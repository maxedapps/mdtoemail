import { createHighlighterCore } from "@shikijs/core";
import type { Element, ElementContent, Root } from "hast";
import type { Config, SyntaxHighlightingMode } from "./config";
import { addDiagnostic, type Diagnostic } from "./diagnostics";
import { createJavaScriptRegexEngine } from "@shikijs/engine-javascript";
import bash from "@shikijs/langs/bash";
import css from "@shikijs/langs/css";
import diff from "@shikijs/langs/diff";
import html from "@shikijs/langs/html";
import javascript from "@shikijs/langs/javascript";
import json from "@shikijs/langs/json";
import jsx from "@shikijs/langs/jsx";
import markdown from "@shikijs/langs/markdown";
import python from "@shikijs/langs/python";
import sql from "@shikijs/langs/sql";
import toml from "@shikijs/langs/toml";
import tsx from "@shikijs/langs/tsx";
import typescript from "@shikijs/langs/typescript";
import yaml from "@shikijs/langs/yaml";
import githubDarkDefault from "@shikijs/themes/github-dark-default";
import githubLight from "@shikijs/themes/github-light";

export const MAX_CODE_UNITS = 20_000;
export const MAX_CODE_LINES = 200;
export const MAX_HIGHLIGHT_TOKENS = 8_000;
export const MAX_DISPLAY_COLUMNS = 80;
export const MAX_CODE_META_SEGMENTS = 500;
export const DEFAULT_TAB_WIDTH = 4;

export interface EmailCodeProfile {
  readonly background: string;
  readonly foreground: string;
  readonly highlightBackground: string;
  readonly lineNumber: string;
  readonly fontFamily: string;
  readonly fontSize: string;
  readonly lineHeight: string;
}

export const EMAIL_CODE_PROFILE: EmailCodeProfile = Object.freeze({
  background: "#f6f8fa",
  foreground: "#24292e",
  highlightBackground: "#fff8c5",
  lineNumber: "#6e7781",
  fontFamily: '"Courier New", Courier, monospace',
  fontSize: "14px",
  lineHeight: "20px",
});

export const EMAIL_CODE_PROFILES: Readonly<Record<SyntaxHighlightingMode, EmailCodeProfile>> = Object.freeze({
  light: EMAIL_CODE_PROFILE,
  dark: Object.freeze({
    background: "#0d1117",
    foreground: "#e6edf3",
    highlightBackground: "#3b3424",
    lineNumber: "#8b949e",
    fontFamily: '"Courier New", Courier, monospace',
    fontSize: "14px",
    lineHeight: "20px",
  }),
});

export const SUPPORTED_CODE_LANGUAGES = [
  "bash",
  "css",
  "diff",
  "html",
  "javascript",
  "json",
  "jsx",
  "markdown",
  "python",
  "sql",
  "toml",
  "tsx",
  "typescript",
  "yaml",
] as const;

export type SupportedCodeLanguage = (typeof SUPPORTED_CODE_LANGUAGES)[number];
export type CodeLanguage = SupportedCodeLanguage | "plaintext";

export interface HighlightToken {
  text: string;
  color?: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
}

export type HighlightedCode = readonly (readonly HighlightToken[])[];

export interface CodeTokenizer {
  tokenize(
    code: string,
    language: SupportedCodeLanguage,
    mode?: SyntaxHighlightingMode,
  ): Promise<HighlightedCode>;
}

export interface ParsedCodeMeta {
  highlightedLines: ReadonlySet<number>;
  lineNumbers: boolean;
  invalidHighlight?: string;
}

const languageAliases: Readonly<Record<string, CodeLanguage>> = Object.freeze({
  bash: "bash",
  sh: "bash",
  shell: "bash",
  shellscript: "bash",
  css: "css",
  diff: "diff",
  html: "html",
  js: "javascript",
  javascript: "javascript",
  json: "json",
  jsx: "jsx",
  md: "markdown",
  markdown: "markdown",
  py: "python",
  python: "python",
  sql: "sql",
  toml: "toml",
  tsx: "tsx",
  ts: "typescript",
  typescript: "typescript",
  yaml: "yaml",
  yml: "yaml",
  text: "plaintext",
  txt: "plaintext",
  plaintext: "plaintext",
});

const supportedLanguageSet: ReadonlySet<string> = new Set(SUPPORTED_CODE_LANGUAGES);

type Highlighter = Awaited<ReturnType<typeof createHighlighterCore>>;
let highlighterPromise: Promise<Highlighter> | undefined;

export function resolveCodeLanguage(language: string | undefined): CodeLanguage | undefined {
  if (language === undefined) return undefined;
  return languageAliases[language.toLowerCase()];
}

export const defaultCodeTokenizer: CodeTokenizer = Object.freeze({
  async tokenize(code: string, language: SupportedCodeLanguage, mode: SyntaxHighlightingMode = "light") {
    if (!supportedLanguageSet.has(language)) {
      throw new Error(`Unsupported code language: ${language}`);
    }

    const highlighter = await getHighlighter();
    const lines = highlighter.codeToTokensBase(code, {
      lang: language,
      theme: mode === "dark" ? "github-dark-default" : "github-light",
    });

    return lines.map((line) => line.map((token) => normalizeToken(token)));
  },
});

export function parseCodeMeta(meta: string | undefined, lineCount: number): ParsedCodeMeta {
  const trimmed = meta?.trim() ?? "";
  if (!trimmed) {
    return { highlightedLines: new Set(), lineNumbers: false };
  }

  const tokens = trimmed.split(/\s+/);
  const first = tokens[0] ?? "";
  const hasHighlightCandidate = first.startsWith("{") || first.startsWith("}");
  const remainingTokens = hasHighlightCandidate ? tokens.slice(1) : tokens;
  const lineNumbers = remainingTokens.includes("lineNumbers");

  if (!hasHighlightCandidate) {
    return { highlightedLines: new Set(), lineNumbers };
  }

  const ranges = parseHighlightRanges(first, lineCount);
  if (!ranges) {
    return {
      highlightedLines: new Set(),
      lineNumbers,
      invalidHighlight: first,
    };
  }

  const highlightedLines = new Set<number>();
  for (const [start, end] of ranges) {
    for (let line = start; line <= end; line += 1) {
      highlightedLines.add(line);
    }
  }

  return { highlightedLines, lineNumbers };
}

export function displayColumns(line: string, tabWidth = DEFAULT_TAB_WIDTH): number {
  assertTabWidth(tabWidth);

  let columns = 0;
  for (const character of line) {
    if (character === "\t") {
      columns += tabWidth - (columns % tabWidth);
    } else {
      columns += character.codePointAt(0)! <= 0x7f ? 1 : 2;
    }
  }
  return columns;
}

export function toEmailDisplayTokens(
  tokens: readonly HighlightToken[],
  tabWidth = DEFAULT_TAB_WIDTH,
): readonly HighlightToken[] {
  assertTabWidth(tabWidth);

  const output: HighlightToken[] = [];
  const pendingSpaces: HighlightToken[] = [];
  let columns = 0;
  let hasVisibleContent = false;

  const append = (text: string, style: HighlightToken): void => {
    if (!text) return;
    const previous = output.at(-1);
    if (previous && equalTokenStyle(previous, style)) {
      previous.text += text;
      return;
    }
    output.push(copyToken(style, text));
  };

  const queueSpace = (style: HighlightToken): void => {
    pendingSpaces.push(copyToken(style, " "));
    columns += 1;
  };

  const flushSpaces = (trailing: boolean): void => {
    for (let index = 0; index < pendingSpaces.length; index += 1) {
      const isNormalInternalSpace = hasVisibleContent && !trailing && index === pendingSpaces.length - 1;
      append(isNormalInternalSpace ? " " : "\u00a0", pendingSpaces[index]!);
    }
    pendingSpaces.length = 0;
  };

  for (const token of tokens) {
    for (const character of token.text) {
      if (character === " ") {
        queueSpace(token);
        continue;
      }
      if (character === "\t") {
        const spaces = tabWidth - (columns % tabWidth);
        for (let index = 0; index < spaces; index += 1) queueSpace(token);
        continue;
      }

      flushSpaces(false);
      append(character, token);
      hasVisibleContent = true;
      columns += character.codePointAt(0)! <= 0x7f ? 1 : 2;
    }
  }

  flushSpaces(true);
  return output;
}

export async function highlightCodeHast(
  tree: Root,
  config: Config,
  diagnostics: Diagnostic[],
  tokenizer: CodeTokenizer = defaultCodeTokenizer,
): Promise<void> {
  if (!config.markdown.syntaxHighlighting) return;
  await visitPreBlocks(tree, config, diagnostics, tokenizer);
}

async function visitPreBlocks(
  parent: Root | Element,
  config: Config,
  diagnostics: Diagnostic[],
  tokenizer: CodeTokenizer,
): Promise<void> {
  for (let index = 0; index < parent.children.length; index += 1) {
    const child = parent.children[index];
    if (!child || child.type !== "element") continue;
    if (child.tagName === "pre") {
      await highlightPre(child, parent, index, config, diagnostics, tokenizer);
      continue;
    }
    await visitPreBlocks(child, config, diagnostics, tokenizer);
  }
}

async function highlightPre(
  pre: Element,
  parent: Root | Element,
  index: number,
  config: Config,
  diagnostics: Diagnostic[],
  tokenizer: CodeTokenizer,
): Promise<void> {
  const claimedLanguage = claimedCodeLanguage(pre);
  const canonical = canonicalCodeBlock(pre);
  if (!canonical) {
    if (claimedLanguage) {
      reportCodeDiagnostic(diagnostics, pre, {
        code: "code-highlighting-failed",
        severity: "warning",
        message: `Could not highlight ${claimedLanguage} code because the code block structure was not canonical; preserved the plain code block.`,
      });
    }
    return;
  }

  const languageName = languageFrom(canonical.code);
  if (!languageName) return;
  const language = resolveCodeLanguage(languageName);
  if (language === "plaintext") return;
  if (!language) {
    reportCodeDiagnostic(diagnostics, pre, {
      code: "unsupported-code-language",
      severity: "info",
      message: `Code language ${JSON.stringify(languageName)} is not supported; preserved the plain code block.`,
    });
    return;
  }

  const sourceWithTerminalNewline = canonical.text.value;
  const source = sourceWithTerminalNewline.endsWith("\n")
    ? sourceWithTerminalNewline.slice(0, -1)
    : sourceWithTerminalNewline;

  if (source.length > MAX_CODE_UNITS) {
    reportCodeDiagnostic(diagnostics, pre, {
      code: "code-highlighting-skipped",
      severity: "warning",
      message: `Skipped ${language} code highlighting because the block exceeds ${MAX_CODE_UNITS} UTF-16 code units.`,
    });
    return;
  }

  const sourceLines = source.split("\n");
  if (sourceLines.length > MAX_CODE_LINES) {
    reportCodeDiagnostic(diagnostics, pre, {
      code: "code-highlighting-skipped",
      severity: "warning",
      message: `Skipped ${language} code highlighting because the block exceeds ${MAX_CODE_LINES} logical lines.`,
    });
    return;
  }
  if (sourceLines.some((line) => displayColumns(line) > MAX_DISPLAY_COLUMNS)) {
    // sanitizeEmailHast already emitted the warning from the original source.
    return;
  }

  const metadata = parseCodeMeta(metaFrom(canonical.code), sourceLines.length);
  if (metadata.invalidHighlight !== undefined) {
    reportCodeDiagnostic(diagnostics, pre, {
      code: "invalid-code-highlight",
      severity: "warning",
      message: `Ignored invalid code line highlight expression ${JSON.stringify(metadata.invalidHighlight)}.`,
    });
  }

  let highlighted: HighlightedCode;
  try {
    highlighted = await tokenizer.tokenize(source, language, config.markdown.syntaxHighlightingMode);
  } catch {
    reportCodeDiagnostic(diagnostics, pre, {
      code: "code-highlighting-failed",
      severity: "warning",
      message: `Could not highlight ${language} code; preserved the plain code block.`,
    });
    return;
  }

  const tokenValidation = validateHighlightedSource(highlighted, source, sourceLines);
  if (!tokenValidation.ok) {
    reportCodeDiagnostic(diagnostics, pre, {
      code: "code-highlighting-failed",
      severity: "warning",
      message: `Could not validate highlighted ${language} code; preserved the plain code block.`,
    });
    return;
  }
  if (tokenValidation.tokenCount > MAX_HIGHLIGHT_TOKENS) {
    reportCodeDiagnostic(diagnostics, pre, {
      code: "code-highlighting-skipped",
      severity: "warning",
      message: `Skipped ${language} code highlighting because it produced more than ${MAX_HIGHLIGHT_TOKENS} tokens.`,
    });
    return;
  }

  parent.children[index] = renderHighlightedCode(
    highlighted,
    metadata,
    EMAIL_CODE_PROFILES[config.markdown.syntaxHighlightingMode],
  );
}

interface CanonicalCodeBlock {
  code: Readonly<Element>;
  text: Extract<ElementContent, { type: "text" }>;
}

function canonicalCodeBlock(pre: Readonly<Element>): CanonicalCodeBlock | undefined {
  if (pre.children.length !== 1) return undefined;
  const code = pre.children[0];
  if (code?.type !== "element" || code.tagName !== "code" || code.children.length !== 1) return undefined;
  const codeText = code.children[0];
  return codeText?.type === "text" ? { code, text: codeText } : undefined;
}

function claimedCodeLanguage(pre: Readonly<Element>): string | undefined {
  for (const child of pre.children) {
    if (child.type !== "element" || child.tagName !== "code") continue;
    const language = languageFrom(child);
    if (language) return language;
  }
  return undefined;
}

function languageFrom(code: Readonly<Element>): string | undefined {
  const language = (code.data as Record<string, unknown> | undefined)?.lang;
  return typeof language === "string" && language.length > 0 ? language : undefined;
}

function metaFrom(code: Readonly<Element>): string | undefined {
  const meta = (code.data as Record<string, unknown> | undefined)?.meta;
  return typeof meta === "string" ? meta : undefined;
}

function reportCodeDiagnostic(
  diagnostics: Diagnostic[],
  node: Readonly<Element>,
  diagnostic: Diagnostic,
): void {
  const line = node.position?.start.line;
  addDiagnostic(diagnostics, line === undefined ? diagnostic : { ...diagnostic, line });
}

type HighlightValidation =
  | { ok: true; tokenCount: number }
  | { ok: false };

function validateHighlightedSource(
  highlighted: HighlightedCode,
  source: string,
  sourceLines: readonly string[],
): HighlightValidation {
  if (!Array.isArray(highlighted) || highlighted.length !== sourceLines.length) return { ok: false };

  let tokenCount = 0;
  const reconstructedLines: string[] = [];
  for (let index = 0; index < highlighted.length; index += 1) {
    const tokenLine = highlighted[index];
    if (!Array.isArray(tokenLine)) return { ok: false };
    tokenCount += tokenLine.length;
    if (tokenCount > MAX_HIGHLIGHT_TOKENS) {
      return { ok: true, tokenCount };
    }

    let reconstructed = "";
    for (const token of tokenLine) {
      if (!token || typeof token.text !== "string") return { ok: false };
      reconstructed += token.text;
    }
    if (reconstructed !== sourceLines[index]) return { ok: false };
    reconstructedLines.push(reconstructed);
  }

  return reconstructedLines.join("\n") === source
    ? { ok: true, tokenCount }
    : { ok: false };
}

function renderHighlightedCode(
  highlighted: HighlightedCode,
  metadata: ParsedCodeMeta,
  profile: EmailCodeProfile,
): Element {
  const rows = highlighted.map((line, index) => renderCodeLine(line, index + 1, metadata, profile));
  const tableProperties = {
    role: "presentation",
    width: "100%",
    cellSpacing: "0",
    cellPadding: "0",
    border: "0",
    bgColor: profile.background,
  } as const;
  const tableStyle = style({
    width: "100%",
    "background-color": profile.background,
    "border-collapse": "collapse",
    "mso-table-lspace": "0pt",
    "mso-table-rspace": "0pt",
    "table-layout": "fixed",
  });

  return element("table", { ...tableProperties, style: tableStyle }, [
    element("tbody", {}, [
      element("tr", {}, [
        element(
          "td",
          {
            vAlign: "top",
            bgColor: profile.background,
            style: style({
              padding: "12px 12px 16px 12px",
              "background-color": profile.background,
            }),
          },
          [
            element("table", { ...tableProperties, style: tableStyle }, [
              element("tbody", {}, rows),
            ]),
          ],
        ),
      ]),
    ]),
  ]);
}

function renderCodeLine(
  sourceTokens: readonly HighlightToken[],
  lineNumber: number,
  metadata: ParsedCodeMeta,
  profile: EmailCodeProfile,
): Element {
  const highlightedLine = metadata.highlightedLines.has(lineNumber);
  const background = highlightedLine ? profile.highlightBackground : profile.background;
  const normalizedTokens = sourceTokens.map(normalizeRenderableToken);
  const displayedTokens = toEmailDisplayTokens(normalizedTokens);
  const codeChildren: ElementContent[] = displayedTokens.length === 0
    ? [element("br", {}, [])]
    : displayedTokens.map((token) => renderToken(token, profile));
  const cells: Element[] = [];

  if (metadata.lineNumbers) {
    cells.push(element("td", {
      ariaHidden: "true",
      align: "right",
      vAlign: "top",
      width: "40",
      bgColor: background,
      style: style({
        width: "40px",
        padding: "0 8px 0 0",
        "font-family": profile.fontFamily,
        "font-size": profile.fontSize,
        "line-height": profile.lineHeight,
        "mso-line-height-rule": "exactly",
        color: profile.lineNumber,
        "background-color": background,
      }),
    }, [text(String(lineNumber))]));
  }

  cells.push(element("td", {
    vAlign: "top",
    bgColor: background,
    style: style({
      padding: "0",
      "font-family": profile.fontFamily,
      "font-size": profile.fontSize,
      "line-height": profile.lineHeight,
      "mso-line-height-rule": "exactly",
      color: profile.foreground,
      "background-color": background,
    }),
  }, [
    element("code", {
      style: style({
        "font-family": profile.fontFamily,
        "font-size": profile.fontSize,
        "line-height": profile.lineHeight,
        "mso-line-height-rule": "exactly",
        color: profile.foreground,
      }),
    }, codeChildren),
  ]));

  return element("tr", {}, cells);
}

function normalizeRenderableToken(token: HighlightToken): HighlightToken {
  const color = normalizeColor(token.color);
  return {
    text: token.text,
    ...(color ? { color } : {}),
    bold: token.bold === true,
    italic: token.italic === true,
    underline: token.underline === true,
  };
}

function renderToken(token: HighlightToken, profile: EmailCodeProfile): ElementContent {
  const color = normalizeColor(token.color);
  const needsSpan =
    (color !== undefined && color !== profile.foreground) ||
    token.bold ||
    token.italic ||
    token.underline;
  if (!needsSpan) return text(token.text);

  return element("span", {
    style: style({
      ...(color && color !== profile.foreground ? { color } : {}),
      ...(token.bold ? { "font-weight": "700" } : {}),
      ...(token.italic ? { "font-style": "italic" } : {}),
      ...(token.underline ? { "text-decoration": "underline" } : {}),
    }),
  }, [text(token.text)]);
}

function element(tagName: string, properties: Element["properties"], children: ElementContent[]): Element {
  return { type: "element", tagName, properties, children };
}

function text(value: string): ElementContent {
  return { type: "text", value };
}

function style(properties: Readonly<Record<string, string>>): string {
  return Object.entries(properties).map(([name, value]) => `${name}:${value}`).join(";");
}

async function getHighlighter(): Promise<Highlighter> {
  highlighterPromise ??= createHighlighterCore({
    themes: [githubLight, githubDarkDefault],
    langs: [bash, css, diff, html, javascript, json, jsx, markdown, python, sql, toml, tsx, typescript, yaml],
    engine: createJavaScriptRegexEngine(),
  });
  return highlighterPromise;
}

function normalizeToken(token: { content: string; color?: string; fontStyle?: number }): HighlightToken {
  const fontStyle = token.fontStyle !== undefined && token.fontStyle > 0 ? token.fontStyle : 0;
  const color = normalizeColor(token.color);
  return {
    text: token.content,
    ...(color ? { color } : {}),
    bold: (fontStyle & 2) !== 0,
    italic: (fontStyle & 1) !== 0,
    underline: (fontStyle & 4) !== 0,
  };
}

function normalizeColor(color: string | undefined): string | undefined {
  return typeof color === "string" && /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : undefined;
}

function parseHighlightRanges(expression: string, lineCount: number): readonly (readonly [number, number])[] | undefined {
  if (!/^\{[^{}]*\}$/.test(expression)) return undefined;
  if (!Number.isSafeInteger(lineCount) || lineCount < 0 || lineCount > MAX_CODE_LINES) return undefined;

  const body = expression.slice(1, -1);
  if (!body) return undefined;

  let segmentCount = 1;
  for (const character of body) {
    if (character === ",") segmentCount += 1;
    if (segmentCount > MAX_CODE_META_SEGMENTS) return undefined;
  }

  const segments = body.split(",");
  const ranges: [number, number][] = [];
  for (const segment of segments) {
    const match = /^(\d+)(?:-(\d+))?$/.exec(segment);
    if (!match) return undefined;

    const start = Number(match[1]);
    const end = match[2] === undefined ? start : Number(match[2]);
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start < 1 ||
      end < 1 ||
      start > lineCount ||
      end > lineCount ||
      start > end
    ) {
      return undefined;
    }
    ranges.push([start, end]);
  }
  return ranges;
}

function assertTabWidth(tabWidth: number): void {
  if (!Number.isSafeInteger(tabWidth) || tabWidth < 1) {
    throw new RangeError("tabWidth must be a positive safe integer.");
  }
}

function equalTokenStyle(left: HighlightToken, right: HighlightToken): boolean {
  return (
    left.color === right.color &&
    left.bold === right.bold &&
    left.italic === right.italic &&
    left.underline === right.underline
  );
}

function copyToken(token: HighlightToken, text: string): HighlightToken {
  return {
    text,
    ...(token.color ? { color: token.color } : {}),
    bold: token.bold,
    italic: token.italic,
    underline: token.underline,
  };
}

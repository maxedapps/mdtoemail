import { describe, expect, test } from "vitest";
import type { Element, Root, RootContent } from "hast";
import { defaultConfig, type Config } from "../src/config.ts";
import {
  DEFAULT_TAB_WIDTH,
  EMAIL_CODE_PROFILE,
  EMAIL_CODE_PROFILES,
  MAX_CODE_LINES,
  MAX_CODE_META_SEGMENTS,
  MAX_CODE_UNITS,
  MAX_DISPLAY_COLUMNS,
  MAX_HIGHLIGHT_TOKENS,
  SUPPORTED_CODE_LANGUAGES,
  defaultCodeTokenizer,
  displayColumns,
  parseCodeMeta,
  resolveCodeLanguage,
  toEmailDisplayTokens,
  type CodeTokenizer,
  type HighlightToken,
  type SupportedCodeLanguage,
} from "../src/highlight.ts";
import { renderMarkdown } from "../src/markdown.ts";

const aliases = {
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
} satisfies Record<string, SupportedCodeLanguage>;

const samples = {
  bash: 'echo "hello"',
  css: "body { color: red; }",
  diff: "-old\n+new",
  html: '<p class="note">Hello</p>',
  javascript: "const answer = 42;",
  json: '{"answer": 42}',
  jsx: "const view = <p>Hello</p>;",
  markdown: "# Heading\n\nText",
  python: "answer = 42",
  sql: "SELECT answer FROM facts;",
  toml: "answer = 42",
  tsx: "const view: JSX.Element = <p>Hello</p>;",
  typescript: "const answer: number = 42;",
  yaml: "answer: 42",
} satisfies Record<SupportedCodeLanguage, string>;

function token(text: string, overrides: Partial<HighlightToken> = {}): HighlightToken {
  return {
    text,
    bold: false,
    italic: false,
    underline: false,
    ...overrides,
  };
}

function malformedToken(
  text: string,
  key: keyof HighlightToken,
  value: unknown,
  overrides: Partial<HighlightToken> = {},
): HighlightToken {
  const fixture = token(text, overrides);
  Object.defineProperty(fixture, key, { value });
  return fixture;
}

describe("code language and tokenizer contracts", () => {
  test("resolves every exact canonical language and alias case-insensitively", () => {
    expect(Object.keys(aliases).sort()).toEqual([
      "bash",
      "css",
      "diff",
      "html",
      "javascript",
      "js",
      "json",
      "jsx",
      "markdown",
      "md",
      "py",
      "python",
      "sh",
      "shell",
      "shellscript",
      "sql",
      "toml",
      "ts",
      "tsx",
      "typescript",
      "yaml",
      "yml",
    ]);

    for (const [alias, canonical] of Object.entries(aliases)) {
      expect(resolveCodeLanguage(alias)).toBe(canonical);
      expect(resolveCodeLanguage(alias.toUpperCase())).toBe(canonical);
    }

    expect(resolveCodeLanguage(" text")).toBeUndefined();
    expect(resolveCodeLanguage("unknown")).toBeUndefined();
    expect(resolveCodeLanguage(undefined)).toBeUndefined();
  });

  test("recognizes intentional plain-code names without loading a grammar", () => {
    for (const language of ["text", "txt", "plaintext", "TEXT", "TXT", "PLAINTEXT"]) {
      expect(resolveCodeLanguage(language)).toBe("plaintext");
    }
  });

  test("tokenizes every canonical grammar through the cached strict JavaScript engine", async () => {
    const results = await Promise.all(
      SUPPORTED_CODE_LANGUAGES.map(async (language) => ({
        language,
        source: samples[language],
        lines: await defaultCodeTokenizer.tokenize(samples[language], language),
      })),
    );

    for (const { source, lines } of results) {
      expect(lines.map((line) => line.map((item) => item.text).join("")).join("\n")).toBe(source);
      expect(lines.flat().length).toBeGreaterThan(0);
      for (const item of lines.flat()) {
        expect(typeof item.bold).toBe("boolean");
        expect(typeof item.italic).toBe("boolean");
        expect(typeof item.underline).toBe("boolean");
        if (item.color !== undefined) expect(item.color).toMatch(/^#[0-9a-f]{6}$/);
        expect("htmlStyle" in item).toBe(false);
        expect("htmlAttrs" in item).toBe(false);
      }
    }
  });

  test("selects the fixed dark token theme without changing source text", async () => {
    const source = "const answer: number = 42;";
    const light = await defaultCodeTokenizer.tokenize(source, "typescript", "light");
    const dark = await defaultCodeTokenizer.tokenize(source, "typescript", "dark");

    expect(light.flat().map((item) => item.color)).not.toEqual(
      dark.flat().map((item) => item.color),
    );
    expect(dark.map((line) => line.map((item) => item.text).join("")).join("\n")).toBe(source);
    expect(dark.flat().some((item) => item.color === "#ff7b72")).toBe(true);
  });

  test("rejects unsupported runtime input before tokenization", async () => {
    // SAFETY: this deliberately malformed fixture verifies the runtime guard before tokenization.
    const unsupportedLanguage = "ruby" as SupportedCodeLanguage;
    await expect(defaultCodeTokenizer.tokenize("x", unsupportedLanguage)).rejects.toThrow(
      "Unsupported code language: ruby",
    );
  });
});

describe("parseCodeMeta", () => {
  test("parses, bounds, and deduplicates valid ranges", () => {
    const parsed = parseCodeMeta("  {2,4-6,4,2-3} title=demo lineNumbers other  ", 6);

    expect([...parsed.highlightedLines]).toEqual([2, 4, 5, 6, 3]);
    expect(parsed.lineNumbers).toBe(true);
    expect(parsed.invalidHighlight).toBeUndefined();
  });

  test("allows lineNumbers without highlights and ignores unrelated metadata", () => {
    expect(parseCodeMeta("title=demo lineNumbers", 3)).toEqual({
      highlightedLines: new Set(),
      lineNumbers: true,
    });
    expect(parseCodeMeta("title=demo {1} lineNumbersToo", 3)).toEqual({
      highlightedLines: new Set(),
      lineNumbers: false,
    });
    expect(parseCodeMeta(undefined, 3)).toEqual({
      highlightedLines: new Set(),
      lineNumbers: false,
    });
  });

  test("discards all highlights but retains lineNumbers for malformed leading expressions", () => {
    const invalidExpressions = [
      "{}",
      "{0}",
      "{-1}",
      "{1-}",
      "{-2}",
      "{3-2}",
      "{x}",
      "{1,,2}",
      "{1, 2}",
      "{1",
      "}1{",
      "{4}",
      "{9007199254740992}",
      "{1}lineNumbers",
    ];

    for (const expression of invalidExpressions) {
      const parsed = parseCodeMeta(`${expression} lineNumbers`, 3);
      expect(parsed.highlightedLines.size, expression).toBe(0);
      expect(parsed.lineNumbers, expression).toBe(true);
      expect(parsed.invalidHighlight, expression).toBe(expression.split(/\s+/)[0]);
    }
  });

  test("rejects more than 500 segments before range expansion", () => {
    const valid = `{${Array.from({ length: MAX_CODE_META_SEGMENTS }, () => "1").join(",")}}`;
    const invalid = `{${Array.from({ length: MAX_CODE_META_SEGMENTS + 1 }, () => "1").join(",")}}`;

    expect([...parseCodeMeta(valid, 1).highlightedLines]).toEqual([1]);
    expect(parseCodeMeta(`${invalid} lineNumbers`, 1)).toMatchObject({
      highlightedLines: new Set(),
      lineNumbers: true,
      invalidHighlight: invalid,
    });
  });

  test("rejects highlights when lineCount cannot safely bound expansion", () => {
    expect([...parseCodeMeta("{1-200}", MAX_CODE_LINES).highlightedLines]).toHaveLength(
      MAX_CODE_LINES,
    );
    expect(parseCodeMeta("{1}", MAX_CODE_LINES + 1).invalidHighlight).toBe("{1}");
    expect(
      parseCodeMeta(`{1-${Number.MAX_SAFE_INTEGER}}`, Number.MAX_SAFE_INTEGER).invalidHighlight,
    ).toBe(`{1-${Number.MAX_SAFE_INTEGER}}`);
    expect(parseCodeMeta("{1}", Number.MAX_SAFE_INTEGER + 1).invalidHighlight).toBe("{1}");
    expect(parseCodeMeta("{1}", -1).invalidHighlight).toBe("{1}");
  });
});

describe("email code profile and limits", () => {
  test("exports the fixed immutable profile and exact limits", () => {
    expect(EMAIL_CODE_PROFILE).toEqual({
      background: "#f6f8fa",
      foreground: "#24292e",
      highlightBackground: "#fff8c5",
      lineNumber: "#6e7781",
      fontFamily: '"Courier New", Courier, monospace',
      fontSize: "14px",
      lineHeight: "20px",
    });
    expect(Object.isFrozen(EMAIL_CODE_PROFILE)).toBe(true);
    expect(EMAIL_CODE_PROFILES).toEqual({
      light: EMAIL_CODE_PROFILE,
      dark: {
        background: "#0d1117",
        foreground: "#e6edf3",
        highlightBackground: "#3b3424",
        lineNumber: "#8b949e",
        fontFamily: '"Courier New", Courier, monospace',
        fontSize: "14px",
        lineHeight: "20px",
      },
    });
    expect(Object.isFrozen(EMAIL_CODE_PROFILES)).toBe(true);
    expect(Object.isFrozen(EMAIL_CODE_PROFILES.dark)).toBe(true);
    expect({
      MAX_CODE_UNITS,
      MAX_CODE_LINES,
      MAX_HIGHLIGHT_TOKENS,
      MAX_DISPLAY_COLUMNS,
      DEFAULT_TAB_WIDTH,
    }).toEqual({
      MAX_CODE_UNITS: 20_000,
      MAX_CODE_LINES: 200,
      MAX_HIGHLIGHT_TOKENS: 8_000,
      MAX_DISPLAY_COLUMNS: 80,
      DEFAULT_TAB_WIDTH: 4,
    });
  });

  test("calculates conservative columns by code point and tab stop", () => {
    expect(displayColumns("abc")).toBe(3);
    expect(displayColumns("a\tb")).toBe(5);
    expect(displayColumns("\t\tX")).toBe(9);
    expect(displayColumns("é🙂")).toBe(4);
    expect(displayColumns("a\tb", 8)).toBe(9);
    expect(() => displayColumns("x", 0)).toThrow("tabWidth must be a positive safe integer.");
  });
});

describe("codeHighlightPlugin", () => {
  test("runs after sanitization and renders only validated canonical code", async () => {
    const tokenizer: CodeTokenizer = {
      async tokenize(code) {
        expect(code).toBe("  const x = 1;");
        return [
          [
            token("  "),
            token("const", { color: "#D73A49", bold: true }),
            token(" x", { color: "#24292e", italic: true, underline: true }),
            malformedToken(" = 1;", "italic", "yes", { color: "not-a-color" }),
          ],
        ];
      },
    };

    const rendered = await renderWithTokenizer(
      "```ts {1} lineNumbers\n  const x = 1;\n```",
      tokenizer,
    );

    expect(rendered.diagnostics).toEqual([]);
    expect(rendered.html).toContain(
      '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#f6f8fa"',
    );
    expect(rendered.html).toContain(
      '<td aria-hidden="true" align="right" valign="top" width="40" bgcolor="#fff8c5"',
    );
    expect(rendered.html).toContain('<span style="color:#d73a49;font-weight:700">const</span>');
    expect(rendered.html).toContain(
      '<span style="font-style:italic;text-decoration:underline"> x</span>',
    );
    expect(rendered.html).toContain("\u00a0\u00a0");
    expect(rendered.html).not.toContain("not-a-color");
    expect(rendered.html).not.toContain("font-style:yes");
    expect(rendered.html).not.toContain("<pre");
    expect(rendered.html).not.toContain("class=");
  });

  test("renders the coherent fixed dark token and surface profile", async () => {
    const seenModes: string[] = [];
    const rendered = await renderWithTokenizer(
      "```ts {1} lineNumbers\nconst x = 1;\n```",
      {
        async tokenize(_code, _language, mode) {
          seenModes.push(mode ?? "missing");
          return [[token("const", { color: "#ff7b72" }), token(" x = 1;", { color: "#e6edf3" })]];
        },
      },
      highlightingConfig("dark"),
    );

    expect(seenModes).toEqual(["dark"]);
    expect(rendered.diagnostics).toEqual([]);
    expect(rendered.html).toContain('bgcolor="#0d1117"');
    expect(rendered.html).toContain('bgcolor="#3b3424"');
    expect(rendered.html).toContain("color:#8b949e");
    expect(rendered.html).toContain("color:#e6edf3");
    expect(rendered.html).toContain('<span style="color:#ff7b72">const</span>');
    expect(rendered.html).not.toContain("#f6f8fa");
    expect(rendered.html).not.toContain("#fff8c5");
  });

  test("removes exactly one fenced-code terminal newline and pins empty/trailing logical lines", async () => {
    const seen: string[] = [];
    const tokenizer: CodeTokenizer = {
      async tokenize(code) {
        seen.push(code);
        return code.split("\n").map((line) => (line ? [token(line)] : []));
      },
    };

    const rendered = await renderWithTokenizer("```ts\n```\n\n```ts\na\n\n```", tokenizer);

    expect(seen).toEqual(["", "a\n"]);
    expect(rendered.html.match(/<code /g)).toHaveLength(3);
    expect(rendered.html.match(/<br>/g)).toHaveLength(2);
  });

  test("preserves disabled, unlabelled, plaintext, and unsupported blocks", async () => {
    let calls = 0;
    const tokenizer: CodeTokenizer = {
      async tokenize() {
        calls += 1;
        return [];
      },
    };
    const enabled = await renderWithTokenizer(
      "```\nnone\n```\n\n```text\nplain\n```\n\n```RUBY\nruby\n```\n\n```ruby\nagain\n```",
      tokenizer,
    );
    const disabled = await renderWithTokenizer(
      "```ts\nconst x = 1;\n```",
      tokenizer,
      defaultConfig,
    );

    expect(calls).toBe(0);
    expect(enabled.html.match(/<pre /g)).toHaveLength(4);
    expect(disabled.html).toContain("white-space:pre-wrap");
    expect(enabled.diagnostics).toEqual([
      {
        code: "unsupported-code-language",
        severity: "info",
        message: 'Code language "RUBY" is not supported; preserved the plain code block.',
        line: 9,
      },
      {
        code: "unsupported-code-language",
        severity: "info",
        message: 'Code language "ruby" is not supported; preserved the plain code block.',
        line: 13,
      },
    ]);
  });

  test("preserves noncanonical claimed blocks and reports their source line", async () => {
    const result = await renderMarkdown("intro\n\n```ts\nx\n```", highlightingConfig(), {
      beforeHighlight(tree) {
        appendTextToFirstPre(tree, "extra");
      },
    });

    expect(result.html).toContain("<pre");
    expect(result.html).toContain("x\n</code>extra</pre>");
    expect(result.diagnostics).toEqual([
      {
        code: "code-highlighting-failed",
        severity: "warning",
        message:
          "Could not highlight ts code because the code block structure was not canonical; preserved the plain code block.",
        line: 3,
      },
    ]);
  });

  test("catches tokenizer errors and rejects line, token, and source mismatches", async () => {
    const fixtures: Array<[CodeTokenizer, string]> = [
      [
        {
          async tokenize() {
            throw new Error("secret source");
          },
        },
        "Could not highlight typescript code; preserved the plain code block.",
      ],
      [
        {
          async tokenize() {
            return [];
          },
        },
        "Could not validate highlighted typescript code; preserved the plain code block.",
      ],
      [
        {
          async tokenize() {
            return [[token("different")]];
          },
        },
        "Could not validate highlighted typescript code; preserved the plain code block.",
      ],
      [
        {
          async tokenize() {
            return [[malformedToken("x", "text", 42)]];
          },
        },
        "Could not validate highlighted typescript code; preserved the plain code block.",
      ],
    ];

    for (const [tokenizer, message] of fixtures) {
      const rendered = await renderWithTokenizer("```ts\nx\n```", tokenizer);
      expect(rendered.html).toContain("<pre");
      expect(rendered.html).toContain(">x\n</code>");
      expect(rendered.diagnostics).toEqual([
        {
          code: "code-highlighting-failed",
          severity: "warning",
          message,
          line: 1,
        },
      ]);
      expect(JSON.stringify(rendered.diagnostics)).not.toContain("secret source");
    }
  });

  test("bounds code units, logical lines, display columns, and produced tokens", async () => {
    let calls = 0;
    const tokenizer: CodeTokenizer = {
      async tokenize(code) {
        calls += 1;
        if (code === "x")
          return [[token("x"), ...Array.from({ length: MAX_HIGHLIGHT_TOKENS }, () => token(""))]];
        return code.split("\n").map((line) => [token(line)]);
      },
    };
    const units = await renderWithTokenizer(
      `\`\`\`ts\n${"x".repeat(MAX_CODE_UNITS + 1)}\n\`\`\``,
      tokenizer,
    );
    const newlineDense = await renderWithTokenizer(
      `\`\`\`ts\n${"\n".repeat(MAX_CODE_UNITS + 100)}\`\`\``,
      tokenizer,
    );
    const lines = await renderWithTokenizer(
      `\`\`\`ts\n${Array.from({ length: MAX_CODE_LINES + 1 }, () => "x").join("\n")}\n\`\`\``,
      tokenizer,
    );
    const columns = await renderWithTokenizer(
      `\`\`\`ts\n${"x".repeat(MAX_DISPLAY_COLUMNS + 1)}\n\`\`\``,
      tokenizer,
    );
    const maxLines = await renderWithTokenizer(
      `\`\`\`ts\n${Array.from({ length: MAX_CODE_LINES }, () => "y").join("\n")}\n\`\`\``,
      tokenizer,
    );
    const maxColumns = await renderWithTokenizer(
      `\`\`\`ts\n${"z".repeat(MAX_DISPLAY_COLUMNS)}\n\`\`\``,
      tokenizer,
    );
    const tokens = await renderWithTokenizer("```ts\nx\n```", tokenizer);

    expect(calls).toBe(3);
    expect(units.diagnostics.map((item) => item.code)).toEqual([
      "long-code-line",
      "code-highlighting-skipped",
    ]);
    expect(newlineDense.diagnostics).toEqual([
      {
        code: "code-highlighting-skipped",
        severity: "warning",
        message: `Skipped typescript code highlighting because the block exceeds ${MAX_CODE_UNITS} UTF-16 code units.`,
        line: 1,
      },
    ]);
    expect(lines.diagnostics.map((item) => item.code)).toEqual(["code-highlighting-skipped"]);
    expect(columns.diagnostics.map((item) => item.code)).toEqual(["long-code-line"]);
    expect(tokens.diagnostics.map((item) => item.code)).toEqual(["code-highlighting-skipped"]);
    expect(
      [units, newlineDense, lines, columns, tokens].map(
        (rendered) => rendered.diagnostics.at(-1)?.line,
      ),
    ).toEqual([1, 1, 1, 1, 1]);
    expect(maxLines.diagnostics).toEqual([]);
    expect(maxColumns.diagnostics).toEqual([]);
    expect(maxLines.html.match(/<code /g)).toHaveLength(MAX_CODE_LINES);
    expect(maxColumns.html).toContain('<table role="presentation"');
    for (const rendered of [units, newlineDense, lines, columns, tokens])
      expect(rendered.html).toContain("<pre");
    expect(units.html).toContain("x".repeat(MAX_CODE_UNITS + 1));
    expect(lines.html).toContain(Array.from({ length: MAX_CODE_LINES + 1 }, () => "x").join("\n"));
    expect(columns.html).toContain("x".repeat(MAX_DISPLAY_COLUMNS + 1));
    expect(tokens.html).toContain(">x\n</code>");
  });

  test("warns for malformed huge metadata while retaining colors and lineNumbers", async () => {
    const expression = `{1-${Number.MAX_SAFE_INTEGER}}`;
    const rendered = await renderWithTokenizer(`\`\`\`ts ${expression} lineNumbers\nx\n\`\`\``, {
      async tokenize() {
        return [[token("x", { color: "#123456" })]];
      },
    });

    expect(rendered.diagnostics).toEqual([
      {
        code: "invalid-code-highlight",
        severity: "warning",
        message: `Ignored invalid code line highlight expression ${JSON.stringify(expression)}.`,
        line: 1,
      },
    ]);
    expect(rendered.html).toContain('aria-hidden="true"');
    expect(rendered.html).toContain('style="color:#123456"');
    expect(rendered.html).not.toContain('bgcolor="#fff8c5"');
  });
});

describe("toEmailDisplayTokens", () => {
  test("encodes leading, repeated, cross-token, and trailing spaces without mutating source tokens", () => {
    const input = [
      token("  a ", { color: "#111111" }),
      token(" b  ", { color: "#222222", bold: true }),
    ];
    const before = structuredClone(input);
    const output = toEmailDisplayTokens(input);

    expect(input).toEqual(before);
    expect(input.map((item) => item.text).join("")).toBe("  a  b  ");
    expect(output.map((item) => item.text).join("")).toBe("\u00a0\u00a0a\u00a0 b\u00a0\u00a0");
    expect(output).toEqual([
      token("\u00a0\u00a0a\u00a0", { color: "#111111" }),
      token(" b\u00a0\u00a0", { color: "#222222", bold: true }),
    ]);
  });

  test("expands tabs at streaming display-column stops and merges equal styles", () => {
    const style = { color: "#123456", italic: true };
    const input = [token("\tX", style), token("\tY\t", style)];
    const output = toEmailDisplayTokens(input);

    expect(output).toEqual([
      token("\u00a0\u00a0\u00a0\u00a0X\u00a0\u00a0 Y\u00a0\u00a0\u00a0", style),
    ]);
    expect(input.map((item) => item.text).join("")).toBe("\tX\tY\t");
  });

  test("keeps the originating style for whitespace runs spanning token boundaries", () => {
    const output = toEmailDisplayTokens([
      token("a ", { underline: true }),
      token(" ", { italic: true }),
      token("b"),
    ]);

    expect(output).toEqual([
      token("a\u00a0", { underline: true }),
      token(" ", { italic: true }),
      token("b"),
    ]);
  });

  test("rejects invalid tab widths", () => {
    expect(() => toEmailDisplayTokens([], 1.5)).toThrow(
      "tabWidth must be a positive safe integer.",
    );
  });
});

const highlightingConfig = (
  syntaxHighlightingMode: Config["markdown"]["syntaxHighlightingMode"] = "light",
): Config => ({
  ...defaultConfig,
  markdown: { ...defaultConfig.markdown, syntaxHighlighting: true, syntaxHighlightingMode },
  email: { ...defaultConfig.email },
  theme: { ...defaultConfig.theme },
});

async function renderWithTokenizer(
  markdown: string,
  tokenizer: CodeTokenizer,
  config = highlightingConfig(),
) {
  return renderMarkdown(markdown, config, { tokenizer });
}

function appendTextToFirstPre(tree: Root, value: string): void {
  const pre = findPre(tree);
  if (!pre) throw new Error("expected a fenced code block");
  pre.children.push({ type: "text", value });
}

function findPre(node: Root | RootContent): Element | undefined {
  if (node.type === "element" && node.tagName === "pre") return node;
  if (node.type !== "root" && node.type !== "element") return undefined;
  for (const child of node.children) {
    const match = findPre(child);
    if (match) return match;
  }
  return undefined;
}

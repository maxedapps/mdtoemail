import { basename } from "node:path";
import { defineHastPlugin, type HastPluginInput } from "satteri";
import type { Element, Text } from "hast";
import type { Config } from "./config";
import { addDiagnostic, addDiagnosticOnce, type Diagnostic } from "./diagnostics";
import { displayColumns } from "./highlight";

const allowedElements = new Set([
  "p",
  "br",
  "strong",
  "em",
  "a",
  "ul",
  "ol",
  "li",
  "blockquote",
  "code",
  "pre",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "img",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "del",
  "sup",
  "sub",
  "div",
]);

const maxComfortableTableColumns = 6;
const maxComfortableCodeLine = 80;

export function emailHastPlugin(config: Config, diagnostics: Diagnostic[] = []): HastPluginInput {
  return defineHastPlugin({
    name: "email-sanitizer",
    element: {
      filter: [],
      visit(node, ctx) {
        const line = lineOf(node);

        if (node.tagName === "input") {
          if (isCheckbox(node.properties)) {
            reportOnce(diagnostics, line, {
              code: "task-list-input-transformed",
              severity: "info",
              message: "Converted task-list checkbox inputs to plain text symbols for email compatibility.",
            });
            return { type: "text", value: isCheckedCheckbox(node.properties) ? "☑ " : "☐ " };
          }

          report(diagnostics, line, {
            code: "unsupported-element",
            severity: "warning",
            message: "Removed unsupported <input> element.",
          });
          ctx.removeNode(node);
          return;
        }

        if (node.tagName === "section") {
          replaceSectionWithDiv(node, ctx, config, diagnostics, line);
          return;
        }

        if (!allowedElements.has(node.tagName)) {
          report(diagnostics, line, {
            code: "unsupported-element",
            severity: "warning",
            message: `Removed unsupported <${node.tagName}> element.`,
          });
          ctx.removeNode(node);
          return;
        }

        const originalProperties = { ...node.properties };
        stripProperties(node, ctx);
        applySafeProperties(node, originalProperties, ctx, config, diagnostics, line);
      },
    },
    raw(node) {
      reportOnce(diagnostics, lineOf(node), {
        code: "raw-html-escaped",
        severity: "warning",
        message: "Escaped raw HTML because arbitrary HTML is not supported in email-safe output.",
      });
      return { type: "text", value: node.value };
    },
  });
}

const contentIndent = 16;

export function renderEmailDocument(contentHtml: string, inputPath: string, config: Config): string {
  const width = config.email.containerWidth;
  const title = Bun.escapeHTML(basename(inputPath));
  const content = config.email.pretty ? indentContent(contentHtml, contentIndent) : contentHtml;
  const backgroundColor = legacyColorAttribute(config.theme.backgroundColor);
  const containerBackground = legacyColorAttribute(config.theme.containerBackground);
  const bodyStyle = escapedStyleAttribute({
    margin: "0",
    padding: "0",
    background: config.theme.backgroundColor,
  });
  const outerTableStyle = escapedStyleAttribute({
    width: "100%",
    background: config.theme.backgroundColor,
    "border-collapse": "collapse",
    "mso-table-lspace": "0pt",
    "mso-table-rspace": "0pt",
  });
  const outerCellStyle = escapedStyleAttribute({
    padding: config.email.outerPadding,
  });
  const innerTableStyle = escapedStyleAttribute({
    width: "100%",
    "max-width": `${width}px`,
    background: config.theme.containerBackground,
    "border-collapse": "collapse",
    "mso-table-lspace": "0pt",
    "mso-table-rspace": "0pt",
  });
  const contentCellStyle = escapedStyleAttribute({
    padding: config.theme.contentPadding,
    "font-family": config.theme.fontFamily,
    "font-size": config.theme.baseFontSize,
    "line-height": config.theme.lineHeight,
    color: config.theme.textColor,
  });

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width">
    <title>${title}</title>
  </head>
  <body style="${bodyStyle}">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"${backgroundColor ? ` bgcolor="${backgroundColor}"` : ""} style="${outerTableStyle}">
      <tr>
        <td align="center"${backgroundColor ? ` bgcolor="${backgroundColor}"` : ""} style="${outerCellStyle}">
          <table role="presentation" align="center" width="${escapeAttributeValue(width)}" cellspacing="0" cellpadding="0" border="0"${containerBackground ? ` bgcolor="${containerBackground}"` : ""} style="${innerTableStyle}">
            <tr>
              <td align="left" valign="top"${containerBackground ? ` bgcolor="${containerBackground}"` : ""} style="${contentCellStyle}">
                ${content}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
`;
}

export function isAllowedUrl(value: unknown, kind: "link" | "image"): boolean {
  if (kind === "link") {
    const decision = decideLinkUrl(value);
    return decision?.action === "keep";
  }

  return decideImageUrl(value, undefined).action === "keep";
}

type UrlDecision =
  | { action: "keep"; value: string; diagnostic?: Diagnostic }
  | { action: "remove"; diagnostic: Diagnostic; fallbackText?: string };

interface ElementMutationContext {
  setProperty(node: Readonly<Element>, key: string, value: unknown): void;
  removeNode(node: Readonly<Element>): void;
  replaceNode(node: Readonly<Element>, newNode: Element | Text): void;
}

function stripProperties(node: Readonly<Element>, ctx: ElementMutationContext): void {
  for (const key of Object.keys(node.properties)) {
    ctx.setProperty(node, key, undefined);
  }
}

function applySafeProperties(
  node: Readonly<Element>,
  originalProperties: Record<string, unknown>,
  ctx: ElementMutationContext,
  config: Config,
  diagnostics: Diagnostic[],
  line: number | undefined,
): void {
  const id = originalProperties.id;
  if (typeof id === "string" && isSafeId(id)) {
    ctx.setProperty(node, "id", id);
  }

  const textAlign = textAlignFromStyle(originalProperties.style);
  let linkKept = true;

  if (node.tagName === "a") {
    const decision = decideLinkUrl(originalProperties.href);
    if (decision) {
      addDecisionDiagnostic(diagnostics, decision, line);
      if (decision.action === "keep") {
        ctx.setProperty(node, "href", decision.value);
      } else {
        // Href was rejected: render the link text as plain inline text rather than a dead styled link.
        linkKept = false;
      }
    }
  }

  if (node.tagName === "img") {
    const decision = decideImageUrl(originalProperties.src, originalProperties.alt);
    addDecisionDiagnostic(diagnostics, decision, line);
    if (decision.action === "remove") {
      if (decision.fallbackText) {
        ctx.replaceNode(node, { type: "text", value: decision.fallbackText });
      } else {
        ctx.removeNode(node);
      }
      return;
    }

    ctx.setProperty(node, "src", decision.value);
    const alt = typeof originalProperties.alt === "string" ? originalProperties.alt.trim() : "";
    if (!alt) {
      reportOnce(diagnostics, line, {
        code: "missing-image-alt",
        severity: "info",
        message: "Image is missing alt text; emitted an empty alt attribute.",
      });
    }
    ctx.setProperty(node, "alt", alt);
    ctx.setProperty(node, "border", "0");
    setDimensionProperty(node, originalProperties, ctx, "width");
    setDimensionProperty(node, originalProperties, ctx, "height");
  }

  if (node.tagName === "table") {
    ctx.setProperty(node, "width", "100%");
    ctx.setProperty(node, "cellSpacing", "0");
    ctx.setProperty(node, "cellPadding", "0");
    ctx.setProperty(node, "border", "0");

    const columns = countTableColumns(node);
    if (columns > maxComfortableTableColumns) {
      report(diagnostics, line, {
        code: "wide-table",
        severity: "info",
        message: `Table has ${columns} columns; it may be hard to read on narrow mobile screens.`,
      });
    }
  }

  if (node.tagName === "pre") {
    const longest = longestCodeLine(node);
    if (longest > maxComfortableCodeLine) {
      report(diagnostics, line, {
        code: "long-code-line",
        severity: "warning",
        message: `Code block has long lines (up to ${longest} display columns); they may wrap awkwardly in some clients.`,
      });
    }
  }

  if (node.tagName === "th" || node.tagName === "td") {
    const align = textAlign ?? "left";
    ctx.setProperty(node, "align", align);
    ctx.setProperty(node, "vAlign", "top");
    if (node.tagName === "th") {
      const bgColor = legacyColorAttribute(config.theme.tableHeaderBackground);
      if (bgColor) ctx.setProperty(node, "bgColor", bgColor);
    }
  }

  if (node.tagName === "a" && !linkKept) {
    return;
  }

  const style = styleForElement(
    node.tagName,
    config,
    textAlign ?? (node.tagName === "th" || node.tagName === "td" ? "left" : undefined),
    isScreenReaderOnly(originalProperties.className),
  );
  if (style) {
    ctx.setProperty(node, "style", style);
  }
}

function replaceSectionWithDiv(
  node: Readonly<Element>,
  ctx: ElementMutationContext,
  config: Config,
  diagnostics: Diagnostic[],
  line: number | undefined,
): void {
  const properties: Element["properties"] = {};
  const id = node.properties.id;
  if (typeof id === "string" && isSafeId(id)) {
    properties.id = id;
  }

  // Footnote sections are the only sections styled as a block; other sections become a neutral div.
  if (isFootnoteSection(node.properties)) {
    reportOnce(diagnostics, line, {
      code: "footnote-support",
      severity: "info",
      message: "Footnotes may render inconsistently across some email clients.",
    });
    properties.style = footnoteStyle(config);
  }

  ctx.replaceNode(node, {
    type: "element",
    tagName: "div",
    properties,
    children: node.children,
  });
}

function addDecisionDiagnostic(diagnostics: Diagnostic[], decision: UrlDecision, line: number | undefined): void {
  if (!decision.diagnostic) return;
  report(diagnostics, line, decision.diagnostic);
}

function report(diagnostics: Diagnostic[], line: number | undefined, diagnostic: Diagnostic): void {
  addDiagnostic(diagnostics, line === undefined ? diagnostic : { ...diagnostic, line });
}

function reportOnce(diagnostics: Diagnostic[], line: number | undefined, diagnostic: Diagnostic): void {
  addDiagnosticOnce(diagnostics, line === undefined ? diagnostic : { ...diagnostic, line });
}

function lineOf(node: { position?: { start: { line: number } } | undefined }): number | undefined {
  return node.position?.start.line;
}

function indentContent(html: string, spaces: number): string {
  return html.split("\n").join("\n" + " ".repeat(spaces));
}

function decideLinkUrl(value: unknown): UrlDecision | undefined {
  if (typeof value !== "string") return undefined;

  const trimmed = value.trim();
  if (!isNonEmptySafeUrlText(trimmed) || trimmed.startsWith("//")) {
    return removeUrl("unsafe-link-url", `Removed unsafe link URL ${JSON.stringify(trimmed)}.`);
  }

  if (trimmed.startsWith("#")) {
    return { action: "keep", value: trimmed };
  }

  if (isRelativeUrl(trimmed)) {
    return {
      action: "keep",
      value: trimmed,
      diagnostic: {
        code: "relative-link-url",
        severity: "info",
        message: `Relative link URL ${JSON.stringify(trimmed)} may not work in email clients; prefer an absolute HTTPS URL.`,
      },
    };
  }

  const protocol = protocolOf(trimmed);
  if (protocol === "https:" || protocol === "mailto:" || protocol === "tel:") {
    return { action: "keep", value: trimmed };
  }
  if (protocol === "http:") {
    return {
      action: "keep",
      value: trimmed,
      diagnostic: {
        code: "insecure-link-url",
        severity: "warning",
        message: `HTTP link URL ${JSON.stringify(trimmed)} may be blocked or downgraded; prefer HTTPS.`,
      },
    };
  }

  return removeUrl("unsafe-link-url", `Removed unsafe link URL ${JSON.stringify(trimmed)}.`);
}

function decideImageUrl(value: unknown, alt: unknown): UrlDecision {
  const fallbackText = imageFallbackText(alt);
  if (typeof value !== "string") {
    return removeImage("unsafe-image-url", "Removed image without a valid source URL.", fallbackText);
  }

  const trimmed = value.trim();
  if (!isNonEmptySafeUrlText(trimmed) || trimmed.startsWith("//")) {
    return removeImage("unsafe-image-url", `Removed image with unsafe URL ${JSON.stringify(trimmed)}.`, fallbackText);
  }

  if (trimmed.startsWith("#") || isRelativeUrl(trimmed)) {
    return removeImage(
      "relative-image-url",
      `Removed relative image URL ${JSON.stringify(trimmed)}; email images must use absolute HTTPS URLs.`,
      fallbackText,
    );
  }

  const protocol = protocolOf(trimmed);
  if (protocol === "https:") {
    return { action: "keep", value: trimmed };
  }
  if (protocol === "http:") {
    return removeImage(
      "insecure-image-url",
      `Removed HTTP image URL ${JSON.stringify(trimmed)}; email images should use HTTPS.`,
      fallbackText,
    );
  }

  return removeImage("unsafe-image-url", `Removed image with unsafe URL ${JSON.stringify(trimmed)}.`, fallbackText);
}

function removeUrl(code: "unsafe-link-url", message: string): UrlDecision {
  return { action: "remove", diagnostic: { code, severity: "warning", message } };
}

function removeImage(
  code: "unsafe-image-url" | "insecure-image-url" | "relative-image-url",
  message: string,
  fallbackText: string | undefined,
): UrlDecision {
  const decision: UrlDecision = { action: "remove", diagnostic: { code, severity: "warning", message } };
  if (fallbackText) {
    decision.fallbackText = fallbackText;
  }
  return decision;
}

function isNonEmptySafeUrlText(value: string): boolean {
  return Boolean(value) && !/[\u0000-\u001f\u007f]/.test(value) && !/\s/.test(value);
}

function isRelativeUrl(value: string): boolean {
  return value.startsWith("/") || value.startsWith("./") || value.startsWith("../") || !/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(value);
}

function protocolOf(value: string): string | undefined {
  const protocolMatch = /^[a-zA-Z][a-zA-Z\d+.-]*:/.exec(value);
  if (!protocolMatch) return undefined;

  try {
    return new URL(value).protocol;
  } catch {
    return undefined;
  }
}

function imageFallbackText(alt: unknown): string | undefined {
  if (typeof alt !== "string") return undefined;
  const trimmed = alt.trim();
  return trimmed ? `[Image: ${trimmed}]` : undefined;
}

function setDimensionProperty(
  node: Readonly<Element>,
  originalProperties: Record<string, unknown>,
  ctx: ElementMutationContext,
  key: "width" | "height",
): void {
  const value = originalProperties[key];
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    ctx.setProperty(node, key, value);
  }
  if (typeof value === "string" && /^\d+$/.test(value)) {
    ctx.setProperty(node, key, value);
  }
}

function isFootnoteSection(properties: Record<string, unknown>): boolean {
  if ("dataFootnotes" in properties) return true;
  const className = properties.className;
  return Array.isArray(className) ? className.includes("footnotes") : className === "footnotes";
}

function countTableColumns(table: Readonly<Element>): number {
  const row = findFirstRow(table);
  if (!row) return 0;
  return row.children.filter(
    (child) => child.type === "element" && (child.tagName === "th" || child.tagName === "td"),
  ).length;
}

function findFirstRow(node: Readonly<Element>): Element | undefined {
  for (const child of node.children) {
    if (child.type !== "element") continue;
    if (child.tagName === "tr") return child;
    const nested = findFirstRow(child);
    if (nested) return nested;
  }
  return undefined;
}

function longestCodeLine(pre: Readonly<Element>): number {
  let max = 0;
  for (const codeLine of collectText(pre).split("\n")) {
    const columns = displayColumns(codeLine);
    if (columns > max) max = columns;
  }
  return max;
}

function collectText(node: Readonly<Element>): string {
  let text = "";
  for (const child of node.children) {
    if (child.type === "text") text += child.value;
    else if (child.type === "element") text += collectText(child);
  }
  return text;
}

function isCheckbox(properties: Record<string, unknown>): boolean {
  return properties.type === "checkbox";
}

function isCheckedCheckbox(properties: Record<string, unknown>): boolean {
  return properties.checked === true || properties.checked === "" || properties.checked === "checked";
}

function isSafeId(value: string): boolean {
  return /^[A-Za-z][A-Za-z0-9_:.\-]*$/.test(value);
}

function isScreenReaderOnly(value: unknown): boolean {
  return Array.isArray(value) ? value.includes("sr-only") : value === "sr-only";
}

function textAlignFromStyle(value: unknown): "left" | "right" | "center" | undefined {
  if (typeof value !== "string") return undefined;

  const match = /(?:^|;)\s*text-align\s*:\s*(left|right|center)\s*(?:;|$)/i.exec(value);
  return match?.[1]?.toLowerCase() as "left" | "right" | "center" | undefined;
}

function styleForElement(tagName: string, config: Config, textAlign?: string, screenReaderOnly = false): string | undefined {
  const { theme } = config;

  switch (tagName) {
    case "p":
      return rawStyleAttribute({ margin: theme.paragraphMargin, color: theme.textColor, "line-height": theme.lineHeight });
    case "h1":
      return rawStyleAttribute({ margin: theme.h1Margin, color: theme.headingColor, "font-size": theme.h1FontSize, "line-height": theme.h1LineHeight, "font-weight": "700" });
    case "h2":
      if (screenReaderOnly) {
        return rawStyleAttribute({ margin: theme.paragraphMargin, color: theme.mutedTextColor, "font-size": theme.smallFontSize, "line-height": theme.lineHeight, "font-weight": "700" });
      }
      return rawStyleAttribute({ margin: theme.h2Margin, color: theme.headingColor, "font-size": theme.h2FontSize, "line-height": theme.h2LineHeight, "font-weight": "700" });
    case "h3":
      return rawStyleAttribute({ margin: theme.h3Margin, color: theme.headingColor, "font-size": theme.h3FontSize, "line-height": theme.h3LineHeight, "font-weight": "700" });
    case "h4":
    case "h5":
    case "h6":
      return rawStyleAttribute({ margin: theme.minorHeadingMargin, color: theme.headingColor, "font-size": theme.minorHeadingFontSize, "line-height": theme.minorHeadingLineHeight, "font-weight": "700" });
    case "a":
      return rawStyleAttribute({ color: theme.linkColor, "text-decoration": "underline" });
    case "ul":
    case "ol":
      return rawStyleAttribute({ margin: theme.listMargin, padding: theme.listPadding });
    case "li":
      return rawStyleAttribute({ margin: theme.listItemMargin });
    case "blockquote":
      return rawStyleAttribute({ margin: theme.blockquoteMargin, padding: theme.blockquotePadding, borderLeft: `4px solid ${theme.blockquoteBorderColor}`, color: theme.textColor });
    case "code":
      return rawStyleAttribute({ background: theme.codeBackground, padding: theme.codePadding, "font-family": theme.codeFontFamily, "font-size": theme.codeFontSize });
    case "pre":
      return rawStyleAttribute({ margin: theme.preMargin, padding: theme.prePadding, background: theme.codeBackground, "white-space": "pre-wrap", "overflow-wrap": "break-word", "font-family": theme.codeFontFamily, "font-size": theme.preFontSize, "line-height": theme.preLineHeight });
    case "hr":
      return rawStyleAttribute({ border: "0", "border-top": `1px solid ${theme.borderColor}`, margin: theme.hrMargin });
    case "img":
      return rawStyleAttribute({ display: "block", "max-width": "100%", height: "auto", border: "0", outline: "none", "text-decoration": "none", "-ms-interpolation-mode": "bicubic", margin: theme.imageMargin });
    case "table":
      return rawStyleAttribute({ width: "100%", "border-collapse": "collapse", "mso-table-lspace": "0pt", "mso-table-rspace": "0pt", margin: theme.tableMargin });
    case "th":
      return rawStyleAttribute({ border: `1px solid ${theme.borderColor}`, padding: theme.tableCellPadding, background: theme.tableHeaderBackground, color: theme.textColor, "font-weight": "700", "text-align": textAlign });
    case "td":
      return rawStyleAttribute({ border: `1px solid ${theme.borderColor}`, padding: theme.tableCellPadding, color: theme.textColor, "text-align": textAlign });
    default:
      return undefined;
  }
}

function footnoteStyle(config: Config): string {
  const { theme } = config;
  return rawStyleAttribute({
    margin: theme.footnoteMargin,
    padding: theme.footnotePadding,
    "border-top": `1px solid ${theme.borderColor}`,
    color: theme.mutedTextColor,
    "font-size": theme.smallFontSize,
  });
}

function legacyColorAttribute(value: string): string | undefined {
  const trimmed = value.trim();
  if (!/^(#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?|black|white|transparent)$/i.test(trimmed)) {
    return undefined;
  }

  return escapeAttributeValue(trimmed);
}

function escapeAttributeValue(value: string | number): string {
  return Bun.escapeHTML(String(value));
}

function rawStyleAttribute(styles: Record<string, string | number | undefined>): string {
  return Object.entries(styles)
    .filter((entry): entry is [string, string | number] => entry[1] !== undefined)
    .map(([property, value]) => `${toKebabCase(property)}:${value}`)
    .join(";");
}

function escapedStyleAttribute(styles: Record<string, string | number | undefined>): string {
  return Bun.escapeHTML(rawStyleAttribute(styles));
}

function toKebabCase(value: string): string {
  return value.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

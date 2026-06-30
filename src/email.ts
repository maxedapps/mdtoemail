import { basename } from "node:path";
import { defineHastPlugin, type HastPluginInput } from "satteri";
import type { Element } from "hast";
import type { Config } from "./config";
import { addDiagnostic, addDiagnosticOnce, type Diagnostic } from "./diagnostics";

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
  "section",
]);

export function emailHastPlugin(config: Config, diagnostics: Diagnostic[] = []): HastPluginInput {
  return defineHastPlugin({
    name: "email-sanitizer",
    element: {
      filter: [],
      visit(node, ctx) {
        if (node.tagName === "input") {
          if (isCheckbox(node.properties)) {
            addDiagnosticOnce(diagnostics, {
              code: "task-list-input-transformed",
              severity: "info",
              message: "Converted task-list checkbox inputs to plain text symbols for email compatibility.",
            });
            return { type: "text", value: isCheckedCheckbox(node.properties) ? "☑ " : "☐ " };
          }

          addDiagnostic(diagnostics, {
            code: "unsupported-element",
            severity: "warning",
            message: "Removed unsupported <input> element.",
          });
          ctx.removeNode(node);
          return;
        }

        if (!allowedElements.has(node.tagName)) {
          addDiagnostic(diagnostics, {
            code: "unsupported-element",
            severity: "warning",
            message: `Removed unsupported <${node.tagName}> element.`,
          });
          ctx.removeNode(node);
          return;
        }

        const originalProperties = { ...node.properties };
        addPropertyDiagnostics(node, originalProperties, diagnostics);
        stripProperties(node, ctx);
        applySafeProperties(node, originalProperties, ctx, config);
      },
    },
    raw(node) {
      addDiagnosticOnce(diagnostics, {
        code: "raw-html-escaped",
        severity: "warning",
        message: "Escaped raw HTML because arbitrary HTML is not supported in email-safe output.",
      });
      return { type: "text", value: node.value };
    },
  });
}

export function renderEmailDocument(contentHtml: string, inputPath: string, config: Config): string {
  const width = config.email.containerWidth;
  const title = Bun.escapeHTML(basename(inputPath));
  const bodyStyle = escapedStyleAttribute({
    margin: "0",
    padding: "0",
    background: config.theme.backgroundColor,
  });
  const outerTableStyle = escapedStyleAttribute({
    width: "100%",
    background: config.theme.backgroundColor,
  });
  const outerCellStyle = escapedStyleAttribute({
    padding: config.email.outerPadding,
  });
  const innerTableStyle = escapedStyleAttribute({
    width: `${width}px`,
    "max-width": `${width}px`,
    background: config.theme.containerBackground,
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
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="${outerTableStyle}">
      <tr>
        <td align="center" style="${outerCellStyle}">
          <table role="presentation" width="${width}" cellspacing="0" cellpadding="0" border="0" style="${innerTableStyle}">
            <tr>
              <td style="${contentCellStyle}">
                ${contentHtml}
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
  if (typeof value !== "string") return false;

  const trimmed = value.trim();
  if (!trimmed || /[\u0000-\u001f\u007f]/.test(trimmed) || trimmed.startsWith("//")) {
    return false;
  }

  if (trimmed.startsWith("#") || trimmed.startsWith("/") || trimmed.startsWith("./") || trimmed.startsWith("../")) {
    return true;
  }

  const protocolMatch = /^[a-zA-Z][a-zA-Z\d+.-]*:/.exec(trimmed);
  if (!protocolMatch) return false;

  try {
    const protocol = new URL(trimmed).protocol;
    if (kind === "image") {
      return protocol === "https:" || protocol === "http:";
    }

    return protocol === "https:" || protocol === "http:" || protocol === "mailto:" || protocol === "tel:";
  } catch {
    return false;
  }
}

interface ElementMutationContext {
  setProperty(node: Readonly<Element>, key: string, value: unknown): void;
  removeNode(node: Readonly<Element>): void;
}

function addPropertyDiagnostics(
  node: Readonly<Element>,
  originalProperties: Record<string, unknown>,
  diagnostics: Diagnostic[],
): void {
  if (
    node.tagName === "a" &&
    typeof originalProperties.href === "string" &&
    !isAllowedUrl(originalProperties.href, "link")
  ) {
    addDiagnostic(diagnostics, {
      code: "unsafe-link-url",
      severity: "warning",
      message: `Removed unsafe link URL ${JSON.stringify(originalProperties.href.trim())}.`,
    });
  }

  if (node.tagName === "img") {
    const src = originalProperties.src;
    if (typeof src === "string" && !isAllowedUrl(src, "image")) {
      addDiagnostic(diagnostics, {
        code: "unsafe-image-url",
        severity: "warning",
        message: `Removed image with unsafe URL ${JSON.stringify(src.trim())}.`,
      });
    } else if (typeof src !== "string") {
      addDiagnostic(diagnostics, {
        code: "unsafe-image-url",
        severity: "warning",
        message: "Removed image without a valid source URL.",
      });
    }
  }
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
): void {
  const id = originalProperties.id;
  if (typeof id === "string" && isSafeId(id)) {
    ctx.setProperty(node, "id", id);
  }

  if (node.tagName === "a") {
    const href = safeUrlValue(originalProperties.href, "link");
    if (href) {
      ctx.setProperty(node, "href", href);
    }
  }

  if (node.tagName === "img") {
    const src = safeUrlValue(originalProperties.src, "image");
    if (!src) {
      ctx.removeNode(node);
      return;
    }

    ctx.setProperty(node, "src", src);
    if (typeof originalProperties.alt === "string") {
      ctx.setProperty(node, "alt", originalProperties.alt);
    }
    setDimensionProperty(node, originalProperties, ctx, "width");
    setDimensionProperty(node, originalProperties, ctx, "height");
  }

  const style = styleForElement(node.tagName, config, textAlignFromStyle(originalProperties.style));
  if (style) {
    ctx.setProperty(node, "style", style);
  }
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

function safeUrlValue(value: unknown, kind: "link" | "image"): string | undefined {
  return typeof value === "string" && isAllowedUrl(value, kind) ? value.trim() : undefined;
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

function textAlignFromStyle(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;

  const match = /(?:^|;)\s*text-align\s*:\s*(left|right|center)\s*(?:;|$)/i.exec(value);
  return match?.[1]?.toLowerCase();
}

function styleForElement(tagName: string, config: Config, textAlign?: string): string | undefined {
  const { theme } = config;

  switch (tagName) {
    case "p":
      return rawStyleAttribute({ margin: theme.paragraphMargin, color: theme.textColor, "line-height": theme.lineHeight });
    case "h1":
      return rawStyleAttribute({ margin: theme.h1Margin, color: theme.headingColor, "font-size": theme.h1FontSize, "line-height": theme.h1LineHeight, "font-weight": "700" });
    case "h2":
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
      return rawStyleAttribute({ margin: theme.preMargin, padding: theme.prePadding, background: theme.codeBackground, overflow: "auto", "font-family": theme.codeFontFamily, "font-size": theme.preFontSize, "line-height": theme.preLineHeight });
    case "hr":
      return rawStyleAttribute({ border: "0", "border-top": `1px solid ${theme.borderColor}`, margin: theme.hrMargin });
    case "img":
      return rawStyleAttribute({ display: "block", "max-width": "100%", height: "auto", border: "0", margin: theme.imageMargin });
    case "table":
      return rawStyleAttribute({ width: "100%", "border-collapse": "collapse", margin: theme.tableMargin });
    case "th":
      return rawStyleAttribute({ border: `1px solid ${theme.borderColor}`, padding: theme.tableCellPadding, background: theme.tableHeaderBackground, color: theme.textColor, "font-weight": "700", "text-align": textAlign });
    case "td":
      return rawStyleAttribute({ border: `1px solid ${theme.borderColor}`, padding: theme.tableCellPadding, color: theme.textColor, "text-align": textAlign });
    case "section":
      return rawStyleAttribute({ margin: theme.footnoteMargin, padding: theme.footnotePadding, "border-top": `1px solid ${theme.borderColor}`, color: theme.mutedTextColor, "font-size": theme.smallFontSize });
    default:
      return undefined;
  }
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

import { describe, expect, test } from "vitest";
import { parse, type DefaultTreeAdapterMap } from "parse5";
import { defaultConfig, type Config } from "../src/config.ts";
import { renderEmailDocument } from "../src/email.ts";
import { renderMarkdown } from "../src/markdown.ts";

type Node = DefaultTreeAdapterMap["node"];
type Element = DefaultTreeAdapterMap["element"];
type ParentNode = DefaultTreeAdapterMap["parentNode"];

const highlightedConfig: Config = {
  ...defaultConfig,
  markdown: { ...defaultConfig.markdown, syntaxHighlighting: true },
  email: { ...defaultConfig.email },
  theme: { ...defaultConfig.theme },
};

const darkHighlightedConfig: Config = {
  ...highlightedConfig,
  markdown: { ...highlightedConfig.markdown, syntaxHighlightingMode: "dark" },
};

const allowedAttributes = new Map<string, ReadonlySet<string>>([
  ["table", new Set(["role", "width", "cellspacing", "cellpadding", "border", "bgcolor", "style"])],
  ["tbody", new Set()],
  ["tr", new Set()],
  ["td", new Set(["aria-hidden", "align", "valign", "width", "bgcolor", "style"])],
  ["code", new Set(["style"])],
  ["span", new Set(["style"])],
  ["br", new Set()],
]);

const allowedStyleProperties = new Set([
  "width",
  "padding",
  "font-family",
  "font-size",
  "line-height",
  "mso-line-height-rule",
  "color",
  "background-color",
  "border-collapse",
  "mso-table-lspace",
  "mso-table-rspace",
  "table-layout",
  "font-weight",
  "font-style",
  "text-decoration",
]);

describe("highlighted full-document HTML validity", () => {
  test("parses default, highlighted, numbered, empty-line, and malicious fixtures without errors", async () => {
    const fixtures: Array<[string, Config]> = [
      ["```ts\nconst x = 1;\n```", defaultConfig],
      ["```ts\nconst x = 1;\n```", highlightedConfig],
      ["```ts {1} lineNumbers\nconst x = 1;\n```", highlightedConfig],
      ["```ts {1} lineNumbers\nconst x = 1;\n```", darkHighlightedConfig],
      ["```ts\nfirst\n\nthird\n```", highlightedConfig],
      ["```html\n</td><script>alert(1)</script>&\"' style=data-x\n```", highlightedConfig],
    ];

    for (const [markdown, config] of fixtures) {
      const html = await fullDocument(markdown, config);
      const errors: string[] = [];
      parse(html, {
        onParseError(error) {
          errors.push(error.code);
        },
      });
      expect(errors, markdown).toEqual([]);
    }
  });

  test("retains exact explicit table hierarchy, one code cell per source line, and controlled attributes", async () => {
    const html = await fullDocument(
      "```ts {2} lineNumbers\n\tfirst\n\nthird\n```",
      highlightedConfig,
    );
    const document = parse(html);
    const outer = findHighlightOuterTable(document);
    expect(outer).toBeDefined();

    const outerTbody = onlyElementChild(outer!, "tbody");
    const outerRow = onlyElementChild(outerTbody, "tr");
    const wrapperCell = onlyElementChild(outerRow, "td");
    const inner = onlyElementChild(wrapperCell, "table");
    const innerTbody = onlyElementChild(inner, "tbody");
    const rows = elementChildren(innerTbody);

    expect(rows.map((row) => row.tagName)).toEqual(["tr", "tr", "tr"]);
    expect(rows.map((row) => elementChildren(row).map((cell) => cell.tagName))).toEqual([
      ["td", "td"],
      ["td", "td"],
      ["td", "td"],
    ]);
    expect(rows.map((row) => textContent(elementChildren(row)[0]!))).toEqual(["1", "2", "3"]);
    expect(
      rows
        .map((row) => {
          const codeCell = elementChildren(row)[1]!;
          return onlyElementChild(codeCell, "code");
        })
        .map(textContent),
    ).toEqual(["    first", "", "third"]);
    expect(findElements(rows[1]!, "br")).toHaveLength(1);
    expect(attribute(elementChildren(rows[1]!)[1]!, "bgcolor")).toBe("#fff8c5");

    const controlled = [outer!, ...findElements(outer!, "*")];
    for (const element of controlled) {
      expect(allowedAttributes.has(element.tagName)).toBe(true);
      const allowed = allowedAttributes.get(element.tagName);
      if (!allowed) throw new Error(`unexpected controlled element <${element.tagName}>`);
      for (const attr of element.attrs) {
        expect(allowed.has(attr.name), `${element.tagName}[${attr.name}]`).toBe(true);
        expect(attr.name).not.toMatch(/^(?:class|data-|on)/i);
        if (attr.name === "style") {
          expect(attr.value).not.toMatch(/(?:var\(|url\(|[<>])/i);
          for (const declaration of attr.value.split(";")) {
            expect(allowedStyleProperties.has(declaration.split(":", 1)[0]!), declaration).toBe(
              true,
            );
          }
        }
      }
      if (element.tagName === "table") {
        expect(
          Object.fromEntries(element.attrs.map((attr) => [attr.name, attr.value])),
        ).toMatchObject({
          role: "presentation",
          width: "100%",
          cellspacing: "0",
          cellpadding: "0",
          border: "0",
          bgcolor: "#f6f8fa",
        });
      }
    }
    for (const span of findElements(outer!, "span")) {
      expect(attribute(span, "style")).toMatch(
        /^(?:(?:color:#[0-9a-f]{6}|font-weight:700|font-style:italic|text-decoration:underline);?)+$/,
      );
    }
  });

  test("uses the dark profile without changing the controlled tree", async () => {
    const html = await fullDocument(
      "```ts {1} lineNumbers\nconst x = 1;\n```",
      darkHighlightedConfig,
    );
    const document = parse(html);
    const outer = findHighlightOuterTable(document, "#0d1117")!;
    const numberCell = findElements(outer, "td").find(
      (cell) => attribute(cell, "aria-hidden") === "true",
    )!;
    const highlightedCell = findElements(outer, "td").find(
      (cell) => attribute(cell, "bgcolor") === "#3b3424",
    )!;

    expect(attribute(outer, "bgcolor")).toBe("#0d1117");
    expect(attribute(numberCell, "style")).toContain("color:#8b949e");
    expect(attribute(highlightedCell, "style")).toContain("background-color:#3b3424");
    expect(findElements(outer, "code")).toHaveLength(1);
  });

  test("keeps line numbers opt-in in the exact unnumbered row tree", async () => {
    const html = await fullDocument("```ts\nconst x = 1;\n```", highlightedConfig);
    const document = parse(html);
    const outer = findHighlightOuterTable(document)!;
    const outerTbody = onlyElementChild(outer, "tbody");
    const outerRow = onlyElementChild(outerTbody, "tr");
    const wrapperCell = onlyElementChild(outerRow, "td");
    const inner = onlyElementChild(wrapperCell, "table");
    const innerTbody = onlyElementChild(inner, "tbody");
    const sourceRow = onlyElementChild(innerTbody, "tr");
    const cells = elementChildren(sourceRow);

    expect(cells).toHaveLength(1);
    expect(onlyElementChild(cells[0]!, "code")).toBeDefined();
    expect(
      findElements(outer, "td").some((cell) => attribute(cell, "aria-hidden") === "true"),
    ).toBe(false);
  });

  test("keeps malicious-looking source as text under code without structural injection or foster parenting", async () => {
    const source = "</td><script>alert(1)</script>&\"' style=data-x";
    const html = await fullDocument(`\`\`\`html\n${source}\n\`\`\``, highlightedConfig);
    const document = parse(html);
    const outer = findHighlightOuterTable(document)!;
    const code = findElements(outer, "code")[0]!;

    expect(textContent(code)).toBe(source);
    expect(findElements(outer, "script")).toEqual([]);
    expect(findElements(document, "script")).toEqual([]);
    expect(html).toContain("&lt;/");
    expect(html).toContain("&lt;");
    expect(html).not.toContain("<script>");
    expect(code.parentNode?.nodeName).toBe("td");
  });
});

async function fullDocument(markdown: string, config: Config): Promise<string> {
  const rendered = await renderMarkdown(markdown, config);
  return renderEmailDocument(rendered.html, "fixture.md", config);
}

function findHighlightOuterTable(root: ParentNode, background = "#f6f8fa"): Element | undefined {
  return findElements(root, "table").find((table) => {
    if (attribute(table, "bgcolor") !== background) return false;
    const tbody = elementChildren(table)[0];
    const row = tbody && elementChildren(tbody)[0];
    const cell = row && elementChildren(row)[0];
    return cell ? elementChildren(cell).some((child) => child.tagName === "table") : false;
  });
}

function onlyElementChild(parent: ParentNode, tagName: string): Element {
  const children = elementChildren(parent);
  expect(children).toHaveLength(1);
  expect(children[0]?.tagName).toBe(tagName);
  return children[0]!;
}

function elementChildren(parent: ParentNode): Element[] {
  return parent.childNodes.filter(isElement);
}

function findElements(root: ParentNode, tagName: string): Element[] {
  const found: Element[] = [];
  for (const child of root.childNodes) {
    if (!isElement(child)) continue;
    if (tagName === "*" || child.tagName === tagName) found.push(child);
    found.push(...findElements(child, tagName));
  }
  return found;
}

function isElement(node: Node): node is Element {
  return "tagName" in node;
}

function attribute(element: Element, name: string): string | undefined {
  return element.attrs.find((attr) => attr.name === name)?.value;
}

function textContent(root: ParentNode): string {
  let value = "";
  for (const child of root.childNodes) {
    if (child.nodeName === "#text" && "value" in child) value += child.value;
    else if (isElement(child)) value += textContent(child);
  }
  return value;
}

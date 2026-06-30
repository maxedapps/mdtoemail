import { describe, expect, test } from "bun:test";
import { defaultConfig, type Config } from "../src/config";
import { markdownFeatures, renderMarkdown } from "../src/markdown";

describe("renderMarkdown", () => {
  test("renders CommonMark basics", async () => {
    const rendered = await renderMarkdown("# Hello\n\nThis is **bold** and *emphasized*.", defaultConfig);

    expect(rendered.frontmatter).toBeNull();
    expect(rendered.html).toContain("<h1>Hello</h1>");
    expect(rendered.html).toContain("<strong>bold</strong>");
    expect(rendered.html).toContain("<em>emphasized</em>");
  });

  test("renders links", async () => {
    const rendered = await renderMarkdown("[Site](https://example.com)", defaultConfig);

    expect(rendered.html).toContain('href="https://example.com"');
    expect(rendered.html).toContain(">Site</a>");
  });

  test("maps markdown config to Sätteri features", () => {
    expect(markdownFeatures(withMarkdownConfig({ gfm: false, frontmatter: false }))).toEqual({
      gfm: false,
      frontmatter: false,
    });
  });

  test("renders GFM tables when enabled", async () => {
    const rendered = await renderMarkdown("| A | B |\n|---|---|\n| 1 | 2 |", defaultConfig);

    expect(rendered.html).toContain("<table>");
    expect(rendered.html).toContain("<th>A</th>");
    expect(rendered.html).toContain("<td>2</td>");
  });

  test("does not render GFM tables or strikethrough when GFM is disabled", async () => {
    const table = await renderMarkdown(
      "| A | B |\n|---|---|\n| 1 | 2 |",
      withMarkdownConfig({ gfm: false }),
    );
    const strikethrough = await renderMarkdown("~~x~~", withMarkdownConfig({ gfm: false }));

    expect(table.html).not.toContain("<table>");
    expect(table.html).toContain("| A | B |");
    expect(strikethrough.html).toContain("~~x~~");
    expect(strikethrough.html).not.toContain("<del>");
  });

  test("documents current GFM task list output", async () => {
    const rendered = await renderMarkdown("- [x] done\n- [ ] todo", defaultConfig);

    expect(rendered.html).toContain("contains-task-list");
    expect(rendered.html).toContain('type="checkbox"');
  });

  test("extracts frontmatter when enabled", async () => {
    const rendered = await renderMarkdown("---\ntitle: Test\n---\n# Hi", defaultConfig);

    expect(rendered.frontmatter).toEqual({ kind: "yaml", value: "title: Test" });
    expect(rendered.html).toContain("<h1>Hi</h1>");
    expect(rendered.html).not.toContain("title: Test");
  });

  test("treats frontmatter delimiters as Markdown when frontmatter is disabled", async () => {
    const rendered = await renderMarkdown(
      "---\ntitle: Test\n---\n# Hi",
      withMarkdownConfig({ frontmatter: false }),
    );

    expect(rendered.frontmatter).toBeNull();
    expect(rendered.html).toContain("<hr>");
    expect(rendered.html).toContain("<h2>title: Test</h2>");
  });

  test("escapes raw HTML by default", async () => {
    const inline = await renderMarkdown("a <em>x</em> b", defaultConfig);
    const block = await renderMarkdown("<script>alert(1)</script>", defaultConfig);

    expect(inline.html).toContain("<p>a &lt;em&gt;x&lt;/em&gt; b</p>");
    expect(block.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(block.html).not.toContain("<script>");
  });

  test("passes raw HTML through when enabled", async () => {
    const rendered = await renderMarkdown("<em>x</em>", withMarkdownConfig({ rawHtml: true }));

    expect(rendered.html).toContain("<em>x</em>");
  });

  test("documents known URL sanitizer gap", async () => {
    const rendered = await renderMarkdown("[bad](javascript:alert(1))", defaultConfig);

    expect(rendered.html).toContain('href="javascript:alert(1)"');
  });
});

function withMarkdownConfig(markdown: Partial<Config["markdown"]>): Config {
  return {
    markdown: {
      ...defaultConfig.markdown,
      ...markdown,
    },
    email: { ...defaultConfig.email },
    theme: { ...defaultConfig.theme },
  };
}

import { describe, expect, test } from "bun:test";
import { defaultConfig, type Config } from "../src/config";
import { countWarnings } from "../src/diagnostics";
import { renderMarkdown } from "../src/markdown";

describe("renderMarkdown", () => {
  test("renders and styles CommonMark basics", async () => {
    const rendered = await renderMarkdown("# Hello\n\nThis is **bold** and *emphasized*.", defaultConfig);

    expect(rendered.frontmatter).toBeNull();
    expect(rendered.diagnostics).toEqual([]);
    expect(rendered.html).toContain("<h1 style=");
    expect(rendered.html).toContain(">Hello</h1>");
    expect(rendered.html).toContain("<strong>bold</strong>");
    expect(rendered.html).toContain("<em>emphasized</em>");
  });

  test("keeps safe links and adds link styles", async () => {
    const rendered = await renderMarkdown("[Site](https://example.com)", defaultConfig);

    expect(rendered.diagnostics).toEqual([]);
    expect(rendered.html).toContain('href="https://example.com"');
    expect(rendered.html).toContain(`style="color:${defaultConfig.theme.linkColor};text-decoration:underline"`);
    expect(rendered.html).toContain(">Site</a>");
  });

  test("renders and styles GFM tables with legacy attributes", async () => {
    const rendered = await renderMarkdown("| A | B |\n|---|---|\n| 1 | 2 |", defaultConfig);

    expect(rendered.html).toContain('<table width="100%" cellspacing="0" cellpadding="0" border="0" style=');
    expect(rendered.html).toContain("border-collapse:collapse");
    expect(rendered.html).toContain("mso-table-lspace:0pt");
    expect(rendered.html).toContain('<th align="left" valign="top" bgcolor="#f3f4f6" style=');
    expect(rendered.html).toContain(">A</th>");
    expect(rendered.html).toContain('<td align="left" valign="top" style=');
    expect(rendered.html).toContain(">2</td>");
  });

  test("preserves GFM table alignment as attributes and styles", async () => {
    const rendered = await renderMarkdown("| A | B | C |\n|:--|:-:|--:|\n| 1 | 2 | 3 |", defaultConfig);

    expect(rendered.html).toContain('align="left"');
    expect(rendered.html).toContain('align="center"');
    expect(rendered.html).toContain('align="right"');
    expect(rendered.html).toContain("text-align:left");
    expect(rendered.html).toContain("text-align:center");
    expect(rendered.html).toContain("text-align:right");
  });

  test("does not render GFM tables or strikethrough when GFM is disabled", async () => {
    const table = await renderMarkdown(
      "| A | B |\n|---|---|\n| 1 | 2 |",
      withMarkdownConfig({ gfm: false }),
    );
    const strikethrough = await renderMarkdown("~~x~~", withMarkdownConfig({ gfm: false }));

    expect(table.html).not.toContain("<table");
    expect(table.html).toContain("| A | B |");
    expect(strikethrough.html).toContain("~~x~~");
    expect(strikethrough.html).not.toContain("<del>");
  });

  test("transforms GFM task-list inputs into text symbols", async () => {
    const rendered = await renderMarkdown("- [x] done\n- [ ] todo", defaultConfig);

    expect(rendered.diagnostics).toEqual([
      {
        code: "task-list-input-transformed",
        severity: "info",
        message: "Converted task-list checkbox inputs to plain text symbols for email compatibility.",
      },
    ]);
    expect(countWarnings(rendered.diagnostics)).toBe(0);
    expect(rendered.html).toContain("☑ ");
    expect(rendered.html).toContain("☐ ");
    expect(rendered.html).not.toContain("<input");
    expect(rendered.html).not.toContain("contains-task-list");
    expect(rendered.html).not.toContain("task-list-item");
  });

  test("extracts frontmatter when enabled", async () => {
    const rendered = await renderMarkdown("---\ntitle: Test\n---\n# Hi", defaultConfig);

    expect(rendered.frontmatter).toEqual({ kind: "yaml", value: "title: Test" });
    expect(rendered.html).toContain(">Hi</h1>");
    expect(rendered.html).not.toContain("title: Test");
  });

  test("extracts TOML frontmatter when enabled", async () => {
    const rendered = await renderMarkdown("+++\ntitle = \"Test\"\n+++\n# Hi", defaultConfig);

    expect(rendered.frontmatter).toEqual({ kind: "toml", value: "title = \"Test\"" });
    expect(rendered.html).toContain(">Hi</h1>");
    expect(rendered.html).not.toContain("title = \"Test\"");
  });

  test("treats frontmatter delimiters as Markdown when frontmatter is disabled", async () => {
    const rendered = await renderMarkdown(
      "---\ntitle: Test\n---\n# Hi",
      withMarkdownConfig({ frontmatter: false }),
    );

    expect(rendered.frontmatter).toBeNull();
    expect(rendered.html).toContain("<hr style=");
    expect(rendered.html).toContain(">title: Test</h2>");
  });

  test("always escapes raw HTML in email-safe output", async () => {
    const inline = await renderMarkdown("a <em>x</em> b", defaultConfig);
    const script = await renderMarkdown("<script>alert(1)</script>", defaultConfig);

    expect(inline.diagnostics).toEqual([
      {
        code: "raw-html-escaped",
        severity: "warning",
        message: "Escaped raw HTML because arbitrary HTML is not supported in email-safe output.",
        line: 1,
      },
    ]);
    expect(script.diagnostics).toEqual(inline.diagnostics);
    // rehype-stringify encodes `<`/`&` in text (HTML-equivalent to also encoding `>`).
    expect(inline.html).toContain("a &lt;em>x&lt;/em> b");
    expect(script.html).toContain("&lt;script>alert(1)&lt;/script>");
    expect(script.html).not.toContain("<script>");
  });

  test("removes unsafe link URLs while preserving link text", async () => {
    const rendered = await renderMarkdown("[bad](javascript:alert(1))", defaultConfig);

    expect(rendered.diagnostics).toEqual([
      {
        code: "unsafe-link-url",
        severity: "warning",
        message: 'Removed unsafe link URL "javascript:alert(1)".',
        line: 1,
      },
    ]);
    expect(rendered.html).toContain(">bad</a>");
    expect(rendered.html).not.toContain("javascript:");
    expect(rendered.html).not.toContain("text-decoration:underline");
  });

  test("keeps HTTP and relative links with diagnostics", async () => {
    const rendered = await renderMarkdown("[http](http://example.com) [rel](/pricing) [hash](#x)", defaultConfig);

    expect(rendered.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "insecure-link-url",
      "relative-link-url",
    ]);
    expect(rendered.html).toContain('href="http://example.com"');
    expect(rendered.html).toContain('href="/pricing"');
    expect(rendered.html).toContain('href="#x"');
  });

  test("rejects protocol-relative and obfuscated URLs", async () => {
    const rendered = await renderMarkdown(
      "[a](//example.com) [b](JAVASCRIPT:alert(1)) [c](java\tscript:alert(1))",
      defaultConfig,
    );

    expect(rendered.html).not.toContain("href=");
    expect(rendered.html).not.toContain("javascript:");
    expect(rendered.html).not.toContain("//example.com");
  });

  test("validates image URLs and emits safer image attributes", async () => {
    const safe = await renderMarkdown("![Alt](https://example.com/a.png)", defaultConfig);
    const unsafe = await renderMarkdown("![x](javascript:alert(1))", defaultConfig);

    expect(safe.diagnostics).toEqual([]);
    expect(unsafe.diagnostics).toEqual([
      {
        code: "unsafe-image-url",
        severity: "warning",
        message: 'Removed image with unsafe URL "javascript:alert(1)".',
        line: 1,
      },
    ]);
    expect(safe.html).toContain('<img src="https://example.com/a.png" alt="Alt" border="0" style=');
    expect(safe.html).toContain("-ms-interpolation-mode:bicubic");
    expect(unsafe.html).toContain("[Image: x]");
    expect(unsafe.html).not.toContain("<img");
    expect(unsafe.html).not.toContain("javascript:");
  });

  test("removes HTTP and relative images with fallback text", async () => {
    const rendered = await renderMarkdown("![Logo](http://example.com/logo.png) ![Local](./logo.png)", defaultConfig);

    expect(rendered.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "insecure-image-url",
      "relative-image-url",
    ]);
    expect(rendered.html).toContain("[Image: Logo]");
    expect(rendered.html).toContain("[Image: Local]");
    expect(rendered.html).not.toContain("<img");
  });

  test("emits info diagnostic for missing image alt text", async () => {
    const rendered = await renderMarkdown("![](https://example.com/a.png)", defaultConfig);

    expect(rendered.diagnostics).toEqual([
      {
        code: "missing-image-alt",
        severity: "info",
        message: "Image is missing alt text; emitted an empty alt attribute.",
        line: 1,
      },
    ]);
    expect(countWarnings(rendered.diagnostics)).toBe(0);
    expect(rendered.html).toContain('alt=""');
  });

  test("preserves footnote text and safe in-document ids", async () => {
    const rendered = await renderMarkdown("Footnote[^1].\n\n[^1]: Note text.", defaultConfig);

    expect(rendered.html).toContain("Note text.");
    expect(rendered.html).toContain('href="#user-content-fn-1"');
    expect(rendered.html).toContain('id="user-content-fn-1"');
    expect(rendered.html).toContain("<div style=\"margin:24px 0 0 0;padding:16px 0 0 0;border-top:1px solid #dddddd");
    expect(rendered.html).not.toContain("<section");
    expect(rendered.html).not.toContain('class="footnotes"');
    expect(rendered.html).not.toContain("data-footnotes");
  });

  test("styles nested links and table cells", async () => {
    const rendered = await renderMarkdown("- [Site](https://example.com)\n\n| A |\n|---|\n| [B](https://example.com/b) |", defaultConfig);

    expect(rendered.html).toContain(`<a href="https://example.com" style="color:${defaultConfig.theme.linkColor};text-decoration:underline">Site</a>`);
    expect(rendered.html).toContain('<td align="left" valign="top" style=');
    expect(rendered.html).toContain(`<a href="https://example.com/b" style="color:${defaultConfig.theme.linkColor};text-decoration:underline">B</a>`);
  });

  test("emits one raw HTML diagnostic for multiple raw nodes", async () => {
    const rendered = await renderMarkdown("<em>a</em> <strong>b</strong>", defaultConfig);

    expect(rendered.diagnostics).toHaveLength(1);
    expect(rendered.diagnostics[0]?.code).toBe("raw-html-escaped");
  });

  test("keeps diagnostic order for unsafe links and images", async () => {
    const rendered = await renderMarkdown(
      "[bad](javascript:alert(1))\n\n![x](data:text/plain,x)",
      defaultConfig,
    );

    expect(rendered.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "unsafe-link-url",
      "unsafe-image-url",
    ]);
  });

  test("does not double-escape styles set by the HAST plugin", async () => {
    const rendered = await renderMarkdown("[Site](https://example.com)", {
      ...defaultConfig,
      theme: {
        ...defaultConfig.theme,
        linkColor: 'rgb(0, "0", 0)',
      },
    });

    expect(rendered.html).toContain('style="color:rgb(0, &quot;0&quot;, 0);text-decoration:underline"');
    expect(rendered.html).not.toContain("&amp;#x22;");
  });

  test("uses expanded theme tokens in generated styles", async () => {
    const rendered = await renderMarkdown("# Title\n\n| A |\n|---|\n| `B` |\n\nFootnote[^1].\n\n[^1]: Note.", {
      ...defaultConfig,
      theme: {
        ...defaultConfig.theme,
        headingColor: "#111111",
        h1FontSize: "34px",
        h1Margin: "1px 2px 3px 4px",
        tableHeaderBackground: "#eeeeee",
        tableCellPadding: "11px",
        borderColor: "#cccccc",
        codeBackground: "#fafafa",
        mutedTextColor: "#777777",
        smallFontSize: "12px",
      },
    });

    expect(rendered.html).toContain('style="margin:1px 2px 3px 4px;color:#111111;font-size:34px;line-height:1.25;font-weight:700"');
    expect(rendered.html).toContain('style="border:1px solid #cccccc;padding:11px;background:#eeeeee;color:#222222;font-weight:700;text-align:left"');
    expect(rendered.html).toContain('bgcolor="#eeeeee"');
    expect(rendered.html).toContain('background:#fafafa');
    expect(rendered.html).toContain('style="margin:24px 0 0 0;padding:16px 0 0 0;border-top:1px solid #cccccc;color:#777777;font-size:12px"');
  });

  test("code blocks wrap instead of relying on scrollbars", async () => {
    const rendered = await renderMarkdown("```ts\nconst value = 'very long line';\n```", defaultConfig);

    expect(rendered.html).toContain("white-space:pre-wrap");
    expect(rendered.html).toContain("overflow-wrap:break-word");
    expect(rendered.html).not.toContain("overflow:auto");
  });

  test("renders opt-in highlighted blocks after sanitization with fixed controlled markup", async () => {
    const rendered = await renderMarkdown(
      "```ts {1} lineNumbers\n\tconst source = '<script data-x=\\\"y\\\">&</script>';\n\n```",
      withMarkdownConfig({ syntaxHighlighting: true }),
    );

    expect(rendered.diagnostics).toEqual([]);
    expect(rendered.html).toContain('<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#f6f8fa"');
    expect(rendered.html).toContain('aria-hidden="true" align="right" valign="top" width="40"');
    expect(rendered.html).toContain('bgcolor="#fff8c5"');
    expect(rendered.html).toContain("\u00a0\u00a0\u00a0\u00a0");
    expect(rendered.html).toContain("&lt;script");
    expect(rendered.html).toContain("&amp;");
    expect(rendered.html).toContain("<br>");
    expect(rendered.html).not.toContain("<pre");
    expect(rendered.html).not.toMatch(/<(?:style|script)\b/i);
    expect(rendered.html).not.toMatch(/<(?:table|tbody|tr|td|code|span|br)\b[^>]*\s(?:class|data-[\w-]+|on[\w-]+)=/i);
    expect(rendered.html).not.toContain("var(");
  });

  test("keeps inline code and raw HTML policies unchanged when highlighting is enabled", async () => {
    const rendered = await renderMarkdown(
      "Use `const x = 1` and <span style=\"color:red\">raw</span>.\n\n```ts\nconst x = 1;\n```",
      withMarkdownConfig({ syntaxHighlighting: true }),
    );

    expect(rendered.diagnostics).toContainEqual({
      code: "raw-html-escaped",
      severity: "warning",
      message: "Escaped raw HTML because arbitrary HTML is not supported in email-safe output.",
      line: 1,
    });
    expect(rendered.html).toContain(`<code style="background:${defaultConfig.theme.codeBackground}`);
    expect(rendered.html).toContain('&lt;span style="color:red">raw&lt;/span>');
    expect(rendered.html).not.toContain('<span style="color:red">raw</span>');
    expect(rendered.html).toContain('<table role="presentation"');
  });

  test("keeps the default-off fenced-code output byte-equivalent to explicit disabled config", async () => {
    const markdown = "```ts {1} lineNumbers\nconst x = 1;\n```";
    const defaultRendered = await renderMarkdown(markdown, defaultConfig);
    const disabledRendered = await renderMarkdown(markdown, withMarkdownConfig({ syntaxHighlighting: false }));

    expect(defaultRendered).toEqual(disabledRendered);
    expect(defaultRendered.html).toContain("<pre style=");
    expect(defaultRendered.html).not.toContain('role="presentation"');
  });

  test("reports each unsafe URL per occurrence with its source line", async () => {
    const rendered = await renderMarkdown("[a](javascript:alert(1))\n\n[b](javascript:alert(2))", defaultConfig);

    expect(rendered.diagnostics).toEqual([
      { code: "unsafe-link-url", severity: "warning", message: 'Removed unsafe link URL "javascript:alert(1)".', line: 1 },
      { code: "unsafe-link-url", severity: "warning", message: 'Removed unsafe link URL "javascript:alert(2)".', line: 3 },
    ]);
  });

  test("renders empty-href links as plain text without link styling", async () => {
    const rendered = await renderMarkdown("Click [here]() now.", defaultConfig);

    expect(rendered.html).toContain(">here</a>");
    expect(rendered.html).not.toContain("text-decoration:underline");
    expect(rendered.html).not.toContain("href=");
  });

  test("warns about wide tables above the column threshold", async () => {
    const wide = await renderMarkdown(
      "| a | b | c | d | e | f | g |\n|---|---|---|---|---|---|---|\n| 1 | 2 | 3 | 4 | 5 | 6 | 7 |",
      defaultConfig,
    );
    const narrow = await renderMarkdown(
      "| a | b | c | d | e | f |\n|---|---|---|---|---|---|\n| 1 | 2 | 3 | 4 | 5 | 6 |",
      defaultConfig,
    );

    expect(wide.diagnostics).toEqual([
      { code: "wide-table", severity: "info", message: "Table has 7 columns; it may be hard to read on narrow mobile screens.", line: 1 },
    ]);
    expect(countWarnings(wide.diagnostics)).toBe(0);
    expect(narrow.diagnostics).toEqual([]);
  });

  test("emits an info diagnostic when footnotes are present", async () => {
    const rendered = await renderMarkdown("Text[^1].\n\n[^1]: Note text.", defaultConfig);

    expect(rendered.diagnostics).toContainEqual({
      code: "footnote-support",
      severity: "info",
      message: "Footnotes may render inconsistently across some email clients.",
    });
    expect(countWarnings(rendered.diagnostics)).toBe(0);
  });

  test("warns about long code lines but not short ones", async () => {
    const long = await renderMarkdown("```\n" + "x".repeat(100) + "\n```", defaultConfig);
    const short = await renderMarkdown("```\nshort line\n```", defaultConfig);

    expect(long.diagnostics).toEqual([
      { code: "long-code-line", severity: "warning", message: "Code block has long lines (up to 100 display columns); they may wrap awkwardly in some clients.", line: 1 },
    ]);
    expect(countWarnings(long.diagnostics)).toBe(1);
    expect(short.diagnostics).toEqual([]);
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

import { describe, expect, test } from "bun:test";
import { defaultConfig } from "../src/config";
import { isAllowedUrl, renderEmailDocument } from "../src/email";

describe("isAllowedUrl", () => {
  test("allows safe link URLs", () => {
    expect(isAllowedUrl("https://example.com", "link")).toBe(true);
    expect(isAllowedUrl("http://example.com", "link")).toBe(true);
    expect(isAllowedUrl("mailto:test@example.com", "link")).toBe(true);
    expect(isAllowedUrl("tel:+123456789", "link")).toBe(true);
    expect(isAllowedUrl("#section", "link")).toBe(true);
    expect(isAllowedUrl("/path", "link")).toBe(true);
    expect(isAllowedUrl("./path", "link")).toBe(true);
    expect(isAllowedUrl("../path", "link")).toBe(true);
    expect(isAllowedUrl("path", "link")).toBe(true);
  });

  test("allows only https image URLs", () => {
    expect(isAllowedUrl("https://example.com/a.png", "image")).toBe(true);
    expect(isAllowedUrl("http://example.com/a.png", "image")).toBe(false);
    expect(isAllowedUrl("/a.png", "image")).toBe(false);
    expect(isAllowedUrl("./a.png", "image")).toBe(false);
    expect(isAllowedUrl("mailto:test@example.com", "image")).toBe(false);
  });

  test("rejects unsafe or ambiguous URLs", () => {
    expect(isAllowedUrl("javascript:alert(1)", "link")).toBe(false);
    expect(isAllowedUrl("JAVASCRIPT:alert(1)", "link")).toBe(false);
    expect(isAllowedUrl("java\tscript:alert(1)", "link")).toBe(false);
    expect(isAllowedUrl("//example.com", "link")).toBe(false);
    expect(isAllowedUrl("data:text/html,x", "image")).toBe(false);
    expect(isAllowedUrl("cid:logo", "image")).toBe(false);
    expect(isAllowedUrl("file:///tmp/x", "link")).toBe(false);
  });
});

describe("renderEmailDocument", () => {
  test("wraps content in a table-based email document", () => {
    const html = renderEmailDocument("<p>Hello</p>", "welcome.md", defaultConfig);

    expect(html).toContain("<!doctype html>");
    expect(html).toContain("<title>welcome.md</title>");
    expect(html).toContain('role="presentation"');
    expect(html).toContain(`width="${defaultConfig.email.containerWidth}"`);
    expect(html).toContain('cellspacing="0"');
    expect(html).toContain('cellpadding="0"');
    expect(html).toContain('border="0"');
    expect(html).toContain('bgcolor="#f4f4f4"');
    expect(html).toContain('bgcolor="#ffffff"');
    expect(html).toContain('align="left" valign="top"');
    expect(html).toContain("mso-table-lspace:0pt");
    expect(html).toContain("mso-table-rspace:0pt");
    expect(html).toContain("width:100%;max-width:600px");
    expect(html).toContain("<p>Hello</p>");
    expect(html).not.toContain("<main");
  });

  test("indents content when pretty is enabled", () => {
    const compact = renderEmailDocument("<p>one</p>\n<p>two</p>", "welcome.md", defaultConfig);
    const pretty = renderEmailDocument("<p>one</p>\n<p>two</p>", "welcome.md", {
      ...defaultConfig,
      email: { ...defaultConfig.email, pretty: true },
    });

    expect(compact).toContain("<p>one</p>\n<p>two</p>");
    expect(pretty).toContain("<p>one</p>\n                <p>two</p>");
  });

  test("uses configured outer padding", () => {
    const html = renderEmailDocument("<p>Hello</p>", "welcome.md", {
      ...defaultConfig,
      email: {
        ...defaultConfig.email,
        outerPadding: "40px 20px",
      },
    });

    expect(html).toContain('style="padding:40px 20px"');
  });

  test("escapes hand-built wrapper attributes and styles", () => {
    const config = {
      ...defaultConfig,
      theme: {
        ...defaultConfig.theme,
        fontFamily: 'Arial, "Helvetica Neue", sans-serif',
        backgroundColor: '#fff" data-bad="x',
      },
    };

    const html = renderEmailDocument("<p>Hello</p>", "welcome.md", config);

    expect(html).toContain("font-family:Arial, &quot;Helvetica Neue&quot;, sans-serif");
    expect(html).not.toContain('data-bad="x');
    expect(html).not.toContain('bgcolor="#fff&quot; data-bad=&quot;x"');
  });
});

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
  });

  test("allows only http and https image URLs", () => {
    expect(isAllowedUrl("https://example.com/a.png", "image")).toBe(true);
    expect(isAllowedUrl("http://example.com/a.png", "image")).toBe(true);
    expect(isAllowedUrl("mailto:test@example.com", "image")).toBe(false);
  });

  test("rejects unsafe or ambiguous URLs", () => {
    expect(isAllowedUrl("javascript:alert(1)", "link")).toBe(false);
    expect(isAllowedUrl("JAVASCRIPT:alert(1)", "link")).toBe(false);
    expect(isAllowedUrl("java\tscript:alert(1)", "link")).toBe(false);
    expect(isAllowedUrl("//example.com", "link")).toBe(false);
    expect(isAllowedUrl("data:text/html,x", "image")).toBe(false);
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
    expect(html).toContain("<p>Hello</p>");
    expect(html).not.toContain("<main");
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

  test("escapes hand-built wrapper attributes", () => {
    const config = {
      ...defaultConfig,
      theme: {
        ...defaultConfig.theme,
        fontFamily: 'Arial, "Helvetica Neue", sans-serif',
      },
    };

    const html = renderEmailDocument("<p>Hello</p>", "welcome.md", config);

    expect(html).toContain("font-family:Arial, &quot;Helvetica Neue&quot;, sans-serif");
  });
});

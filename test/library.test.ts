import { afterEach, describe, expect, test } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compileMarkdownEmail, defaultConfig, type Config, type Diagnostic } from "../src/index.ts";

const tempDirs: string[] = [];
const originalCwd = process.cwd();
const originalLog = console.log;
const originalError = console.error;

afterEach(async () => {
  console.log = originalLog;
  console.error = originalError;
  process.chdir(originalCwd);
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("compileMarkdownEmail", () => {
  test("returns a complete table-based email document", async () => {
    const result = await compileMarkdownEmail("# Hello\n\nThis is **bold**.");

    expect(result.html).toContain("<!doctype html>");
    expect(result.html).toContain('role="presentation"');
    expect(result.html).toContain("<table");
    expect(result.html).toContain("<h1 style=");
    expect(result.html).toContain(">Hello</h1>");
    expect(result.html).toContain("<strong>bold</strong>");
    expect(result.frontmatter).toBeNull();
  });

  test("defaults the document title to empty", async () => {
    const result = await compileMarkdownEmail("# Hello");

    expect(result.html).toContain("<title></title>");
  });

  test("uses and escapes an explicit title", async () => {
    const result = await compileMarkdownEmail("# Hello", { title: `A <b>title</b> & "quoted"` });

    expect(result.html).toContain(
      "<title>A &lt;b&gt;title&lt;/b&gt; &amp; &quot;quoted&quot;</title>",
    );
    expect(result.html).not.toContain("<title>A <b>");
    expect(result.html).not.toContain("<b>title</b>");
  });

  test("returns frozen diagnostics for unsafe links", async () => {
    const result = await compileMarkdownEmail("[bad](javascript:alert(1))", {
      config: {
        ...defaultConfig,
        email: { ...defaultConfig.email, strict: true, warnings: false },
      },
    });

    expect(result.diagnostics).toEqual([
      {
        code: "unsafe-link-url",
        severity: "warning",
        message: 'Removed unsafe link URL "javascript:alert(1)".',
        line: 1,
      },
    ]);
    expect(result.html).toContain(">bad</a>");
    expect(result.html).not.toContain("javascript:");
    expect(Object.isFrozen(result.diagnostics)).toBe(true);
    expect(Object.isFrozen(result.diagnostics[0])).toBe(true);
    expect(() => {
      Object.defineProperty(result.diagnostics, result.diagnostics.length, {
        value: {
          code: "unsafe-link-url",
          severity: "warning",
          message: "caller mutation",
        } satisfies Diagnostic,
      });
    }).toThrow();
    expect(() => {
      Object.defineProperty(result.diagnostics[0], "message", { value: "caller mutation" });
    }).toThrow();
  });

  test("returns YAML frontmatter and does not render it as title or body", async () => {
    const result = await compileMarkdownEmail("---\ntitle: Test\n---\n# Hi");

    expect(result.frontmatter).toEqual({ kind: "yaml", value: "title: Test" });
    expect(result.html).toContain("<title></title>");
    expect(result.html).toContain(">Hi</h1>");
    expect(result.html).not.toContain("title: Test");
  });

  test("clones a supplied resolved config", async () => {
    const config: Config = {
      markdown: { ...defaultConfig.markdown },
      email: { ...defaultConfig.email },
      theme: { ...defaultConfig.theme, linkColor: "#111111" },
    };

    const first = await compileMarkdownEmail("[Site](https://example.com)", { config });
    config.theme.linkColor = "#abcdef";
    config.markdown.gfm = false;

    expect(first.html).toContain("color:#111111");
    expect(first.html).not.toContain("color:#abcdef");

    const second = await compileMarkdownEmail("[Site](https://example.com)", { config });
    expect(second.html).toContain("color:#abcdef");
  });

  test("rejects malformed runtime config", async () => {
    const config: Config = {
      ...defaultConfig,
      markdown: { ...defaultConfig.markdown },
    };
    Object.defineProperty(config.markdown, "gfm", { value: "yes" });

    await expect(compileMarkdownEmail("# Hello", { config })).rejects.toThrow(
      "Invalid config: markdown.gfm must be a boolean.",
    );
  });

  test("rejects unsafe theme tokens", async () => {
    await expect(
      compileMarkdownEmail("# Hello", {
        config: {
          ...defaultConfig,
          theme: { ...defaultConfig.theme, backgroundColor: "url(https://example.com/x.png)" },
        },
      }),
    ).rejects.toThrow(
      "Invalid config: theme.backgroundColor contains unsupported CSS characters or functions.",
    );
  });

  test("warns when the complete document reaches 85 KiB UTF-8", async () => {
    const encoder = new TextEncoder();
    const limit = 85 * 1024;
    const probe = await compileMarkdownEmail("x");
    const extra = limit - encoder.encode(probe.html).byteLength;
    expect(extra).toBeGreaterThan(0);

    const below = await compileMarkdownEmail("x".repeat(extra));
    const at = await compileMarkdownEmail("x".repeat(extra + 1));

    expect(encoder.encode(below.html).byteLength).toBe(limit - 1);
    expect(below.diagnostics.some((diagnostic) => diagnostic.code === "large-email-html")).toBe(
      false,
    );
    expect(encoder.encode(at.html).byteLength).toBe(limit);
    expect(at.diagnostics).toContainEqual({
      code: "large-email-html",
      severity: "warning",
      message: `Generated HTML is ${limit} bytes; email clients may clip messages at this size.`,
    });
  });

  test("does not print diagnostics or load a surprising config file", async () => {
    const dir = await makeTempDir();
    await writeFile(join(dir, "mdtoemail.toml"), '[theme]\nlink_color = "#ff00ff"\n');

    const logs: unknown[][] = [];
    const errors: unknown[][] = [];
    console.log = (...args: unknown[]) => {
      logs.push(args);
    };
    console.error = (...args: unknown[]) => {
      errors.push(args);
    };

    process.chdir(dir);
    const result = await compileMarkdownEmail(
      "[Site](https://example.com) [bad](javascript:alert(1))",
    );

    expect(result.html).toContain(`color:${defaultConfig.theme.linkColor}`);
    expect(result.html).not.toContain("#ff00ff");
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain("unsafe-link-url");
    expect(logs).toEqual([]);
    expect(errors).toEqual([]);
  });
});

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "mdtoemail-library-"));
  tempDirs.push(dir);
  return dir;
}

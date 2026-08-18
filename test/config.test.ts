import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { defaultConfig, mergeConfig, validateResolvedConfig } from "../src/config";
import { loadConfig } from "../src/config-loader";
import { deriveOutputPath } from "../src/cli";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("config", () => {
  test("returns defaults when no config file exists", async () => {
    const dir = await makeTempDir();

    expect(await loadConfig({ cwd: dir })).toEqual(defaultConfig);
  });

  test("maps a full TOML override", () => {
    const config = mergeConfig({
      markdown: {
        gfm: false,
        frontmatter: false,
        syntax_highlighting: true,
        syntax_highlighting_mode: "dark",
      },
      email: {
        container_width: 720,
        outer_padding: "12px 8px",
        warnings: false,
        strict: true,
        pretty: true,
      },
      theme: {
        background_color: "#000000",
        container_background: "#111111",
        text_color: "#eeeeee",
        heading_color: "#ffffff",
        muted_text_color: "#aaaaaa",
        link_color: "#66ccff",
        border_color: "#333333",
        table_header_background: "#222222",
        code_background: "#1a1a1a",
        blockquote_border_color: "#444444",
        font_family: "Georgia, serif",
        code_font_family: "Courier New, monospace",
        base_font_size: "18px",
        small_font_size: "13px",
        line_height: "1.7",
        content_padding: "40px",
        h1_font_size: "32px",
        h2_font_size: "26px",
        h3_font_size: "22px",
        minor_heading_font_size: "18px",
        h1_line_height: "1.2",
        h2_line_height: "1.25",
        h3_line_height: "1.3",
        minor_heading_line_height: "1.4",
        h1_margin: "0 0 24px 0",
        h2_margin: "28px 0 18px 0",
        h3_margin: "22px 0 14px 0",
        minor_heading_margin: "18px 0 10px 0",
        paragraph_margin: "0 0 18px 0",
        list_margin: "0 0 18px 0",
        list_padding: "0 0 0 28px",
        list_item_margin: "0 0 10px 0",
        blockquote_margin: "0 0 18px 0",
        blockquote_padding: "0 0 0 18px",
        code_font_size: "92%",
        code_padding: "3px 5px",
        pre_margin: "0 0 18px 0",
        pre_padding: "14px",
        pre_font_size: "15px",
        pre_line_height: "1.45",
        hr_margin: "28px 0",
        image_margin: "0 0 18px 0",
        table_margin: "0 0 18px 0",
        table_cell_padding: "10px",
        footnote_margin: "28px 0 0 0",
        footnote_padding: "18px 0 0 0",
      },
    });

    expect(config).toEqual({
      markdown: {
        gfm: false,
        frontmatter: false,
        syntaxHighlighting: true,
        syntaxHighlightingMode: "dark",
      },
      email: {
        containerWidth: 720,
        outerPadding: "12px 8px",
        warnings: false,
        strict: true,
        pretty: true,
      },
      theme: {
        backgroundColor: "#000000",
        containerBackground: "#111111",
        textColor: "#eeeeee",
        headingColor: "#ffffff",
        mutedTextColor: "#aaaaaa",
        linkColor: "#66ccff",
        borderColor: "#333333",
        tableHeaderBackground: "#222222",
        codeBackground: "#1a1a1a",
        blockquoteBorderColor: "#444444",
        fontFamily: "Georgia, serif",
        codeFontFamily: "Courier New, monospace",
        baseFontSize: "18px",
        smallFontSize: "13px",
        lineHeight: "1.7",
        contentPadding: "40px",
        h1FontSize: "32px",
        h2FontSize: "26px",
        h3FontSize: "22px",
        minorHeadingFontSize: "18px",
        h1LineHeight: "1.2",
        h2LineHeight: "1.25",
        h3LineHeight: "1.3",
        minorHeadingLineHeight: "1.4",
        h1Margin: "0 0 24px 0",
        h2Margin: "28px 0 18px 0",
        h3Margin: "22px 0 14px 0",
        minorHeadingMargin: "18px 0 10px 0",
        paragraphMargin: "0 0 18px 0",
        listMargin: "0 0 18px 0",
        listPadding: "0 0 0 28px",
        listItemMargin: "0 0 10px 0",
        blockquoteMargin: "0 0 18px 0",
        blockquotePadding: "0 0 0 18px",
        codeFontSize: "92%",
        codePadding: "3px 5px",
        preMargin: "0 0 18px 0",
        prePadding: "14px",
        preFontSize: "15px",
        preLineHeight: "1.45",
        hrMargin: "28px 0",
        imageMargin: "0 0 18px 0",
        tableMargin: "0 0 18px 0",
        tableCellPadding: "10px",
        footnoteMargin: "28px 0 0 0",
        footnotePadding: "18px 0 0 0",
      },
    });
  });

  test("partial overrides preserve defaults", () => {
    expect(mergeConfig({ theme: { text_color: "#123456" } })).toEqual({
      ...defaultConfig,
      markdown: { ...defaultConfig.markdown },
      email: { ...defaultConfig.email },
      theme: {
        ...defaultConfig.theme,
        textColor: "#123456",
      },
    });
  });

  test("rejects invalid known field types", () => {
    expect(() => mergeConfig({ email: { container_width: "600" } })).toThrow(
      "Invalid config: email.container_width must be a positive number.",
    );
    expect(() => mergeConfig({ email: { strict: "yes" } })).toThrow(
      "Invalid config: email.strict must be a boolean.",
    );
    expect(() => mergeConfig({ markdown: { syntax_highlighting: "yes" } })).toThrow(
      "Invalid config: markdown.syntax_highlighting must be a boolean.",
    );
    expect(() => mergeConfig({ markdown: { syntax_highlighting_mode: "auto" } })).toThrow(
      'Invalid config: markdown.syntax_highlighting_mode must be "light" or "dark".',
    );
    expect(() => mergeConfig({ markdown: { syntax_highlighting_mode: true } })).toThrow(
      'Invalid config: markdown.syntax_highlighting_mode must be "light" or "dark".',
    );
  });

  test("rejects unsafe or fragile CSS token values", () => {
    expect(() => mergeConfig({ theme: { link_color: "blue; display:flex" } })).toThrow(
      "Invalid config: theme.link_color contains unsupported CSS characters or functions.",
    );
    expect(() => mergeConfig({ theme: { background_color: "url(https://example.com/x.png)" } })).toThrow(
      "Invalid config: theme.background_color contains unsupported CSS characters or functions.",
    );
    expect(() => mergeConfig({ theme: { content_padding: "calc(16px + 1vw)" } })).toThrow(
      "Invalid config: theme.content_padding contains unsupported CSS characters or functions.",
    );
    expect(() => mergeConfig({ theme: { background_color: "oklch(60% 0.2 40)" } })).toThrow(
      "Invalid config: theme.background_color contains unsupported CSS characters or functions.",
    );
    expect(() => mergeConfig({ theme: { h1_font_size: "clamp(24px, 5vw, 36px)" } })).toThrow(
      "Invalid config: theme.h1_font_size contains unsupported CSS characters or functions.",
    );
    expect(() => mergeConfig({ theme: { table_margin: "1vw" } })).toThrow(
      "Invalid config: theme.table_margin contains unsupported CSS characters or functions.",
    );
  });

  test("ignores unknown keys in project configs", () => {
    expect(
      mergeConfig({
        unknown: true,
        theme: {
          unknown_color: "#ffffff",
          link_color: "#ff00ff",
        },
      }).theme.linkColor,
    ).toBe("#ff00ff");
  });

  test("validateResolvedConfig accepts a cloned default config", () => {
    const validated = validateResolvedConfig(defaultConfig);
    expect(validated).toEqual(defaultConfig);
    expect(validated).not.toBe(defaultConfig);
    expect(validated.markdown).not.toBe(defaultConfig.markdown);
    expect(validated.email).not.toBe(defaultConfig.email);
    expect(validated.theme).not.toBe(defaultConfig.theme);
  });

  test("validateResolvedConfig ignores extra unknown keys", () => {
    expect(
      validateResolvedConfig({
        extra: true,
        markdown: { ...defaultConfig.markdown, extra: 1 },
        email: { ...defaultConfig.email, extra: "nope" },
        theme: { ...defaultConfig.theme, extraColor: "#fff" },
      }),
    ).toEqual(defaultConfig);
  });

  test("validateResolvedConfig rejects malformed types", () => {
    expect(() =>
      validateResolvedConfig({
        ...defaultConfig,
        markdown: { ...defaultConfig.markdown, gfm: "yes" },
      }),
    ).toThrow("Invalid config: markdown.gfm must be a boolean.");
    expect(() =>
      validateResolvedConfig({
        ...defaultConfig,
        email: { ...defaultConfig.email, containerWidth: "600" },
      }),
    ).toThrow("Invalid config: email.containerWidth must be a positive number.");
    expect(() =>
      validateResolvedConfig({
        ...defaultConfig,
        markdown: { ...defaultConfig.markdown, syntaxHighlightingMode: "auto" },
      }),
    ).toThrow('Invalid config: markdown.syntaxHighlightingMode must be "light" or "dark".');
  });

  test("validateResolvedConfig rejects unsafe theme tokens", () => {
    expect(() =>
      validateResolvedConfig({
        ...defaultConfig,
        theme: { ...defaultConfig.theme, linkColor: "blue; display:flex" },
      }),
    ).toThrow("Invalid config: theme.linkColor contains unsupported CSS characters or functions.");
    expect(() =>
      validateResolvedConfig({
        ...defaultConfig,
        theme: { ...defaultConfig.theme, backgroundColor: "url(https://example.com/x.png)" },
      }),
    ).toThrow("Invalid config: theme.backgroundColor contains unsupported CSS characters or functions.");
    expect(() =>
      validateResolvedConfig({
        ...defaultConfig,
        theme: { ...defaultConfig.theme, contentPadding: "calc(16px + 1vw)" },
      }),
    ).toThrow("Invalid config: theme.contentPadding contains unsupported CSS characters or functions.");
    expect(() =>
      validateResolvedConfig({
        ...defaultConfig,
        email: { ...defaultConfig.email, outerPadding: "oklch(60% 0.2 40)" },
      }),
    ).toThrow("Invalid config: email.outerPadding contains unsupported CSS characters or functions.");
  });

  test("loads an explicit TOML config file", async () => {
    const dir = await makeTempDir();
    const path = join(dir, "custom.toml");
    await writeFile(path, "[theme]\nbackground_color = \"#abcdef\"\n");

    expect((await loadConfig({ configPath: path })).theme.backgroundColor).toBe("#abcdef");
  });

  test("loads a named theme relative to the config file directory", async () => {
    const dir = await makeTempDir();
    const configPath = join(dir, "mdtoemail.toml");
    await mkdir(join(dir, "themes"));
    await writeFile(configPath, "[theme]\nextends = \"newsletter\"\nlink_color = \"#dc2626\"\n");
    await writeFile(join(dir, "themes", "newsletter.toml"), "[theme]\nbackground_color = \"#fef3c7\"\nlink_color = \"#92400e\"\n");

    const config = await loadConfig({ configPath });

    expect(config.theme.backgroundColor).toBe("#fef3c7");
    expect(config.theme.linkColor).toBe("#dc2626");
  });

  test("loads a named theme from cwd", async () => {
    const dir = await makeTempDir();
    await mkdir(join(dir, "themes"));
    await writeFile(join(dir, "themes", "minimal.toml"), "[theme]\nbackground_color = \"#ffffff\"\n");

    expect((await loadConfig({ cwd: dir, theme: "minimal" })).theme.backgroundColor).toBe("#ffffff");
  });

  test("CLI theme option overrides config-selected theme", async () => {
    const dir = await makeTempDir();
    const configPath = join(dir, "mdtoemail.toml");
    await mkdir(join(dir, "themes"));
    await writeFile(configPath, "[theme]\nextends = \"newsletter\"\n");
    await writeFile(join(dir, "themes", "newsletter.toml"), "[theme]\nbackground_color = \"#fef3c7\"\n");
    await writeFile(join(dir, "themes", "minimal.toml"), "[theme]\nbackground_color = \"#ffffff\"\n");

    expect((await loadConfig({ configPath, theme: "minimal" })).theme.backgroundColor).toBe("#ffffff");
  });

  test("loads CLI path-like themes relative to cwd", async () => {
    const dir = await makeTempDir();
    await writeFile(join(dir, "theme.toml"), "[theme]\nbackground_color = \"#fafafa\"\n");

    expect((await loadConfig({ cwd: dir, theme: "./theme.toml" })).theme.backgroundColor).toBe("#fafafa");
  });

  test("rejects invalid theme files", async () => {
    const dir = await makeTempDir();
    await writeFile(join(dir, "theme.toml"), "[markdown]\nsyntax_highlighting = true\n");
    await expect(loadConfig({ cwd: dir, theme: "./theme.toml" })).rejects.toThrow(
      "Invalid theme: root.markdown is not allowed.",
    );

    await writeFile(join(dir, "theme.toml"), "[email]\nstrict = true\n");
    await expect(loadConfig({ cwd: dir, theme: "./theme.toml" })).rejects.toThrow(
      "Invalid theme: email.strict is not allowed.",
    );

    await writeFile(join(dir, "theme.toml"), "[email]\npretty = true\n");
    await expect(loadConfig({ cwd: dir, theme: "./theme.toml" })).rejects.toThrow(
      "Invalid theme: email.pretty is not allowed.",
    );

    await writeFile(join(dir, "theme.toml"), "[theme]\nextends = \"base\"\n");
    await expect(loadConfig({ cwd: dir, theme: "./theme.toml" })).rejects.toThrow(
      "Invalid theme: theme.extends is not allowed.",
    );
  });

  test("rejects unsafe CSS token values in theme files", async () => {
    const dir = await makeTempDir();
    await writeFile(join(dir, "theme.toml"), "[theme]\nlink_color = \"blue; display:flex\"\n");

    await expect(loadConfig({ cwd: dir, theme: "./theme.toml" })).rejects.toThrow(
      "Invalid theme: theme.link_color contains unsupported CSS characters or functions.",
    );
  });

  test("missing theme files fail clearly", async () => {
    const dir = await makeTempDir();

    await expect(loadConfig({ cwd: dir, theme: "missing" })).rejects.toThrow(join(dir, "themes", "missing.toml"));
  });
});

describe("deriveOutputPath", () => {
  test("replaces markdown extensions with html", () => {
    expect(deriveOutputPath("welcome.md")).toBe("welcome.html");
    expect(deriveOutputPath("welcome.markdown")).toBe("welcome.html");
  });

  test("keeps output next to the input", () => {
    expect(deriveOutputPath("notes/post.md")).toBe("notes/post.html");
  });

  test("appends html when there is no extension", () => {
    expect(deriveOutputPath("welcome")).toBe("welcome.html");
    expect(deriveOutputPath("notes/welcome")).toBe("notes/welcome.html");
  });
});

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "mdtoemail-"));
  tempDirs.push(dir);
  return dir;
}

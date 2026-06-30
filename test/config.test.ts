import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { defaultConfig, loadConfig, mergeConfig } from "../src/config";
import { deriveOutputPath } from "../src/cli";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("config", () => {
  test("returns defaults when no config file exists", async () => {
    const dir = await makeTempDir();

    expect(await loadConfig(undefined, dir)).toEqual(defaultConfig);
  });

  test("maps a full TOML override", () => {
    const config = mergeConfig({
      markdown: {
        gfm: false,
        frontmatter: false,
        raw_html: true,
      },
      email: {
        container_width: 720,
      },
      theme: {
        background_color: "#000000",
        container_background: "#111111",
        text_color: "#eeeeee",
        link_color: "#66ccff",
        font_family: "Georgia, serif",
        base_font_size: "18px",
        line_height: "1.7",
        content_padding: "40px",
      },
    });

    expect(config).toEqual({
      markdown: {
        gfm: false,
        frontmatter: false,
        rawHtml: true,
      },
      email: {
        containerWidth: 720,
      },
      theme: {
        backgroundColor: "#000000",
        containerBackground: "#111111",
        textColor: "#eeeeee",
        linkColor: "#66ccff",
        fontFamily: "Georgia, serif",
        baseFontSize: "18px",
        lineHeight: "1.7",
        contentPadding: "40px",
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
      "Invalid config: email.container_width must be a number.",
    );
  });

  test("ignores unknown keys", () => {
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

  test("loads an explicit TOML config file", async () => {
    const dir = await makeTempDir();
    const path = join(dir, "custom.toml");
    await writeFile(path, "[theme]\nbackground_color = \"#abcdef\"\n");

    expect((await loadConfig(path)).theme.backgroundColor).toBe("#abcdef");
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

import { afterEach, describe, expect, test } from "bun:test";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const tempDirs: string[] = [];
const textDecoder = new TextDecoder();

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("CLI", () => {
  test("renders Markdown instead of placeholder preformatted source", async () => {
    const dir = await makeTempDir();
    const input = join(dir, "input.md");
    const output = join(dir, "output.html");
    await writeFile(input, "# Hello\n\nThis is **bold**.");

    const result = runCli(input, "-o", output);

    expect(result.exitCode).toBe(0);
    expect(stdout(result)).toContain(`Wrote ${output}`);

    const html = await readFile(output, "utf8");
    expect(html).toContain('role="presentation"');
    expect(html).toContain("<h1 style=");
    expect(html).toContain(">Hello</h1>");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).not.toContain("<main");
    expect(html).not.toContain("<pre");
  });

  test("prints diagnostics by default while still writing output", async () => {
    const { input, output } = await writeInput("[bad](javascript:alert(1))");

    const result = runCli(input, "-o", output);

    expect(result.exitCode).toBe(0);
    expect(stdout(result)).toContain(`Wrote ${output}`);
    expect(stderr(result)).toContain("Warning [unsafe-link-url]");
    await expectFileExists(output);
  });

  test("includes the source line in printed diagnostics", async () => {
    const { input, output } = await writeInput("intro\n\n[bad](javascript:alert(1))");

    const result = runCli(input, "-o", output);

    expect(result.exitCode).toBe(0);
    expect(stderr(result)).toContain("Warning [unsafe-link-url]");
    expect(stderr(result)).toContain("(line 3)");
    await expectFileExists(output);
  });

  test("suppresses diagnostics when configured", async () => {
    const { dir, input, output } = await writeInput("[bad](javascript:alert(1))");
    const config = join(dir, "mdtoemail.toml");
    await writeFile(config, "[email]\nwarnings = false\n");

    const result = runCli(input, "--config", config, "-o", output);

    expect(result.exitCode).toBe(0);
    expect(stderr(result)).not.toContain("Warning [");
    await expectFileExists(output);
  });

  test("--no-warnings suppresses diagnostics", async () => {
    const { dir, input, output } = await writeInput("[bad](javascript:alert(1))");
    const config = join(dir, "mdtoemail.toml");
    await writeFile(config, "[email]\nwarnings = true\n");

    const result = runCli(input, "--config", config, "--no-warnings", "-o", output);

    expect(result.exitCode).toBe(0);
    expect(stderr(result)).not.toContain("Warning [");
    await expectFileExists(output);
  });

  test("strict config fails before writing output for warnings", async () => {
    const { dir, input, output } = await writeInput("[bad](javascript:alert(1))");
    const config = join(dir, "mdtoemail.toml");
    await writeFile(config, "[email]\nstrict = true\n");

    const result = runCli(input, "--config", config, "-o", output);

    expect(result.exitCode).not.toBe(0);
    expect(stderr(result)).toContain("Warning [unsafe-link-url]");
    expect(stderr(result)).toContain("Strict mode failed with 1 warning(s).");
    await expectFileMissing(output);
  });

  test("--strict fails before writing output", async () => {
    const { input, output } = await writeInput("[bad](javascript:alert(1))");

    const result = runCli(input, "--strict", "-o", output);

    expect(result.exitCode).not.toBe(0);
    expect(stderr(result)).toContain("Strict mode failed with 1 warning(s).");
    await expectFileMissing(output);
  });

  test("strict mode succeeds with clean input", async () => {
    const { input, output } = await writeInput("[ok](https://example.com)");

    const result = runCli(input, "--strict", "-o", output);

    expect(result.exitCode).toBe(0);
    expect(stderr(result)).toBe("");
    await expectFileExists(output);
  });

  test("strict highlighted conversion fails before writing for invalid metadata", async () => {
    const { dir, input, output } = await writeInput("```ts {1-999999999} lineNumbers\nconst x = 1;\n```");
    const config = join(dir, "mdtoemail.toml");
    await writeFile(config, "[markdown]\nsyntax_highlighting = true\n[email]\nstrict = true\n");

    const result = runCli(input, "--config", config, "-o", output);

    expect(result.exitCode).not.toBe(0);
    expect(stderr(result)).toContain("Warning [invalid-code-highlight]");
    expect(stderr(result)).toContain("Strict mode failed with 1 warning(s).");
    await expectFileMissing(output);
  });

  test("evaluates final document size before diagnostics and strict no-write", async () => {
    const { input, output } = await writeInput("x".repeat(87_000));

    const result = runCli(input, "--strict", "-o", output);

    expect(result.exitCode).not.toBe(0);
    expect(stderr(result)).toContain("Warning [large-email-html]");
    expect(stderr(result)).toContain("Strict mode failed with 1 warning(s).");
    await expectFileMissing(output);
  });

  test("strict mode renders the fixed dark highlighting profile", async () => {
    const { dir, input, output } = await writeInput("```ts {1} lineNumbers\nconst x: number = 1;\n```");
    const config = join(dir, "mdtoemail.toml");
    await writeFile(
      config,
      '[markdown]\nsyntax_highlighting = true\nsyntax_highlighting_mode = "dark"\n[email]\nstrict = true\n',
    );

    const result = runCli(input, "--config", config, "-o", output);

    expect(result.exitCode).toBe(0);
    expect(stderr(result)).toBe("");
    const html = await readFile(output, "utf8");
    expect(html).toContain('bgcolor="#0d1117"');
    expect(html).toContain('bgcolor="#3b3424"');
    expect(html).toContain("color:#8b949e");
    expect(html).toContain("color:#ff7b72");
  });

  test("strict mode succeeds for unsupported highlighted language info fallback", async () => {
    const { dir, input, output } = await writeInput("```ruby\nputs 'safe'\n```");
    const config = join(dir, "mdtoemail.toml");
    await writeFile(config, "[markdown]\nsyntax_highlighting = true\n[email]\nstrict = true\n");

    const result = runCli(input, "--config", config, "-o", output);

    expect(result.exitCode).toBe(0);
    expect(stderr(result)).toContain("Info [unsupported-code-language]");
    expect(await readFile(output, "utf8")).toContain("<pre style=");
  });

  test("strict mode succeeds for info-only diagnostics", async () => {
    const { input, output } = await writeInput("- [x] Done\n\n![](https://example.com/a.png)\n\n[rel](/pricing)");

    const result = runCli(input, "--strict", "-o", output);

    expect(result.exitCode).toBe(0);
    expect(stderr(result)).toContain("Info [task-list-input-transformed]");
    expect(stderr(result)).toContain("Info [missing-image-alt]");
    expect(stderr(result)).toContain("Info [relative-link-url]");
    await expectFileExists(output);
  });

  test("prints new image/link diagnostics", async () => {
    const { input, output } = await writeInput("[http](http://example.com)\n\n![Logo](./logo.png)");

    const result = runCli(input, "-o", output);

    expect(result.exitCode).toBe(0);
    expect(stderr(result)).toContain("Warning [insecure-link-url]");
    expect(stderr(result)).toContain("Warning [relative-image-url]");
    expect(await readFile(output, "utf8")).toContain("[Image: Logo]");
  });

  test("--no-warnings suppresses diagnostics but strict still fails on warnings", async () => {
    const { input, output } = await writeInput("[http](http://example.com)");

    const result = runCli(input, "--strict", "--no-warnings", "-o", output);

    expect(result.exitCode).not.toBe(0);
    expect(stderr(result)).not.toContain("Warning [insecure-link-url]");
    expect(stderr(result)).toContain("Strict mode failed with 1 warning(s).");
    await expectFileMissing(output);
  });

  test("--pretty indents the generated content", async () => {
    const { input, output } = await writeInput("# Hello\n\nWorld");

    const result = runCli(input, "--pretty", "-o", output);

    expect(result.exitCode).toBe(0);
    const html = await readFile(output, "utf8");
    expect(html).toContain("\n                <p");
  });

  test("--theme path applies a TOML theme", async () => {
    const { dir, input, output } = await writeInput("# Hello");
    const theme = join(dir, "theme.toml");
    await writeFile(theme, "[theme]\nheading_color = \"#123456\"\nh1_font_size = \"31px\"\n");

    const result = runCli(input, "--theme", theme, "-o", output);

    expect(result.exitCode).toBe(0);
    expect(await readFile(output, "utf8")).toContain("color:#123456;font-size:31px");
  });

  test("--theme name loads from themes directory and overrides config-selected theme", async () => {
    const { dir, input, output } = await writeInput("# Hello");
    const config = join(dir, "mdtoemail.toml");
    await mkdir(join(dir, "themes"));
    await writeFile(config, "[theme]\nextends = \"newsletter\"\n");
    await writeFile(join(dir, "themes", "newsletter.toml"), "[theme]\nheading_color = \"#f59e0b\"\n");
    await writeFile(join(dir, "themes", "minimal.toml"), "[theme]\nheading_color = \"#111111\"\n");

    const result = runCli(input, "--config", config, "--theme", "minimal", "-o", output);

    expect(result.exitCode).toBe(0);
    const html = await readFile(output, "utf8");
    expect(html).toContain("color:#111111");
    expect(html).not.toContain("#f59e0b");
  });

  test("missing --theme fails cleanly", async () => {
    const { dir, input, output } = await writeInput("# Hello");

    const result = runCli(input, "--theme", "missing", "-o", output, { cwd: dir });

    expect(result.exitCode).not.toBe(0);
    expect(stderr(result)).toContain(join(dir, "themes", "missing.toml"));
    await expectFileMissing(output);
  });
});

function runCli(...args: [...string[], { cwd: string }] | string[]): ReturnType<typeof Bun.spawnSync> {
  const options = typeof args.at(-1) === "object" ? (args.pop() as { cwd: string }) : undefined;
  return Bun.spawnSync({
    cmd: ["bun", "run", join(process.cwd(), "src/cli.ts"), ...(args as string[])],
    ...(options ? { cwd: options.cwd } : {}),
    stdout: "pipe",
    stderr: "pipe",
  });
}

function stdout(result: ReturnType<typeof Bun.spawnSync>): string {
  return textDecoder.decode(result.stdout);
}

function stderr(result: ReturnType<typeof Bun.spawnSync>): string {
  return textDecoder.decode(result.stderr);
}

async function writeInput(markdown: string): Promise<{ dir: string; input: string; output: string }> {
  const dir = await makeTempDir();
  const input = join(dir, "input.md");
  const output = join(dir, "output.html");
  await writeFile(input, markdown);
  return { dir, input, output };
}

async function expectFileExists(path: string): Promise<void> {
  await expect(access(path)).resolves.toBeNull();
}

async function expectFileMissing(path: string): Promise<void> {
  await expect(access(path)).rejects.toThrow();
}

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "mdtoemail-cli-"));
  tempDirs.push(dir);
  return dir;
}

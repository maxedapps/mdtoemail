import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("CLI", () => {
  test("renders Markdown instead of placeholder preformatted source", async () => {
    const dir = await makeTempDir();
    const input = join(dir, "input.md");
    const output = join(dir, "output.html");
    await writeFile(input, "# Hello\n\nThis is **bold**.");

    const result = Bun.spawnSync({
      cmd: ["bun", "run", "src/cli.ts", input, "-o", output],
      stdout: "pipe",
      stderr: "pipe",
    });

    expect(result.exitCode).toBe(0);
    expect(new TextDecoder().decode(result.stdout)).toContain(`Wrote ${output}`);

    const html = await readFile(output, "utf8");
    expect(html).toContain("<h1>Hello</h1>");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).not.toContain("<pre");
  });
});

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "mdtoemail-cli-"));
  tempDirs.push(dir);
  return dir;
}

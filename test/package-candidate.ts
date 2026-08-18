import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { mkdtemp, rm, writeFile, copyFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import packageJson from "../package.json";

const root = join(import.meta.dir, "..");
const version = packageJson.version;
const wranglerBin = join(root, "node_modules", ".bin", "wrangler");
const workerTemplateDir = join(root, "test", "worker");
const readyTimeoutMs = 60_000;
const requestTimeoutMs = 30_000;
const workerSizeLimitBytes = 10 * 1024 * 1024;

const tempDirs: string[] = [];
let wrangler: ChildProcess | undefined;

async function main(): Promise<void> {
  try {
    console.log("==> building");
    run(root, ["bun", "run", "build"]);

    const packDir = await makeTempDir("mdtoemail-candidate-pack-");
    console.log("==> packing into", packDir);
    const tarball = packOnce(packDir);
    console.log("packed", tarball);

    inspectTarball(tarball);

    const bunDir = await makeTempDir("mdtoemail-candidate-bun-");
    const workerDir = await makeTempDir("mdtoemail-candidate-worker-");
    await installTarball(tarball, bunDir);
    await installTarball(tarball, workerDir);

    await runBunFixture(bunDir);
    await runWorkerFixture(workerDir);
    console.log("candidate ok");
  } finally {
    await cleanup();
  }
}

function packOnce(packDir: string): string {
  const result = run(root, ["bun", "pm", "pack", "--destination", packDir, "--quiet"]);
  const packed = result.stdout.trim() || join(packDir, `mdtoemail-${version}.tgz`);
  const tarball = packed.endsWith(".tgz") ? packed : join(packDir, packed);
  if (!tarball.endsWith(`mdtoemail-${version}.tgz`)) {
    throw new Error(`expected mdtoemail-${version}.tgz from bun pm pack, got: ${packed || result.stderr}`);
  }
  return tarball;
}

function inspectTarball(tarball: string): void {
  const listing = run(root, ["tar", "-tzf", tarball]).stdout.split("\n").filter(Boolean);
  const names = listing.map((entry) => entry.replace(/\/+$/, ""));

  const required = [
    "package/dist",
    "package/README.md",
    "package/LICENSE",
    "package/examples",
    "package/mdtoemail.example.toml",
  ];
  for (const requiredPath of required) {
    if (!names.some((name) => name === requiredPath || name.startsWith(`${requiredPath}/`))) {
      throw new Error(`packed tarball is missing ${requiredPath}`);
    }
  }

  if (!names.includes("package/dist/index.js") || !names.includes("package/dist/index.d.ts") || !names.includes("package/dist/cli.js")) {
    throw new Error("packed tarball is missing dist/index.js, dist/index.d.ts, or dist/cli.js");
  }

  const publishedSrc = names.filter((name) => name === "package/src" || name.startsWith("package/src/"));
  if (publishedSrc.length > 0) {
    throw new Error(`src/ must not be the shipped API; tarball contains ${publishedSrc[0]}`);
  }

  const satteri = names.filter((name) => name.toLowerCase().includes("satteri"));
  if (satteri.length > 0) {
    throw new Error(`tarball must not publish satteri; found ${satteri[0]}`);
  }

  const pkg = JSON.parse(run(root, ["tar", "-xOf", tarball, "package/package.json"]).stdout) as {
    dependencies?: Record<string, string>;
    main?: string;
    types?: string;
    exports?: { "."?: { import?: string; types?: string } };
  };
  if (pkg.dependencies && Object.keys(pkg.dependencies).some((name) => name.toLowerCase().includes("satteri"))) {
    throw new Error("packed package.json still depends on satteri");
  }
  if (pkg.main !== "./dist/index.js" || pkg.types !== "./dist/index.d.ts" || pkg.exports?.["."]?.import !== "./dist/index.js") {
    throw new Error("packed package.json does not ship the dist library API");
  }

  console.log(`tarball contains ${names.length} entries`);
}

async function installTarball(tarball: string, dir: string): Promise<void> {
  const localTarball = join(dir, `mdtoemail-${version}.tgz`);
  await copyFile(tarball, localTarball);
  await writeFile(
    join(dir, "package.json"),
    `${JSON.stringify({ name: "mdtoemail-candidate-fixture", private: true, type: "module" }, null, 2)}\n`,
  );
  run(dir, ["bun", "add", localTarball]);
}

async function runBunFixture(dir: string): Promise<void> {
  console.log("==> bun fixture", dir);
  const compileFile = join(dir, "compile.ts");
  const typesFile = join(dir, "types.ts");
  await writeFile(compileFile, bunCompileSource());
  await writeFile(typesFile, bunTypesSource());

  const compiled = run(dir, ["bun", "run", compileFile]);
  process.stdout.write(compiled.stdout);
  if (compiled.stderr) process.stderr.write(compiled.stderr);

  run(dir, [
    join(root, "node_modules", "typescript", "bin", "tsc"),
    "--strict",
    "--module",
    "nodenext",
    "--moduleResolution",
    "nodenext",
    "--target",
    "es2022",
    "--skipLibCheck",
    "--noEmit",
    typesFile,
  ]);

  const binary = run(dir, ["bun", "run", join(dir, "node_modules", ".bin", "mdtoemail"), "--version"]);
  const printed = binary.stdout.trim();
  if (printed !== version) {
    throw new Error(`installed mdtoemail --version printed ${JSON.stringify(printed)}, expected ${version}`);
  }
  console.log("installed mdtoemail --version", printed);
}

function bunCompileSource(): string {
  return `import { compileMarkdownEmail, defaultConfig } from "mdtoemail";

const result = await compileMarkdownEmail(
  "# Hello\\n\\n| A | B |\\n| --- | --- |\\n| 1 | 2 |\\n\\n[bad](javascript:alert(1))",
  { title: "Hello", config: defaultConfig },
);

if (!result.html.includes("<!doctype html>")) throw new Error("missing doctype");
if (!result.html.includes("<html")) throw new Error("missing html element");
if (!result.html.includes('role="presentation"')) throw new Error("missing presentation table");
if (!result.html.includes(">Hello</h1>")) throw new Error("missing heading");
if (!result.html.includes(">A</th>") || !result.html.includes(">2</td>")) throw new Error("missing GFM table");
if (result.html.includes("javascript:")) throw new Error("unsafe javascript: URL leaked");
if (!result.diagnostics.some((diagnostic) => diagnostic.code === "unsafe-link-url")) {
  throw new Error("missing unsafe-link-url diagnostic");
}
console.log("bun compile ok");
`;
}

function bunTypesSource(): string {
  return `import {
  compileMarkdownEmail,
  defaultConfig,
  type CompiledMarkdownEmail,
  type CompileMarkdownEmailOptions,
  type Config,
  type Diagnostic,
  type Frontmatter,
} from "mdtoemail";

const options: CompileMarkdownEmailOptions = { title: "Hello", config: defaultConfig };
const config: Config = defaultConfig;
const result: CompiledMarkdownEmail = await compileMarkdownEmail("# Hi", options);
const diagnostics: readonly Diagnostic[] = result.diagnostics;
const frontmatter: Frontmatter | null = result.frontmatter;
void config;
void diagnostics;
void frontmatter;
`;
}

async function runWorkerFixture(dir: string): Promise<void> {
  console.log("==> worker fixture", dir);
  await copyFile(join(workerTemplateDir, "worker.ts"), join(dir, "worker.ts"));
  await copyFile(join(workerTemplateDir, "wrangler.jsonc"), join(dir, "wrangler.jsonc"));

  const dryRunDir = join(dir, "dry-run-out");
  const dryRun = run(dir, [wranglerBin, "deploy", "--dry-run", "--outdir", dryRunDir], { allowFailure: true });
  const dryRunOutput = `${dryRun.stdout}\n${dryRun.stderr}`;
  process.stdout.write(dryRun.stdout);
  if (dryRun.stderr) process.stderr.write(dryRun.stderr);
  if (dryRun.exitCode !== 0) {
    throw new Error(`wrangler deploy --dry-run failed:\n${dryRunOutput}`);
  }
  recordUploadSize(dryRunOutput);

  const port = await freePort();
  const inspectorPort = await freePort();
  wrangler = spawn(
    wranglerBin,
    [
      "dev",
      "--ip",
      "127.0.0.1",
      "--port",
      String(port),
      "--inspector-port",
      String(inspectorPort),
      "--show-interactive-dev-session",
      "false",
      "--log-level",
      "info",
    ],
    {
      cwd: dir,
      env: { ...process.env, CI: "1" },
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
    },
  );

  const readyUrl = await waitForReady(wrangler, `http://127.0.0.1:${port}`);
  console.log("wrangler ready at", readyUrl);

  await assertDefaultCompile(`${readyUrl}/`);
  await assertHighlightedCompile(`${readyUrl}/?highlight=1`);
}

function recordUploadSize(output: string): void {
  const match = output.match(/Total Upload:\s*([\d.]+)\s*(KiB|MiB|B)\s*\/\s*gzip:\s*([\d.]+)\s*(KiB|MiB|B)/i);
  if (!match || match[1] === undefined || match[2] === undefined || match[3] === undefined || match[4] === undefined) {
    throw new Error(`could not parse wrangler upload size from:\n${output}`);
  }
  const gzip = toBytes(Number(match[3]), match[4]);
  console.log(`worker upload size: ${match[1]} ${match[2]} / gzip: ${match[3]} ${match[4]} (${gzip} bytes gzip)`);
  if (gzip > workerSizeLimitBytes) {
    throw new Error(`Worker gzip upload ${gzip} bytes exceeds Cloudflare's 10 MiB Worker size limit`);
  }
}

function toBytes(value: number, unit: string): number {
  if (unit === "B") return value;
  if (unit === "KiB") return value * 1024;
  if (unit === "MiB") return value * 1024 * 1024;
  throw new Error(`unknown size unit ${unit}`);
}

async function waitForReady(child: ChildProcess, fallbackUrl: string): Promise<string> {
  let output = "";
  let settled = false;

  return await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      fail(new Error(`wrangler did not become ready within ${readyTimeoutMs}ms\n${output}`));
    }, readyTimeoutMs);

    const onData = (chunk: Buffer | string) => {
      const text = chunk.toString();
      output += text;
      process.stderr.write(text);
      const ready = output.match(/Ready on\s+(https?:\/\/\S+)/i) ?? output.match(/listening.*? (https?:\/\/\S+)/i);
      if (ready?.[1]) {
        succeed(ready[1].replace(/[.,)]+$/, ""));
        return;
      }
      if (/Ready/i.test(output) && /127\.0\.0\.1|localhost/i.test(output)) {
        succeed(fallbackUrl);
      }
    };

    const succeed = (url: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(url);
    };

    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    };

    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
    child.on("error", fail);
    child.on("exit", (code, signal) => {
      fail(new Error(`wrangler exited before ready (code=${code}, signal=${signal})\n${output}`));
    });
  });
}

async function assertDefaultCompile(url: string): Promise<void> {
  const result = await fetchJson(url);
  if (!result.html.includes("<!doctype html>") || !result.html.includes("<html")) {
    throw new Error("worker default compile did not return a complete HTML document");
  }
  if (!result.html.includes(">Hello</h1>") || !result.html.includes(">A</th>") || !result.html.includes(">2</td>")) {
    throw new Error("worker default compile missing GFM heading/table markup");
  }
  if (result.html.includes("javascript:")) {
    throw new Error("worker default compile leaked javascript: URL");
  }
  if (!result.diagnostics.some((diagnostic) => diagnostic.code === "unsafe-link-url")) {
    throw new Error("worker default compile missing unsafe-link-url diagnostic");
  }
  console.log("worker default compile ok");
}

async function assertHighlightedCompile(url: string): Promise<void> {
  const result = await fetchJson(url);
  if (!result.html.includes("<!doctype html>") || !result.html.includes("<html")) {
    throw new Error("worker highlighted compile did not return a complete HTML document");
  }
  if (!result.html.includes('role="presentation"') || !result.html.includes('bgcolor="#f6f8fa"')) {
    throw new Error("worker highlighted compile missing highlight table markup");
  }
  if (result.html.includes("<pre")) {
    throw new Error("worker highlighted compile left leftover <pre markup");
  }
  if (!result.html.includes("ready")) {
    throw new Error("worker highlighted compile missing TypeScript source text");
  }
  console.log("worker highlighted compile ok");
}

async function fetchJson(url: string): Promise<{ html: string; diagnostics: Array<{ code: string }> }> {
  const response = await fetch(url, { signal: AbortSignal.timeout(requestTimeoutMs) });
  if (!response.ok) {
    throw new Error(`worker request ${url} failed: ${response.status} ${await response.text()}`);
  }
  return (await response.json()) as { html: string; diagnostics: Array<{ code: string }> };
}

async function makeTempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function run(
  cwd: string,
  cmd: string[],
  options: { allowFailure?: boolean } = {},
): { stdout: string; stderr: string; exitCode: number } {
  const result = Bun.spawnSync({
    cmd,
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, CI: "1" },
  });
  const stdout = new TextDecoder().decode(result.stdout);
  const stderr = new TextDecoder().decode(result.stderr);
  if (result.exitCode !== 0 && !options.allowFailure) {
    throw new Error(`${cmd.join(" ")} failed (${result.exitCode})\n${stdout}\n${stderr}`);
  }
  return { stdout, stderr, exitCode: result.exitCode ?? 1 };
}

async function freePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("could not allocate a TCP port"));
        return;
      }
      const { port } = address;
      server.close((error) => {
        if (error) reject(error);
        else resolve(port);
      });
    });
  });
}

async function stopWrangler(): Promise<void> {
  const child = wrangler;
  wrangler = undefined;
  if (!child?.pid) return;

  const pid = child.pid;
  await new Promise<void>((resolve) => {
    const done = () => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      killProcessTree(pid, "SIGKILL");
      resolve();
    }, 5_000);
    child.once("exit", done);
    killProcessTree(pid, "SIGTERM");
  });
}

function killProcessTree(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-pid, signal);
  } catch {
    try {
      process.kill(pid, signal);
    } catch {
      // already gone
    }
  }
}

async function cleanup(): Promise<void> {
  await stopWrangler();
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
}

try {
  await main();
} catch (error) {
  await cleanup();
  throw error;
}

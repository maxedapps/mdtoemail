import { spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { builtinModules } from "node:module";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const wranglerBin = join(
  root,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "wrangler.cmd" : "wrangler",
);
const tscBin = join(root, "node_modules", "typescript", "bin", "tsc");
const workerTemplateDir = join(root, "test", "worker");
const workerSizeLimitBytes = 10 * 1024 * 1024;
const readyTimeoutMs = 60_000;
const requestTimeoutMs = 30_000;
const maximumOutputBytes = 5 * 1024 * 1024;

const operationTimeouts = {
  pack: 180_000,
  tar: 30_000,
  install: 180_000,
  node: 30_000,
  typecheck: 60_000,
  bin: 30_000,
  conversion: 60_000,
  "wrangler-dry-run": 180_000,
} as const;

type Operation = keyof typeof operationTimeouts;
type Exit = { code: number | null; signal: NodeJS.Signals | null };
type CommandResult = Exit & { stdout: string; stderr: string };
type PackedFile = { path: string; size: number; mode: number };
type CandidateMetadata = {
  tarball: string;
  version: string;
  integrity: string;
  shasum?: string;
  size: number;
  files: PackedFile[];
};

let runRoot: string | undefined;
let wrangler: ChildProcess | undefined;
let cleanupPromise: Promise<void> | undefined;
let terminatingSignal: NodeJS.Signals | undefined;
const terminationController = new AbortController();
const activeCommands = new Set<ChildProcess>();
const childExits = new Map<ChildProcess, Promise<Exit>>();
const signalHandlers = new Map<NodeJS.Signals, () => void>();

async function main(): Promise<void> {
  const tarballArgument = parseTarballArgument();
  if (tarballArgument) {
    const tarballStat = await stat(tarballArgument);
    if (!tarballStat.isFile())
      throw new Error(`existing tarball is not a file: ${tarballArgument}`);
  }

  runRoot = await mkdtemp(join(tmpdir(), "mdtoemail-candidate-"));
  const packDir = join(runRoot, "pack");
  const nodeDir = join(runRoot, "node");
  const workerDir = join(runRoot, "worker");
  const dryRunDir = join(runRoot, "dry-run");
  await Promise.all([packDir, nodeDir, workerDir, dryRunDir].map((path) => mkdir(path)));
  console.log("candidate run root:", runRoot);

  let packMetadata: CandidateMetadata | undefined;
  let tarball: string;
  if (tarballArgument) {
    tarball = tarballArgument;
    console.log("==> using existing tarball (npm pack skipped)", tarball);
  } else {
    console.log("==> npm pack (prepack builds)");
    packMetadata = await packOnce(packDir);
    tarball = packMetadata.tarball;
    const retainedPath = process.env.MDTOEMAIL_CANDIDATE_TARBALL_OUTPUT;
    if (retainedPath) {
      const destination = resolve(retainedPath);
      if (isWithin(runRoot, destination)) {
        throw new Error(
          "MDTOEMAIL_CANDIDATE_TARBALL_OUTPUT must be outside the candidate run root",
        );
      }
      await mkdir(dirname(destination), { recursive: true });
      await copyFile(tarball, destination, 1);
      console.log("retained exact tarball at", destination);
    }
  }

  const metadata = await inspectTarball(tarball, packDir, packMetadata);
  console.log(
    `tarball metadata: version=${metadata.version} size=${metadata.size} integrity=${metadata.integrity} files=${metadata.files.length}`,
  );

  await Promise.all([
    installTarball(metadata.tarball, nodeDir),
    installTarball(metadata.tarball, workerDir),
  ]);
  await runNodeFixture(nodeDir, metadata.version);
  await runWorkerFixture(workerDir, dryRunDir);
}

function parseTarballArgument(): string | undefined {
  const arguments_ = process.argv.slice(2);
  if (arguments_.length > 1)
    throw new Error("usage: node test/package-candidate.ts [existing-package.tgz]");
  return arguments_[0] ? resolve(arguments_[0]) : undefined;
}

async function packOnce(packDir: string): Promise<CandidateMetadata> {
  const result = await runCommand("pack", root, [
    "npm",
    "pack",
    "--json",
    "--pack-destination",
    packDir,
  ]);
  const entries = parseNpmPackOutput(result.stdout);
  if (entries.length !== 1)
    throw new Error(`npm pack returned ${entries.length} package records, expected exactly one`);
  const entry = entries[0];
  if (!entry) throw new Error("npm pack did not return package metadata");

  const filename = requireString(entry, "filename", "npm pack metadata");
  const version = requireString(entry, "version", "npm pack metadata");
  const integrity = requireString(entry, "integrity", "npm pack metadata");
  const shasum = requireString(entry, "shasum", "npm pack metadata");
  const size = requireNumber(entry, "size", "npm pack metadata");
  const rawFiles = entry.files;
  if (!Array.isArray(rawFiles)) throw new Error("npm pack metadata.files must be an array");
  const files = rawFiles.map((value, index) =>
    parsePackedFile(value, `npm pack metadata.files[${index}]`),
  );
  const tarball = resolve(packDir, filename);
  if (!isWithin(packDir, tarball))
    throw new Error(`npm pack returned a filename outside its destination: ${filename}`);
  await stat(tarball);
  return { tarball, version, integrity, shasum, size, files };
}

function parseNpmPackOutput(output: string): Record<string, unknown>[] {
  if (Buffer.byteLength(output) > maximumOutputBytes)
    throw new Error("npm pack JSON output exceeded its bounded limit");
  const values: unknown[] = [];
  let start = -1;
  let depth = 0;
  let quote = false;
  let escaped = false;

  for (let index = 0; index < output.length; index += 1) {
    const character = output[index];
    if (start < 0) {
      if (character === "[" || character === "{") {
        start = index;
        depth = 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') quote = false;
      continue;
    }
    if (character === '"') quote = true;
    else if (character === "[" || character === "{") depth += 1;
    else if (character === "]" || character === "}") {
      depth -= 1;
      if (depth === 0) {
        try {
          values.push(JSON.parse(output.slice(start, index + 1)));
        } catch {
          // Lifecycle output can contain non-JSON brackets; keep looking for the bounded npm result.
        }
        start = -1;
      }
    }
  }

  for (let index = values.length - 1; index >= 0; index -= 1) {
    const value = values[index];
    if (
      Array.isArray(value) &&
      value.every(isRecord) &&
      value.some((entry) => typeof entry.filename === "string")
    ) {
      return value;
    }
  }
  throw new Error(`could not find npm pack JSON metadata in stdout:\n${output}`);
}

async function inspectTarball(
  tarball: string,
  packDir: string,
  reported: CandidateMetadata | undefined,
): Promise<CandidateMetadata> {
  const tarballStat = await stat(tarball);
  const listingResult = await runCommand("tar", root, ["tar", "-tzf", tarball]);
  const entries = listingResult.stdout
    .split("\n")
    .map((line) => line.replace(/\/+$/, ""))
    .filter(Boolean);
  if (entries.length === 0) throw new Error("packed tarball has an empty inventory");
  for (const entry of entries) {
    if (entry !== "package" && !entry.startsWith("package/")) {
      throw new Error(`packed tarball contains a path outside package/: ${entry}`);
    }
    if (entry.split("/").includes(".."))
      throw new Error(`packed tarball contains path traversal: ${entry}`);
  }

  const extractDir = join(packDir, "extracted");
  await mkdir(extractDir);
  await runCommand("tar", root, ["tar", "-xzf", tarball, "-C", extractDir]);
  const packageDir = join(extractDir, "package");
  const actualFiles = await inventoryFiles(packageDir);
  assertInventory(actualFiles.map((file) => file.path));

  const manifest = await readJsonRecord(join(packageDir, "package.json"), "packed package.json");
  const version = requireString(manifest, "version", "packed package.json");
  assertManifest(manifest, version);
  await assertNoBunRuntimeArtifacts(packageDir, actualFiles);
  await assertNeutralLibrary(join(packageDir, "dist", "index.js"));

  const integrity = `sha512-${createHash("sha512")
    .update(await readFile(tarball))
    .digest("base64")}`;
  const shasum = createHash("sha1")
    .update(await readFile(tarball))
    .digest("hex");
  const metadata: CandidateMetadata = {
    tarball,
    version,
    integrity,
    shasum,
    size: tarballStat.size,
    files: actualFiles,
  };

  if (reported) {
    if (reported.version !== version)
      throw new Error(`npm pack version ${reported.version} differs from manifest ${version}`);
    if (reported.integrity !== integrity)
      throw new Error("npm pack integrity differs from the exact tarball bytes");
    if (reported.shasum !== shasum)
      throw new Error("npm pack shasum differs from the exact tarball bytes");
    if (reported.size !== tarballStat.size)
      throw new Error("npm pack size differs from the exact tarball bytes");
    assertSamePackFiles(reported.files, actualFiles);
  }

  return metadata;
}

function assertInventory(paths: string[]): void {
  const pathSet = new Set(paths);
  const required = [
    "dist/index.js",
    "dist/index.js.map",
    "dist/index.d.ts",
    "dist/index.d.ts.map",
    "dist/cli.js",
    "dist/cli.js.map",
    "README.md",
    "LICENSE",
    "mdtoemail.example.toml",
    "package.json",
  ];
  for (const requiredPath of required) {
    if (!pathSet.has(requiredPath))
      throw new Error(`packed/installed inventory is missing ${requiredPath}`);
  }
  if (
    !paths.some(
      (path) => path.startsWith("examples/") && (path.endsWith(".md") || path.endsWith(".toml")),
    )
  ) {
    throw new Error("packed/installed inventory is missing examples");
  }

  const rejectedRoots = ["src/", "test/", "tools/", ".plans/", ".reviews/", "reports/", ".github/"];
  const rejectedNames = new Set([
    "AGENTS.md",
    "PROJECT.md",
    "bun.lock",
    "bun.lockb",
    "package-lock.json",
    "tsconfig.json",
    "tsdown.config.ts",
  ]);
  for (const path of paths) {
    if (rejectedRoots.some((prefix) => path.startsWith(prefix)) || rejectedNames.has(path)) {
      throw new Error(`unrelated source/tooling/history file was published: ${path}`);
    }
    if (path.toLowerCase().includes("satteri"))
      throw new Error(`Sätteri artifact was published: ${path}`);
  }
}

function assertManifest(manifest: Record<string, unknown>, version: string): void {
  if (version !== "0.3.0") throw new Error(`expected package version 0.3.0, got ${version}`);
  if (manifest.type !== "module") throw new Error("packed package.json must be ESM");
  if (manifest.main !== "./dist/index.js" || manifest.types !== "./dist/index.d.ts") {
    throw new Error("packed package.json does not expose the dist library entry and declarations");
  }
  const engines = requireRecord(manifest.engines, "packed package.json engines");
  if (engines.node !== ">=22.18.0" || "bun" in engines)
    throw new Error("packed engines must require Node >=22.18.0 and not Bun");
  const exports_ = requireRecord(manifest.exports, "packed package.json exports");
  const dot = requireRecord(exports_["."], "packed package.json exports[.]");
  if (dot.import !== "./dist/index.js" || dot.types !== "./dist/index.d.ts") {
    throw new Error("packed package.json exports are not the dist ESM API and declarations");
  }
  const bin = requireRecord(manifest.bin, "packed package.json bin");
  if (bin.mdtoemail !== "dist/cli.js")
    throw new Error("packed package.json does not expose dist/cli.js");
}

async function assertNoBunRuntimeArtifacts(packageDir: string, files: PackedFile[]): Promise<void> {
  for (const file of files) {
    if (!/\.(?:js|d\.ts|json)$/.test(file.path)) continue;
    const text = await readFile(join(packageDir, file.path), "utf8");
    if (/#!\/usr\/bin\/env bun\b|\bbun:test\b|\bBun\./.test(text)) {
      throw new Error(`packed runtime artifact contains a Bun shebang/API: ${file.path}`);
    }
  }
  const cli = files.find((file) => file.path === "dist/cli.js");
  if (!cli || (cli.mode & 0o111) === 0) throw new Error("packed dist/cli.js is not executable");
  const cliSource = await readFile(join(packageDir, "dist", "cli.js"), "utf8");
  if (!cliSource.startsWith("#!/usr/bin/env node\n"))
    throw new Error("packed CLI does not have the Node shebang");
}

async function assertNeutralLibrary(indexPath: string): Promise<void> {
  const source = await readFile(indexPath, "utf8");
  if (source.includes("node:"))
    throw new Error("installed library entry contains a node: built-in dependency");
  const builtins = new Set(builtinModules.map((name) => name.replace(/^node:/, "")));
  const imports = source.matchAll(/(?:from\s*|import\s*\()(["'])([^"']+)\1/g);
  for (const match of imports) {
    const specifier = match[2];
    if (specifier && builtins.has(specifier)) {
      throw new Error(`installed library entry imports Node built-in ${specifier}`);
    }
  }
}

function assertSamePackFiles(reported: PackedFile[], actual: PackedFile[]): void {
  const reportedByPath = new Map(reported.map((file) => [file.path, file]));
  const actualByPath = new Map(actual.map((file) => [file.path, file]));
  if (reportedByPath.size !== actualByPath.size) {
    throw new Error(
      `npm pack reported ${reportedByPath.size} files but tarball contains ${actualByPath.size}`,
    );
  }
  for (const [path, file] of actualByPath) {
    const metadata = reportedByPath.get(path);
    if (!metadata) throw new Error(`npm pack metadata omitted ${path}`);
    if (metadata.size !== file.size || metadata.mode !== file.mode) {
      throw new Error(`npm pack metadata differs from tarball inventory for ${path}`);
    }
  }
}

async function inventoryFiles(directory: string): Promise<PackedFile[]> {
  const files: PackedFile[] = [];
  async function visit(current: string): Promise<void> {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const fullPath = join(current, entry.name);
      if (entry.isSymbolicLink())
        throw new Error(
          `package inventory contains a symbolic link: ${relative(directory, fullPath)}`,
        );
      if (entry.isDirectory()) await visit(fullPath);
      else if (entry.isFile()) {
        const details = await lstat(fullPath);
        files.push({
          path: relative(directory, fullPath).split(sep).join("/"),
          size: details.size,
          mode: details.mode & 0o777,
        });
      } else
        throw new Error(
          `package inventory contains an unsupported entry: ${relative(directory, fullPath)}`,
        );
    }
  }
  await visit(directory);
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

async function installTarball(tarball: string, directory: string): Promise<void> {
  await writeFile(
    join(directory, "package.json"),
    `${JSON.stringify({ name: `mdtoemail-candidate-${basename(directory)}`, private: true, type: "module" }, null, 2)}\n`,
  );
  await runCommand("install", directory, [
    "npm",
    "install",
    "--no-audit",
    "--no-fund",
    "--ignore-scripts",
    "--package-lock=false",
    tarball,
  ]);
  const installedDir = join(directory, "node_modules", "mdtoemail");
  const installedFiles = await inventoryFiles(installedDir);
  assertInventory(installedFiles.map((file) => file.path));
  const installedManifest = await readJsonRecord(
    join(installedDir, "package.json"),
    "installed package.json",
  );
  assertManifest(
    installedManifest,
    requireString(installedManifest, "version", "installed package.json"),
  );
  await assertNoBunRuntimeArtifacts(installedDir, installedFiles);
  await assertNeutralLibrary(join(installedDir, "dist", "index.js"));
}

async function runNodeFixture(directory: string, version: string): Promise<void> {
  console.log("==> Node package fixture", directory);
  const compileFile = join(directory, "compile.mjs");
  const typesFile = join(directory, "types.mts");
  await writeFile(compileFile, nodeCompileSource());
  await writeFile(typesFile, nodeTypesSource());

  const compiled = await runCommand("node", directory, [process.execPath, compileFile]);
  process.stdout.write(compiled.stdout);
  if (compiled.stderr) process.stderr.write(compiled.stderr);

  await runCommand("typecheck", directory, [
    process.execPath,
    tscBin,
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

  const binary = join(
    directory,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "mdtoemail.cmd" : "mdtoemail",
  );
  const binaryResult = await runCommand("bin", directory, [binary, "--version"]);
  if (binaryResult.stdout.trim() !== version) {
    throw new Error(
      `installed bin printed ${JSON.stringify(binaryResult.stdout.trim())}, expected ${version}`,
    );
  }
  console.log("installed mdtoemail --version", version);

  const markdownPath = join(directory, "input.md");
  const configPath = join(directory, "candidate.toml");
  const outputPath = join(directory, "output.html");
  await writeFile(markdownPath, "# Configured candidate\n");
  await writeFile(configPath, '[theme]\nheading_color = "#123456"\n');
  await runCommand("conversion", directory, [
    binary,
    "--config",
    configPath,
    "--output",
    outputPath,
    markdownPath,
  ]);
  const html = await readFile(outputPath, "utf8");
  if (!html.includes("Configured candidate") || !html.includes("#123456")) {
    throw new Error("installed bin conversion did not use the explicit TOML configuration");
  }
  console.log("installed bin TOML conversion ok");
}

function nodeCompileSource(): string {
  return `import { compileMarkdownEmail, defaultConfig } from "mdtoemail";

const result = await compileMarkdownEmail(
  "# Hello\\n\\n| A | B |\\n| --- | --- |\\n| 1 | 2 |\\n\\n[bad](javascript:alert(1))",
  { title: "Hello", config: defaultConfig },
);
if (!result.html.includes("<!doctype html>") || !result.html.includes("<html")) throw new Error("missing document markup");
if (!result.html.includes('role="presentation"')) throw new Error("missing presentation table");
if (!result.html.includes(">Hello</h1>") || !result.html.includes(">A</th>") || !result.html.includes(">2</td>")) throw new Error("missing GFM markup");
if (result.html.includes("javascript:")) throw new Error("unsafe javascript URL leaked");
if (!result.diagnostics.some((diagnostic) => diagnostic.code === "unsafe-link-url")) throw new Error("missing unsafe-link-url diagnostic");
console.log("plain Node ESM compile ok");
`;
}

function nodeTypesSource(): string {
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

async function runWorkerFixture(directory: string, dryRunDir: string): Promise<void> {
  console.log("==> Worker package fixture", directory);
  await copyFile(join(workerTemplateDir, "worker.ts"), join(directory, "worker.ts"));
  await copyFile(join(workerTemplateDir, "wrangler.jsonc"), join(directory, "wrangler.jsonc"));
  const wranglerConfig = await readFile(join(directory, "wrangler.jsonc"), "utf8");
  if (/nodejs_compat/i.test(wranglerConfig))
    throw new Error("Worker fixture must not enable nodejs_compat");

  const dryRun = await runCommand(
    "wrangler-dry-run",
    directory,
    [wranglerBin, "deploy", "--dry-run", "--outdir", dryRunDir],
    true,
  );
  process.stdout.write(dryRun.stdout);
  if (dryRun.stderr) process.stderr.write(dryRun.stderr);
  if (dryRun.code !== 0) {
    throw new Error(
      `wrangler deploy --dry-run failed (code=${dryRun.code}, signal=${dryRun.signal})\n${dryRun.stdout}\n${dryRun.stderr}`,
    );
  }
  recordUploadSize(`${dryRun.stdout}\n${dryRun.stderr}`);

  const port = await freePort();
  const inspectorPort = await freePort();
  const pauseBeforeLaunch = controlledPause("MDTOEMAIL_CANDIDATE_PAUSE_BEFORE_WRANGLER_LAUNCH_MS");
  if (pauseBeforeLaunch > 0) {
    console.log(`controlled pause before Wrangler launch: ${pauseBeforeLaunch}ms`);
    await interruptibleDelay(pauseBeforeLaunch);
  }
  throwIfTerminating();
  const earlyExit = process.env.MDTOEMAIL_CANDIDATE_WRANGLER_EARLY_EXIT === "1";
  const command = earlyExit ? process.execPath : wranglerBin;
  const arguments_ = earlyExit
    ? ["-e", "process.stderr.write('controlled early Wrangler exit\\n'); process.exit(23)"]
    : [
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
      ];
  wrangler = spawn(command, arguments_, {
    cwd: directory,
    env: commandEnvironment(),
    stdio: ["ignore", "pipe", "pipe"],
    detached: process.platform !== "win32",
  });
  void trackChild(wrangler);

  const readyUrl = await waitForReady(wrangler, `http://127.0.0.1:${port}`);
  console.log("wrangler ready at", readyUrl);
  const pauseAfterReady = controlledPause("MDTOEMAIL_CANDIDATE_PAUSE_AFTER_WRANGLER_READY_MS");
  if (pauseAfterReady > 0) {
    console.log(`controlled pause after Wrangler readiness: ${pauseAfterReady}ms`);
    await interruptibleDelay(pauseAfterReady);
  }
  await assertDefaultCompile(`${readyUrl}/`);
  await assertHighlightedCompile(`${readyUrl}/?highlight=1`);
}

function recordUploadSize(output: string): void {
  const match = output.match(
    /Total Upload:\s*([\d.]+)\s*(KiB|MiB|B)\s*\/\s*gzip:\s*([\d.]+)\s*(KiB|MiB|B)/i,
  );
  if (!match?.[1] || !match[2] || !match[3] || !match[4]) {
    throw new Error(`could not parse Wrangler upload size from:\n${output}`);
  }
  const gzip = toBytes(Number(match[3]), match[4]);
  console.log(
    `worker upload size: ${match[1]} ${match[2]} / gzip: ${match[3]} ${match[4]} (${gzip} bytes gzip)`,
  );
  if (gzip > workerSizeLimitBytes) {
    throw new Error(
      `Worker gzip upload ${gzip} bytes exceeds Cloudflare's 10 MiB Worker size limit`,
    );
  }
}

function toBytes(value: number, unit: string): number {
  if (!Number.isFinite(value)) throw new Error(`invalid upload size ${value}`);
  if (unit === "B") return value;
  if (unit === "KiB") return value * 1024;
  if (unit === "MiB") return value * 1024 * 1024;
  throw new Error(`unknown size unit ${unit}`);
}

async function waitForReady(child: ChildProcess, fallbackUrl: string): Promise<string> {
  let output = "";
  return await new Promise<string>((resolvePromise, rejectPromise) => {
    let settled = false;
    const timer = setTimeout(() => {
      fail(new Error(`Wrangler did not become ready within ${readyTimeoutMs}ms\n${output}`));
    }, readyTimeoutMs);

    const finish = (callback: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback();
    };
    const fail = (error: Error): void => finish(() => rejectPromise(error));
    const onData = (chunk: Buffer | string): void => {
      const text = chunk.toString();
      output = appendBounded(output, text, "Wrangler readiness output");
      process.stderr.write(text);
      const ready =
        output.match(/Ready on\s+(https?:\/\/\S+)/i) ??
        output.match(/listening.*? (https?:\/\/\S+)/i);
      if (ready?.[1]) finish(() => resolvePromise(ready[1]!.replace(/[.,)]+$/, "")));
      else if (/Ready/i.test(output) && /127\.0\.0\.1|localhost/i.test(output))
        finish(() => resolvePromise(fallbackUrl));
    };

    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
    child.once("error", fail);
    child.once("exit", (code, signal) => {
      fail(
        new Error(`Wrangler exited before readiness (code=${code}, signal=${signal})\n${output}`),
      );
    });
  });
}

async function assertDefaultCompile(url: string): Promise<void> {
  const result = await fetchWorkerResult(url);
  if (!result.html.includes("<!doctype html>") || !result.html.includes("<html"))
    throw new Error("Worker default compile did not return a complete document");
  if (
    !result.html.includes(">Hello</h1>") ||
    !result.html.includes(">A</th>") ||
    !result.html.includes(">2</td>")
  ) {
    throw new Error("Worker default compile is missing GFM markup");
  }
  if (result.html.includes("javascript:"))
    throw new Error("Worker default compile leaked an unsafe URL");
  if (!result.diagnostics.some((diagnostic) => diagnostic.code === "unsafe-link-url")) {
    throw new Error("Worker default compile is missing the unsafe-link-url diagnostic");
  }
  console.log("worker default compile ok");
}

async function assertHighlightedCompile(url: string): Promise<void> {
  const result = await fetchWorkerResult(url);
  if (!result.html.includes('role="presentation"') || !result.html.includes('bgcolor="#f6f8fa"')) {
    throw new Error("Worker highlighted compile is missing highlight table markup");
  }
  if (result.html.includes("<pre") || !result.html.includes("ready")) {
    throw new Error("Worker highlighted compile has invalid highlighted source markup");
  }
  console.log("worker highlighted compile ok");
}

async function fetchWorkerResult(
  url: string,
): Promise<{ html: string; diagnostics: Array<{ code: string }> }> {
  let response: Response;
  try {
    response = await fetch(url, {
      signal: AbortSignal.any([
        AbortSignal.timeout(requestTimeoutMs),
        terminationController.signal,
      ]),
    });
  } catch (error) {
    throw new Error(
      `Worker request ${url} failed or timed out after ${requestTimeoutMs}ms: ${messageFrom(error)}`,
    );
  }
  if (!response.ok)
    throw new Error(`Worker request ${url} failed: ${response.status} ${await response.text()}`);
  const value: unknown = await response.json();
  if (!isRecord(value) || typeof value.html !== "string" || !Array.isArray(value.diagnostics)) {
    throw new Error(`Worker request ${url} returned an invalid response shape`);
  }
  const diagnostics = value.diagnostics.map((diagnostic, index) => {
    if (!isRecord(diagnostic) || typeof diagnostic.code !== "string") {
      throw new Error(`Worker response diagnostic ${index} has an invalid shape`);
    }
    return { code: diagnostic.code };
  });
  return { html: value.html, diagnostics };
}

async function runCommand(
  operation: Operation,
  cwd: string,
  command: string[],
  allowFailure = false,
): Promise<CommandResult> {
  throwIfTerminating();
  const timeoutMs = timeoutFor(operation);
  const child = spawn(command[0]!, command.slice(1), {
    cwd,
    env: commandEnvironment(),
    stdio: ["ignore", "pipe", "pipe"],
    detached: process.platform !== "win32",
  });
  activeCommands.add(child);
  const exitPromise = trackChild(child);
  let stdout = "";
  let stderr = "";
  let forcedError: string | undefined;
  let timeoutHandle: NodeJS.Timeout | undefined;
  let escalationHandle: NodeJS.Timeout | undefined;
  let confirmationHandle: NodeJS.Timeout | undefined;

  child.stdout?.on("data", (chunk: Buffer | string) => {
    try {
      stdout = appendBounded(stdout, chunk.toString(), `${operation} stdout`);
    } catch (error) {
      forcedError = messageFrom(error);
      signalProcessTree(child, "SIGKILL");
    }
  });
  child.stderr?.on("data", (chunk: Buffer | string) => {
    try {
      stderr = appendBounded(stderr, chunk.toString(), `${operation} stderr`);
    } catch (error) {
      forcedError = messageFrom(error);
      signalProcessTree(child, "SIGKILL");
    }
  });

  timeoutHandle = setTimeout(() => {
    forcedError = `${operation} timed out after ${timeoutMs}ms`;
    signalProcessTree(child, "SIGTERM");
    escalationHandle = setTimeout(() => signalProcessTree(child, "SIGKILL"), 2_000);
    escalationHandle.unref();
  }, timeoutMs);

  const confirmationFailure = new Promise<Exit>((_resolvePromise, rejectPromise) => {
    confirmationHandle = setTimeout(() => {
      rejectPromise(
        new Error(`${operation} could not confirm subprocess exit after timeout escalation`),
      );
    }, timeoutMs + 7_000);
  });
  let exit: Exit;
  try {
    exit = await Promise.race([exitPromise, confirmationFailure]);
  } catch (error) {
    throw new Error(
      `${messageFrom(error)}; command=${formatCommand(command)}\n${stdout}\n${stderr}`,
    );
  } finally {
    clearTimeout(timeoutHandle);
    if (escalationHandle) clearTimeout(escalationHandle);
    if (confirmationHandle) clearTimeout(confirmationHandle);
  }
  activeCommands.delete(child);
  const result = { ...exit, stdout, stderr };
  if (forcedError) {
    throw new Error(
      `${forcedError}; command=${formatCommand(command)}; code=${exit.code}; signal=${exit.signal}\n${stdout}\n${stderr}`,
    );
  }
  if (exit.code !== 0 && !allowFailure) {
    throw new Error(
      `${operation} failed; command=${formatCommand(command)}; code=${exit.code}; signal=${exit.signal}\n${stdout}\n${stderr}`,
    );
  }
  return result;
}

function timeoutFor(operation: Operation): number {
  if (process.env.MDTOEMAIL_CANDIDATE_TIMEOUT_OPERATION !== operation)
    return operationTimeouts[operation];
  const value = Number(process.env.MDTOEMAIL_CANDIDATE_TIMEOUT_MS);
  if (!Number.isInteger(value) || value <= 0 || value > operationTimeouts[operation]) {
    throw new Error(
      `MDTOEMAIL_CANDIDATE_TIMEOUT_MS must be an integer from 1 to ${operationTimeouts[operation]}`,
    );
  }
  return value;
}

function controlledPause(variable: string): number {
  const raw = process.env[variable];
  if (raw === undefined) return 0;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0 || value > 30_000) {
    throw new Error(`${variable} must be an integer from 1 to 30000`);
  }
  return value;
}

async function interruptibleDelay(milliseconds: number): Promise<void> {
  throwIfTerminating();
  await new Promise<void>((resolvePromise, rejectPromise) => {
    const timer = setTimeout(finish, milliseconds);
    const onTermination = (): void => {
      clearTimeout(timer);
      terminationController.signal.removeEventListener("abort", onTermination);
      rejectPromise(new Error(`candidate interrupted by ${terminatingSignal ?? "termination"}`));
    };
    function finish(): void {
      terminationController.signal.removeEventListener("abort", onTermination);
      resolvePromise();
    }
    terminationController.signal.addEventListener("abort", onTermination, { once: true });
  });
  throwIfTerminating();
}

function throwIfTerminating(): void {
  if (terminatingSignal) throw new Error(`candidate interrupted by ${terminatingSignal}`);
}

function trackChild(child: ChildProcess): Promise<Exit> {
  const existing = childExits.get(child);
  if (existing) return existing;
  const exit = new Promise<Exit>((resolvePromise) => {
    child.once("error", () => resolvePromise({ code: child.exitCode, signal: child.signalCode }));
    child.once("close", (code, signal) => resolvePromise({ code, signal }));
  });
  childExits.set(child, exit);
  return exit;
}

function appendBounded(current: string, addition: string, label: string): string {
  if (Buffer.byteLength(current) + Buffer.byteLength(addition) > maximumOutputBytes) {
    throw new Error(`${label} exceeded ${maximumOutputBytes} bytes`);
  }
  return current + addition;
}

function commandEnvironment(): NodeJS.ProcessEnv {
  return { ...process.env, CI: "1", NO_COLOR: "1", FORCE_COLOR: "0" };
}

async function freePort(): Promise<number> {
  return await new Promise((resolvePromise, rejectPromise) => {
    const server = createServer();
    server.unref();
    server.once("error", rejectPromise);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        rejectPromise(new Error("could not allocate a TCP port"));
        return;
      }
      server.close((error) => (error ? rejectPromise(error) : resolvePromise(address.port)));
    });
  });
}

async function cleanup(): Promise<void> {
  cleanupPromise ??= performCleanup();
  return await cleanupPromise;
}

async function performCleanup(): Promise<void> {
  const errors: string[] = [];
  if (wrangler) {
    try {
      await stopChild(wrangler, "Wrangler");
    } catch (error) {
      errors.push(messageFrom(error));
    } finally {
      wrangler = undefined;
    }
  }
  for (const child of activeCommands) {
    try {
      await stopChild(child, "candidate subprocess");
    } catch (error) {
      errors.push(messageFrom(error));
    } finally {
      activeCommands.delete(child);
    }
  }
  if (runRoot) {
    const removing = runRoot;
    try {
      await rm(removing, { recursive: true, force: true });
      console.log("removed candidate run root:", removing);
    } catch (error) {
      errors.push(`could not remove candidate run root ${removing}: ${messageFrom(error)}`);
    } finally {
      runRoot = undefined;
    }
  }
  if (errors.length > 0) throw new Error(`candidate cleanup failed:\n${errors.join("\n")}`);
}

async function stopChild(child: ChildProcess, label: string): Promise<void> {
  const pid = child.pid;
  const exitPromise = trackChild(child);
  if (!pid) {
    await Promise.race([exitPromise, delay(1_000)]);
    if (child.exitCode === null && child.signalCode === null)
      throw new Error(`${label} has no PID and its exit cannot be confirmed`);
    return;
  }

  if (child.exitCode === null && child.signalCode === null) signalProcessTree(child, "SIGTERM");
  await Promise.race([exitPromise, delay(5_000)]);
  if ((child.exitCode === null && child.signalCode === null) || processGroupExists(pid)) {
    signalProcessTree(child, "SIGKILL");
    await Promise.race([exitPromise, delay(5_000)]);
  }
  if (child.exitCode === null && child.signalCode === null) {
    throw new Error(`${label} PID ${pid} did not confirm exit after SIGTERM and SIGKILL`);
  }
  const deadline = Date.now() + 2_000;
  while (processGroupExists(pid) && Date.now() < deadline) await delay(50);
  if (processGroupExists(pid))
    throw new Error(`${label} process group ${pid} still exists after confirmed child exit`);
  console.log(`${label} exit confirmed (code=${child.exitCode}, signal=${child.signalCode})`);
}

function signalProcessTree(child: ChildProcess, signal: NodeJS.Signals): void {
  if (!child.pid) return;
  try {
    process.kill(process.platform === "win32" ? child.pid : -child.pid, signal);
  } catch (error) {
    if (!isNoSuchProcess(error)) throw error;
  }
}

function processGroupExists(pid: number): boolean {
  try {
    process.kill(process.platform === "win32" ? pid : -pid, 0);
    return true;
  } catch (error) {
    return !isNoSuchProcess(error);
  }
}

function isNoSuchProcess(error: unknown): boolean {
  return isRecord(error) && error.code === "ESRCH";
}

function registerSignalHandlers(): void {
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    const handler = (): void => {
      if (terminatingSignal) return;
      terminatingSignal = signal;
      process.exitCode = signal === "SIGINT" ? 130 : 143;
      console.error(`received ${signal}; interrupting current work and waiting for main to unwind`);
      terminationController.abort(new Error(`received ${signal}`));
      interruptCurrentChildren();
    };
    signalHandlers.set(signal, handler);
    process.once(signal, handler);
  }
}

function interruptCurrentChildren(): void {
  const children = new Set(activeCommands);
  if (wrangler) children.add(wrangler);
  for (const child of children) {
    try {
      signalProcessTree(child, "SIGTERM");
    } catch (error) {
      console.error(`could not interrupt child: ${messageFrom(error)}`);
    }
  }
  const escalation = setTimeout(() => {
    for (const child of children) {
      if (child.exitCode !== null || child.signalCode !== null) continue;
      try {
        signalProcessTree(child, "SIGKILL");
      } catch (error) {
        console.error(`could not escalate interrupted child: ${messageFrom(error)}`);
      }
    }
  }, 2_000);
  escalation.unref();
}

function unregisterSignalHandlers(): void {
  for (const [signal, handler] of signalHandlers) process.removeListener(signal, handler);
  signalHandlers.clear();
}

async function readJsonRecord(path: string, label: string): Promise<Record<string, unknown>> {
  let value: unknown;
  try {
    value = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${messageFrom(error)}`);
  }
  if (!isRecord(value)) throw new Error(`${label} must be a JSON object`);
  return value;
}

function parsePackedFile(value: unknown, label: string): PackedFile {
  const record = requireRecord(value, label);
  return {
    path: requireString(record, "path", label),
    size: requireNumber(record, "size", label),
    mode: requireNumber(record, "mode", label),
  };
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${label} must be an object`);
  return value;
}

function requireString(record: Record<string, unknown>, key: string, label: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.length === 0)
    throw new Error(`${label}.${key} must be a non-empty string`);
  return value;
}

function requireNumber(record: Record<string, unknown>, key: string, label: string): number {
  const value = record[key];
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
    throw new Error(`${label}.${key} must be a non-negative number`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isWithin(parent: string, child: string): boolean {
  const path = relative(resolve(parent), resolve(child));
  return path === "" || (path !== ".." && !path.startsWith(`..${sep}`));
}

function formatCommand(command: string[]): string {
  return command.map((part) => JSON.stringify(part)).join(" ");
}

function messageFrom(error: unknown): string {
  return error instanceof Error ? (error.stack ?? error.message) : String(error);
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

registerSignalHandlers();
let failure: unknown;
try {
  await main();
} catch (error) {
  if (!terminatingSignal) failure = error;
} finally {
  if (terminatingSignal) console.error("candidate main unwound; cleaning up candidate resources");
}
try {
  await cleanup();
} catch (error) {
  failure ??= error;
}
if (terminatingSignal) {
  const signal = terminatingSignal;
  if (failure) console.error(messageFrom(failure));
  console.error(`candidate cleanup complete; propagating ${signal}`);
  unregisterSignalHandlers();
  try {
    process.kill(process.pid, signal);
  } catch (error) {
    console.error(`could not propagate ${signal}: ${messageFrom(error)}`);
  }
} else {
  unregisterSignalHandlers();
  if (failure instanceof Error) throw failure;
  if (failure) throw new Error(messageFrom(failure));
  console.log("candidate ok");
}

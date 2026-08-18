#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { dirname, extname, basename, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import packageJson from "../package.json" with { type: "json" };
import { compileMarkdownEmail } from "./compiler.ts";
import type { Config } from "./config.ts";
import { loadConfig, type LoadConfigOptions } from "./config-loader.ts";
import { countWarnings, formatDiagnostic, type Diagnostic } from "./diagnostics.ts";

const helpText = `Usage: mdtoemail [options] <input.md>

Options:
  -o, --output <file>   Output HTML file
  -c, --config <file>   TOML config file
      --theme <name|file>  Theme name from ./themes or TOML theme file
      --strict             Fail on warning diagnostics
      --pretty             Indent the generated HTML content
      --no-warnings        Do not print diagnostics
  -h, --help            Show help
  -v, --version         Show version`;

const cliOptions = {
  help: { type: "boolean", short: "h" },
  version: { type: "boolean", short: "v" },
  output: { type: "string", short: "o" },
  config: { type: "string", short: "c" },
  theme: { type: "string" },
  strict: { type: "boolean" },
  pretty: { type: "boolean" },
  "no-warnings": { type: "boolean" },
} as const;

async function main(): Promise<void> {
  const { values, positionals } = parseCliArgs();

  if (values.help) {
    console.log(helpText);
    return;
  }

  if (values.version) {
    console.log(packageJson.version);
    return;
  }

  if (positionals.length === 0) {
    throw new Error("Missing input file. Run `mdtoemail --help` for usage.");
  }

  if (positionals.length > 1) {
    throw new Error("Expected one input file. Run `mdtoemail --help` for usage.");
  }

  const input = positionals[0];
  if (!input) {
    throw new Error("Missing input file. Run `mdtoemail --help` for usage.");
  }

  const output = values.output ?? deriveOutputPath(input);
  if (resolve(input) === resolve(output)) {
    throw new Error("Output path must be different from input path.");
  }

  const loadOptions: LoadConfigOptions = {};
  if (values.config) loadOptions.configPath = values.config;
  if (values.theme) loadOptions.theme = values.theme;
  const config = applyCliOverrides(await loadConfig(loadOptions), values);
  const markdown = await readInput(input);
  const compiled = await compileMarkdownEmail(markdown, { title: basename(input), config });
  printDiagnostics(compiled.diagnostics, config);

  const warningCount = countWarnings(compiled.diagnostics);
  if (config.email.strict && warningCount > 0) {
    throw new Error(`Strict mode failed with ${warningCount} warning(s).`);
  }

  try {
    await writeFile(output, compiled.html, "utf8");
  } catch (error) {
    throw new Error(`Could not write output file "${output}". ${messageFrom(error)}`);
  }

  console.log(`Wrote ${output}`);
}

function parseCliArgs() {
  try {
    return parseArgs({
      options: cliOptions,
      strict: true,
      allowPositionals: true,
    });
  } catch (error) {
    throw new Error(`${messageFrom(error)}\nRun \`mdtoemail --help\` for usage.`);
  }
}

export function deriveOutputPath(input: string): string {
  const extension = extname(input);
  if (!extension) {
    return `${input}.html`;
  }

  return join(dirname(input), `${basename(input, extension)}.html`);
}

async function readInput(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    throw new Error(`Could not read input file "${path}". ${messageFrom(error)}`);
  }
}

function applyCliOverrides(
  config: Config,
  values: ReturnType<typeof parseCliArgs>["values"],
): Config {
  return {
    ...config,
    email: {
      ...config.email,
      strict: values.strict ? true : config.email.strict,
      warnings: values["no-warnings"] ? false : config.email.warnings,
      pretty: values.pretty ? true : config.email.pretty,
    },
  };
}

function printDiagnostics(diagnostics: readonly Diagnostic[], config: Config): void {
  if (!config.email.warnings) return;

  for (const diagnostic of diagnostics) {
    console.error(formatDiagnostic(diagnostic));
  }
}

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    console.error(messageFrom(error));
    process.exitCode = 1;
  });
}

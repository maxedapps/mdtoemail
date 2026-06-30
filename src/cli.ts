#!/usr/bin/env bun

import { dirname, extname, basename, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import packageJson from "../package.json";
import { loadConfig, type Config } from "./config";
import { countWarnings, formatDiagnostic, type Diagnostic } from "./diagnostics";
import { renderEmailDocument } from "./email";
import { renderMarkdown, type RenderedMarkdown } from "./markdown";

const helpText = `Usage: mdtoemail [options] <input.md>

Options:
  -o, --output <file>   Output HTML file
  -c, --config <file>   TOML config file
      --theme <name|file>  Theme name from ./themes or TOML theme file
      --strict             Fail on warning diagnostics
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

  const config = applyCliOverrides(
    await loadConfig({
      ...(values.config ? { configPath: values.config } : {}),
      ...(values.theme ? { theme: values.theme } : {}),
    }),
    values,
  );
  const markdown = await readInput(input);
  const rendered = await renderInputMarkdown(markdown, config);
  printDiagnostics(rendered.diagnostics, config);

  const warningCount = countWarnings(rendered.diagnostics);
  if (config.email.strict && warningCount > 0) {
    throw new Error(`Strict mode failed with ${warningCount} warning(s).`);
  }

  const html = renderEmailDocument(rendered.html, input, config);

  try {
    await Bun.write(output, html);
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
    return await Bun.file(path).text();
  } catch (error) {
    throw new Error(`Could not read input file "${path}". ${messageFrom(error)}`);
  }
}

async function renderInputMarkdown(markdown: string, config: Config): Promise<RenderedMarkdown> {
  try {
    return await renderMarkdown(markdown, config);
  } catch (error) {
    throw new Error(`Could not render Markdown. ${messageFrom(error)}`);
  }
}

function applyCliOverrides(config: Config, values: ReturnType<typeof parseCliArgs>["values"]): Config {
  return {
    ...config,
    email: {
      ...config.email,
      strict: values.strict ? true : config.email.strict,
      warnings: values["no-warnings"] ? false : config.email.warnings,
    },
  };
}

function printDiagnostics(diagnostics: Diagnostic[], config: Config): void {
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

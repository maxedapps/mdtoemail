#!/usr/bin/env bun

import { dirname, extname, basename, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import packageJson from "../package.json";
import { loadConfig, type Config } from "./config";
import { renderMarkdown } from "./markdown";

const helpText = `Usage: mdtoemail [options] <input.md>

Options:
  -o, --output <file>   Output HTML file
  -c, --config <file>   TOML config file
  -h, --help            Show help
  -v, --version         Show version`;

const cliOptions = {
  help: { type: "boolean", short: "h" },
  version: { type: "boolean", short: "v" },
  output: { type: "string", short: "o" },
  config: { type: "string", short: "c" },
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

  const config = await loadConfig(values.config);
  const markdown = await readInput(input);
  const renderedHtml = await renderInputMarkdown(markdown, config);
  const html = renderHtmlDocument(renderedHtml, input, config);

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

async function renderInputMarkdown(markdown: string, config: Config): Promise<string> {
  try {
    const rendered = await renderMarkdown(markdown, config);
    return rendered.html;
  } catch (error) {
    throw new Error(`Could not render Markdown. ${messageFrom(error)}`);
  }
}

function renderHtmlDocument(contentHtml: string, input: string, config: Config): string {
  const title = Bun.escapeHTML(basename(input));
  const bodyStyle = styleAttribute({
    margin: "0",
    background: config.theme.backgroundColor,
    color: config.theme.textColor,
    "font-family": config.theme.fontFamily,
    "font-size": config.theme.baseFontSize,
    "line-height": config.theme.lineHeight,
  });
  const containerStyle = styleAttribute({
    background: config.theme.containerBackground,
    margin: "0 auto",
    padding: config.theme.contentPadding,
    "max-width": `${config.email.containerWidth}px`,
  });
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width">
    <title>${title}</title>
  </head>
  <body style="${bodyStyle}">
    <main style="${containerStyle}">
      ${contentHtml}
    </main>
  </body>
</html>
`;
}

function styleAttribute(styles: Record<string, string>): string {
  return Bun.escapeHTML(
    Object.entries(styles)
      .map(([property, value]) => `${property}:${value}`)
      .join(";"),
  );
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

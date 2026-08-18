import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { parse } from "smol-toml";
import {
  cloneConfig,
  defaultConfig,
  mergeConfig,
  mergeThemeConfig,
  type Config,
} from "./config.ts";

export interface LoadConfigOptions {
  configPath?: string;
  cwd?: string;
  theme?: string;
}

export async function loadConfig(options: LoadConfigOptions = {}): Promise<Config> {
  const cwd = options.cwd ?? process.cwd();
  const projectConfig = await readProjectConfig(options.configPath, cwd);
  const projectRaw = projectConfig?.raw;
  const themeBaseDir = projectConfig ? dirname(projectConfig.path) : cwd;
  const themeSelector = options.theme ?? themeSelectorFrom(projectRaw);
  const themeRaw = themeSelector
    ? await readThemeConfig(themeSelector, themeBaseDir, cwd, options.theme !== undefined)
    : undefined;

  let config = cloneConfig(defaultConfig);
  if (themeRaw) config = mergeThemeConfig(themeRaw, config);
  if (projectRaw) config = mergeConfig(projectRaw, config);
  return config;
}

async function readProjectConfig(
  configPath: string | undefined,
  cwd: string,
): Promise<{ raw: unknown; path: string } | undefined> {
  if (configPath) {
    const path = resolve(cwd, configPath);
    try {
      return { raw: parseToml(await readFile(path, "utf8"), "Invalid config"), path };
    } catch (error) {
      if (isValidationError(error)) throw error;
      throw new Error(`Could not read config file "${configPath}". ${messageFrom(error)}`);
    }
  }

  const path = join(cwd, "mdtoemail.toml");
  try {
    return { raw: parseToml(await readFile(path, "utf8"), "Invalid config"), path };
  } catch (error) {
    if (isFileNotFoundError(error)) return undefined;
    if (isValidationError(error)) throw error;
    throw new Error(`Could not read config file "${path}". ${messageFrom(error)}`);
  }
}

async function readThemeConfig(
  selector: string,
  themeBaseDir: string,
  cwd: string,
  fromCli: boolean,
): Promise<unknown> {
  const path = resolveThemePath(selector, themeBaseDir, cwd, fromCli);
  try {
    return parseToml(await readFile(path, "utf8"), "Invalid theme");
  } catch (error) {
    if (isValidationError(error)) throw error;
    throw new Error(`Could not read theme file "${path}". ${messageFrom(error)}`);
  }
}

function themeSelectorFrom(raw: unknown): string | undefined {
  if (!isRecord(raw) || raw.theme === undefined) return undefined;
  if (!isRecord(raw.theme)) return undefined;

  const value = raw.theme.extends;
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    throw new Error("Invalid config: theme.extends must be a string.");
  }
  if (!value.trim()) {
    throw new Error("Invalid config: theme.extends must not be empty.");
  }
  return value;
}

function resolveThemePath(
  selector: string,
  themeBaseDir: string,
  cwd: string,
  fromCli: boolean,
): string {
  const trimmed = selector.trim();
  if (!trimmed) {
    throw new Error(
      fromCli
        ? "Invalid config: --theme must not be empty."
        : "Invalid config: theme.extends must not be empty.",
    );
  }

  if (!isThemePathLike(trimmed)) {
    return join(themeBaseDir, "themes", `${trimmed}.toml`);
  }

  if (isAbsolute(trimmed)) return trimmed;
  return resolve(fromCli ? cwd : themeBaseDir, trimmed);
}

function isThemePathLike(selector: string): boolean {
  return (
    selector.startsWith(".") ||
    selector.startsWith("/") ||
    selector.includes("/") ||
    selector.includes("\\") ||
    selector.endsWith(".toml")
  );
}

function parseToml(text: string, label: "Invalid config" | "Invalid theme"): unknown {
  try {
    return parse(text);
  } catch (error) {
    throw new Error(`${label}: ${messageFrom(error)}`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidationError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message.startsWith("Invalid config:") || error.message.startsWith("Invalid theme:"))
  );
}

function isFileNotFoundError(error: unknown): boolean {
  return isRecord(error) && error.code === "ENOENT";
}

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

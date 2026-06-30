import { dirname, isAbsolute, join, resolve } from "node:path";

export interface Config {
  markdown: {
    gfm: boolean;
    frontmatter: boolean;
    rawHtml: boolean;
  };
  email: {
    containerWidth: number;
    outerPadding: string;
    warnings: boolean;
    strict: boolean;
  };
  theme: {
    backgroundColor: string;
    containerBackground: string;
    textColor: string;
    headingColor: string;
    mutedTextColor: string;
    linkColor: string;
    borderColor: string;
    tableHeaderBackground: string;
    codeBackground: string;
    blockquoteBorderColor: string;
    fontFamily: string;
    codeFontFamily: string;
    baseFontSize: string;
    smallFontSize: string;
    lineHeight: string;
    contentPadding: string;
    h1FontSize: string;
    h2FontSize: string;
    h3FontSize: string;
    minorHeadingFontSize: string;
    h1LineHeight: string;
    h2LineHeight: string;
    h3LineHeight: string;
    minorHeadingLineHeight: string;
    h1Margin: string;
    h2Margin: string;
    h3Margin: string;
    minorHeadingMargin: string;
    paragraphMargin: string;
    listMargin: string;
    listPadding: string;
    listItemMargin: string;
    blockquoteMargin: string;
    blockquotePadding: string;
    codeFontSize: string;
    codePadding: string;
    preMargin: string;
    prePadding: string;
    preFontSize: string;
    preLineHeight: string;
    hrMargin: string;
    imageMargin: string;
    tableMargin: string;
    tableCellPadding: string;
    footnoteMargin: string;
    footnotePadding: string;
  };
}

export interface LoadConfigOptions {
  configPath?: string;
  cwd?: string;
  theme?: string;
}

const themeStringFields = [
  ["background_color", "backgroundColor"],
  ["container_background", "containerBackground"],
  ["text_color", "textColor"],
  ["heading_color", "headingColor"],
  ["muted_text_color", "mutedTextColor"],
  ["link_color", "linkColor"],
  ["border_color", "borderColor"],
  ["table_header_background", "tableHeaderBackground"],
  ["code_background", "codeBackground"],
  ["blockquote_border_color", "blockquoteBorderColor"],
  ["font_family", "fontFamily"],
  ["code_font_family", "codeFontFamily"],
  ["base_font_size", "baseFontSize"],
  ["small_font_size", "smallFontSize"],
  ["line_height", "lineHeight"],
  ["content_padding", "contentPadding"],
  ["h1_font_size", "h1FontSize"],
  ["h2_font_size", "h2FontSize"],
  ["h3_font_size", "h3FontSize"],
  ["minor_heading_font_size", "minorHeadingFontSize"],
  ["h1_line_height", "h1LineHeight"],
  ["h2_line_height", "h2LineHeight"],
  ["h3_line_height", "h3LineHeight"],
  ["minor_heading_line_height", "minorHeadingLineHeight"],
  ["h1_margin", "h1Margin"],
  ["h2_margin", "h2Margin"],
  ["h3_margin", "h3Margin"],
  ["minor_heading_margin", "minorHeadingMargin"],
  ["paragraph_margin", "paragraphMargin"],
  ["list_margin", "listMargin"],
  ["list_padding", "listPadding"],
  ["list_item_margin", "listItemMargin"],
  ["blockquote_margin", "blockquoteMargin"],
  ["blockquote_padding", "blockquotePadding"],
  ["code_font_size", "codeFontSize"],
  ["code_padding", "codePadding"],
  ["pre_margin", "preMargin"],
  ["pre_padding", "prePadding"],
  ["pre_font_size", "preFontSize"],
  ["pre_line_height", "preLineHeight"],
  ["hr_margin", "hrMargin"],
  ["image_margin", "imageMargin"],
  ["table_margin", "tableMargin"],
  ["table_cell_padding", "tableCellPadding"],
  ["footnote_margin", "footnoteMargin"],
  ["footnote_padding", "footnotePadding"],
] as const;

type ThemeConfigKey = (typeof themeStringFields)[number][1];

export const defaultConfig: Config = {
  markdown: {
    gfm: true,
    frontmatter: true,
    rawHtml: false,
  },
  email: {
    containerWidth: 600,
    outerPadding: "24px 12px",
    warnings: true,
    strict: false,
  },
  theme: {
    backgroundColor: "#f4f4f4",
    containerBackground: "#ffffff",
    textColor: "#222222",
    headingColor: "#222222",
    mutedTextColor: "#666666",
    linkColor: "#2563eb",
    borderColor: "#dddddd",
    tableHeaderBackground: "#f3f4f6",
    codeBackground: "#f3f4f6",
    blockquoteBorderColor: "#dddddd",
    fontFamily: "Arial, Helvetica, sans-serif",
    codeFontFamily: "Consolas, Monaco, monospace",
    baseFontSize: "16px",
    smallFontSize: "14px",
    lineHeight: "1.5",
    contentPadding: "32px",
    h1FontSize: "28px",
    h2FontSize: "24px",
    h3FontSize: "20px",
    minorHeadingFontSize: "16px",
    h1LineHeight: "1.25",
    h2LineHeight: "1.3",
    h3LineHeight: "1.35",
    minorHeadingLineHeight: "1.5",
    h1Margin: "0 0 20px 0",
    h2Margin: "24px 0 16px 0",
    h3Margin: "20px 0 12px 0",
    minorHeadingMargin: "16px 0 8px 0",
    paragraphMargin: "0 0 16px 0",
    listMargin: "0 0 16px 0",
    listPadding: "0 0 0 24px",
    listItemMargin: "0 0 8px 0",
    blockquoteMargin: "0 0 16px 0",
    blockquotePadding: "0 0 0 16px",
    codeFontSize: "90%",
    codePadding: "2px 4px",
    preMargin: "0 0 16px 0",
    prePadding: "12px",
    preFontSize: "14px",
    preLineHeight: "1.4",
    hrMargin: "24px 0",
    imageMargin: "0 0 16px 0",
    tableMargin: "0 0 16px 0",
    tableCellPadding: "8px",
    footnoteMargin: "24px 0 0 0",
    footnotePadding: "16px 0 0 0",
  },
};

export async function loadConfig(options: LoadConfigOptions = {}): Promise<Config> {
  const cwd = options.cwd ?? process.cwd();
  const projectConfig = await readProjectConfig(options.configPath, cwd);
  const projectRaw = projectConfig?.raw;
  const themeBaseDir = projectConfig ? dirname(projectConfig.path) : cwd;
  const themeSelector = options.theme ?? themeSelectorFrom(projectRaw);
  const themeRaw = themeSelector ? await readThemeConfig(themeSelector, themeBaseDir, cwd, options.theme !== undefined) : undefined;

  let config = cloneConfig(defaultConfig);
  if (themeRaw) config = mergeThemeConfig(themeRaw, config);
  if (projectRaw) config = mergeConfig(projectRaw, config);
  return config;
}

export function mergeConfig(raw: unknown, base: Config = defaultConfig): Config {
  const config = cloneConfig(base);

  if (!isRecord(raw)) {
    throw new Error("Invalid config: root must be a TOML table.");
  }

  if (raw.markdown !== undefined) {
    if (!isRecord(raw.markdown)) {
      throw new Error("Invalid config: markdown must be a table.");
    }

    setBoolean(raw.markdown, "gfm", "markdown.gfm", (value) => {
      config.markdown.gfm = value;
    });
    setBoolean(raw.markdown, "frontmatter", "markdown.frontmatter", (value) => {
      config.markdown.frontmatter = value;
    });
    setBoolean(raw.markdown, "raw_html", "markdown.raw_html", (value) => {
      config.markdown.rawHtml = value;
    });
  }

  if (raw.email !== undefined) {
    if (!isRecord(raw.email)) {
      throw new Error("Invalid config: email must be a table.");
    }

    setNumber(raw.email, "container_width", "email.container_width", (value) => {
      config.email.containerWidth = value;
    });
    setStyleString(raw.email, "outer_padding", "email.outer_padding", (value) => {
      config.email.outerPadding = value;
    });
    setBoolean(raw.email, "warnings", "email.warnings", (value) => {
      config.email.warnings = value;
    });
    setBoolean(raw.email, "strict", "email.strict", (value) => {
      config.email.strict = value;
    });
  }

  if (raw.theme !== undefined) {
    if (!isRecord(raw.theme)) {
      throw new Error("Invalid config: theme must be a table.");
    }

    const extendsValue = raw.theme.extends;
    if (extendsValue !== undefined && typeof extendsValue !== "string") {
      throw new Error("Invalid config: theme.extends must be a string.");
    }

    applyThemeFields(raw.theme, config, "Invalid config");
  }

  return config;
}

function mergeThemeConfig(raw: unknown, base: Config): Config {
  const config = cloneConfig(base);

  if (!isRecord(raw)) {
    throw new Error("Invalid theme: root must be a TOML table.");
  }

  rejectUnknownKeys(raw, new Set(["email", "theme"]), "Invalid theme: root");

  if (raw.email !== undefined) {
    if (!isRecord(raw.email)) {
      throw new Error("Invalid theme: email must be a table.");
    }

    rejectUnknownKeys(raw.email, new Set(["container_width", "outer_padding"]), "Invalid theme: email");
    setNumber(raw.email, "container_width", "email.container_width", (value) => {
      config.email.containerWidth = value;
    }, "Invalid theme");
    setStyleString(raw.email, "outer_padding", "email.outer_padding", (value) => {
      config.email.outerPadding = value;
    }, "Invalid theme");
  }

  if (raw.theme !== undefined) {
    if (!isRecord(raw.theme)) {
      throw new Error("Invalid theme: theme must be a table.");
    }

    const allowedThemeKeys = new Set(themeStringFields.map(([key]) => key));
    rejectUnknownKeys(raw.theme, allowedThemeKeys, "Invalid theme: theme");
    applyThemeFields(raw.theme, config, "Invalid theme");
  }

  return config;
}

async function readProjectConfig(configPath: string | undefined, cwd: string): Promise<{ raw: unknown; path: string } | undefined> {
  if (configPath) {
    const path = resolve(cwd, configPath);
    try {
      return { raw: parseToml(await Bun.file(path).text(), "Invalid config"), path };
    } catch (error) {
      if (isValidationError(error)) throw error;
      throw new Error(`Could not read config file "${configPath}". ${messageFrom(error)}`);
    }
  }

  const path = join(cwd, "mdtoemail.toml");
  try {
    return { raw: parseToml(await Bun.file(path).text(), "Invalid config"), path };
  } catch (error) {
    if (isFileNotFoundError(error)) return undefined;
    if (isValidationError(error)) throw error;
    throw new Error(`Could not read config file "${path}". ${messageFrom(error)}`);
  }
}

async function readThemeConfig(selector: string, themeBaseDir: string, cwd: string, fromCli: boolean): Promise<unknown> {
  const path = resolveThemePath(selector, themeBaseDir, cwd, fromCli);
  try {
    return parseToml(await Bun.file(path).text(), "Invalid theme");
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

function resolveThemePath(selector: string, themeBaseDir: string, cwd: string, fromCli: boolean): string {
  const trimmed = selector.trim();
  if (!trimmed) {
    throw new Error(fromCli ? "Invalid config: --theme must not be empty." : "Invalid config: theme.extends must not be empty.");
  }

  if (!isThemePathLike(trimmed)) {
    return join(themeBaseDir, "themes", `${trimmed}.toml`);
  }

  if (isAbsolute(trimmed)) return trimmed;
  return resolve(fromCli ? cwd : themeBaseDir, trimmed);
}

function isThemePathLike(selector: string): boolean {
  return selector.startsWith(".") || selector.startsWith("/") || selector.includes("/") || selector.includes("\\") || selector.endsWith(".toml");
}

function parseToml(text: string, label: "Invalid config" | "Invalid theme"): unknown {
  try {
    return Bun.TOML.parse(text);
  } catch (error) {
    throw new Error(`${label}: ${messageFrom(error)}`);
  }
}

function cloneConfig(config: Config): Config {
  return {
    markdown: { ...config.markdown },
    email: { ...config.email },
    theme: { ...config.theme },
  };
}

function applyThemeFields(rawTheme: Record<string, unknown>, config: Config, prefix: "Invalid config" | "Invalid theme"): void {
  for (const [tomlKey, configKey] of themeStringFields) {
    setStyleString(rawTheme, tomlKey, `theme.${tomlKey}`, (value) => {
      config.theme[configKey as ThemeConfigKey] = value;
    }, prefix);
  }
}

function rejectUnknownKeys(raw: Record<string, unknown>, allowed: Set<string>, label: string): void {
  for (const key of Object.keys(raw)) {
    if (!allowed.has(key)) {
      throw new Error(`${label}.${key} is not allowed.`);
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function setBoolean(
  raw: Record<string, unknown>,
  key: string,
  label: string,
  apply: (value: boolean) => void,
): void {
  const value = raw[key];
  if (value === undefined) return;
  if (typeof value !== "boolean") {
    throw new Error(`Invalid config: ${label} must be a boolean.`);
  }
  apply(value);
}

function setNumber(
  raw: Record<string, unknown>,
  key: string,
  label: string,
  apply: (value: number) => void,
  prefix: "Invalid config" | "Invalid theme" = "Invalid config",
): void {
  const value = raw[key];
  if (value === undefined) return;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${prefix}: ${label} must be a positive number.`);
  }
  apply(value);
}

function setStyleString(
  raw: Record<string, unknown>,
  key: string,
  label: string,
  apply: (value: string) => void,
  prefix: "Invalid config" | "Invalid theme" = "Invalid config",
): void {
  const value = raw[key];
  if (value === undefined) return;
  if (typeof value !== "string") {
    throw new Error(`${prefix}: ${label} must be a string.`);
  }
  apply(validateStyleValue(value, label, prefix));
}

function validateStyleValue(value: string, label: string, prefix: "Invalid config" | "Invalid theme"): string {
  const trimmed = value.trim();
  if (
    !trimmed ||
    trimmed.length > 200 ||
    /[\u0000-\u001f\u007f]/.test(trimmed) ||
    /[;{}<>]/.test(trimmed) ||
    trimmed.includes("/*") ||
    trimmed.includes("*/") ||
    /url\s*\(/i.test(trimmed) ||
    /expression\s*\(/i.test(trimmed)
  ) {
    throw new Error(`${prefix}: ${label} contains unsupported CSS characters or functions.`);
  }
  return trimmed;
}

function isValidationError(error: unknown): boolean {
  return error instanceof Error && (error.message.startsWith("Invalid config:") || error.message.startsWith("Invalid theme:"));
}

function isFileNotFoundError(error: unknown): boolean {
  return isRecord(error) && error.code === "ENOENT";
}

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

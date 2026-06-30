import { join } from "node:path";

export interface Config {
  markdown: {
    gfm: boolean;
    frontmatter: boolean;
    rawHtml: boolean;
  };
  email: {
    containerWidth: number;
  };
  theme: {
    backgroundColor: string;
    containerBackground: string;
    textColor: string;
    linkColor: string;
    fontFamily: string;
    baseFontSize: string;
    lineHeight: string;
    contentPadding: string;
  };
}

export const defaultConfig: Config = {
  markdown: {
    gfm: true,
    frontmatter: true,
    rawHtml: false,
  },
  email: {
    containerWidth: 600,
  },
  theme: {
    backgroundColor: "#f4f4f4",
    containerBackground: "#ffffff",
    textColor: "#222222",
    linkColor: "#2563eb",
    fontFamily: "Arial, Helvetica, sans-serif",
    baseFontSize: "16px",
    lineHeight: "1.5",
    contentPadding: "32px",
  },
};

export async function loadConfig(configPath?: string, cwd = process.cwd()): Promise<Config> {
  if (configPath) {
    try {
      return mergeConfig(parseToml(await Bun.file(configPath).text()));
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Invalid config:")) {
        throw error;
      }

      throw new Error(`Could not read config file "${configPath}". ${messageFrom(error)}`);
    }
  }

  const defaultPath = join(cwd, "mdtoemail.toml");

  try {
    return mergeConfig(parseToml(await Bun.file(defaultPath).text()));
  } catch (error) {
    if (isFileNotFoundError(error)) {
      return cloneConfig(defaultConfig);
    }

    if (error instanceof Error && error.message.startsWith("Invalid config:")) {
      throw error;
    }

    throw new Error(`Could not read config file "${defaultPath}". ${messageFrom(error)}`);
  }
}

export function mergeConfig(raw: unknown): Config {
  const config = cloneConfig(defaultConfig);

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
  }

  if (raw.theme !== undefined) {
    if (!isRecord(raw.theme)) {
      throw new Error("Invalid config: theme must be a table.");
    }

    setString(raw.theme, "background_color", "theme.background_color", (value) => {
      config.theme.backgroundColor = value;
    });
    setString(raw.theme, "container_background", "theme.container_background", (value) => {
      config.theme.containerBackground = value;
    });
    setString(raw.theme, "text_color", "theme.text_color", (value) => {
      config.theme.textColor = value;
    });
    setString(raw.theme, "link_color", "theme.link_color", (value) => {
      config.theme.linkColor = value;
    });
    setString(raw.theme, "font_family", "theme.font_family", (value) => {
      config.theme.fontFamily = value;
    });
    setString(raw.theme, "base_font_size", "theme.base_font_size", (value) => {
      config.theme.baseFontSize = value;
    });
    setString(raw.theme, "line_height", "theme.line_height", (value) => {
      config.theme.lineHeight = value;
    });
    setString(raw.theme, "content_padding", "theme.content_padding", (value) => {
      config.theme.contentPadding = value;
    });
  }

  return config;
}

function parseToml(text: string): unknown {
  try {
    return Bun.TOML.parse(text);
  } catch (error) {
    throw new Error(`Invalid config: ${messageFrom(error)}`);
  }
}

function cloneConfig(config: Config): Config {
  return {
    markdown: { ...config.markdown },
    email: { ...config.email },
    theme: { ...config.theme },
  };
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
): void {
  const value = raw[key];
  if (value === undefined) return;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Invalid config: ${label} must be a number.`);
  }
  apply(value);
}

function setString(
  raw: Record<string, unknown>,
  key: string,
  label: string,
  apply: (value: string) => void,
): void {
  const value = raw[key];
  if (value === undefined) return;
  if (typeof value !== "string") {
    throw new Error(`Invalid config: ${label} must be a string.`);
  }
  apply(value);
}

function isFileNotFoundError(error: unknown): boolean {
  return isRecord(error) && error.code === "ENOENT";
}

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

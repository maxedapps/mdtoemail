import { cloneConfig, defaultConfig, validateResolvedConfig, type Config } from "./config.ts";
import { addFinalHtmlSizeDiagnostic, type Diagnostic } from "./diagnostics.ts";
import { renderEmailDocument } from "./email.ts";
import { renderMarkdown } from "./markdown.ts";

export interface Frontmatter {
  kind: string;
  value: string;
}

export interface CompileMarkdownEmailOptions {
  readonly title?: string;
  readonly config?: Config;
}

export interface CompiledMarkdownEmail {
  readonly html: string;
  readonly frontmatter: Frontmatter | null;
  readonly diagnostics: readonly Diagnostic[];
}

export async function compileMarkdownEmail(
  markdown: string,
  options: CompileMarkdownEmailOptions = {},
): Promise<CompiledMarkdownEmail> {
  const config =
    options.config === undefined
      ? cloneConfig(defaultConfig)
      : validateResolvedConfig(options.config);
  const rendered = await renderMarkdown(markdown, config);
  const html = renderEmailDocument(rendered.html, options.title ?? "", config);
  addFinalHtmlSizeDiagnostic(html, rendered.diagnostics);

  return {
    html,
    frontmatter: toFrontmatter(rendered.frontmatter),
    diagnostics: freezeDiagnostics(rendered.diagnostics),
  };
}

function toFrontmatter(frontmatter: { kind: string; value: string } | null): Frontmatter | null {
  if (frontmatter === null) return null;
  return { kind: frontmatter.kind, value: frontmatter.value };
}

function freezeDiagnostics(diagnostics: Diagnostic[]): readonly Diagnostic[] {
  for (const diagnostic of diagnostics) {
    Object.freeze(diagnostic);
  }
  return Object.freeze(diagnostics);
}

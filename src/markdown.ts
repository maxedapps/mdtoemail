import { markdownToHtml, type Features, type Frontmatter } from "satteri";
import type { Config } from "./config";
import { emailHastPlugin } from "./email";
import { codeHighlightPlugin } from "./highlight";
import type { Diagnostic } from "./diagnostics";

export interface RenderedMarkdown {
  html: string;
  frontmatter: Frontmatter | null;
  diagnostics: Diagnostic[];
}

export function markdownFeatures(config: Config): Features {
  return {
    gfm: config.markdown.gfm,
    frontmatter: config.markdown.frontmatter,
  };
}

export async function renderMarkdown(markdown: string, config: Config): Promise<RenderedMarkdown> {
  const diagnostics: Diagnostic[] = [];
  const result = await markdownToHtml(markdown, {
    features: markdownFeatures(config),
    hastPlugins: [emailHastPlugin(config, diagnostics), codeHighlightPlugin(config, diagnostics)],
  });

  return {
    html: result.html,
    frontmatter: result.frontmatter,
    diagnostics,
  };
}

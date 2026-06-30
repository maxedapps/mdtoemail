import { defineMdastPlugin, markdownToHtml, type Features, type Frontmatter } from "satteri";
import type { Config } from "./config";

export interface RenderedMarkdown {
  html: string;
  frontmatter: Frontmatter | null;
}

const escapeRawHtml = defineMdastPlugin({
  name: "escape-raw-html",
  html(node) {
    return { type: "text", value: node.value };
  },
});

export function markdownFeatures(config: Config): Features {
  return {
    gfm: config.markdown.gfm,
    frontmatter: config.markdown.frontmatter,
  };
}

export async function renderMarkdown(markdown: string, config: Config): Promise<RenderedMarkdown> {
  const result = await markdownToHtml(markdown, {
    features: markdownFeatures(config),
    mdastPlugins: config.markdown.rawHtml ? [] : [escapeRawHtml],
  });

  return {
    html: result.html,
    frontmatter: result.frontmatter,
  };
}

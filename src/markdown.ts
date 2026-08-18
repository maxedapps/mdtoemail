import type { Root as HastRoot } from "hast";
import type { Root as MdastRoot, Literal } from "mdast";
import rehypeStringify from "rehype-stringify";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import type { Config } from "./config.ts";
import type { Diagnostic } from "./diagnostics.ts";
import { sanitizeEmailHast } from "./email.ts";
import { defaultCodeTokenizer, highlightCodeHast, type CodeTokenizer } from "./highlight.ts";

export interface Frontmatter {
  kind: string;
  value: string;
}

export interface RenderedMarkdown {
  html: string;
  frontmatter: Frontmatter | null;
  diagnostics: Diagnostic[];
}

export interface RenderMarkdownOptions {
  tokenizer?: CodeTokenizer;
  beforeHighlight?: (tree: HastRoot) => void;
}

export async function renderMarkdown(
  markdown: string,
  config: Config,
  options: RenderMarkdownOptions = {},
): Promise<RenderedMarkdown> {
  const diagnostics: Diagnostic[] = [];
  let frontmatter: Frontmatter | null = null;

  const processor = unified().use(remarkParse);
  if (config.markdown.gfm) processor.use(remarkGfm);
  if (config.markdown.frontmatter) processor.use(remarkFrontmatter, ["yaml", "toml"]);

  processor.use(() => (tree: MdastRoot) => {
    frontmatter = extractFrontmatter(tree);
  });
  processor.use(remarkRehype, { allowDangerousHtml: true });
  processor.use(() => (tree: HastRoot) => {
    sanitizeEmailHast(tree, config, diagnostics);
    options.beforeHighlight?.(tree);
  });
  processor.use(() => async (tree: HastRoot) => {
    await highlightCodeHast(tree, config, diagnostics, options.tokenizer ?? defaultCodeTokenizer);
  });
  processor.use(rehypeStringify, { characterReferences: { useNamedReferences: true } });

  const file = await processor.process(markdown);

  return {
    html: String(file),
    frontmatter,
    diagnostics,
  };
}

function extractFrontmatter(tree: MdastRoot): Frontmatter | null {
  let frontmatter: Frontmatter | null = null;
  const children = [];

  for (const child of tree.children) {
    if (!isFrontmatterNode(child)) {
      children.push(child);
      continue;
    }

    if (!frontmatter) {
      frontmatter = {
        kind: child.type,
        value: child.value.endsWith("\n") ? child.value.slice(0, -1) : child.value,
      };
    }
  }

  tree.children = children;
  return frontmatter;
}

function isFrontmatterNode(node: {
  type: string;
  value?: string;
}): node is Literal & { type: "yaml" | "toml" } {
  return node.type === "yaml" || node.type === "toml";
}

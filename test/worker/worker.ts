import { compileMarkdownEmail, defaultConfig } from "mdtoemail";

const defaultMarkdown = `# Hello

| A | B |
| --- | --- |
| 1 | 2 |

[bad](javascript:alert(1))
`;

const highlightMarkdown = "```ts\nconst ready = true;\n```\n";

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const highlight = url.searchParams.get("highlight") === "1";

    const result = highlight
      ? await compileMarkdownEmail(highlightMarkdown, {
          title: "Highlight",
          config: {
            ...defaultConfig,
            markdown: { ...defaultConfig.markdown, syntaxHighlighting: true },
          },
        })
      : await compileMarkdownEmail(defaultMarkdown, { title: "Hello" });

    return Response.json(result);
  },
};

---
title: Theme Customizations
---

# Theme Customizations

This example demonstrates how reusable themes and local style-token overrides work together.

## Reusable theme file

You can pick a theme directly:

```bash
bun run src/cli.ts examples/theme-customizations.md --theme ./examples/themes/minimal.toml -o examples/theme-customizations-minimal.html
```

Or select one in a config file:

```toml
[theme]
extends = "newsletter"
```

## Local overrides

A project config can extend a reusable theme and override individual safe tokens:

```toml
[email]
container_width = 620
outer_padding = "40px 12px"

[theme]
extends = "newsletter"
link_color = "#7c3aed"
heading_color = "#312e81"
table_header_background = "#ede9fe"
code_background = "#f5f3ff"
blockquote_border_color = "#8b5cf6"
h1_font_size = "34px"
content_padding = "42px"
```

### Token coverage

| Token area | Example |
|:--|:--|
| Layout | `container_width`, `outer_padding`, `content_padding` |
| Colors | `background_color`, `heading_color`, `link_color` |
| Typography | `font_family`, `base_font_size`, `line_height` |
| Components | `table_cell_padding`, `code_background`, `blockquote_border_color` |

> Theme values are safe tokens, not arbitrary CSS. The renderer still controls which CSS properties are emitted.

- [x] Theme files are reusable
- [x] Config files can override theme tokens
- [x] Unsafe generated content is still sanitized
- [ ] Real email-client testing is still required

Footnotes use muted/small theme tokens.[^1]

[^1]: This footnote should inherit the configured muted text color and small font size.

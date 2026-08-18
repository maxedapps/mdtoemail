---
title: Product Update
---

# Product Update: July

Hi team,

We shipped a focused update to make **mdtoemail** more useful for real email workflows.

## Highlights

- Markdown is rendered through Sätteri
- Output uses a conservative table-based email wrapper
- Unsafe URLs are removed with diagnostics
- Strict mode can fail builds when warnings are produced
- Themes can be reused from TOML files and safely overridden per project

[Read the release notes](https://example.com/releases/july)

## Migration checklist

- [x] Update your config
- [x] Pick a reusable theme
- [x] Run the converter locally
- [ ] Test the generated email in your provider

## Theme preview

This example is useful for comparing the built-in defaults, the reusable `newsletter` theme, and a config file that extends `newsletter` with custom tokens.

```toml
[theme]
extends = "newsletter"
link_color = "#dc2626"
h1_font_size = "34px"
content_padding = "44px"
```

| Feature               | Default  |   Themed |
| :-------------------- | :------- | -------: |
| Markdown rendering    | Yes      |      Yes |
| Email-safe wrapper    | Yes      |      Yes |
| Theme token overrides | Basic    |   Custom |
| Provider testing      | Required | Required |

> Tip: keep email styles boring on purpose. Inline, simple, and predictable usually wins.

Thanks for following along.[^1]

[^1]: Generated HTML should still be tested in your target email clients.

import { defineConfig, type UserConfigExport } from "tsdown";

const config: UserConfigExport = defineConfig([
  {
    entry: ["src/index.ts"],
    outDir: "dist",
    format: "esm",
    platform: "neutral",
    target: "es2022",
    dts: { sourcemap: true },
    sourcemap: true,
    deps: { neverBundle: true },
    minify: false,
    clean: true,
    failOnWarn: true,
    publint: { level: "error" },
    attw: { profile: "esm-only", level: "error" },
  },
  {
    entry: ["src/cli.ts"],
    outDir: "dist",
    format: "esm",
    platform: "node",
    target: "es2022",
    fixedExtension: false,
    dts: false,
    sourcemap: true,
    deps: { neverBundle: true },
    minify: false,
    clean: false,
    failOnWarn: true,
  },
]);

export default config;

import { describe, expect, test } from "bun:test";
import {
  addDiagnostic,
  addDiagnosticOnce,
  countWarnings,
  formatDiagnostic,
  type Diagnostic,
} from "../src/diagnostics";

describe("diagnostics", () => {
  test("stores diagnostics", () => {
    const diagnostics: Diagnostic[] = [];

    addDiagnostic(diagnostics, {
      code: "unsafe-link-url",
      severity: "warning",
      message: "Removed unsafe link URL.",
    });

    expect(diagnostics).toEqual([
      {
        code: "unsafe-link-url",
        severity: "warning",
        message: "Removed unsafe link URL.",
      },
    ]);
  });

  test("dedupes diagnostics by code", () => {
    const diagnostics: Diagnostic[] = [];

    addDiagnosticOnce(diagnostics, {
      code: "raw-html-escaped",
      severity: "warning",
      message: "First.",
    });
    addDiagnosticOnce(diagnostics, {
      code: "raw-html-escaped",
      severity: "warning",
      message: "Second.",
    });

    expect(diagnostics).toEqual([
      {
        code: "raw-html-escaped",
        severity: "warning",
        message: "First.",
      },
    ]);
  });

  test("counts warning diagnostics only", () => {
    expect(
      countWarnings([
        { code: "unsafe-link-url", severity: "warning", message: "Warning." },
        { code: "task-list-input-transformed", severity: "info", message: "Info." },
      ]),
    ).toBe(1);
  });

  test("formats diagnostics", () => {
    expect(
      formatDiagnostic({
        code: "unsafe-link-url",
        severity: "warning",
        message: "Removed unsafe link URL.",
      }),
    ).toBe("Warning [unsafe-link-url]: Removed unsafe link URL.");

    expect(
      formatDiagnostic({
        code: "task-list-input-transformed",
        severity: "info",
        message: "Converted task list.",
      }),
    ).toBe("Info [task-list-input-transformed]: Converted task list.");
  });

  test("appends the source line when present", () => {
    expect(
      formatDiagnostic({
        code: "unsafe-link-url",
        severity: "warning",
        message: "Removed unsafe link URL.",
        line: 12,
      }),
    ).toBe("Warning [unsafe-link-url]: Removed unsafe link URL. (line 12)");
  });
});

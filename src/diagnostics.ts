export type DiagnosticSeverity = "warning" | "info";

export type DiagnosticCode =
  | "unsafe-link-url"
  | "unsafe-image-url"
  | "insecure-link-url"
  | "relative-link-url"
  | "insecure-image-url"
  | "relative-image-url"
  | "missing-image-alt"
  | "unsupported-element"
  | "raw-html-escaped"
  | "task-list-input-transformed"
  | "wide-table"
  | "footnote-support"
  | "long-code-line"
  | "unsupported-code-language"
  | "code-highlighting-skipped"
  | "invalid-code-highlight"
  | "code-highlighting-failed"
  | "large-email-html";

export interface Diagnostic {
  code: DiagnosticCode;
  severity: DiagnosticSeverity;
  message: string;
  line?: number;
}

export function addDiagnostic(diagnostics: Diagnostic[], diagnostic: Diagnostic): void {
  diagnostics.push(diagnostic);
}

export function addDiagnosticOnce(diagnostics: Diagnostic[], diagnostic: Diagnostic): void {
  if (diagnostics.some((existing) => existing.code === diagnostic.code)) return;
  diagnostics.push(diagnostic);
}

export function countWarnings(diagnostics: readonly Diagnostic[]): number {
  return diagnostics.filter((diagnostic) => diagnostic.severity === "warning").length;
}

export function addFinalHtmlSizeDiagnostic(html: string, diagnostics: Diagnostic[]): void {
  const bytes = Buffer.byteLength(html, "utf8");
  if (bytes < 85 * 1024) return;

  addDiagnostic(diagnostics, {
    code: "large-email-html",
    severity: "warning",
    message: `Generated HTML is ${bytes} bytes; email clients may clip messages at this size.`,
  });
}

export function formatDiagnostic(diagnostic: Diagnostic): string {
  const label = diagnostic.severity === "warning" ? "Warning" : "Info";
  const location = diagnostic.line !== undefined ? ` (line ${diagnostic.line})` : "";
  return `${label} [${diagnostic.code}]: ${diagnostic.message}${location}`;
}

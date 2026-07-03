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
  | "long-code-line";

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

export function formatDiagnostic(diagnostic: Diagnostic): string {
  const label = diagnostic.severity === "warning" ? "Warning" : "Info";
  const location = diagnostic.line !== undefined ? ` (line ${diagnostic.line})` : "";
  return `${label} [${diagnostic.code}]: ${diagnostic.message}${location}`;
}

import { buildCanonical } from "./canonical.js";
import { compareDiagnostics, type Diagnostic, type PendingDiagnostic, RULES, toPointer } from "./diagnostics.js";
import { formatCanonical } from "./hash.js";
import { type LoadedDictionary, loadDictionary } from "./loader.js";
import { locate } from "./source.js";

export type { Diagnostic, Severity } from "./diagnostics.js";
export { RULES } from "./diagnostics.js";
export { canonicalize, dictionaryHash, formatCanonical } from "./hash.js";

/** The RADD dictionary format version this library reads. */
export const RADD_FORMAT_VERSION = 1;

export interface LintResult {
  ok: boolean;
  errorCount: number;
  warningCount: number;
  diagnostics: Diagnostic[];
}

export interface BuildResult extends LintResult {
  /** The canonical document, present when there are no errors. */
  document?: Record<string, unknown>;
  /** The dictionary version (sha256:...), present when there are no errors. */
  version?: string;
  /** The canonical JSON text: key-sorted, two-space indent, LF, trailing newline. */
  json?: string;
}

function resolveDiagnostics(loaded: LoadedDictionary, pending: PendingDiagnostic[]): Diagnostic[] {
  const files = new Map(loaded.files.map((f) => [f.path, f]));
  return pending
    .map((p) => {
      const info = RULES[p.code];
      const file = p.file !== undefined ? files.get(p.file) : undefined;
      const pos =
        p.line !== undefined
          ? { line: p.line, column: p.column ?? 1 }
          : file
            ? locate(file, p.path ?? [], p.atKey)
            : undefined;
      const d: Diagnostic = {
        code: p.code,
        rule: info.rule,
        severity: info.severity,
        message: p.message,
        ...(p.file !== undefined ? { file: p.file } : {}),
        ...(pos ? { line: pos.line, column: pos.column } : {}),
        ...(p.path ? { path: toPointer(p.path) } : {}),
        ...(p.hint ? { hint: p.hint } : {}),
      };
      return d;
    })
    .sort(compareDiagnostics);
}

function summarize(diagnostics: Diagnostic[]): LintResult {
  const errorCount = diagnostics.filter((d) => d.severity === "error").length;
  const warningCount = diagnostics.filter((d) => d.severity === "warning").length;
  return { ok: errorCount === 0, errorCount, warningCount, diagnostics };
}

function run(dir: string): { loaded: LoadedDictionary; result: LintResult } {
  const loaded = loadDictionary(dir);
  const pending = [...loaded.diagnostics];
  return { loaded, result: summarize(resolveDiagnostics(loaded, pending)) };
}

/** Lints the dictionary folder at `dir`. */
export function lint(dir: string): LintResult {
  return run(dir).result;
}

/** Lints and, when there are no errors, builds the canonical document and its version hash. */
export function build(dir: string): BuildResult {
  const { loaded, result } = run(dir);
  if (!result.ok) return result;
  const document = buildCanonical(loaded);
  return { ...result, document, version: String(document.version), json: formatCanonical(document) };
}

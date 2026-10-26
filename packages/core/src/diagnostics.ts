export type Severity = "error" | "warning" | "info";

export type PathSegment = string | number;

/** A lint finding. `file` is relative to the dictionary folder, with forward slashes. */
export interface Diagnostic {
  code: string;
  rule: string;
  severity: Severity;
  message: string;
  file?: string;
  line?: number;
  column?: number;
  /** JSON pointer into the file's document. */
  path?: string;
  hint?: string;
}

interface RuleInfo {
  rule: string;
  severity: Severity;
}

/** Every lint rule. Codes are stable and never reused; see docs/lint-rules.md. */
export const RULES = {
  RADD101: { rule: "yaml-syntax", severity: "error" },
  RADD102: { rule: "schema", severity: "error" },
  RADD103: { rule: "duplicate-name", severity: "error" },
  RADD104: { rule: "unknown-file", severity: "warning" },
  RADD105: { rule: "missing-dictionary-file", severity: "error" },
  RADD201: { rule: "unknown-domain-type", severity: "error" },
  RADD202: { rule: "unknown-lookup", severity: "error" },
  RADD203: { rule: "unknown-entity", severity: "error" },
  RADD204: { rule: "unknown-field", severity: "error" },
  RADD205: { rule: "unknown-validator", severity: "error" },
  RADD206: { rule: "unknown-calculator", severity: "error" },
  RADD207: { rule: "unknown-function", severity: "error" },
  RADD208: { rule: "extension-not-enabled", severity: "error" },
  RADD209: { rule: "type-with-domain", severity: "error" },
  RADD210: { rule: "lookup-type-mismatch", severity: "error" },
  RADD211: { rule: "invalid-constraint", severity: "error" },
  RADD301: { rule: "entity-name", severity: "error" },
  RADD302: { rule: "field-name", severity: "error" },
  RADD303: { rule: "physical-name", severity: "error" },
  RADD304: { rule: "component-name", severity: "error" },
  RADD305: { rule: "file-name", severity: "warning" },
  RADD401: { rule: "missing-description", severity: "error" },
  RADD501: { rule: "missing-default-locale-key", severity: "error" },
  RADD502: { rule: "missing-locale-key", severity: "warning" },
  RADD503: { rule: "unused-key", severity: "warning" },
  RADD504: { rule: "invalid-message", severity: "error" },
  RADD505: { rule: "unknown-locale", severity: "error" },
  RADD601: { rule: "renamed-from-conflict", severity: "error" },
  RADD701: { rule: "expression-syntax", severity: "error" },
  RADD702: { rule: "missing-computed-sql", severity: "error" },
  RADD703: { rule: "invalid-pattern", severity: "error" },
} as const satisfies Record<string, RuleInfo>;

export type RuleCode = keyof typeof RULES;

/** A diagnostic before its line and column are resolved from the source file. */
export interface PendingDiagnostic {
  code: RuleCode;
  message: string;
  file?: string;
  path?: PathSegment[];
  /** Point at the key of the last path segment rather than its value. */
  atKey?: boolean;
  /** An explicit position, used when there is no path (for example a YAML syntax error). */
  line?: number;
  column?: number;
  hint?: string;
}

export function toPointer(path: readonly PathSegment[]): string {
  return path.map((s) => `/${String(s).replaceAll("~", "~0").replaceAll("/", "~1")}`).join("");
}

export function compareDiagnostics(a: Diagnostic, b: Diagnostic): number {
  return (
    (a.file ?? "").localeCompare(b.file ?? "") ||
    (a.line ?? 0) - (b.line ?? 0) ||
    (a.column ?? 0) - (b.column ?? 0) ||
    a.code.localeCompare(b.code) ||
    a.message.localeCompare(b.message)
  );
}

export function levenshtein(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0] ?? 0;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j] ?? 0;
      row[j] = Math.min(
        (row[j] ?? 0) + 1,
        (row[j - 1] ?? 0) + 1,
        prev + (a[i - 1]?.toLowerCase() === b[j - 1]?.toLowerCase() ? 0 : 1),
      );
      prev = tmp;
    }
  }
  return row[b.length] ?? 0;
}

/** "Did you mean ...?" for the closest candidate, if one is close enough. */
export function suggest(name: string, candidates: Iterable<string>): string | undefined {
  let best: string | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const c of candidates) {
    const d = levenshtein(name, c);
    if (d < bestDistance) {
      best = c;
      bestDistance = d;
    }
  }
  const limit = Math.max(2, Math.floor(name.length / 3));
  return best !== undefined && bestDistance <= limit ? `Did you mean '${best}'?` : undefined;
}

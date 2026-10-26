import { createHash } from "node:crypto";

/**
 * RFC 8785 JSON Canonicalization Scheme: object keys sorted by UTF-16 code units, no
 * whitespace, and ECMAScript serialization of strings and numbers (which JSON.stringify gives).
 */
export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") {
    if (typeof value === "number" && !Number.isFinite(value))
      throw new Error("JCS cannot encode non-finite numbers.");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalize(v)}`).join(",")}}`;
}

/** The dictionary version: SHA-256 over the JCS form of the document without its version property. */
export function dictionaryHash(document: Record<string, unknown>): string {
  const { version: _, ...rest } = document;
  return `sha256:${createHash("sha256").update(canonicalize(rest), "utf8").digest("hex")}`;
}

/** Recursively sorts object keys the way JCS does, for readable output. */
export function sortKeys<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(sortKeys) as T;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(value as object).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))) {
    const v = (value as Record<string, unknown>)[k];
    if (v !== undefined) out[k] = sortKeys(v);
  }
  return out as T;
}

/** Pretty, key-sorted JSON with LF line endings and a trailing newline. */
export function formatCanonical(document: unknown): string {
  return `${JSON.stringify(sortKeys(document), null, 2)}\n`;
}

// @ts-check
/**
 * Turns the hand-written JSONC schemas in schema/src into the strict JSON published in
 * schema/v1. Shared by build-schemas.mjs and its tests.
 */
import { parse, printParseErrorCode } from "jsonc-parser";

export const SRC_DIR = "schema/src";
export const OUT_DIR = "schema/v1";
export const SRC_SUFFIX = ".schema.jsonc";
export const OUT_SUFFIX = ".schema.json";

/** The published file name for a source file name: entity.schema.jsonc -> entity.schema.json. */
export function outputName(srcName) {
  return `${srcName.slice(0, -SRC_SUFFIX.length)}${OUT_SUFFIX}`;
}

/**
 * Compiles one JSONC schema to strict JSON: comments are dropped, a $comment naming the source
 * is placed after $id, and the result is two-space indented with LF and a trailing newline.
 *
 * @param {string} text the JSONC source
 * @param {string} srcName the source file name, for example entity.schema.jsonc
 * @returns {{ json: string } | { errors: string[] }}
 */
export function compileSchema(text, srcName) {
  /** @type {import("jsonc-parser").ParseError[]} */
  const parseErrors = [];
  const data = parse(text, parseErrors, { allowTrailingComma: false, disallowComments: false });
  if (parseErrors.length > 0) {
    return {
      errors: parseErrors.map((e) => {
        const { line, column } = position(text, e.offset);
        return `${srcName}:${line}:${column}: ${printParseErrorCode(e.error)}`;
      }),
    };
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return { errors: [`${srcName}: the schema must be a JSON object.`] };
  }
  const expectedId = `https://raw.githubusercontent.com/rabesames/RADD/main/${OUT_DIR}/${outputName(srcName)}`;
  if (data.$id !== expectedId) {
    return { errors: [`${srcName}: $id must be ${expectedId}`] };
  }
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const [key, value] of Object.entries(data)) {
    if (key === "$comment") continue;
    out[key] = value;
    if (key === "$id") {
      out.$comment = `Generated from ${SRC_DIR}/${srcName} by npm run schema:build. Do not edit.`;
    }
  }
  return { json: `${JSON.stringify(out, null, 2)}\n` };
}

/** 1-based line and column of an offset. */
function position(text, offset) {
  const before = text.slice(0, offset).split("\n");
  return { line: before.length, column: (before.at(-1)?.length ?? 0) + 1 };
}

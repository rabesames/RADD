#!/usr/bin/env node
// @ts-check
/**
 * Writes the strict JSON schemas in schema/v1 from the JSONC sources in schema/src, and removes
 * schema/v1 files that no longer have a source. With --check, writes nothing and exits 1 if
 * schema/v1 is out of date (CI runs this).
 *
 *   node scripts/build-schemas.mjs [--check]
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  compileSchema,
  OUT_DIR,
  OUT_SUFFIX,
  outputName,
  SRC_DIR,
  SRC_SUFFIX,
} from "./schema-rules.mjs";

const check = process.argv.includes("--check");
const problems = [];
const expected = new Set();

mkdirSync(OUT_DIR, { recursive: true });
for (const srcName of readdirSync(SRC_DIR)
  .filter((n) => n.endsWith(SRC_SUFFIX))
  .sort()) {
  const result = compileSchema(readFileSync(join(SRC_DIR, srcName), "utf8"), srcName);
  if ("errors" in result) {
    problems.push(...result.errors);
    continue;
  }
  const outName = outputName(srcName);
  expected.add(outName);
  const outPath = join(OUT_DIR, outName);
  // Compare with LF line endings, so a Windows checkout with autocrlf is not out of date.
  const current = existsSync(outPath)
    ? readFileSync(outPath, "utf8").replaceAll("\r\n", "\n")
    : undefined;
  if (current === result.json) continue;
  if (check) problems.push(`${outPath} is out of date with ${SRC_DIR}/${srcName}.`);
  else {
    writeFileSync(outPath, result.json);
    console.log(`Wrote ${outPath}.`);
  }
}

for (const outName of readdirSync(OUT_DIR).filter((n) => n.endsWith(OUT_SUFFIX))) {
  if (expected.has(outName)) continue;
  const outPath = join(OUT_DIR, outName);
  if (check) problems.push(`${outPath} has no source in ${SRC_DIR}.`);
  else if (!problems.length) {
    rmSync(outPath);
    console.log(`Removed ${outPath}.`);
  }
}

if (problems.length > 0) {
  for (const p of problems) console.error(p);
  if (check) console.error("Run npm run schema:build and commit the result.");
  process.exit(1);
}
if (check) console.log(`${OUT_DIR} is up to date.`);

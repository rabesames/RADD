#!/usr/bin/env node
// @ts-check
/**
 * Regenerates the table in docs/adr/README.md from the ADR files, between the
 * <!-- adr-index:start --> and <!-- adr-index:end --> markers.
 *
 *   node scripts/adr-index.mjs
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseAdr } from "./adr-rules.mjs";

const DIR = "docs/adr";
const START = "<!-- adr-index:start -->";
const END = "<!-- adr-index:end -->";

const rows = [];
for (const name of readdirSync(DIR)
  .filter((n) => /^ADR-\d{4}\.md$/.test(n))
  .sort()) {
  const adr = parseAdr(readFileSync(join(DIR, name), "utf8"));
  if (typeof adr === "string") throw new Error(`${name}: ${adr}`);
  const links = [
    ...adr.supersedes.map((n) => `Supersedes [${n}](${n}.md)`),
    ...adr.supersededBy.map((n) => `Superseded by [${n}](${n}.md)`),
  ].join("; ");
  rows.push(
    `| [${adr.number}](${adr.number}.md) | ${adr.title} | ${adr.status} | ${adr.date} | ${links} |`,
  );
}

const table = [
  "| ADR | Title | Status | Date | Links |",
  "| --- | --- | --- | --- | --- |",
  ...rows,
].join("\n");
const path = join(DIR, "README.md");
const text = readFileSync(path, "utf8");
const start = text.indexOf(START);
const end = text.indexOf(END);
if (start < 0 || end < start) throw new Error(`${path} has no ${START} ... ${END} markers.`);
writeFileSync(path, `${text.slice(0, start + START.length)}\n${table}\n${text.slice(end)}`);
console.log(`Wrote ${rows.length} rows to ${path}.`);

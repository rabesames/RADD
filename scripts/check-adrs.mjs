#!/usr/bin/env node
// @ts-check
/**
 * Checks docs/adr: the index matches the ADR files, and, with --base <ref>, no ADR was
 * deleted and no Hardened, Superseded, Obsolete or Rejected ADR was changed beyond what the
 * standard allows. CI runs it on every pull request with the base branch.
 *
 *   node scripts/check-adrs.mjs [--base origin/main]
 */
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { checkImmutability, checkIndex } from "./adr-rules.mjs";

const DIR = "docs/adr";

function git(/** @type {string[]} */ ...args) {
  return execFileSync("git", args, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

/** @returns {Map<string, string>} */
function workingTree() {
  const files = new Map();
  for (const name of readdirSync(DIR)) {
    if (name.endsWith(".md")) files.set(name, readFileSync(join(DIR, name), "utf8"));
  }
  return files;
}

/** @returns {Map<string, string>} */
function atRef(/** @type {string} */ ref) {
  const files = new Map();
  const list = git("ls-tree", "--name-only", `${ref}:${DIR}`).split("\n").filter(Boolean);
  for (const name of list) {
    if (name.endsWith(".md")) files.set(name, git("show", `${ref}:${DIR}/${name}`));
  }
  return files;
}

function hasDir(/** @type {string} */ ref) {
  try {
    git("cat-file", "-e", `${ref}:${DIR}`);
    return true;
  } catch {
    return false;
  }
}

const baseIndex = process.argv.indexOf("--base");
const base = baseIndex > 0 ? process.argv[baseIndex + 1] : undefined;

const head = workingTree();
const errors = checkIndex(head);
if (base) {
  if (hasDir(base)) errors.push(...checkImmutability(atRef(base), head));
  else console.log(`${base} has no ${DIR}; nothing to compare.`);
}

if (errors.length > 0) {
  for (const e of errors) console.error(`${DIR}/${e}`);
  console.error(`\n${errors.length} ADR problem${errors.length === 1 ? "" : "s"}.`);
  process.exit(1);
}
console.log(`ADRs OK (${[...head.keys()].filter((f) => f.startsWith("ADR-")).length} records).`);

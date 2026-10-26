import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll } from "vitest";

export type Files = Record<string, string>;

/** A minimal dictionary with no diagnostics at all. */
export const BASE: Files = {
  "dictionary.yaml": `name: test
description: Test dictionary.
formatVersion: 1
locales: { default: en, supported: [en] }
databases: [sqlite]
`,
  "entities/item.yaml": `entity: Item
description: An item.
primaryKey: id
fields:
  id:
    type: integer
    description: Key.
  name:
    type: string
    maxLength: 50
    description: Name.
`,
  "i18n/en.yaml": `item.displayLabel: Item
item.id.displayLabel: ID
item.name.displayLabel: Name
`,
};

const created: string[] = [];
afterAll(() => {
  for (const dir of created) rmSync(dir, { recursive: true, force: true });
});

/** Writes a dictionary folder to a temporary directory. A null value removes a BASE file. */
export function writeDictionary(
  overrides: Record<string, string | null> = {},
  base: Files = BASE,
): string {
  const root = mkdtempSync(join(tmpdir(), "radd-test-"));
  created.push(root);
  const files: Record<string, string | null> = { ...base, ...overrides };
  for (const [path, text] of Object.entries(files)) {
    if (text === null) continue;
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

/** The files after overrides, for locating markers. */
export function merged(overrides: Record<string, string | null>, base: Files = BASE): Files {
  const out: Files = {};
  for (const [k, v] of Object.entries({ ...base, ...overrides })) if (v !== null) out[k] = v;
  return out;
}

/** 1-based line of the first line containing `marker`. */
export function lineOf(text: string, marker: string): number {
  const index = text.split("\n").findIndex((l) => l.includes(marker));
  if (index < 0) throw new Error(`Marker '${marker}' not found.`);
  return index + 1;
}

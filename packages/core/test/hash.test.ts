import { describe, expect, it } from "vitest";
import { build, canonicalize, dictionaryHash } from "../src/index.js";
import { BASE, writeDictionary } from "./helpers.js";

const versionOf = (overrides: Record<string, string | null> = {}) => {
  const r = build(writeDictionary(overrides));
  expect(r.diagnostics).toEqual([]);
  return r.version;
};

const RICH = {
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
    required: true
    tags: [pii, audit]
    description: Name.
  size:
    type: string
    maxLength: 1
    lookup: { list: size }
    description: Size.
`,
  "lookups/size.yaml": `lookup: size
description: Sizes.
valueType: string
items:
  - { code: S, label: size.small }
  - { code: L, label: size.large }
`,
  "i18n/en.yaml": `item.label: Item
item.id.label: ID
item.name.label: Name
item.size.label: Size
size.small: Small
size.large: Large
`,
};

describe("canonicalize (RFC 8785)", () => {
  it("sorts keys by UTF-16 code units and drops whitespace", () => {
    expect(canonicalize({ b: 1, a: [true, null, "x"], A: { d: 1.5, c: 1e21 } })).toBe(
      '{"A":{"c":1e+21,"d":1.5},"a":[true,null,"x"],"b":1}',
    );
  });

  it("matches the RFC 8785 example for numbers and strings", () => {
    expect(
      canonicalize({
        // biome-ignore lint/correctness/noPrecisionLoss: RFC 8785 test vector; the rounding is the point.
        numbers: [333333333.33333329, 1e30, 4.5, 2e-3, 0.000000000000000000000000001],
      }),
    ).toBe('{"numbers":[333333333.3333333,1e+30,4.5,0.002,1e-27]}');
    expect(canonicalize({ string: '€$\u000f\nA\'B"\\\\"/' })).toBe(
      '{"string":"€$\\u000f\\nA\'B\\"\\\\\\\\\\"/"}',
    );
  });

  it("ignores the version property when hashing", () => {
    expect(dictionaryHash({ a: 1, version: "x" })).toBe(dictionaryHash({ a: 1 }));
    expect(dictionaryHash({ a: 1 })).toMatch(/^sha256:[0-9a-f]{64}$/);
  });
});

describe("dictionary version", () => {
  const base = versionOf(RICH);

  it("is stable across builds", () => {
    expect(versionOf(RICH)).toBe(base);
  });

  it("does not change when keys are reordered", () => {
    const reordered = (RICH["entities/item.yaml"] as string)
      .replace("description: An item.\nprimaryKey: id\n", "primaryKey: id\ndescription: An item.\n")
      .replace(
        "    type: string\n    maxLength: 50\n    required: true\n",
        "    required: true\n    maxLength: 50\n    type: string\n",
      );
    expect(versionOf({ ...RICH, "entities/item.yaml": reordered })).toBe(base);
  });

  it("does not change with whitespace, comments, flow style or line endings", () => {
    const restyled = `${(RICH["entities/item.yaml"] as string).replace("lookup: { list: size }", "lookup:\n      list:   size   # static list")}\n\n`;
    expect(versionOf({ ...RICH, "entities/item.yaml": restyled })).toBe(base);
    const crlf = Object.fromEntries(
      Object.entries({ ...BASE, ...RICH }).map(([k, v]) => [k, v.replaceAll("\n", "\r\n")]),
    );
    expect(versionOf(crlf)).toBe(base);
  });

  it("does not change when files are renamed, moved or split", () => {
    const en = RICH["i18n/en.yaml"] as string;
    const lines = en.trimEnd().split("\n");
    expect(
      versionOf({
        ...RICH,
        "entities/item.yaml": null,
        "entities/catalog/item.yaml": RICH["entities/item.yaml"] as string,
        "i18n/en.yaml": null,
        "i18n/en/items.yaml": `${lines.slice(0, 4).join("\n")}\n`,
        "i18n/en/sizes.yaml": `${lines.slice(4).join("\n")}\n`,
      }),
    ).toBe(base);
  });

  it("does not change when a default is written out", () => {
    const explicit = (RICH["entities/item.yaml"] as string).replace(
      "  id:\n    type: integer\n",
      "  id:\n    type: integer\n    required: false\n    readOnly: never\n    dbName: Id\n    apiName: id\n",
    );
    expect(versionOf({ ...RICH, "entities/item.yaml": explicit })).toBe(base);
  });

  it("does not change when set-like arrays are reordered", () => {
    const tags = (RICH["entities/item.yaml"] as string).replace(
      "tags: [pii, audit]",
      "tags: [audit, pii]",
    );
    expect(versionOf({ ...RICH, "entities/item.yaml": tags })).toBe(base);
  });

  it("treats field unique: true and an equivalent unique index the same", () => {
    const viaField = (RICH["entities/item.yaml"] as string).replace(
      "    required: true\n",
      "    required: true\n    unique: true\n",
    );
    const viaIndex = `${RICH["entities/item.yaml"]}indexes:\n  - { fields: [name], unique: true }\n`;
    expect(versionOf({ ...RICH, "entities/item.yaml": viaField })).toBe(
      versionOf({ ...RICH, "entities/item.yaml": viaIndex }),
    );
  });

  it.each([
    ["a description", (s: string) => s.replace("description: Name.", "description: Display name.")],
    ["a constraint", (s: string) => s.replace("maxLength: 50", "maxLength: 60")],
    ["a flag", (s: string) => s.replace("required: true", "required: false")],
    [
      "a database name",
      (s: string) =>
        s.replace("    description: Key.\n", "    description: Key.\n    dbName: ItemId\n"),
    ],
    ["the field order", (s: string) => s.replace(/( {2}name:[\s\S]*?)( {2}size:[\s\S]*)$/, "$2$1")],
    ["a tag", (s: string) => s.replace("tags: [pii, audit]", "tags: [pii]")],
  ])("changes when %s changes", (_, change) => {
    expect(
      versionOf({ ...RICH, "entities/item.yaml": change(RICH["entities/item.yaml"] as string) }),
    ).not.toBe(base);
  });

  it("changes when a message or the item order of a static lookup changes", () => {
    expect(
      versionOf({
        ...RICH,
        "i18n/en.yaml": (RICH["i18n/en.yaml"] as string).replace("Small", "Little"),
      }),
    ).not.toBe(base);
    const swapped = (RICH["lookups/size.yaml"] as string).replace(
      "  - { code: S, label: size.small }\n  - { code: L, label: size.large }",
      "  - { code: L, label: size.large }\n  - { code: S, label: size.small }",
    );
    expect(versionOf({ ...RICH, "lookups/size.yaml": swapped })).not.toBe(base);
  });
});

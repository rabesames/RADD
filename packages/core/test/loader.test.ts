import { describe, expect, it } from "vitest";
import { lint } from "../src/index.js";
import { BASE, writeDictionary } from "./helpers.js";

const messagesFor = (overrides: Record<string, string | null>, code: string) =>
  lint(writeDictionary(overrides))
    .diagnostics.filter((d) => d.code === code)
    .map((d) => `${d.file}:${d.line} ${d.message}`);

describe("YAML rules (RADD101)", () => {
  const withExtra = (extra: string) => ({
    "entities/item.yaml": `${BASE["entities/item.yaml"]}${extra}`,
  });

  it("rejects anchors and aliases", () => {
    const yaml = `entity: Item
description: &d An item.
primaryKey: id
fields:
  id: { type: integer, description: *d }
  name: { type: string, maxLength: 50, description: Name. }
`;
    expect(messagesFor({ "entities/item.yaml": yaml }, "RADD101")).toEqual([
      "entities/item.yaml:2 YAML anchors are not allowed (&d); use a domain type to share definitions.",
      "entities/item.yaml:5 YAML aliases are not allowed; write the value out.",
    ]);
  });

  it("rejects merge keys and tags", () => {
    expect(messagesFor(withExtra("audit: !!bool true\n"), "RADD101")).toEqual([
      "entities/item.yaml:12 YAML tags are not allowed (tag:yaml.org,2002:bool).",
    ]);
    const merge = `entity: Item
description: An item.
primaryKey: id
fields:
  id: { type: integer, description: Key. }
  name: { <<: {}, type: string, maxLength: 50, description: Name. }
`;
    expect(messagesFor({ "entities/item.yaml": merge }, "RADD101")).toContainEqual(
      "entities/item.yaml:6 YAML merge keys (<<) are not allowed; write the properties out.",
    );
  });

  it("parses YAML 1.2, so N and no stay strings", () => {
    const yaml = `lookup: yesNo
description: Yes or no.
valueType: string
items:
  - { code: Y, label: yesNo.yes }
  - { code: N, label: yesNo.no }
  - { code: no, label: yesNo.no2 }
`;
    const r = lint(
      writeDictionary({
        "lookups/yes-no.yaml": yaml,
        "i18n/en.yaml": `${BASE["i18n/en.yaml"]}yesNo.yes: Yes\nyesNo.no: No\nyesNo.no2: No\n`,
      }),
    );
    expect(r.diagnostics).toEqual([]);
  });
});

describe("file discovery", () => {
  it("warns about .yml files and ignores non-YAML files", () => {
    expect(
      messagesFor(
        { "entities/other.yml": "entity: Other\n", "AGENTS.md": "# Agents\n" },
        "RADD104",
      ),
    ).toEqual(["entities/other.yml:1 Use the .yaml extension; .yml files are ignored."]);
  });

  it("reads nested folders", () => {
    const r = lint(
      writeDictionary({
        "entities/item.yaml": null,
        "entities/a/b/item.yaml": BASE["entities/item.yaml"] as string,
      }),
    );
    expect(r.diagnostics).toEqual([]);
  });

  it("does not report unused keys while a file has schema errors", () => {
    const r = lint(
      writeDictionary({ "entities/item.yaml": `${BASE["entities/item.yaml"]}colour: red\n` }),
    );
    expect(r.diagnostics.map((d) => d.code)).toEqual(["RADD102"]);
  });

  it("reports schema errors with a hint for misspelled enum values", () => {
    const r = lint(
      writeDictionary({
        "entities/item.yaml": (BASE["entities/item.yaml"] as string).replace(
          "type: integer",
          "type: interger",
        ),
      }),
    );
    expect(r.diagnostics[0]).toMatchObject({
      code: "RADD102",
      file: "entities/item.yaml",
      line: 6,
      column: 11,
      path: "/fields/id/type",
      hint: "Did you mean 'integer'?",
    });
  });
});

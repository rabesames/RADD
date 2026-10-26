import { describe, expect, it } from "vitest";
import { lint, RULES } from "../src/index.js";
import { BASE, lineOf, merged, writeDictionary } from "./helpers.js";

type Overrides = Record<string, string | null>;

interface Case {
  /** What the bad fixture breaks. */
  name: string;
  bad: Overrides;
  /** Where the diagnostic must point: file and a marker on the expected line; null when it has no location. */
  at: [file: string, marker: string] | null;
  /** How many diagnostics with this code the bad fixture gives, all at `at`; 1 when omitted. */
  count?: number;
  /** A fixture that uses the same feature correctly; BASE when omitted. */
  good?: Overrides;
}

const item = (fields: string, extra = "") => `entity: Item
description: An item.
primaryKey: id
fields:
  id:
    type: integer
    description: Key.
${fields}${extra}`;

const nameField = `  name:
    type: string
    maxLength: 50
    description: Name.
`;

const en = (extra = "") => `${BASE["i18n/en.yaml"]}${extra}`;

const CASES: Record<keyof typeof RULES, Case> = {
  RADD101: {
    name: "duplicate key",
    bad: {
      "entities/item.yaml": item(`${nameField}  name: { type: text, description: Again. }\n`),
    },
    at: ["entities/item.yaml", "type: text"],
  },
  RADD102: {
    name: "misspelled property",
    bad: {
      "entities/item.yaml": item(
        `  name:\n    type: string\n    maxLenght: 50\n    description: Name.\n`,
      ),
    },
    at: ["entities/item.yaml", "maxLenght"],
  },
  RADD103: {
    name: "entity defined twice",
    bad: { "entities/z-item.yaml": BASE["entities/item.yaml"] as string },
    at: ["entities/z-item.yaml", "entity: Item"],
  },
  RADD104: {
    name: "stray YAML file",
    bad: { "notes.yaml": "a: 1\n" },
    at: ["notes.yaml", "a: 1"],
  },
  RADD105: {
    name: "no dictionary.yaml",
    bad: { "dictionary.yaml": null },
    at: null,
  },
  RADD201: {
    name: "unknown domain type",
    bad: {
      "entities/item.yaml": item(
        `${nameField}  email:\n    domain: Emial\n    description: Email.\n`,
      ),
    },
    at: ["entities/item.yaml", "domain: Emial"],
    good: {
      "entities/item.yaml": item(
        `${nameField}  email:\n    domain: Email\n    description: Email.\n`,
      ),
      "types/email.yaml":
        "domainType: Email\ndescription: An email.\ntype: string\nmaxLength: 254\nformat: email\n",
      "i18n/en.yaml": en("item.email.label: Email\n"),
    },
  },
  RADD202: {
    name: "unknown static lookup",
    bad: {
      "entities/item.yaml": item(
        `${nameField}  size:\n    type: string\n    maxLength: 1\n    lookup: { list: sizes }\n    description: Size.\n`,
      ),
    },
    at: ["entities/item.yaml", "list: sizes"],
    good: {
      "entities/item.yaml": item(
        `${nameField}  size:\n    type: string\n    maxLength: 1\n    lookup: { list: size }\n    description: Size.\n`,
      ),
      "lookups/size.yaml":
        "lookup: size\ndescription: Sizes.\nvalueType: string\nitems:\n  - { code: S, label: size.small }\n",
      "i18n/en.yaml": en("item.size.label: Size\nsize.small: Small\n"),
    },
  },
  RADD203: {
    name: "unknown referenced entity",
    bad: {
      "entities/item.yaml": item(
        `${nameField}  ownerId:\n    type: integer\n    references: { entity: Owner }\n    description: Owner.\n`,
      ),
    },
    at: ["entities/item.yaml", "references: { entity: Owner }"],
  },
  RADD204: {
    name: "primary key names no field",
    bad: { "entities/item.yaml": item(nameField).replace("primaryKey: id", "primaryKey: ident") },
    at: ["entities/item.yaml", "primaryKey: ident"],
  },
  RADD205: {
    name: "undeclared validator",
    bad: {
      "entities/item.yaml": item(
        `  name:\n    type: string\n    maxLength: 50\n    validators: [{ name: uniqueName }]\n    description: Name.\n`,
      ),
    },
    at: ["entities/item.yaml", "uniqueName"],
    good: {
      "entities/item.yaml": item(
        `  name:\n    type: string\n    maxLength: 50\n    validators: [{ name: uniqueName }]\n    description: Name.\n`,
      ),
      "validators.yaml": "validators:\n  uniqueName:\n    scope: field\n    description: Unique.\n",
      "i18n/en.yaml": en("item.name.uniqueName: Taken.\n"),
    },
  },
  RADD206: {
    name: "undeclared calculator",
    bad: {
      "entities/item.yaml": item(
        `${nameField}  total:\n    type: integer\n    computed: { source: application, calculator: itemTotal }\n    description: Total.\n`,
      ),
    },
    at: ["entities/item.yaml", "calculator: itemTotal"],
    good: {
      "entities/item.yaml": item(
        `${nameField}  total:\n    type: integer\n    computed: { source: application, calculator: itemTotal }\n    description: Total.\n`,
      ),
      "calculators.yaml": "calculators:\n  itemTotal:\n    description: Totals an item.\n",
      "i18n/en.yaml": en("item.total.label: Total\n"),
    },
  },
  RADD207: {
    name: "unknown function in an expression",
    bad: {
      "entities/item.yaml": item(
        nameField,
        `rules:\n  - { expression: "isBlnk(name) == false", message: item.label }\n`,
      ),
    },
    at: ["entities/item.yaml", "isBlnk"],
    good: {
      "entities/item.yaml": item(
        nameField,
        `rules:\n  - { expression: "isBlank(name) == false", message: item.label }\n`,
      ),
    },
  },
  RADD208: {
    name: "function from an extension that is not enabled",
    bad: {
      "entities/item.yaml": item(
        nameField,
        `rules:\n  - { expression: "name.lowerAscii() == name", message: item.label }\n`,
      ),
    },
    at: ["entities/item.yaml", "lowerAscii"],
    good: {
      "entities/item.yaml": item(
        nameField,
        `rules:\n  - { expression: "name.lowerAscii() == name", message: item.label }\n`,
      ),
      "dictionary.yaml": `${BASE["dictionary.yaml"]}expressions: { extensions: [strings] }\n`,
    },
  },
  RADD209: {
    name: "type and domain together",
    bad: {
      "entities/item.yaml": item(
        `${nameField}  email:\n    type: string # with a domain\n    domain: Email\n    description: Email.\n`,
      ),
      "types/email.yaml":
        "domainType: Email\ndescription: An email.\ntype: string\nmaxLength: 254\n",
      "i18n/en.yaml": en("item.email.label: Email\n"),
    },
    at: ["entities/item.yaml", "# with a domain"],
  },
  RADD210: {
    name: "static lookup with integer codes on a string field",
    bad: {
      "entities/item.yaml": item(
        `${nameField}  size:\n    type: string\n    maxLength: 1\n    lookup: { list: size }\n    description: Size.\n`,
      ),
      "lookups/size.yaml":
        "lookup: size\ndescription: Sizes.\nvalueType: integer\nitems:\n  - { code: 1, label: size.small }\n",
      "i18n/en.yaml": en("item.size.label: Size\nsize.small: Small\n"),
    },
    at: ["entities/item.yaml", "list: size"],
  },
  RADD211: {
    name: "maxLength on an integer",
    bad: {
      "entities/item.yaml": item(
        `${nameField}  count:\n    type: integer\n    maxLength: 3\n    description: Count.\n`,
      ),
    },
    at: ["entities/item.yaml", "maxLength: 3"],
  },
  RADD301: {
    name: "entity name not PascalCase",
    bad: { "entities/item.yaml": item(nameField).replace("entity: Item", "entity: item_thing") },
    at: ["entities/item.yaml", "entity: item_thing"],
  },
  RADD302: {
    name: "field name not lowerCamelCase",
    bad: {
      "entities/item.yaml": item(
        `  Title:\n    type: string\n    maxLength: 50\n    description: Title.\n`,
      ),
    },
    at: ["entities/item.yaml", "Title:"],
  },
  RADD303: {
    name: "database name with a space",
    bad: {
      "entities/item.yaml": item(
        `  name:\n    type: string\n    maxLength: 50\n    dbName: "Item Name"\n    description: Name.\n`,
      ),
    },
    at: ["entities/item.yaml", "dbName"],
    good: {
      "entities/item.yaml": item(
        `  name:\n    type: string\n    maxLength: 50\n    dbName: ITEM_NAME\n    description: Name.\n`,
      ),
    },
  },
  RADD304: {
    name: "validator name not lowerCamelCase",
    bad: {
      "validators.yaml":
        "validators:\n  Unique_Name:\n    scope: field\n    description: Unique.\n",
    },
    at: ["validators.yaml", "Unique_Name"],
  },
  RADD305: {
    name: "file name does not match the entity",
    bad: {
      "entities/item.yaml": null,
      "entities/thing.yaml": BASE["entities/item.yaml"] as string,
    },
    at: ["entities/thing.yaml", "entity: Item"],
  },
  RADD401: {
    name: "field without a description",
    bad: { "entities/item.yaml": item(`  name:\n    type: string\n    maxLength: 50\n`) },
    at: ["entities/item.yaml", "  name:"],
  },
  RADD501: {
    name: "field label missing in the default locale",
    bad: { "i18n/en.yaml": "item.label: Item\nitem.id.label: ID\n" },
    at: ["entities/item.yaml", "  name:"],
  },
  RADD502: {
    name: "key missing in another locale",
    bad: {
      "dictionary.yaml": BASE["dictionary.yaml"]?.replace(
        "supported: [en]",
        "supported: [en, fil]",
      ) as string,
      "i18n/fil.yaml": "item.label: Bagay\nitem.id.label: ID\n",
    },
    at: ["i18n/fil.yaml", "item.label"],
    // item.name.label, plus one warning for all the radd.* framework messages.
    count: 2,
  },
  RADD503: {
    name: "unused key",
    bad: { "i18n/en.yaml": en("item.colour.label: Colour\n") },
    at: ["i18n/en.yaml", "item.colour.label"],
  },
  RADD504: {
    name: "malformed ICU message",
    bad: {
      "i18n/en.yaml": BASE["i18n/en.yaml"]?.replace(
        "item.label: Item",
        'item.label: "Item {oops"',
      ) as string,
    },
    at: ["i18n/en.yaml", "item.label"],
  },
  RADD505: {
    name: "i18n file for an unsupported locale",
    bad: { "i18n/de.yaml": "item.label: Ding\n" },
    at: ["i18n/de.yaml", "item.label"],
  },
  RADD601: {
    name: "renamedFrom names a field that still exists",
    bad: {
      "entities/item.yaml": item(
        `  name:\n    type: string\n    maxLength: 50\n    renamedFrom: id\n    description: Name.\n`,
      ),
    },
    at: ["entities/item.yaml", "renamedFrom: id"],
    good: {
      "entities/item.yaml": item(
        `  name:\n    type: string\n    maxLength: 50\n    renamedFrom: title\n    description: Name.\n`,
      ),
    },
  },
  RADD701: {
    name: "unbalanced parenthesis in an expression",
    bad: {
      "entities/item.yaml": item(
        nameField,
        `rules:\n  - { expression: "(size(name) > 0", message: item.label }\n`,
      ),
    },
    at: ["entities/item.yaml", "(size(name) > 0"],
  },
  RADD702: {
    name: "database-computed field without SQL for an enabled database",
    bad: {
      "entities/item.yaml": item(
        `${nameField}  upper:\n    type: string\n    maxLength: 50\n    computed: { source: database, sql: { sqlserver: "UPPER([Name])" } }\n    description: Upper.\n`,
      ),
    },
    at: ["entities/item.yaml", "UPPER"],
    good: {
      "entities/item.yaml": item(
        `${nameField}  upper:\n    type: string\n    maxLength: 50\n    computed: { source: database, sql: { sqlite: "upper(Name)" } }\n    description: Upper.\n`,
      ),
      "i18n/en.yaml": en("item.upper.label: Upper\n"),
    },
  },
  RADD703: {
    name: "pattern that is not RE2",
    bad: {
      "entities/item.yaml": item(
        `  name:\n    type: string\n    maxLength: 50\n    pattern: "(?<=a)b"\n    description: Name.\n`,
      ),
    },
    at: ["entities/item.yaml", "pattern:"],
    good: {
      "entities/item.yaml": item(
        `  name:\n    type: string\n    maxLength: 50\n    pattern: "^[A-Z][a-z]+$"\n    description: Name.\n`,
      ),
    },
  },
};

describe("BASE fixture", () => {
  it("has no diagnostics", () => {
    expect(lint(writeDictionary()).diagnostics).toEqual([]);
  });
});

describe.each(Object.entries(CASES))("%s", (code, c) => {
  it(`passes a correct fixture`, () => {
    const result = lint(writeDictionary(c.good ?? {}));
    expect(result.diagnostics.filter((d) => d.code === code)).toEqual([]);
    expect(result.errorCount).toBe(0);
  });

  it(`reports ${c.name} at the right place`, () => {
    const result = lint(writeDictionary(c.bad));
    const found = result.diagnostics
      .filter((d) => d.code === code)
      .map((d) => ({ file: d.file, line: d.line }));
    if (c.at === null) {
      expect(found).toEqual([{ file: undefined, line: undefined }]);
    } else {
      const [file, marker] = c.at;
      const text = merged(c.bad)[file] as string;
      expect(found).toEqual(Array(c.count ?? 1).fill({ file, line: lineOf(text, marker) }));
    }
    const d = result.diagnostics.find((x) => x.code === code);
    expect(d?.rule).toBe(RULES[code as keyof typeof RULES].rule);
    expect(d?.severity).toBe(RULES[code as keyof typeof RULES].severity);
  });
});

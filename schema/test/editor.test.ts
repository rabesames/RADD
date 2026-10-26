/**
 * The schemas must work in editors, not only in radd lint. These tests run yaml-language-server,
 * the engine behind the VS Code YAML extension, with the same mappings as .vscode/settings.json.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parse } from "jsonc-parser";
import { describe, expect, it } from "vitest";
import { TextDocument } from "vscode-languageserver-textdocument";
import { getLanguageService } from "yaml-language-server";

const repo = fileURLToPath(new URL("../../", import.meta.url));
const settings = parse(readFileSync(`${repo}.vscode/settings.json`, "utf8")) as {
  "yaml.schemas": Record<string, string[]>;
};

const ls = getLanguageService({
  schemaRequestService: async (uri: string) => readFileSync(fileURLToPath(uri), "utf8"),
  workspaceContext: {
    resolveRelativePath: (rel: string, res: string) => new URL(rel, res).toString(),
  },
});
ls.configure({
  validate: true,
  completion: true,
  hover: true,
  schemas: Object.entries(settings["yaml.schemas"]).map(([path, fileMatch]) => ({
    uri: pathToFileURL(`${repo}${path}`).toString(),
    fileMatch,
  })),
});

const doc = (path: string, text: string) =>
  TextDocument.create(`file:///project/dictionary/${path}`, "yaml", 1, text);

const errorsIn = async (path: string, text: string) =>
  (await ls.doValidation(doc(path, text), false)).map(
    (d) => `${d.range.start.line + 1}: ${d.message.split("\n")[0]}`,
  );

describe("editor support (yaml-language-server)", () => {
  it.each([
    "dictionary.yaml",
    "entities/customer.yaml",
    "entities/order-line.yaml",
    "types/email.yaml",
    "lookups/gender.yaml",
    "validators.yaml",
    "i18n/en.yaml",
  ])("accepts the example's %s", async (path) => {
    const text = readFileSync(`${repo}examples/acme-orders/dictionary/${path}`, "utf8");
    expect(await errorsIn(path, text)).toEqual([]);
  });

  it("shows inline errors on the right lines", async () => {
    const text = `entity: Thing
description: A thing.
primaryKey: id
fields:
  id:
    type: integr
    maxLenght: 3
    description: Key.
relationships:
  owner: { kind: manyToOne, entity: Owner }
`;
    const errors = await errorsIn("entities/thing.yaml", text);
    expect(errors).toContainEqual(expect.stringMatching(/^6: Value is not accepted/));
    expect(errors).toContainEqual("7: Property maxLenght is not allowed.");
    expect(errors).toContainEqual('10: Missing property "foreignKey".');
  });

  it("completes field properties and logical types", async () => {
    const field = doc(
      "entities/field.yaml",
      "entity: Thing\nprimaryKey: id\nfields:\n  id:\n    type: integer\n    \n",
    );
    const props = (await ls.doComplete(field, { line: 5, character: 4 }, false)).items.map(
      (i) => i.label,
    );
    expect(props).toEqual(
      expect.arrayContaining(["dbName", "apiName", "maxLength", "lookup", "rules", "computed"]),
    );

    const type = doc("entities/type.yaml", "entity: Thing\nfields:\n  id:\n    type: \n");
    const types = (await ls.doComplete(type, { line: 3, character: 10 }, false)).items.map(
      (i) => i.label,
    );
    expect(types).toEqual(expect.arrayContaining(["string", "decimal", "guid", "datetimeOffset"]));
  });

  it("shows property descriptions on hover", async () => {
    const d = doc("entities/hover.yaml", "entity: Thing\nfields:\n  id:\n    type: guid\n");
    const hover = await ls.doHover(d, { line: 3, character: 5 });
    expect(JSON.stringify(hover?.contents)).toContain("Logical type.");
  });
});

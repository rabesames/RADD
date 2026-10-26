# Editor setup: VS Code

RADD's JSON Schema gives you autocomplete, inline errors and hover help while you edit dictionary YAML. `radd lint` checks more (references across files, naming, descriptions, translations), so run it too; see [lint-rules.md](lint-rules.md).

## 1. Install the YAML extension

Install **YAML** by Red Hat (`redhat.vscode-yaml`). In this repository VS Code suggests it automatically from `.vscode/extensions.json`.

## 2. Map the schemas

This repository already maps them in `.vscode/settings.json`. For your own project, add the same mapping to its `.vscode/settings.json`, pointing at the schema files. Until the schema is published, use a local checkout of RADD or the raw GitHub URLs.

```json
{
  "yaml.schemas": {
    "https://raw.githubusercontent.com/rabesames/RADD/main/schema/v1/dictionary.schema.json": ["**/dictionary/dictionary.yaml"],
    "https://raw.githubusercontent.com/rabesames/RADD/main/schema/v1/entity.schema.json": ["**/dictionary/entities/**/*.yaml"],
    "https://raw.githubusercontent.com/rabesames/RADD/main/schema/v1/domain-type.schema.json": ["**/dictionary/types/**/*.yaml"],
    "https://raw.githubusercontent.com/rabesames/RADD/main/schema/v1/lookup.schema.json": ["**/dictionary/lookups/**/*.yaml"],
    "https://raw.githubusercontent.com/rabesames/RADD/main/schema/v1/validators.schema.json": ["**/dictionary/validators.yaml"],
    "https://raw.githubusercontent.com/rabesames/RADD/main/schema/v1/calculators.schema.json": ["**/dictionary/calculators.yaml"],
    "https://raw.githubusercontent.com/rabesames/RADD/main/schema/v1/functions.schema.json": ["**/dictionary/functions.yaml"],
    "https://raw.githubusercontent.com/rabesames/RADD/main/schema/v1/i18n.schema.json": ["**/dictionary/i18n/**/*.yaml"]
  }
}
```

The globs assume the dictionary folder is called `dictionary`, as `radd init` creates it. If yours is named differently, change `**/dictionary/` in each pattern.

## 3. Check it works

Open `examples/acme-orders/dictionary/entities/customer.yaml`:

- **Hover** over `type:` to see its description and allowed values.
- **Autocomplete:** on a new line inside a field, press Ctrl+Space; you get the field properties (`maxLength`, `lookup`, `dbName`, ...). After `type: `, you get the logical types.
- **Inline errors:** change `maxLength` to `maxLenght`; it is underlined as "Property maxLenght is not allowed". Give a lookup both `list` and `entity`; `entity` is flagged.

The tests in `schema/test/editor.test.ts` run the same language server as the extension, so these behaviors are checked in CI.

## What the editor does not check

The schema checks one file at a time. These need `radd lint`:

- references that do not exist, types that do not fit, formats and generated keys (RADD201 to RADD214)
- naming conventions and file names (RADD301 to RADD305)
- missing descriptions (RADD401)
- missing or unused translations, and display-hint HTML (RADD501 to RADD506)
- expression, pattern, computed-SQL and ICU format checks (RADD701 to RADD704)

Run it from the terminal (`npx radd lint dictionary`). Its `file:line:column` output is clickable in the VS Code terminal.

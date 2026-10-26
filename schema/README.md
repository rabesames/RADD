# RADD dictionary JSON Schema

JSON Schema (draft 2020-12) for every file in a RADD dictionary folder. Editors, `radd lint` and AI agents all validate against these files.

| File in the dictionary | Schema |
| --- | --- |
| `dictionary.yaml` | [`v1/dictionary.schema.json`](v1/dictionary.schema.json) |
| `entities/**/*.yaml` | [`v1/entity.schema.json`](v1/entity.schema.json) |
| `types/**/*.yaml` | [`v1/domain-type.schema.json`](v1/domain-type.schema.json) |
| `lookups/**/*.yaml` | [`v1/lookup.schema.json`](v1/lookup.schema.json) |
| `validators.yaml` | [`v1/validators.schema.json`](v1/validators.schema.json) |
| `calculators.yaml` | [`v1/calculators.schema.json`](v1/calculators.schema.json) |
| `functions.yaml` | [`v1/functions.schema.json`](v1/functions.schema.json) |
| `i18n/<locale>.yaml`, `i18n/<locale>/*.yaml` | [`v1/i18n.schema.json`](v1/i18n.schema.json) |

`v1/common.schema.json` holds the shared definitions (fields' constraints, rules, lookups, computed fields).

## Editing the schemas

The schemas are written in `src/*.schema.jsonc`, JSON with comments that explain the less obvious choices. The files in `v1/` are generated strict JSON, because editors and validators load them by URL; never edit them by hand (ADR-0038).

```sh
npm run schema:build   # writes v1/ from src/
npm run schema:check   # fails if v1/ is out of date (CI runs it)
```

Commit the source and the generated file together. Each generated file keeps its `$id` and gets a `$comment` naming its source.

The schemas check structure only. Cross-file references, naming conventions, required descriptions and translations are checked by `radd lint`; see [docs/lint-rules.md](../docs/lint-rules.md).

The schemas avoid 2020-12 keywords that the VS Code YAML extension does not understand (`unevaluatedProperties`, `$dynamicRef`), so editor validation matches `radd lint`.

# AGENTS.md: working on this dictionary

This folder is a RADD data dictionary: the single source of truth for this system's entities, fields, validation, lookups and user-facing text. The database schema, API validation and front end are generated from or driven by it. Change behavior here, not in application code.

This is a first draft; `radd init` will generate a version of it for new projects.

## Before and after every change

1. Read the files you are changing and the domain types they use (`types/`).
2. Make the change.
3. Run `npx radd lint dictionary --json` and fix every error. Warnings should be fixed too, unless the change explains why not.
4. Run `npx radd build dictionary --json` and check that it succeeds.
5. Open a pull request. A human reviews and merges every dictionary change.

Never edit the canonical JSON (`.radd/dictionary.json`) or generated code; they are rebuilt from these files.

## Layout

| Path | Holds |
| --- | --- |
| `dictionary.yaml` | name, `formatVersion: 1`, locales, databases, allowed CEL extensions |
| `entities/<kebab-name>.yaml` | one entity per file, `entity: PascalName` |
| `types/<kebab-name>.yaml` | one domain type per file, `domainType: PascalName` |
| `lookups/<kebab-name>.yaml` | one static list per file, `lookup: camelName` |
| `validators.yaml`, `calculators.yaml`, `functions.yaml` | named server validators, calculators, custom CEL functions |
| `i18n/<locale>.yaml` | all user-facing text, one file per locale (`en`, `fil`) |

## Naming conventions

- Entities and domain types: PascalCase, singular (`OrderLine`, `MobileNumber`).
- Fields, relationships, lookups, validators, calculators: lowerCamelCase (`countryCode`, `uniqueCustomerEmail`).
- Custom functions: lowerCamelCase, optionally one namespace (`geo.distance`).
- Database names default to TitleCase (`CountryCode`) and API names to camelCase. Set `dbName` or `apiName` only to match an existing schema or API.
- Message keys: `<entity>.<field>.<what>` in lowerCamelCase (`customer.creditLimit.displayLabel`).

## Rules for changes

- **Describe everything.** Every entity, field, domain type, lookup, validator, calculator and function needs a `description` that says what it is and why it exists.
- **Prefer domain types.** If a field is an email, money amount or mobile number, use `Email`, `Money` or `MobileNumber` instead of repeating constraints. Add a domain type when a concept appears twice.
- **Logical types only.** Never write database types. `string` needs `maxLength`; use `text` for long text. `decimal` needs `precision` and `scale`.
- **Text goes in i18n.** Every new entity and field needs a `displayLabel` in every locale in `locales.supported`. Draft translations are welcome; mark them in the pull request so a speaker can review them.
- **Display hints** may use only `b`, `strong`, `i`, `em`, `br`, `p`, `ul`, `ol`, `li`, `code`, and `a` with an `https` link.
- **Renames.** Rename by changing the name and adding `renamedFrom: <old name>`. Never delete and re-add a field to rename it.
- **Tags.** Tag personal data `pii` and money `financial`; their values are never logged.
- **Keys.** New surrogate keys use `generated: uuid` (guid) or `generated: identity` (integer or long).
- **Expressions** are CEL. Use `dec.*` for decimal arithmetic. Only functions from standard CEL, the RADD built-ins, enabled extensions and `functions.yaml` are allowed.
- **Logic that needs the database** (uniqueness, credit checks, totals over other rows) is a named validator or calculator, declared in `validators.yaml` or `calculators.yaml`, never an expression.
- **Do not loosen or remove** a rule, constraint or validator without saying why in the pull request; tightening rules can reject existing data and needs a migration check.

## Domain types in this dictionary

| Domain type | Meaning |
| --- | --- |
| `Email` | email address, max 254, `pii` |
| `Money` | Philippine pesos, decimal(12,2), shown as `#,##0.00`, `financial` |
| `MobileNumber` | Philippine mobile number, 11 digits starting with 09, shown as `0000-000-0000`, `pii` |

## Reference

- Authoring guide: `docs/authoring.md` in the RADD repository.
- Lint codes and fixes: `docs/lint-rules.md`.

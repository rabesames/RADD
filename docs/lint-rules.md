# Lint rule reference

`radd lint` reports problems with a stable code, the rule name, a severity, the file, line and column, and often a hint. Codes never change meaning and are never reused ([ADR-0032](adr/ADR-0032.md)).

```
entities/customer.yaml:25:21  error  RADD202  Unknown lookup 'genders'.
    Did you mean 'gender'?
```

- **error:** `radd lint` exits with 1 and `radd build` writes nothing.
- **warning:** reported, but lint passes and build proceeds.

Semantic rules (2xx to 7xx) run only on files that pass the YAML and schema checks (1xx). Fix those first; the rest of a broken file's problems appear afterwards.

| Code | Rule | Severity |
| --- | --- | --- |
| [RADD101](#radd101-yaml-syntax) | yaml-syntax | error |
| [RADD102](#radd102-schema) | schema | error |
| [RADD103](#radd103-duplicate-name) | duplicate-name | error |
| [RADD104](#radd104-unknown-file) | unknown-file | warning |
| [RADD105](#radd105-missing-dictionary-file) | missing-dictionary-file | error |
| [RADD201](#radd201-unknown-domain-type) | unknown-domain-type | error |
| [RADD202](#radd202-unknown-lookup) | unknown-lookup | error |
| [RADD203](#radd203-unknown-entity) | unknown-entity | error |
| [RADD204](#radd204-unknown-field) | unknown-field | error |
| [RADD205](#radd205-unknown-validator) | unknown-validator | error |
| [RADD206](#radd206-unknown-calculator) | unknown-calculator | error |
| [RADD207](#radd207-unknown-function) | unknown-function | error |
| [RADD208](#radd208-extension-not-enabled) | extension-not-enabled | error |
| [RADD209](#radd209-type-with-domain) | type-with-domain | error |
| [RADD210](#radd210-lookup-type-mismatch) | lookup-type-mismatch | error |
| [RADD211](#radd211-invalid-constraint) | invalid-constraint | error |
| [RADD212](#radd212-format-type-mismatch) | format-type-mismatch | error |
| [RADD213](#radd213-invalid-generated) | invalid-generated | error |
| [RADD214](#radd214-generated-option-ignored) | generated-option-ignored | warning |
| [RADD301](#radd301-entity-name) | entity-name | error |
| [RADD302](#radd302-field-name) | field-name | error |
| [RADD303](#radd303-physical-name) | physical-name | error |
| [RADD304](#radd304-component-name) | component-name | error |
| [RADD305](#radd305-file-name) | file-name | warning |
| [RADD401](#radd401-missing-description) | missing-description | error |
| [RADD501](#radd501-missing-default-locale-key) | missing-default-locale-key | error |
| [RADD502](#radd502-missing-locale-key) | missing-locale-key | warning |
| [RADD503](#radd503-unused-key) | unused-key | warning |
| [RADD504](#radd504-invalid-message) | invalid-message | error |
| [RADD505](#radd505-unknown-locale) | unknown-locale | error |
| [RADD506](#radd506-invalid-hint-html) | invalid-hint-html | error |
| [RADD601](#radd601-renamed-from-conflict) | renamed-from-conflict | error |
| [RADD701](#radd701-expression-syntax) | expression-syntax | error |
| [RADD702](#radd702-missing-computed-sql) | missing-computed-sql | error |
| [RADD703](#radd703-invalid-pattern) | invalid-pattern | error |
| [RADD704](#radd704-invalid-format-pattern) | invalid-format-pattern | error |

## Files and schema

### RADD101 yaml-syntax

**Meaning:** the file is not valid YAML 1.2, has a duplicate key, or uses a YAML feature RADD does not allow: anchors (`&x`), aliases (`*x`), merge keys (`<<`), explicit tags (`!!bool`) or several documents in one file.

**Fix:** correct the syntax, and write shared values out. To reuse a field definition, create a domain type in `types/`.

### RADD102 schema

**Meaning:** the file does not match its JSON Schema: an unknown or misspelled property, a wrong type, a value outside an enum, a missing required property, or properties that cannot be combined (for example `list` and `entity` in one lookup).

**Fix:** follow the message and hint (`Did you mean 'maxLength'?`). The editor shows the same errors inline; see [editor-setup.md](editor-setup.md).

### RADD103 duplicate-name

**Meaning:** a name is defined twice. This covers two entities, domain types or lookups with the same name; an entity, domain type and lookup that share a message-key prefix (`Gender` and `gender` both use `gender.*`); the reserved prefix `radd`; one i18n key in two files of the same locale; a lookup code used twice; and a custom function that redefines a RADD built-in.

**Fix:** rename one of them.

### RADD104 unknown-file

**Meaning:** a YAML file is outside the dictionary layout (`entities/`, `types/`, `lookups/`, `i18n/`, and the root files), or uses the `.yml` extension. It is ignored. Non-YAML files such as `AGENTS.md` are ignored silently.

**Fix:** move it into the right folder, rename it to `.yaml`, or delete it.

### RADD105 missing-dictionary-file

**Meaning:** the folder has no `dictionary.yaml`.

**Fix:** add one with `name`, `formatVersion: 1`, `locales` and `databases`, or point `radd` at the right folder.

## References and types

### RADD201 unknown-domain-type

**Meaning:** `domain:` names a domain type that does not exist in `types/`.

**Fix:** correct the name, or add the domain type.

### RADD202 unknown-lookup

**Meaning:** `lookup: { list: ... }` names a static lookup that does not exist in `lookups/`.

**Fix:** correct the name, or add the lookup.

### RADD203 unknown-entity

**Meaning:** a lookup, `references`, or a relationship's `entity` or `through` names an entity that does not exist.

**Fix:** correct the entity name (entity names are PascalCase, for example `OrderLine`).

### RADD204 unknown-field

**Meaning:** a field name does not exist where it is used: `primaryKey`, an index, `concurrencyToken`, a lookup's `value`, `display` or `dependsOn`, a relationship's `foreignKey`, `references.field`, or a display format's `currency` field. Also reported when `references` targets an entity with a composite key and names no field.

**Fix:** correct the field name, using the logical name (the YAML key), not the database or API name.

### RADD205 unknown-validator

**Meaning:** a validator is not declared in `validators.yaml`; is used at the wrong scope (a `field` validator on an entity, or the reverse); is given a parameter it does not declare; or lacks a required parameter.

**Fix:** declare the validator with its `scope` and `parameters`, or correct the use.

### RADD206 unknown-calculator

**Meaning:** `computed: { calculator: ... }` names a calculator not declared in `calculators.yaml`.

**Fix:** declare it, or correct the name.

### RADD207 unknown-function

**Meaning:** a CEL expression calls a function that is not standard CEL, not a RADD built-in (`isBlank`, `newGuid`, `dec.add`, `dec.sub`, `dec.mul`, `dec.eq`, `dec.round`), not in an enabled extension, and not declared in `functions.yaml`.

**Fix:** correct the name, or declare the function in `functions.yaml`. Until the stage 2 CEL library is in place, lint checks function names only, not argument types ([ADR-0036](adr/ADR-0036.md)).

### RADD208 extension-not-enabled

**Meaning:** an expression uses a function from a CEL extension (for example `lowerAscii` from `strings`) that is not listed in `expressions.extensions` in `dictionary.yaml`.

**Fix:** add the extension to `dictionary.yaml`, or avoid the function.

### RADD209 type-with-domain

**Meaning:** a field sets both `type` and `domain`. A domain type's base type cannot be overridden.

**Fix:** remove `type`; the domain type provides it. Constraints such as `maxLength` can still be overridden.

### RADD210 lookup-type-mismatch

**Meaning:** a field's type does not match what it points at: a static lookup's `valueType` (string codes need a string field, integer codes an integer or long field), a lookup item's code, or the type of the referenced field for `references` and reference-table lookups.

**Fix:** align the types.

### RADD211 invalid-constraint

**Meaning:** a constraint does not fit the field. Examples: `maxLength` on an integer; `precision` on a string; `format`, `pattern` or `mask` on a non-string; a decimal without `precision` and `scale`; a string without `maxLength`; `scale` above `precision`; `min` above `max`, or `minLength` above `maxLength`; a `min` or `max` that is not a whole number for an integer, outside the integer or long range, with more decimals than the scale, or too large for the precision; a literal `default` of the wrong type; a computed field with `readOnly` other than `always`.

**Fix:** follow the message. Use `text` for unbounded strings, and `default: { expression: "..." }` for computed defaults.

### RADD212 format-type-mismatch

**Meaning:** a `displayFormat` or `editFormat` does not suit the field: for example a `number` format on a string, a `mask` on a number, an `editFormat` with `decimals` on an integer or with more decimals than the scale, or a `currency` field that is not a string.

**Fix:** choose a kind that suits the type. Number kinds (`number`, `percent`, `currency`) are for integer, long and decimal; `date`, `time` and `datetime` for the matching date types; `boolean` for boolean; `text` and `mask` for strings.

### RADD213 invalid-generated

**Meaning:** `generated` is used wrongly: on a field that is not part of the primary key; `identity` on a type other than integer or long; `uuid` on a type other than guid; more than one identity in an entity; or together with `default`, `computed`, or a `readOnly` other than `always`.

**Fix:** follow the message. Generated keys are always read-only, so `readOnly` can be left out.

### RADD214 generated-option-ignored

**Meaning:** an identity key sets a `seed` or `increment` other than 1 while SQLite is an enabled database. SQLite always starts at 1 and increments by 1.

**Fix:** keep it if SQL Server or Postgres also use the dictionary; otherwise remove it.

## Naming

### RADD301 entity-name

**Meaning:** an entity or domain type name is not PascalCase (`OrderLine`, `MobileNumber`).

**Fix:** rename it. Use `dbName` if the table name must differ.

### RADD302 field-name

**Meaning:** a field or relationship name is not lowerCamelCase (`countryCode`, `lines`).

**Fix:** rename it. Use `dbName` or `apiName` if the column or JSON name must differ.

### RADD303 physical-name

**Meaning:** a `dbName` or `apiName` is not a plain identifier (letters, digits and underscores, not starting with a digit), or two fields of an entity, or two entities, end up with the same database or API name, ignoring case.

**Fix:** choose a plain, unique name.

### RADD304 component-name

**Meaning:** a lookup, validator, calculator or function name is not lowerCamelCase. Functions may have one namespace (`geo.distance`).

**Fix:** rename it.

### RADD305 file-name

**Meaning:** a file's name is not the kebab-case form of the name it defines (`OrderLine` belongs in `order-line.yaml`).

**Fix:** rename the file. File names carry no meaning, so this never changes the build.

## Documentation

### RADD401 missing-description

**Meaning:** an entity, field, domain type, lookup, validator, calculator or function has no `description`.

**Fix:** say what it is and why it exists. Descriptions are what make the dictionary useful to people and AI agents.

## Localization

### RADD501 missing-default-locale-key

**Meaning:** a message key the dictionary needs is missing in the default locale: an entity's or field's `displayLabel`, a lookup item's label, an explicit rule or validator `message`, an explicitly named `shortLabel`, `displayHint` or `placeholder`, a boolean format's labels, or a validator message with no fallback. Also reported once for a framework message (`radd.required`) when the default locale is not English and does not define it.

**Fix:** add the key to `i18n/<default>.yaml`.

### RADD502 missing-locale-key

**Meaning:** a key in the default locale is missing in another supported locale; the default text will be shown. Missing framework messages (`radd.*`) are reported together, once per locale.

**Fix:** add the translation.

### RADD503 unused-key

**Meaning:** an i18n key is not used by the dictionary, or exists in a non-default locale but not in the default one. Not reported while any file has YAML or schema errors.

**Fix:** remove the key, correct its name, or add it to the default locale.

### RADD504 invalid-message

**Meaning:** a message is not valid ICU MessageFormat (for example an unclosed `{`). HTML tags are treated as text.

**Fix:** correct the placeholders. Quote a literal brace as `'{'`.

### RADD505 unknown-locale

**Meaning:** an `i18n/` file is for a locale not in `locales.supported`, a supported locale has no file, or the default locale is not in the supported list.

**Fix:** align `dictionary.yaml` and `i18n/`.

### RADD506 invalid-hint-html

**Meaning:** a display hint, in any locale, contains HTML outside the allowlist: `b`, `strong`, `i`, `em`, `br`, `p`, `ul`, `ol`, `li`, `code`, and `a` with an `https` `href` and no other attributes. Scripts, styles, images, event handlers, other attributes and comments are rejected.

**Fix:** use only the allowed tags. A `<` followed by a space is text.

## Renames

### RADD601 renamed-from-conflict

**Meaning:** `renamedFrom` names the item itself, names an entity or field that still exists, or two items claim the same old name.

**Fix:** correct `renamedFrom`. Remove it once every database has been migrated.

## Expressions, computed fields and patterns

### RADD701 expression-syntax

**Meaning:** a CEL expression has a lexical error: an unterminated string, unbalanced brackets or an unexpected character.

**Fix:** correct the expression.

### RADD702 missing-computed-sql

**Meaning:** a database-computed field has no SQL for one of the databases in `dictionary.yaml`.

**Fix:** add SQL for that provider under `computed.sql`. Columns are referenced by their `dbName`.

### RADD703 invalid-pattern

**Meaning:** a field's `pattern` is not a valid RE2 regular expression. RE2 has no lookbehind or backreferences.

**Fix:** rewrite the pattern in RE2 syntax.

### RADD704 invalid-format-pattern

**Meaning:** a display or edit format has an invalid ICU number pattern (`#.##0`, `0#`), an invalid ICU date pattern (unquoted literal letters such as `at`), a mask with no placeholders, or grouping and decimal symbols that are the same.

**Fix:** use ICU syntax. Number patterns put `#` before `0` in the integer part and `0` before `#` in the fraction (`#,##0.00`). Date patterns quote literal text (`yyyy-MM-dd 'at' HH:mm`). Masks use `0` for a digit, `A` for a letter and `*` for any character.

# RADD — Implementation Plan

Last updated: 2026-10-26 · Owner: Rommel

The framework is built in stages, and no stage starts until Rommel has validated the previous one. Only stages 1 to 3 are detailed; later stages are placeholders, refined using what the first three teach us. The requirements live in [requirements-spec.md](requirements-spec.md).

## How each stage runs

1. **Propose.** Claude writes the stage proposal into this plan: scope, design choices, what is out of scope, and anything that changes the spec. Rommel can redirect before work starts, but the work proceeds unless he does.
2. **Build.** Claude implements the stage on its own branch, in small commits.
3. **Test and example.** Every stage adds automated tests that run in CI, and extends the example project (`examples/acme-orders`) so the stage's behavior can be seen and run.
4. **Document.** Claude writes an ADR for every architectural or Rommel-level decision made in the stage, in the same pull request as the code it governs, and updates the user docs in the repo, the requirements spec for any decision that changed, and this plan with what was learned.
5. **Validate.** Claude opens a pull request with a short summary, how to try it, the validation checklist for that stage, and known gaps. The stage is done only when Rommel approves the code and its ADRs, and hardens the ADRs he considers final; feedback is fixed on the same branch.

After each gate, Claude proposes the next stage in detail, updating later placeholders with what was learned.

## Standard: architecture decision records

Every architectural or Rommel-level decision is recorded as an ADR in the repo, committed with the code it governs. Once an ADR is hardened it is immutable, with one exception: its status may later change to Superseded or Obsolete, recording which ADR replaced it. A changed decision always gets a new ADR.

### What needs an ADR

- Every decision recorded in the requirements spec.
- Any choice between alternatives with lasting consequences: a library, a file format, a public API or contract, a layering rule, a naming convention, a security or licensing stance.
- Any decision Rommel makes at a stage gate.

Implementation details that can be changed freely within one package do not need an ADR.

### Files and naming

- Location: `/docs/adr/`.
- File name: `ADR-` plus a four-digit sequence number, e.g. `ADR-0001.md`. Numbers are sequential and never reused, including for rejected ADRs.
- `/docs/adr/README.md` is the index: number, title, status, date, and supersedes or superseded-by links. It is updated in the same pull request whenever a status changes.

### Template

```markdown
# ADR-0007: Use CEL for dictionary expressions

- Status: Proposed | Accepted | Hardened | Rejected | Superseded | Obsolete
- Date: 2026-10-26
- Deciders: Rommel
- Supersedes: ADR-0003 (optional)
- Superseded by: ADR-0012 (only when Superseded or Obsolete)

## Context
What problem, constraints and forces led to this decision.

## Decision
What was decided, stated so it can be checked against the code.

## Alternatives considered
Each option and why it was not chosen.

## Consequences
What becomes easier, harder, or required as a result.

## References
Spec sections, pull requests, spike memos.
```

### Lifecycle

| Status | Meaning | Can the file change? |
| --- | --- | --- |
| Proposed | Drafted by Claude, under discussion in a pull request | Yes |
| Accepted | Agreed, but may still be refined while the stage is in progress | Yes, with the change noted in the pull request |
| Hardened | Final, set by Rommel at a stage gate | Only the status and Superseded-by lines, and only to mark it Superseded or Obsolete |
| Superseded | Replaced by a newer ADR, named in Superseded by | No |
| Obsolete | No longer applies (the component or concern is gone); names the ADR that made it obsolete, if one did | No |
| Rejected | Considered and declined; kept for the record | No |

### Enforcement

- A CI check fails any pull request that deletes an ADR, or modifies one whose status on the base branch is Hardened, Superseded, Obsolete or Rejected. The only allowed change is a Hardened ADR's status line becoming Superseded or Obsolete, plus a Superseded-by line naming an ADR that exists in the same branch (and, for Superseded, lists it under Supersedes).
- Only Rommel changes a status to Hardened; Claude never does.
- `CODEOWNERS` makes Rommel a required reviewer for `/docs/adr/`.
- A new ADR that supersedes an older one must name it in `Supersedes`, and the index is updated in the same pull request.

## Stage overview

The order puts the dictionary format first and the risky technical bets (CEL libraries, EF schema diff, source generation) second, so they are proven before the runtime is built on them.

| # | Stage | Outcome | Detail | Status |
| --- | --- | --- | --- | --- |
| 1 | Repo foundation and dictionary format | A dictionary can be written in YAML with editor help, linted, and built into canonical JSON with a stable hash | Detailed | Proposed |
| 2 | Spikes | Evidence-based picks for the CEL libraries, the EF diff approach and the source-generator approach | Detailed | Not started |
| 3 | .NET runtime: model and EF Core | Generated entity classes and an EF model configured from the dictionary, running on SQLite | Detailed | Not started |
| 4 | API validation pipeline | All rule kinds, severities, named validators and ProblemDetails results, with structured logging | Placeholder | Not started |
| 5 | Metadata endpoints and localization | `/_radd/*` endpoints, lookups with cache modes, localized labels and messages | Placeholder | Not started |
| 6 | TypeScript client | Headless client with TTL cache, form state, validation and lookups | Placeholder | Not started |
| 7 | Migration script generation | `radd db diff` against a live database, change report, safety rules | Placeholder | Not started |
| 8 | CLI and project initializer | Node core with plugin protocol, `radd init`, `radd gen`, `radd doctor` | Placeholder | Not started |
| 9 | AI layer | MCP server, semantic diff for review, docs with ERDs, AGENTS.md | Placeholder | Not started |
| 10 | Alpha hardening | End-to-end example, conformance pass on both runtimes, alpha tag | Placeholder | Not started |

## Stage 1: Repo foundation and dictionary format

At the end of this stage, a dictionary can be authored in YAML with autocomplete and inline errors in the editor, linted with clear messages, and built into canonical JSON with a hash that only changes when meaning changes.

> **Proposal status:** approved by Rommel on 2026-10-26, with the naming change in decision 4 below.

### Scope

1. **Monorepo skeleton:** npm workspaces for TypeScript and one .NET solution, sharing a root README, LICENSE (all rights reserved, alpha) and CI workflow.

   ```
   /schema/v1         JSON Schema for every dictionary file type
   /packages/core     @radd/core: loader, canonical build, hash, lint
   /packages/cli      @radd/cli: the radd command (build and lint only for now)
   /dotnet            RADD.slnx with empty projects, filled in stage 3
   /conformance       test-vector format and first vectors
   /examples/acme-orders/dictionary
   /scripts           repo tooling (ADR immutability check)
   /docs              user docs
   /docs/adr          architecture decision records (ADR-0001.md, ...)
   ```
2. **JSON Schema (draft 2020-12)** for `dictionary.yaml`, entities, domain types, lookups, `validators.yaml`, `calculators.yaml`, `functions.yaml` and `i18n/*.yaml`, with descriptions on every property so editors show help text.
3. **Loader and canonical build:** reads the folder, validates each file, merges into one document, applies defaults (derived message keys, domain-type inheritance), sorts keys, and computes a SHA-256 hash over the canonical form.
4. **Lint, first pass:** schema errors with file and line; broken references (domain type, lookup, entity, field, validator, calculator, function); naming conventions; required descriptions; missing default-locale keys; `renamedFrom` conflicts. CEL type-checking waits for the stage 2 library pick.
5. **CLI:** `radd build` and `radd lint`, both with `--json` output and non-zero exit codes on failure.
6. **Example dictionary:** Customer, Country, Province, Order and OrderLine, a gender static list, a dependent lookup, one conditional rule, one named validator and one computed field, in English and Filipino.

**ADRs for decisions already made:** stage 1 also sets up `/docs/adr`, the index, the template and the CI immutability check, and backfills one ADR per decision already agreed in the spec: YAML dictionary format; runtime interpretation with generated entity classes; headless client with TTL-cached metadata; CEL with declared subset, custom functions and named server validators; computed fields (database and application); display and edit metadata (labels, HTML hints, ICU display and edit formats, numeric min and max); generated primary keys (identity and uuid); migration scripts by diffing against a live database; Node CLI core with stack plugins; structured logging and level usage; one dictionary per system; no generic CRUD endpoints; no hot reload; read-only payload handling deferred; warning UX left to the component layer; licensing; naming (RADD, `radd`, `RADD.*`, `@radd/*`); latest LTS versions; GitHub Actions for CI; and the ADR standard itself. Rommel can harden these at the stage 1 gate.

### Proposed design

#### Tooling

| Concern | Choice | Why |
| --- | --- | --- |
| Packages | `@radd/core` (library), `@radd/cli` (bin `radd`), both `private: true`, `license: UNLICENSED` | Matches the naming decision; nothing is published in alpha |
| Language and modules | TypeScript, `strict`, ESM only (`"type": "module"`, `module: nodenext`) | Node 24+ is ESM-first; one module system across packages |
| Compiler | TypeScript 7 (`tsc -b` with project references); fall back to the latest 6.x if `--build` is not solid in 7 | Latest stable; the fallback is recorded in the PR if used |
| Build on install | Root `prepare` script runs `tsc -b`, so `npm install` then `npx radd ...` works from a fresh clone | Validation checklist step 1 |
| YAML parser | `yaml` (eemeli/yaml) v2, YAML 1.2 core schema | Keeps source ranges for every node (needed for file:line:column), rejects duplicate keys, YAML 1.2 so `N`, `Y`, `no`, `on` stay strings |
| JSON Schema validator | Ajv v8 (`ajv/dist/2020`) plus `ajv-formats` | De facto standard, full 2020-12 support, structured errors with instance paths that map back to YAML nodes |
| Test runner | Vitest | Already named in the plan |
| CLI parsing | `commander` | Subcommands, help text and option validation without hand-rolled code; the plugin protocol in stage 8 does not depend on it |
| RE2 check for patterns | `re2js` (pure JS port of RE2) | Validates `pattern` with RE2 semantics, no native build on Windows |
| ICU check for messages | `@formatjs/icu-messageformat-parser` | Lint can reject a malformed message before a runtime does |
| Code formatting and lint | Biome | One fast tool for format and lint; repo-internal, no ADR needed |
| .NET | `RADD.slnx` with `RADD.Core`, `RADD.EntityFrameworkCore`, `RADD.AspNetCore` (net10.0) and `RADD.Generators` (netstandard2.0, required for Roslyn generators); `global.json` pins SDK 10.0.x; `Directory.Build.props` turns on nullable and warnings-as-errors; central package management | Empty projects only; stage 3 fills them |
| Line endings | `.gitattributes` with `* text=auto eol=lf` | The dev machine checks out with CRLF; hashes and snapshots must not depend on it |

#### Dictionary files

| File | Top-level shape |
| --- | --- |
| `dictionary.yaml` | `name`, `description`, `formatVersion: 1`, `locales: { default, supported }`, `databases: [sqlite]`, `expressions: { extensions: [strings] }`, `lookups: { defaultTtl: 10m }` |
| `entities/**/*.yaml` | `entity: Customer`, `description`, `dbName`, `apiName`, `primaryKey`, `fields`, `indexes`, `relationships`, `rules`, `validators`, `audit`, `softDelete`, `concurrencyToken`, `renamedFrom`, `tags` |
| `types/**/*.yaml` | `domainType: Email`, `description`, `type`, then any field constraint (`maxLength`, `format`, `pattern`, `rules`, ...) |
| `lookups/**/*.yaml` | `lookup: gender`, `description`, `valueType`, `items: [{ code, label, sortOrder, active }]` |
| `validators.yaml`, `calculators.yaml` | `validators:` / `calculators:` map of name to `{ description, scope: field or entity, parameters, message }` |
| `functions.yaml` | `functions:` map of name (may be dotted, e.g. `geo.distance`) to `{ description, parameters: [{ name, type }], returns, clientSafe }` (CEL type names; `clientSafe` defaults to false) |
| `i18n/<locale>.yaml` or `i18n/<locale>/*.yaml` | Flat map of message key to ICU MessageFormat text; a locale may be split over several files |

- Folders under `entities/`, `types/` and `lookups/` may be nested; file names carry no meaning (the name comes from the `entity:`, `domainType:` or `lookup:` key), so renaming or moving a file never changes the hash.
- YAML anchors, aliases, merge keys and custom tags are rejected: every file must read on its own, and domain types are the reuse mechanism.
- Field properties: `type` or `domain` (not both), `description`, `tags`, `required`, `maxLength`, `minLength`, `precision`, `scale`, `min`, `max`, `default`, `readOnly` (`never`, `always`, `onUpdate`), `format` (`email`, `url`, `phone`), `pattern` (RE2), `mask`, `lookup`, `references`, `rules`, `validators`, `computed`, `dbName`, `apiName`, `renamedFrom`.
- Lookup on a field: `{ list: gender }` or `{ entity, value, display, cache, ttl, filter, dependsOn, search }`. A reference-table lookup implies a foreign key. `cache` defaults to `ttl`, because reference-table data changes at runtime and `static` would serve stale values.
- Plain foreign keys (OrderLine.orderId) use `references: { entity: Order, field: id, onDelete: restrict | cascade | setNull }`.
- Relationships give navigation names: `relationships: { lines: { oneToMany: OrderLine, foreignKey: orderId } }`, `{ manyToOne: Customer, foreignKey: customerId }`, `{ manyToMany: Tag, through: OrderTag }`.
- Rules: `{ when, required | readOnly | visible, severity, code, message }` for conditional rules; `{ when?, expression, severity, code, message }` for cross-field and expression rules. Named validators go under `validators: [{ name, params, severity, code, message }]` on a field or entity.
- `audit`, `softDelete` and `concurrencyToken` (the name of a declared field) are recorded as given. Turning `audit` and `softDelete` into concrete columns is decided in stage 3 alongside EF.

#### Canonical form and hash

- One JSON document: `formatVersion`, `name`, `version`, `locales`, `databases`, `expressions`, `lookupDefaults`, `types`, `lookups`, `entities`, `validators`, `calculators`, `functions`, `messages` (per locale).
- **Defaults are made explicit** before hashing (`required: false`, `readOnly: never`, `cache: ttl`, index names, `dbName` and `apiName` for every entity and field, `primaryKey` as an array), so writing a default out or leaving it implicit gives the same hash.
- **Normalization:** durations become seconds (`10m` → `ttlSeconds: 600`); field-level `unique: true` becomes an entity index identical to an explicit unique index; set-like arrays (`tags`, `dependsOn`, `extensions`, supported locales) are sorted and de-duplicated; every other array keeps its order.
- **Domain types are expanded** into each field (field overrides win, rules are concatenated domain-first) while `domain: Email` is kept for reference.
- **Message keys are derived and resolved at build.** Labels default to `customer.name.label` (entity prefix is the lowerCamel entity name). Each constraint's message is resolved to one key by trying the field key (`customer.name.maxLength`), then the domain-type key (`email.maxLength`), then the framework default (`radd.maxLength`), and taking the first that exists in the default locale. A rule's `code` defaults to its `message` key, or to `<entity>.<field>.<validatorName>` for validators, matching the spec's result example.
- **Framework messages:** `@radd/core` ships `radd.*` messages for `en`; a project's i18n overrides them. Other locales supply their own `radd.*` text or fall back with a warning. The messages that end up in the canonical document are part of the hash.
- **Hash:** SHA-256 over the RFC 8785 JSON Canonicalization Scheme (JCS) serialization of the document without its `version` property, written as `version: "sha256:<64 hex>"`. JCS is a published standard, so a C# or Java implementation can reproduce the hash from the conformance vectors.
- **Output:** `radd build <dir>` writes pretty-printed, key-sorted JSON (two-space indent, LF, trailing newline) to `--out`, default `<dir>/../.radd/dictionary.json` (`.radd/` is git-ignored). The build runs lint first and refuses to write if there are errors.

#### Lint rules

Codes are stable and never reused. Every diagnostic has `code`, `rule`, `severity`, `message`, `file` (relative to the dictionary folder), `line`, `column` and `path` (JSON pointer), and a "did you mean" hint where one applies.

| Code | Rule | Severity | Catches |
| --- | --- | --- | --- |
| RADD101 | yaml-syntax | error | Invalid YAML, duplicate keys, anchors, aliases, merge keys, custom tags |
| RADD102 | schema | error | Any JSON Schema violation (unknown property, wrong type, bad enum value) |
| RADD103 | duplicate-name | error | Two definitions with the same name, a name shared by an entity, domain type and lookup (they share the message-key namespace), the reserved prefix `radd`, or one i18n key in two files of a locale |
| RADD104 | unknown-file | warning | A YAML file outside the known layout, or a `.yml` extension |
| RADD105 | missing-dictionary-file | error | No `dictionary.yaml` in the folder |
| RADD201 | unknown-domain-type | error | `domain:` names no domain type |
| RADD202 | unknown-lookup | error | `lookup.list` names no static lookup |
| RADD203 | unknown-entity | error | Lookup, `references` or relationship names no entity |
| RADD204 | unknown-field | error | `primaryKey`, index, `concurrencyToken`, lookup `value`/`display`, `dependsOn`, `foreignKey` or `references.field` names no field |
| RADD205 | unknown-validator | error | Validator not declared in `validators.yaml`, or used at the wrong scope |
| RADD206 | unknown-calculator | error | Calculator not declared in `calculators.yaml` |
| RADD207 | unknown-function | error | A CEL expression calls a function that is not standard CEL, an enabled extension, a RADD built-in or declared in `functions.yaml` |
| RADD208 | extension-not-enabled | error | A CEL expression uses a function from an extension not listed in `dictionary.yaml` |
| RADD209 | type-with-domain | error | A field sets both `type` and `domain` (a domain's base type cannot be overridden) |
| RADD210 | lookup-type-mismatch | error | A static lookup's `valueType`, or a referenced field's type, differs from the field's type |
| RADD211 | invalid-constraint | error | A constraint that does not fit the type (`maxLength` on an integer, `scale` > `precision`, `min` > `max`) |
| RADD301 | entity-name | error | Entity or domain type not PascalCase |
| RADD302 | field-name | error | Field or relationship not lowerCamelCase |
| RADD303 | physical-name | error | A `dbName` that is not a plain SQL identifier, or an `apiName` that is not a plain identifier; two fields of an entity with the same `dbName` or `apiName` (ignoring case), or two entities with the same `dbName` or `apiName` |
| RADD304 | component-name | error | Lookup, validator, calculator or function not lowerCamelCase (functions may have one dotted namespace) |
| RADD305 | file-name | warning | File name is not the kebab-case form of the name it defines (`entities/order-line.yaml` for OrderLine) |
| RADD401 | missing-description | error | Entity, field, domain type, lookup, validator, calculator or function without a `description` |
| RADD501 | missing-default-locale-key | error | A required message key (entity and field labels, lookup item labels, explicit rule and validator messages) is missing in the default locale |
| RADD502 | missing-locale-key | warning | A key present in the default locale is missing in another supported locale |
| RADD503 | unused-key | warning | An i18n key nothing refers to (derived optional keys such as `.help` and `.placeholder` count as used) |
| RADD504 | invalid-message | error | Message text is not valid ICU MessageFormat |
| RADD505 | unknown-locale | error | An i18n file for a locale not in `locales.supported`, or a supported locale with no file |
| RADD601 | renamed-from-conflict | error | `renamedFrom` names an existing entity or field, equals its own name, or two items claim the same old name |
| RADD701 | expression-syntax | error | Lexical errors in a CEL expression (unterminated string, unbalanced brackets) |
| RADD702 | missing-computed-sql | error | A database-computed field has no SQL for an enabled database |
| RADD703 | invalid-pattern | error | `pattern` is not valid RE2 |

Expression checks in this stage use a small CEL lexer that finds function calls; full parsing, identifier checks, type checking and the decimal-arithmetic warning arrive with the stage 2 library.

#### CLI

- `radd lint [dir]` and `radd build [dir] [--out file]`; `dir` defaults to `./dictionary`.
- Text output is one line per diagnostic, `file:line:column  severity  CODE  message`, followed by a summary.
- `--json` prints one object: `{ ok, errorCount, warningCount, diagnostics: [...] }`, plus `version` and `out` for build.
- Exit codes: 0 for success (warnings allowed), 1 for lint errors, 2 for usage or internal errors.

#### Example dictionary

`acme-orders` with domain types Email and Money; static lookup `gender`; entities Country, Province (with countryCode), Customer (the spec example: email with `uniqueCustomerEmail`, gender list, country lookup, province as a dependent lookup filtered by country, the conditional `vipNotes` warning), Order (customer reference, `lines` relationship, audit) and OrderLine (order reference, quantity, unitPrice, `lineTotal` computed by the application and persisted). Full `en` and `fil` translations.

#### ADR mechanics

- ADR-0001 is the ADR standard; the other backfilled ADRs follow in the order listed above, all with status Accepted. New decisions made in this stage (the tooling and format choices above) get their own ADRs after the backfill.
- `scripts/check-adrs.mjs` runs in CI on pull requests. It diffs `docs/adr` against the base branch and fails on a deleted ADR, or on any change to an ADR whose base status is Hardened, Superseded, Obsolete or Rejected, except a Hardened ADR moving to Superseded or Obsolete with only the status and Superseded-by lines changed and a Superseded-by target that exists (and, for Superseded, lists it under Supersedes). It also fails if the index and the ADR files disagree on number, title or status. The checking logic is a pure function with Vitest tests.
- `CODEOWNERS`: `/docs/adr/ @rabesames`.

#### CI

`.github/workflows/ci.yml` on push and pull request: a Node job on Ubuntu and Windows × Node 24 and 26 (`npm ci`, Biome check, build, test, `radd lint` on the example), a .NET job (`dotnet build dotnet/RADD.slnx`), and the ADR check on pull requests.

#### Spec decisions (agreed with Rommel, 2026-10-26)

1. **`version` in `dictionary.yaml`.** The file carries `formatVersion: 1` (which RADD format it is written in); `version` exists only in the canonical JSON, as the hash.
2. **Literal versus expression defaults.** `default:` is always a literal; expressions use `default: { expression: "newGuid()" }`. `newGuid()` and `ctx.now` join the built-ins.
3. **Field order.** The canonical entity keeps a `fieldOrder` array, so reordering fields changes the hash, while reordering properties inside a definition does not.
4. **Database and API names.** Every entity and field has a logical name (the YAML key: PascalCase entities, lowerCamelCase fields), a database name `dbName` and an API name `apiName`. `dbName` defaults to TitleCase (entity `Customer` → table `Customer`, field `countryCode` → column `CountryCode`; no pluralizing). `apiName` defaults to camelCase (entity `orderLine`, field `countryCode`) and names JSON properties and `/_radd/*` route segments. Both can be overridden per entity and field (`dbName: LEGACY_CD`), and the canonical JSON always states both. CEL expressions, message keys and generated C# use the logical name. `dbName` replaces the spec's `table:`; database-computed SQL refers to `dbName` columns.
5. **Locales.** The dictionary owns locales; the `radd.config.yaml` entry is dropped when stage 8 is detailed.
6. **More backfilled ADRs.** Add distribution, the ProblemDetails result format with three severities, ICU MessageFormat localization, the conformance suite as the portability mechanism, and the first stack (React + TypeScript, ASP.NET Core with EF Core, SQLite).
7. **CODEOWNERS.** Keep `CODEOWNERS` for review requests and ownership, make the ADR check a required status check on `main`, and treat Rommel's merge as the approval (an author cannot approve their own pull request).
8. **New stage 1 ADRs** are Accepted, like the backfill.
9. Wording: the spec's Lookups section says "three sources" but lists two (static lists and reference tables) plus dependency; fixed in the spec update.

### Tests and examples

- Unit tests (Vitest) for the loader, defaults and canonical form.
- Hash stability tests: reordering keys, changing whitespace or line endings, renaming or moving files, or splitting a locale over several files does not change the hash; writing out a default does not change it; changing any value does.
- A good and a bad fixture for every lint rule, asserting the exact code, file and line.
- Snapshot of the example's canonical JSON, so any change to the build is visible in review.
- First conformance vectors: dictionary-in, canonical-JSON-out (`conformance/build/<case>/dictionary/` and `expected.json`, described in `conformance/README.md`), starting with acme-orders and a minimal dictionary.
- CLI tests: exit codes and `--json` shape for both commands.
- ADR check tests: every allowed and blocked transition.

### Documentation

- Dictionary authoring guide with the example walked through (`docs/authoring.md`).
- Lint rule reference (code, meaning, fix) (`docs/lint-rules.md`).
- First draft of `AGENTS.md` with naming conventions and change rules, in `examples/acme-orders/dictionary/AGENTS.md`; it becomes the `radd init` template.
- Editor setup for YAML schema validation in VS Code (`docs/editor-setup.md`), with a checked-in `.vscode/settings.json` mapping the schemas by folder for the Red Hat YAML extension. The schemas avoid 2020-12 keywords that extension does not understand (`unevaluatedProperties`, `$dynamicRef`).
- Schema `$id`s use `https://raw.githubusercontent.com/rabesames/RADD/main/schema/v1/<file>.schema.json` until there is a project domain (a change of URL is its own ADR).

### Validation checklist for Rommel

- [ ] Clone the repo, run `npm install` and `npx radd lint examples/acme-orders/dictionary`; it passes.
- [ ] Add a new entity in the editor; autocomplete and inline errors work.
- [ ] Break something on purpose (unknown lookup, missing description); the lint message is clear and points to the right line.
- [ ] Read the canonical JSON for the example and confirm the property names and structure are right.
- [ ] Review the JSON Schema for naming and anything missing from the spec.
- [ ] Review the backfilled ADRs and harden the ones that are final; confirm the CI check blocks an edit to a hardened ADR.

### Out of scope

CEL evaluation, CEL parsing and type checking, any .NET code beyond empty projects, the TypeScript client, the plugin protocol, materializing audit and soft-delete columns, and publishing the schema anywhere other than the repo.

## Stage 2: Spikes

At the end of this stage, the riskiest technical choices are settled on evidence, with an ADR for each. Spike code lives in `/spikes` and is thrown away or promoted deliberately, never shipped by accident.

### Spike A: CEL libraries

- **Candidates:** Celly and Cel.NET for .NET; `@marcbachmann/cel-js` for TypeScript, plus any stronger option found during the spike.
- **Measure:** pass rate on the official cel-spec conformance corpus; type checking against declared variables; custom function registration (`isBlank`, `dec.*`); `has()` and missing-field behavior; RE2 regex compatibility; error message quality; performance on 10,000 evaluations; license and maintenance activity.
- **Cross-check:** the same 50 expressions from the example dictionary run on both picks and must give identical results; these become the first expression conformance vectors.

### Spike B: decimals in CEL

- Prove how decimal fields reach CEL in both libraries (as double for comparison, `dec.*` functions for arithmetic).
- Show that `dec.mul(quantity, unitPrice)` and `dec.eq(sum, total)` give exact results where double arithmetic does not.

### Spike C: dictionary-to-database diff with EF Core

- Build the desired model from the example dictionary; read a real SQLite database with EF's scaffolding services; diff with the migrations model differ; render SQL with the SQLite generator.
- **Scenarios:** empty database; add a table; add a column; lengthen and shorten a column; nullable to required; rename with `renamedFrom`; drop a column; add a computed column; no change at all (must produce an empty script).
- **Measure:** spurious operations, reliance on internal EF APIs, and how much glue code the fallback (a dedicated differ using EF's SQL generators) would need.

### Spike D: source generation path

A Roslyn source generator cannot call Node, so it cannot reuse the TypeScript loader directly. Compare:

1. An MSBuild step runs `radd build` before compilation; the generator reads the canonical JSON.
2. The generator parses YAML itself in C#.

The first keeps one loader, the second avoids a Node dependency in .NET builds. Measure build time, IDE experience (errors, regeneration on save) and CI simplicity.

### Deliverables

- One ADR per spike (Proposed), with options, evidence table, recommendation and risks; the spike code is referenced from the ADR.
- Spec updates for each decision.
- Stage 3's detailed plan revised with the results.

### Validation checklist for Rommel

- [ ] Read the four spike ADRs, approve or change each recommendation, and harden them.
- [ ] Run the CEL cross-check and EF diff scenarios locally from the commands in the ADRs.
- [ ] Confirm the revised stage 3 plan.

### Out of scope

Production-quality code; anything beyond SQLite.

## Stage 3: .NET runtime model and EF Core

At the end of this stage, an ASP.NET Core app gets its entity classes generated from the dictionary and its EF Core model configured from it, and a normal EF migration creates the correct SQLite schema. This plan is provisional until stage 2's decisions are in.

### Scope

1. **RADD.Core:** a C# model of the canonical dictionary, loaded from an embedded resource, with its version hash. Startup fails fast on an invalid dictionary or a declared validator, calculator or function with no registered implementation (Critical log entry).
2. **RADD.Generators:** partial POCOs (properties and navigation properties only, no attributes) and the strongly typed key catalog (`Radd.Customer.Email`), using the path chosen in spike D.
3. **RADD.EntityFrameworkCore:** `modelBuilder.ApplyDataDictionary()` configures tables, keys and key generation (identity with seed and increment, uuid), required, max length, precision and scale, defaults, indexes and unique constraints, relationships and foreign keys, check constraints for static lookups, concurrency tokens, soft-delete query filters, audit columns, and database-computed columns (`HasComputedColumnSql`). Application-computed, non-persisted fields are ignored by EF.
4. **Example API:** `examples/acme-orders/api`, a minimal ASP.NET Core app on SQLite using the three packages, with one hand-written partial class adding behavior to a generated entity.

### Tests and examples

- Generator snapshot tests (Verify) for the example's classes and key catalog.
- Model tests that read EF's `IModel` metadata and assert each property's configuration against the dictionary (length, nullability, precision, keys, FKs, indexes, computed SQL).
- Integration test: create a SQLite database through an EF migration, then read its schema (`PRAGMA table_info`, `index_list`, `foreign_key_list`) and compare with expected results from the dictionary.
- Change test: alter a max length and a nullability in a fixture dictionary; `dotnet ef migrations add` produces the expected operations.
- Schema conformance vectors for SQLite: dictionary in, expected schema out.

### Documentation

- .NET getting-started guide using the example API.
- EF Core integration guide: what `ApplyDataDictionary()` configures, how to extend it, and where hand-written partial classes go.
- Reference for the generated code and key catalog.

### Validation checklist for Rommel

- [ ] Run the example API; the SQLite database is created with the expected tables and constraints.
- [ ] Read the generated classes and key catalog in the IDE; confirm they feel natural to use.
- [ ] Change a field's max length in YAML, rebuild and run `dotnet ef migrations add`; the migration contains exactly that change.
- [ ] Add a hand-written partial class method to a generated entity; it survives regeneration.
- [ ] Confirm the startup failure for a missing named validator is clear.

### Out of scope

Validation pipeline, `/_radd/*` endpoints, localization, the TypeScript client and `radd db diff`.

## Stages 4 to 10: placeholders

Each is detailed after the stage before it is validated.

- **Stage 4, API validation pipeline:** endpoint filter and SaveChanges interceptor, all rule kinds and severities, warning acknowledgment, named validators and calculators, ProblemDetails results, structured logging with the level table.
- **Stage 5, metadata endpoints and localization:** `/_radd/metadata`, `/_radd/lookups`, `/_radd/validate`, ETags and `RADD-Version`, lookup cache modes and filters, ICU messages and locale fallback.
- **Stage 6, TypeScript client:** loading and TTL cache, field metadata, conditional state, client-side validation, display and edit formatting (`radd.format`, `radd.parse`) and hint sanitizing, lookups, logger interface, optional type generation.
- **Stage 7, migration script generation:** `radd db diff` with change report, data checks and destructive-change gating, built on spike C.
- **Stage 8, CLI and initializer:** plugin protocol, the .NET plugin, `radd init` from config or prompts, `radd gen`, `radd validate`, `radd doctor`.
- **Stage 9, AI layer:** MCP server, semantic `radd diff`, `radd docs` with ERDs, finished AGENTS.md, PR review workflow.
- **Stage 10, alpha hardening:** full example end to end, conformance suite green on both runtimes, docs pass, alpha tag.

## Project setup decisions

- **Repo:** github.com/rabesames/RADD, cloned locally at `T:\Projects\RADD`. Work happens on a branch per stage, with a pull request into `main` at each gate.
- **Versions:** always target the latest long-term-support releases. Today that is .NET 10 with EF Core 10 (LTS, supported to November 2028; .NET 11 ships in November 2026 but is a short-term release) and Node.js 26 (Active LTS from October 28, 2026, supported to April 2029; Node 24 LTS is acceptable until then). Moving to a newer LTS is its own ADR.
- **CI:** GitHub Actions.
- **Naming:** the framework is RADD, with `RADD.*` packages on NuGet and the `@radd` scope on npm (both need an availability check before publishing).

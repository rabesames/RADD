# Architecture decision records

Every architectural or Rommel-level decision in RADD is recorded here, in the same pull request as the code it governs. The standard is in [ADR-0001](ADR-0001.md) and in the [implementation plan](../implementation-plan.md#standard-architecture-decision-records).

- New ADRs start from [template.md](template.md) and take the next free number. Numbers are never reused.
- Statuses: Proposed, Accepted, Hardened, Rejected, Superseded, Obsolete. Only Rommel sets Hardened.
- A Hardened ADR never changes, except that its status may become Superseded or Obsolete with a Superseded-by line. A changed decision gets a new ADR.
- Regenerate the table below with `npm run adr:index`; CI (`npm run adr:check`) fails if it is out of date or if an ADR changes in a way the standard does not allow.

<!-- adr-index:start -->
| ADR | Title | Status | Date | Links |
| --- | --- | --- | --- | --- |
| [ADR-0001](ADR-0001.md) | Record decisions as immutable architecture decision records | Accepted | 2026-10-26 |  |
| [ADR-0002](ADR-0002.md) | The dictionary is a folder of YAML files validated by JSON Schema | Accepted | 2026-10-26 |  |
| [ADR-0003](ADR-0003.md) | Generate entity classes and interpret the dictionary at run time for everything else | Accepted | 2026-10-26 |  |
| [ADR-0004](ADR-0004.md) | A headless TypeScript client with TTL-cached metadata from the API | Accepted | 2026-10-26 |  |
| [ADR-0005](ADR-0005.md) | CEL for expressions, with a declared subset, custom functions and named server validators | Accepted | 2026-10-26 |  |
| [ADR-0006](ADR-0006.md) | Computed fields from the database or the application, declared explicitly | Accepted | 2026-10-26 |  |
| [ADR-0007](ADR-0007.md) | Display and edit metadata on fields, with text in i18n and ICU formats | Accepted | 2026-10-26 |  |
| [ADR-0008](ADR-0008.md) | Generate migration scripts by diffing the dictionary against a live database | Accepted | 2026-10-26 |  |
| [ADR-0009](ADR-0009.md) | A Node/TypeScript CLI core with stack plugins in each stack's language | Accepted | 2026-10-26 |  |
| [ADR-0010](ADR-0010.md) | Structured logging with consistent property names and a defined use of levels | Accepted | 2026-10-26 |  |
| [ADR-0011](ADR-0011.md) | Each dictionary serves exactly one system | Accepted | 2026-10-26 |  |
| [ADR-0012](ADR-0012.md) | No generic CRUD endpoints | Accepted | 2026-10-26 |  |
| [ADR-0013](ADR-0013.md) | No hot reload of the dictionary | Accepted | 2026-10-26 |  |
| [ADR-0014](ADR-0014.md) | Handling of read-only fields in a write payload is deferred past v1 | Accepted | 2026-10-26 |  |
| [ADR-0015](ADR-0015.md) | How users see and acknowledge warnings is left to the component layer | Accepted | 2026-10-26 |  |
| [ADR-0016](ADR-0016.md) | Public repository, all rights reserved, not open source during alpha | Accepted | 2026-10-26 |  |
| [ADR-0017](ADR-0017.md) | Naming: RADD, radd, RADD.*, @radd/*, /_radd, RADD-* headers, radd.* keys | Accepted | 2026-10-26 |  |
| [ADR-0018](ADR-0018.md) | Target the latest long-term-support releases | Accepted | 2026-10-26 |  |
| [ADR-0019](ADR-0019.md) | GitHub Actions for CI | Accepted | 2026-10-26 |  |
| [ADR-0020](ADR-0020.md) | Distribute from the git repository now, NuGet and npm later, with a one-command initializer | Accepted | 2026-10-26 |  |
| [ADR-0021](ADR-0021.md) | Validation results as RFC 9457 ProblemDetails, with error, warning and info severities | Accepted | 2026-10-26 |  |
| [ADR-0022](ADR-0022.md) | Localized text in per-locale YAML files using ICU MessageFormat | Accepted | 2026-10-26 |  |
| [ADR-0023](ADR-0023.md) | A shared conformance suite, not shared code, keeps runtimes consistent | Accepted | 2026-10-26 |  |
| [ADR-0024](ADR-0024.md) | The first stack is React + TypeScript, ASP.NET Core with EF Core, and SQLite | Accepted | 2026-10-26 |  |
| [ADR-0025](ADR-0025.md) | Repository layout and TypeScript tooling | Accepted | 2026-10-26 |  |
| [ADR-0026](ADR-0026.md) | Dictionary folder layout, YAML 1.2 and the YAML features RADD allows | Accepted | 2026-10-26 |  |
| [ADR-0027](ADR-0027.md) | JSON Schema draft 2020-12, validated with Ajv, with a keyword set editors understand | Accepted | 2026-10-26 |  |
| [ADR-0028](ADR-0028.md) | Canonical form and version hash | Accepted | 2026-10-26 |  |
| [ADR-0029](ADR-0029.md) | Logical, database and API names for entities and fields | Accepted | 2026-10-26 |  |
| [ADR-0030](ADR-0030.md) | Message keys are derived from the path and resolved at build time | Accepted | 2026-10-26 |  |
| [ADR-0031](ADR-0031.md) | Literal defaults and expression defaults are written differently | Accepted | 2026-10-26 |  |
| [ADR-0032](ADR-0032.md) | Lint diagnostics, rule codes and the CLI contract | Accepted | 2026-10-26 |  |
| [ADR-0033](ADR-0033.md) | Locales are declared by the dictionary | Accepted | 2026-10-26 |  |
| [ADR-0034](ADR-0034.md) | ADR enforcement through a required CI check, with the merge as approval | Accepted | 2026-10-26 |  |
| [ADR-0035](ADR-0035.md) | Foreign keys, relationships and lookup defaults | Accepted | 2026-10-26 |  |
| [ADR-0036](ADR-0036.md) | Lexical CEL checks in lint until the CEL library is chosen | Accepted | 2026-10-26 |  |
| [ADR-0037](ADR-0037.md) | Primary keys can be generated as identity or uuid | Accepted | 2026-10-26 |  |
| [ADR-0038](ADR-0038.md) | Hand-written JSON is JSONC; JSON Schemas are generated from JSONC sources | Accepted | 2026-10-27 |  |
<!-- adr-index:end -->

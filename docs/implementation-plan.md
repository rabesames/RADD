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
| 1 | Repo foundation and dictionary format | A dictionary can be written in YAML with editor help, linted, and built into canonical JSON with a stable hash | Detailed | Not started |
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

### Scope

1. **Monorepo skeleton:** npm workspaces for TypeScript and one .NET solution, sharing a root README, LICENSE (all rights reserved, alpha) and CI workflow.

   ```
   /schema            JSON Schema for every dictionary file type
   /packages/core     TypeScript: loader, canonical build, hash, lint
   /packages/cli      radd command (build and lint only for now)
   /dotnet            .NET solution (empty projects, filled in stage 3)
   /conformance       test-vector format and first vectors
   /examples/acme-orders/dictionary
   /docs
   /docs/adr          architecture decision records (ADR-0001.md, ...)
   ```
2. **JSON Schema (draft 2020-12)** for `dictionary.yaml`, entities, domain types, lookups, `validators.yaml`, `calculators.yaml`, `functions.yaml` and `i18n/*.yaml`, with descriptions on every property so editors show help text.
3. **Loader and canonical build:** reads the folder, validates each file, merges into one document, applies defaults (derived message keys, domain-type inheritance), sorts keys, and computes a SHA-256 hash over the canonical form.
4. **Lint, first pass:** schema errors with file and line; broken references (domain type, lookup, entity, field, validator, calculator, function); naming conventions; required descriptions; missing default-locale keys; `renamedFrom` conflicts. CEL type-checking waits for the stage 2 library pick.
5. **CLI:** `radd build` and `radd lint`, both with `--json` output and non-zero exit codes on failure.
6. **Example dictionary:** Customer, Country, Province, Order and OrderLine, a gender static list, a dependent lookup, one conditional rule, one named validator and one computed field, in English and Filipino.

**ADRs for decisions already made:** stage 1 also sets up `/docs/adr`, the index, the template and the CI immutability check, and backfills one ADR per decision already agreed in the spec: YAML dictionary format; runtime interpretation with generated entity classes; headless client with TTL-cached metadata; CEL with declared subset, custom functions and named server validators; computed fields (database and application); migration scripts by diffing against a live database; Node CLI core with stack plugins; structured logging and level usage; one dictionary per system; no generic CRUD endpoints; no hot reload; read-only payload handling deferred; warning UX left to the component layer; licensing; naming (RADD, `radd`, `RADD.*`, `@radd/*`); latest LTS versions; GitHub Actions for CI; and the ADR standard itself. Rommel can harden these at the stage 1 gate.

### Tests and examples

- Unit tests (Vitest) for the loader, defaults and canonical form.
- Hash stability tests: reordering keys, changing whitespace or splitting files does not change the hash; changing any value does.
- A good and a bad fixture for every lint rule, asserting the exact code, file and line.
- Snapshot of the example's canonical JSON, so any change to the build is visible in review.
- First conformance vectors: dictionary-in, canonical-JSON-out.

### Documentation

- Dictionary authoring guide with the example walked through.
- Lint rule reference (code, meaning, fix).
- First draft of `AGENTS.md` with naming conventions and change rules.
- Editor setup for YAML schema validation in VS Code.

### Validation checklist for Rommel

- [ ] Clone the repo, run `npm install` and `npx radd lint examples/acme-orders/dictionary`; it passes.
- [ ] Add a new entity in the editor; autocomplete and inline errors work.
- [ ] Break something on purpose (unknown lookup, missing description); the lint message is clear and points to the right line.
- [ ] Read the canonical JSON for the example and confirm the property names and structure are right.
- [ ] Review the JSON Schema for naming and anything missing from the spec.
- [ ] Review the backfilled ADRs and harden the ones that are final; confirm the CI check blocks an edit to a hardened ADR.

### Out of scope

CEL evaluation, any .NET code beyond empty projects, the TypeScript client and the plugin protocol.

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
3. **RADD.EntityFrameworkCore:** `modelBuilder.ApplyDataDictionary()` configures tables, keys, required, max length, precision and scale, defaults, indexes and unique constraints, relationships and foreign keys, check constraints for static lookups, concurrency tokens, soft-delete query filters, audit columns, and database-computed columns (`HasComputedColumnSql`). Application-computed, non-persisted fields are ignored by EF.
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
- **Stage 6, TypeScript client:** loading and TTL cache, field metadata, conditional state, client-side validation, lookups, logger interface, optional type generation.
- **Stage 7, migration script generation:** `radd db diff` with change report, data checks and destructive-change gating, built on spike C.
- **Stage 8, CLI and initializer:** plugin protocol, the .NET plugin, `radd init` from config or prompts, `radd gen`, `radd validate`, `radd doctor`.
- **Stage 9, AI layer:** MCP server, semantic `radd diff`, `radd docs` with ERDs, finished AGENTS.md, PR review workflow.
- **Stage 10, alpha hardening:** full example end to end, conformance suite green on both runtimes, docs pass, alpha tag.

## Project setup decisions

- **Repo:** github.com/rabesames/RADD, cloned locally at `T:\Projects\RADD`. Work happens on a branch per stage, with a pull request into `main` at each gate.
- **Versions:** always target the latest long-term-support releases. Today that is .NET 10 with EF Core 10 (LTS, supported to November 2028; .NET 11 ships in November 2026 but is a short-term release) and Node.js 26 (Active LTS from October 28, 2026, supported to April 2029; Node 24 LTS is acceptable until then). Moving to a newer LTS is its own ADR.
- **CI:** GitHub Actions.
- **Naming:** the framework is RADD, with `RADD.*` packages on NuGet and the `@radd` scope on npm (both need an availability check before publishing).

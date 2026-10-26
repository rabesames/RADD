# RADD — working agreement for Claude Code

RADD is a code-level data dictionary framework: one YAML dictionary in the repo drives the database schema, API validation and front-end behavior.

## Read first

- `docs/requirements-spec.md` — what RADD is and every agreed decision.
- `docs/implementation-plan.md` — the staged plan, the stage process and the ADR standard.
- `docs/adr/` — architecture decision records (created in stage 1).

## How work proceeds

- Work one stage at a time, in the order of the implementation plan. Never start the next stage until Rommel has validated the current one.
- Each stage: propose (write the stage proposal into the plan), build on branch `stage-<n>-<slug>`, add tests and extend `examples/acme-orders`, document (ADRs, user docs, spec and plan updates), then open a pull request with a summary, how to try it, the stage's validation checklist and known gaps. Stop and ask Rommel to validate.
- Commit in small, focused commits.
- If something in the spec turns out to be wrong or unworkable, stop and raise it with Rommel; do not quietly deviate. Record the outcome as an ADR.

## ADR rules

- Every architectural or Rommel-level decision gets an ADR in `docs/adr/ADR-NNNN.md`, in the same pull request as the code it governs, using the template in the implementation plan.
- Never set an ADR's status to Hardened; only Rommel does.
- Never edit a Hardened, Superseded, Obsolete or Rejected ADR, except to change a Hardened ADR's status to Superseded or Obsolete with a Superseded-by line. Changed decisions get a new ADR.
- Keep `docs/adr/README.md` (the index) in sync in the same pull request.

## Conventions

- JSON: hand-written JSON is JSONC with comments (`.jsonc` unless the tool accepts comments in `.json`). JSON Schemas are edited in `schema/src/*.schema.jsonc`; never hand-edit the generated strict `schema/v1/*.schema.json`. Strict JSON only for package.json, lockfiles, generated output and API payloads.
- Names: framework RADD; CLI `radd`; NuGet `RADD.*`; npm `@radd/*`; endpoints `/_radd/*`; headers `RADD-Version`, `RADD-Acknowledge`; message keys `radd.*`.
- Versions: latest LTS — .NET 10 / EF Core 10, Node.js 26 LTS (24 LTS acceptable until Oct 28, 2026).
- CI: GitHub Actions. Every stage's tests run in CI.
- Licensing: all rights reserved, alpha. Do not add open source license text.
- Logging: structured, with the level usage defined in the spec.

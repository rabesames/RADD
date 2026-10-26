# RADD

RADD is a code-level data dictionary framework: one YAML dictionary in the repo drives the database schema, API validation and front-end behavior.

> **Alpha.** All rights reserved; no use is licensed. See [LICENSE](LICENSE).

## Repository layout

| Path                   | Contents                                                   |
| ---------------------- | ---------------------------------------------------------- |
| `schema/src`           | JSON Schema for every dictionary file type (JSONC source)  |
| `schema/v1`            | The published strict JSON, generated from `schema/src`     |
| `packages/core`        | `@radd/core`: loader, canonical build, hash and lint       |
| `packages/cli`         | `@radd/cli`: the `radd` command                            |
| `dotnet`               | .NET solution (`RADD.*` projects, filled in from stage 3)  |
| `conformance`          | Language-neutral test vectors every runtime must pass      |
| `examples/acme-orders` | The example project, extended at every stage               |
| `docs`                 | Requirements spec, implementation plan, user docs and ADRs |

## Getting started

Requires Node.js 24 or later (26 LTS recommended) and, for the .NET projects, the .NET 10 SDK.

```sh
npm install
npx radd lint examples/acme-orders/dictionary
npx radd build examples/acme-orders/dictionary
npm test
```

## Documentation

- [Authoring a dictionary](docs/authoring.md), walking through the example
- [Lint rule reference](docs/lint-rules.md)
- [Editor setup for VS Code](docs/editor-setup.md)
- [Conformance suite](conformance/README.md)
- [Requirements spec](docs/requirements-spec.md) and [implementation plan](docs/implementation-plan.md)
- [Architecture decision records](docs/adr/README.md)

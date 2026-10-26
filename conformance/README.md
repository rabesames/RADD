# RADD conformance suite

Language-neutral test vectors that every RADD runtime must pass (ADR-0023). A runtime ships only when it passes every vector that applies to it.

## File formats

Hand-written vector files (manifests, and the input records of later vectors) are JSONC, so they can explain themselves in comments. Dictionaries stay YAML, because that is the dictionary format. Expected results are strict JSON, because they are generated output compared byte for byte (ADR-0038).

## Build vectors (`build/`)

Dictionary in, canonical JSON out. Each vector is a folder:

```
build/<name>/
  vector.jsonc     description, and optionally the dictionary path
  dictionary/      the dictionary folder (unless vector.jsonc points elsewhere)
  expected.json    the exact canonical JSON radd build must produce
```

`vector.jsonc`:

```jsonc
{
  "description": "What the vector covers.",
  // Optional; defaults to ./dictionary.
  "dictionary": "../../../examples/acme-orders/dictionary"
}
```

A runtime passes a vector when building the dictionary gives no errors and produces `expected.json` byte for byte (after normalizing line endings to LF), including the `version` hash. The canonical form and hash are specified in [ADR-0028](../docs/adr/ADR-0028.md): keys sorted by UTF-16 code units, two-space indentation, LF and a trailing newline; `version` is `sha256:` plus the hex SHA-256 of the RFC 8785 (JCS) serialization of the document without `version`.

| Vector | Covers |
| --- | --- |
| `minimal` | The smallest valid dictionary: every default made explicit |
| `acme-orders` | The example project (`examples/acme-orders/dictionary`); also the snapshot that makes every change to the build visible in review |

### Running and updating

The TypeScript runtime runs these vectors in `packages/core/test/conformance.test.ts` as part of `npm test`. After an intended change to the canonical form, regenerate and review:

```sh
RADD_UPDATE_VECTORS=1 npm test
git diff conformance
```

## Later vectors

Validation (record in, results out), expression evaluation, conditional state, lookup filtering and per-database schema vectors are added by the stages that implement them.

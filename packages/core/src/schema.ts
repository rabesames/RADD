import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { ErrorObject, ValidateFunction } from "ajv";
import Ajv2020Module from "ajv/dist/2020.js";
import { type PathSegment, type PendingDiagnostic, suggest } from "./diagnostics.js";
import type { FileKind } from "./source.js";

/** The repository's schema/v1 folder. */
export const SCHEMA_DIR = fileURLToPath(new URL("../../../schema/v1/", import.meta.url));

const SCHEMA_FILES: Record<FileKind, string> = {
  dictionary: "dictionary.schema.json",
  entity: "entity.schema.json",
  domainType: "domain-type.schema.json",
  lookup: "lookup.schema.json",
  validators: "validators.schema.json",
  calculators: "calculators.schema.json",
  functions: "functions.schema.json",
  i18n: "i18n.schema.json",
};

let validators: Map<FileKind, ValidateFunction> | undefined;

function getValidators(): Map<FileKind, ValidateFunction> {
  if (validators) return validators;
  // Ajv is CommonJS; under NodeNext its class is the module's default property.
  const ajv = new Ajv2020Module.default({
    allErrors: true,
    verbose: true,
    strict: true,
    strictRequired: false,
    allowUnionTypes: true,
  });
  const ids = new Map<string, string>();
  for (const f of readdirSync(SCHEMA_DIR).filter((n) => n.endsWith(".schema.json"))) {
    const schema = JSON.parse(readFileSync(`${SCHEMA_DIR}${f}`, "utf8")) as { $id: string };
    ajv.addSchema(schema);
    ids.set(f, schema.$id);
  }
  validators = new Map();
  for (const [kind, f] of Object.entries(SCHEMA_FILES) as [FileKind, string][]) {
    const fn = ajv.getSchema(ids.get(f) ?? f);
    if (!fn) throw new Error(`Schema ${f} not found in ${SCHEMA_DIR}`);
    validators.set(kind, fn);
  }
  return validators;
}

/** Validates one file's data against its schema and turns Ajv errors into RADD102 diagnostics. */
export function validateSchema(kind: FileKind, file: string, data: unknown): PendingDiagnostic[] {
  const validate = getValidators().get(kind);
  if (!validate || validate(data)) return [];
  return formatErrors(validate.errors ?? [], file);
}

function pathOf(instancePath: string): PathSegment[] {
  if (instancePath === "") return [];
  return instancePath
    .slice(1)
    .split("/")
    .map((s) => s.replaceAll("~1", "/").replaceAll("~0", "~"))
    .map((s) => (/^\d+$/.test(s) ? Number(s) : s));
}

function describe(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "a list";
  if (typeof value === "object") return "an object";
  return `${typeof value} ${JSON.stringify(value)}`;
}

/**
 * Ajv reports every failing branch of anyOf, oneOf and if/then. This keeps one clear message
 * per problem: branch errors under a failing anyOf/oneOf are folded into it, and `if` errors
 * are dropped because the then/else errors carry the meaning.
 */
function formatErrors(errors: ErrorObject[], file: string): PendingDiagnostic[] {
  const combinators = errors.filter((e) => e.keyword === "anyOf" || e.keyword === "oneOf");
  const out: PendingDiagnostic[] = [];
  const seen = new Set<string>();
  const push = (d: PendingDiagnostic) => {
    const key = `${d.path?.join("/")}|${d.message}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(d);
  };

  for (const e of errors) {
    if (e.keyword === "if") continue;
    const owner = combinators.find(
      (c) =>
        c !== e &&
        e.schemaPath.startsWith(`${c.schemaPath}/`) &&
        e.instancePath.startsWith(c.instancePath),
    );
    if (owner) continue;
    const path = pathOf(e.instancePath);
    switch (e.keyword) {
      case "additionalProperties": {
        const prop = String(e.params.additionalProperty);
        const known = Object.keys((e.parentSchema as { properties?: object })?.properties ?? {});
        push({
          code: "RADD102",
          file,
          path: [...path, prop],
          atKey: true,
          message: `Unknown property '${prop}'.`,
          ...hint(suggest(prop, known)),
        });
        break;
      }
      case "required":
        push({
          code: "RADD102",
          file,
          path,
          atKey: true,
          message: `Missing required property '${String(e.params.missingProperty)}'.`,
        });
        break;
      case "false schema":
        push({
          code: "RADD102",
          file,
          path,
          atKey: true,
          message: `Property '${String(path.at(-1))}' is not allowed here with the other properties given.`,
        });
        break;
      case "enum": {
        const allowed = (e.params.allowedValues as unknown[]).map(String);
        push({
          code: "RADD102",
          file,
          path,
          message: `${describe(e.data)} is not allowed; expected one of: ${allowed.join(", ")}.`,
          ...hint(typeof e.data === "string" ? suggest(e.data, allowed) : undefined),
        });
        break;
      }
      case "type":
        push({
          code: "RADD102",
          file,
          path,
          message: `Expected ${String(e.params.type).replaceAll(",", " or ")}, got ${describe(e.data)}.`,
        });
        break;
      case "const":
        push({
          code: "RADD102",
          file,
          path,
          message: `Must be ${JSON.stringify(e.params.allowedValue)}, got ${describe(e.data)}.`,
        });
        break;
      case "pattern":
        push({
          code: "RADD102",
          file,
          path,
          message:
            `${describe(e.data)} is not in the expected form. ${firstSentence(e.parentSchema)}`.trim(),
        });
        break;
      case "propertyNames":
        push({
          code: "RADD102",
          file,
          path: [...path, String(e.params.propertyName)],
          atKey: true,
          message: `Invalid key '${String(e.params.propertyName)}'.`,
        });
        break;
      case "anyOf":
      case "oneOf": {
        const branches = errors.filter(
          (b) =>
            b !== e &&
            b.schemaPath.startsWith(`${e.schemaPath}/`) &&
            b.instancePath === e.instancePath,
        );
        const missing = branches
          .filter((b) => b.keyword === "required")
          .map((b) => String(b.params.missingProperty));
        if (missing.length > 0 && missing.length === branches.length) {
          push({
            code: "RADD102",
            file,
            path,
            atKey: true,
            message:
              e.keyword === "anyOf"
                ? `Give at least one of: ${missing.join(", ")}.`
                : `Give exactly one of: ${missing.join(", ")}.`,
          });
        } else if (e.keyword === "oneOf" && branches.length === 0) {
          push({
            code: "RADD102",
            file,
            path,
            atKey: true,
            message: "Give exactly one of the alternatives, not several.",
          });
        } else {
          push({
            code: "RADD102",
            file,
            path,
            message:
              `${describe(e.data)} does not match any allowed form. ${firstSentence(e.parentSchema)}`.trim(),
          });
        }
        break;
      }
      default:
        push({
          code: "RADD102",
          file,
          path,
          message: `${capitalize(e.message ?? "Invalid value")}.`,
        });
    }
  }
  return out;
}

function hint(h: string | undefined): { hint?: string } {
  return h ? { hint: h } : {};
}

function firstSentence(schema: unknown): string {
  const d = (schema as { description?: string })?.description;
  if (!d) return "";
  const m = /^[^.]*\./.exec(d);
  return m ? m[0] : d;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

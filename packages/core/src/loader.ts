import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { PathSegment, PendingDiagnostic } from "./diagnostics.js";
import { FRAMEWORK_LOCALE, FRAMEWORK_MESSAGES } from "./framework-messages.js";
import type {
  RawCalculator,
  RawDictionary,
  RawDomainType,
  RawEntity,
  RawFunction,
  RawStaticLookup,
  RawValidator,
} from "./model.js";
import { camelCase } from "./names.js";
import { validateSchema } from "./schema.js";
import { type FileKind, parseYaml, type SourceFile } from "./source.js";

/** A named definition and where it came from. */
export interface Def<T> {
  name: string;
  data: T;
  file: SourceFile;
  /** Path of the definition inside its file. */
  path: PathSegment[];
}

export interface Message {
  text: string;
  /** Undefined for framework messages. */
  file?: SourceFile;
}

export interface LoadedDictionary {
  root: string;
  files: SourceFile[];
  dictionary?: Def<RawDictionary>;
  entities: Map<string, Def<RawEntity>>;
  types: Map<string, Def<RawDomainType>>;
  lookups: Map<string, Def<RawStaticLookup>>;
  validators: Map<string, Def<RawValidator>>;
  calculators: Map<string, Def<RawCalculator>>;
  functions: Map<string, Def<RawFunction>>;
  /** Messages per locale, including framework messages. */
  messages: Map<string, Map<string, Message>>;
  /** Names defined in files that failed YAML or schema checks, so references to them are not reported twice. */
  invalidNames: Set<string>;
  diagnostics: PendingDiagnostic[];
}

const SINGLE_FILES: Record<string, FileKind> = {
  "dictionary.yaml": "dictionary",
  "validators.yaml": "validators",
  "calculators.yaml": "calculators",
  "functions.yaml": "functions",
};

const FOLDERS: Record<string, FileKind> = {
  entities: "entity",
  types: "domainType",
  lookups: "lookup",
};

function walk(root: string, rel = ""): string[] {
  const out: string[] = [];
  for (const name of readdirSync(join(root, rel)).sort()) {
    if (name.startsWith(".") || name === "node_modules") continue;
    const relPath = rel ? `${rel}/${name}` : name;
    if (statSync(join(root, relPath)).isDirectory()) out.push(...walk(root, relPath));
    else out.push(relPath);
  }
  return out;
}

function classify(path: string): { kind: FileKind; locale?: string } | undefined {
  const single = SINGLE_FILES[path];
  if (single) return { kind: single };
  const parts = path.split("/");
  const folder = FOLDERS[parts[0] ?? ""];
  if (folder && parts.length > 1) return { kind: folder };
  if (parts[0] === "i18n" && parts.length === 2) return { kind: "i18n", locale: (parts[1] ?? "").replace(/\.yaml$/, "") };
  if (parts[0] === "i18n" && parts.length > 2) return { kind: "i18n", locale: parts[1] ?? "" };
  return undefined;
}

/** Reads a dictionary folder: discovers, parses and schema-checks every file, and registers definitions. */
export function loadDictionary(root: string): LoadedDictionary {
  const result: LoadedDictionary = {
    root,
    files: [],
    entities: new Map(),
    types: new Map(),
    lookups: new Map(),
    validators: new Map(),
    calculators: new Map(),
    functions: new Map(),
    messages: new Map(),
    invalidNames: new Set(),
    diagnostics: [],
  };
  const diag = result.diagnostics;

  for (const path of walk(root)) {
    if (path.endsWith(".yml")) {
      diag.push({ code: "RADD104", file: path, line: 1, column: 1, message: "Use the .yaml extension; .yml files are ignored." });
      continue;
    }
    if (!path.endsWith(".yaml")) continue;
    const cls = classify(path);
    if (!cls) {
      diag.push({
        code: "RADD104",
        file: path,
        line: 1,
        column: 1,
        message: "This file is not part of the dictionary layout and is ignored.",
        hint: "Entities go in entities/, domain types in types/, lookups in lookups/, messages in i18n/.",
      });
      continue;
    }
    const text = readFileSync(join(root, path), "utf8");
    const { file, diagnostics } = parseYaml(path, cls.kind, text, cls.locale);
    diag.push(...diagnostics);
    if (file.valid) {
      const schemaErrors = validateSchema(cls.kind, path, file.data);
      diag.push(...schemaErrors);
      if (schemaErrors.length > 0) file.valid = false;
    }
    result.files.push(file);
    register(result, file);
  }

  if (!result.files.some((f) => f.kind === "dictionary")) {
    diag.push({ code: "RADD105", message: "The dictionary folder has no dictionary.yaml." });
  }
  addFrameworkMessages(result);
  return result;
}

function register(result: LoadedDictionary, file: SourceFile): void {
  const data = file.data as Record<string, unknown> | undefined;
  const nameOf = (key: string) => (data && typeof data[key] === "string" ? (data[key] as string) : undefined);

  if (!file.valid) {
    for (const key of ["entity", "domainType", "lookup"]) {
      const n = nameOf(key);
      if (n) result.invalidNames.add(n);
    }
    if (file.kind === "dictionary") result.invalidNames.add("dictionary.yaml");
    return;
  }

  const define = <T>(map: Map<string, Def<T>>, key: string, what: string) => {
    const name = nameOf(key) ?? "";
    const existing = map.get(name);
    if (existing) {
      result.diagnostics.push({
        code: "RADD103",
        file: file.path,
        path: [key],
        message: `${what} '${name}' is already defined in ${existing.file.path}.`,
      });
      return;
    }
    map.set(name, { name, data: data as T, file, path: [] });
  };

  switch (file.kind) {
    case "dictionary":
      result.dictionary = { name: "dictionary", data: data as unknown as RawDictionary, file, path: [] };
      break;
    case "entity":
      define(result.entities, "entity", "Entity");
      break;
    case "domainType":
      define(result.types, "domainType", "Domain type");
      break;
    case "lookup":
      define(result.lookups, "lookup", "Lookup");
      break;
    case "validators":
    case "calculators":
    case "functions": {
      const map = data?.[file.kind] as Record<string, unknown>;
      const target = result[file.kind] as Map<string, Def<unknown>>;
      for (const [name, value] of Object.entries(map)) {
        target.set(name, { name, data: value, file, path: [file.kind, name] });
      }
      break;
    }
    case "i18n": {
      const locale = file.locale ?? "";
      let messages = result.messages.get(locale);
      if (!messages) {
        messages = new Map();
        result.messages.set(locale, messages);
      }
      for (const [key, text] of Object.entries(data ?? {})) {
        const existing = messages.get(key);
        if (existing?.file) {
          result.diagnostics.push({
            code: "RADD103",
            file: file.path,
            path: [key],
            atKey: true,
            message: `Message key '${key}' is already defined for '${locale}' in ${existing.file.path}.`,
          });
          continue;
        }
        messages.set(key, { text: String(text), file });
      }
      break;
    }
  }
}

function addFrameworkMessages(result: LoadedDictionary): void {
  const supported = result.dictionary?.data.locales.supported ?? [];
  if (!supported.includes(FRAMEWORK_LOCALE)) return;
  let messages = result.messages.get(FRAMEWORK_LOCALE);
  if (!messages) {
    messages = new Map();
    result.messages.set(FRAMEWORK_LOCALE, messages);
  }
  for (const [key, text] of Object.entries(FRAMEWORK_MESSAGES)) {
    if (!messages.has(key)) messages.set(key, { text });
  }
}

/** The message-key prefix of an entity, domain type or lookup: OrderLine -> orderLine. */
export function keyPrefix(name: string): string {
  return camelCase(name);
}

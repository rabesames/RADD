import { parse as parseIcu } from "@formatjs/icu-messageformat-parser";
import { RE2JS } from "re2js";
import { checkCall, RADD_BUILTINS, scanCel } from "./cel.js";
import { type PathSegment, type PendingDiagnostic, type RuleCode, suggest } from "./diagnostics.js";
import { FRAMEWORK_MESSAGES } from "./framework-messages.js";
import type { Def, LoadedDictionary } from "./loader.js";
import type {
  LogicalType,
  RawConstraints,
  RawDomainType,
  RawEntity,
  RawLookup,
  RawRule,
  RawStaticLookup,
  RawValidatorUse,
} from "./model.js";
import { API_IDENTIFIER, CAMEL_CASE, camelCase, FUNCTION_NAME, kebabCase, PASCAL_CASE, SQL_IDENTIFIER, titleCase } from "./names.js";
import {
  constraintChain,
  constraintMessages,
  defaultLocaleMessages,
  type EffectiveField,
  effectiveField,
  firstPresent,
  fitsValueType,
  literalFits,
  OPTIONAL_ENTITY_KEYS,
  OPTIONAL_FIELD_KEYS,
  primaryKeyOf,
  validatorChain,
} from "./resolve.js";
import type { SourceFile } from "./source.js";

/** Runs the semantic lint rules over a loaded dictionary. Files with YAML or schema errors are skipped. */
export function lintSemantics(loaded: LoadedDictionary): PendingDiagnostic[] {
  return new Linter(loaded).run();
}

type Where = { file: SourceFile; path: PathSegment[]; atKey?: boolean };

class Linter {
  private readonly out: PendingDiagnostic[] = [];
  private readonly defaultMessages: ReadonlyMap<string, unknown>;
  /** Keys that must exist in the default locale, with where they are needed. */
  private readonly needed = new Map<string, Where>();
  /** Every key the dictionary refers to or may use. */
  private readonly used = new Set<string>(Object.keys(FRAMEWORK_MESSAGES));
  private readonly missingFramework = new Set<string>();
  private readonly enabledExtensions: ReadonlySet<string>;
  private readonly declaredFunctions: ReadonlySet<string>;

  constructor(private readonly loaded: LoadedDictionary) {
    this.defaultMessages = defaultLocaleMessages(loaded);
    this.enabledExtensions = new Set(loaded.dictionary?.data.expressions?.extensions ?? []);
    this.declaredFunctions = new Set(loaded.functions.keys());
  }

  run(): PendingDiagnostic[] {
    this.checkLocales();
    this.checkNames();
    for (const t of this.loaded.types.values()) this.checkDomainType(t);
    for (const l of this.loaded.lookups.values()) this.checkLookup(l);
    this.checkComponents();
    this.checkEntities();
    this.checkMessages();
    return this.out;
  }

  private report(code: RuleCode, where: Where, message: string, hint?: string): void {
    this.out.push({
      code,
      file: where.file.path,
      path: where.path,
      ...(where.atKey ? { atKey: true } : {}),
      message,
      ...(hint ? { hint } : {}),
    });
  }

  private need(key: string, where: Where): void {
    this.used.add(key);
    if (!this.needed.has(key)) this.needed.set(key, where);
  }

  // Locales ---------------------------------------------------------------

  private checkLocales(): void {
    const dict = this.loaded.dictionary;
    if (!dict) return;
    const { default: def, supported } = dict.data.locales;
    if (!supported.includes(def)) {
      this.report("RADD505", { file: dict.file, path: ["locales", "default"] }, `The default locale '${def}' is not in locales.supported.`);
    }
    const withFiles = new Set(this.loaded.files.filter((f) => f.kind === "i18n").map((f) => f.locale ?? ""));
    for (const f of this.loaded.files.filter((x) => x.kind === "i18n")) {
      if (!supported.includes(f.locale ?? "")) {
        this.report("RADD505", { file: f, path: [] }, `Locale '${f.locale}' is not in locales.supported in dictionary.yaml.`);
      }
    }
    supported.forEach((locale, i) => {
      if (!withFiles.has(locale)) {
        this.report("RADD505", { file: dict.file, path: ["locales", "supported", i] }, `Supported locale '${locale}' has no file in i18n/.`, `Add i18n/${locale}.yaml.`);
      }
    });
  }

  // Names -----------------------------------------------------------------

  private checkNames(): void {
    const prefixes = new Map<string, { kind: string; name: string }>();
    const claim = (kind: string, def: Def<unknown>, key: string) => {
      const prefix = camelCase(def.name);
      const where = { file: def.file, path: [key] };
      if (prefix === "radd") {
        this.report("RADD103", where, `'${def.name}' is reserved: message keys starting with radd. belong to the framework.`);
        return;
      }
      const other = prefixes.get(prefix);
      if (other) {
        this.report("RADD103", where, `${kind} '${def.name}' uses the message-key prefix '${prefix}', already used by ${other.kind} '${other.name}'.`, "Entities, domain types and lookups share one message-key namespace; rename one of them.");
        return;
      }
      prefixes.set(prefix, { kind, name: def.name });
    };
    for (const e of this.loaded.entities.values()) {
      claim("Entity", e, "entity");
      if (!PASCAL_CASE.test(e.name)) this.report("RADD301", { file: e.file, path: ["entity"] }, `Entity name '${e.name}' must be PascalCase, for example ${titleCase(e.name)}.`);
      this.checkFileName(e.file, e.name);
      this.checkDescription(e.data.description, { file: e.file, path: ["entity"] }, `Entity '${e.name}'`);
    }
    for (const t of this.loaded.types.values()) {
      claim("Domain type", t, "domainType");
      if (!PASCAL_CASE.test(t.name)) this.report("RADD301", { file: t.file, path: ["domainType"] }, `Domain type name '${t.name}' must be PascalCase.`);
      this.checkFileName(t.file, t.name);
      this.checkDescription(t.data.description, { file: t.file, path: ["domainType"] }, `Domain type '${t.name}'`);
    }
    for (const l of this.loaded.lookups.values()) {
      claim("Lookup", l, "lookup");
      if (!CAMEL_CASE.test(l.name)) this.report("RADD304", { file: l.file, path: ["lookup"] }, `Lookup name '${l.name}' must be lowerCamelCase.`);
      this.checkFileName(l.file, l.name);
      this.checkDescription(l.data.description, { file: l.file, path: ["lookup"] }, `Lookup '${l.name}'`);
    }
  }

  private checkFileName(file: SourceFile, name: string): void {
    const base = file.path.split("/").pop() ?? "";
    const expected = `${kebabCase(name)}.yaml`;
    if (base !== expected) {
      this.report("RADD305", { file, path: [] }, `File name '${base}' does not match '${name}'; expected '${expected}'.`);
    }
  }

  private checkDescription(description: string | undefined, where: Where, what: string): void {
    if (!description?.trim()) {
      this.report("RADD401", { ...where, atKey: true }, `${what} has no description.`, "Say what it is and why it exists; people and AI agents rely on it.");
    }
  }

  // Validators, calculators, functions -------------------------------------

  private checkComponents(): void {
    for (const v of this.loaded.validators.values()) {
      const where = { file: v.file, path: v.path, atKey: true };
      if (!CAMEL_CASE.test(v.name)) this.report("RADD304", where, `Validator name '${v.name}' must be lowerCamelCase.`);
      this.checkDescription(v.data.description, where, `Validator '${v.name}'`);
      if (v.data.message) this.need(v.data.message, { file: v.file, path: [...v.path, "message"] });
    }
    for (const c of this.loaded.calculators.values()) {
      const where = { file: c.file, path: c.path, atKey: true };
      if (!CAMEL_CASE.test(c.name)) this.report("RADD304", where, `Calculator name '${c.name}' must be lowerCamelCase.`);
      this.checkDescription(c.data.description, where, `Calculator '${c.name}'`);
    }
    for (const f of this.loaded.functions.values()) {
      const where = { file: f.file, path: f.path, atKey: true };
      if (!FUNCTION_NAME.test(f.name)) this.report("RADD304", where, `Function name '${f.name}' must be lowerCamelCase with at most one namespace, for example geo.distance.`);
      if (RADD_BUILTINS.has(f.name) || f.name.startsWith("dec.")) this.report("RADD103", where, `Function '${f.name}' redefines a RADD built-in.`);
      this.checkDescription(f.data.description, where, `Function '${f.name}'`);
    }
  }

  // Domain types and lookups -----------------------------------------------

  private checkDomainType(t: Def<RawDomainType>): void {
    const where = (...p: PathSegment[]) => ({ file: t.file, path: p });
    this.checkConstraints(t.data.type, t.data, (k) => where(k), `Domain type '${t.name}'`);
    if (t.data.pattern !== undefined) this.checkPattern(t.data.pattern, where("pattern"));
    if (t.data.default !== undefined) this.checkDefault(t.data.type, t.data.default, where("default"));
    if (t.data.lookup) this.checkLookupRef(t.data.type, t.data.lookup, where("lookup"), undefined);
    (t.data.rules ?? []).forEach((r, i) => this.checkRule(r, where("rules", i)));
    (t.data.validators ?? []).forEach((v, i) => this.checkValidatorUse(v, where("validators", i), "field"));
    for (const [c] of constraintMessages(effectiveField(this.loaded, "", { type: t.data.type, domain: t.name }))) {
      this.used.add(`${camelCase(t.name)}.${c}`);
    }
  }

  private checkLookup(l: Def<RawStaticLookup>): void {
    const codes = new Map<string, number>();
    l.data.items.forEach((item, i) => {
      const where = { file: l.file, path: ["items", i] as PathSegment[] };
      const key = String(item.code);
      if (codes.has(key)) this.report("RADD103", { ...where, path: [...where.path, "code"] }, `Code '${key}' appears twice in lookup '${l.name}'.`);
      codes.set(key, i);
      if ((l.data.valueType === "integer") !== (typeof item.code === "number")) {
        this.report("RADD210", { ...where, path: [...where.path, "code"] }, `Code ${JSON.stringify(item.code)} does not match the lookup's valueType '${l.data.valueType}'.`);
      }
      this.need(item.label, { ...where, path: [...where.path, "label"] });
    });
  }

  // Entities ----------------------------------------------------------------

  private checkEntities(): void {
    const dbNames = new Map<string, string>();
    const apiNames = new Map<string, string>();
    const renamed = new Map<string, string>();
    for (const e of this.loaded.entities.values()) {
      const at = (...p: PathSegment[]): Where => ({ file: e.file, path: p });
      const ek = camelCase(e.name);
      this.need(`${ek}.label`, at("entity"));
      for (const k of OPTIONAL_ENTITY_KEYS) this.used.add(`${ek}.${k}`);

      const dbName = e.data.dbName ?? e.name;
      const apiName = e.data.apiName ?? camelCase(e.name);
      this.checkPhysicalName(dbName, apiName, at(e.data.dbName ? "dbName" : "entity"), at(e.data.apiName ? "apiName" : "entity"));
      this.unique(dbNames, dbName, e.name, at(e.data.dbName ? "dbName" : "entity"), "table name");
      this.unique(apiNames, apiName, e.name, at(e.data.apiName ? "apiName" : "entity"), "API name");

      if (e.data.renamedFrom !== undefined) {
        const r = e.data.renamedFrom;
        if (r === e.name) this.report("RADD601", at("renamedFrom"), `Entity '${e.name}' cannot be renamed from itself.`);
        else if (this.loaded.entities.has(r)) this.report("RADD601", at("renamedFrom"), `renamedFrom '${r}' names an entity that still exists.`);
        else if (renamed.has(r)) this.report("RADD601", at("renamedFrom"), `Entities '${renamed.get(r)}' and '${e.name}' both claim to be renamed from '${r}'.`);
        renamed.set(r, e.name);
      }
      this.checkEntity(e);
    }
  }

  private checkEntity(e: Def<RawEntity>): void {
    const at = (...p: PathSegment[]): Where => ({ file: e.file, path: p });
    const fields = e.data.fields;
    const fieldNames = Object.keys(fields);
    const ek = camelCase(e.name);
    const fieldRef = (name: string, where: Where, what: string) => {
      if (!(name in fields)) this.report("RADD204", where, `${what} '${name}' is not a field of ${e.name}.`, suggest(name, fieldNames));
    };

    primaryKeyOf(e.data).forEach((k, i) => fieldRef(k, Array.isArray(e.data.primaryKey) ? at("primaryKey", i) : at("primaryKey"), "Primary key"));
    (e.data.indexes ?? []).forEach((ix, i) => ix.fields.forEach((f, j) => fieldRef(f, at("indexes", i, "fields", j), "Index field")));
    if (e.data.concurrencyToken !== undefined) fieldRef(e.data.concurrencyToken, at("concurrencyToken"), "Concurrency token");

    for (const [name, rel] of Object.entries(e.data.relationships ?? {})) {
      const where = at("relationships", name);
      if (!CAMEL_CASE.test(name)) this.report("RADD302", { ...where, atKey: true }, `Relationship name '${name}' must be lowerCamelCase.`);
      const target = this.entityRef(rel.entity, { ...where, path: [...where.path, "entity"] });
      if (rel.kind === "manyToOne" && rel.foreignKey) fieldRef(rel.foreignKey, { ...where, path: [...where.path, "foreignKey"] }, "Foreign key");
      if (rel.kind === "oneToMany" && rel.foreignKey && target && !(rel.foreignKey in target.data.fields)) {
        this.report("RADD204", { ...where, path: [...where.path, "foreignKey"] }, `Foreign key '${rel.foreignKey}' is not a field of ${target.name}.`, suggest(rel.foreignKey, Object.keys(target.data.fields)));
      }
      if (rel.kind === "manyToMany" && rel.through) this.entityRef(rel.through, { ...where, path: [...where.path, "through"] });
    }

    (e.data.rules ?? []).forEach((r, i) => this.checkRule(r, at("rules", i)));
    (e.data.validators ?? []).forEach((v, i) => {
      this.checkValidatorUse(v, at("validators", i), "entity");
      this.checkValidatorMessage(e, undefined, v, at("validators", i));
    });

    const dbNames = new Map<string, string>();
    const apiNames = new Map<string, string>();
    const renamed = new Map<string, string>();
    for (const [name, raw] of Object.entries(fields)) {
      const where = (...p: PathSegment[]): Where => at("fields", name, ...p);
      const field = effectiveField(this.loaded, name, raw);

      if (!CAMEL_CASE.test(name)) this.report("RADD302", { ...where(), atKey: true }, `Field name '${name}' must be lowerCamelCase.`);
      this.checkDescription(raw.description, { ...where(), atKey: true }, `Field '${e.name}.${name}'`);
      this.need(`${ek}.${name}.label`, { ...where(), atKey: true });
      for (const k of OPTIONAL_FIELD_KEYS) this.used.add(`${ek}.${name}.${k}`);

      const dbName = raw.dbName ?? titleCase(name);
      const apiName = raw.apiName ?? name;
      this.checkPhysicalName(dbName, apiName, raw.dbName ? where("dbName") : { ...where(), atKey: true }, raw.apiName ? where("apiName") : { ...where(), atKey: true });
      this.unique(dbNames, dbName, name, raw.dbName ? where("dbName") : { ...where(), atKey: true }, `column name in ${e.name}`);
      this.unique(apiNames, apiName, name, raw.apiName ? where("apiName") : { ...where(), atKey: true }, `API name in ${e.name}`);

      if (raw.type !== undefined && raw.domain !== undefined) {
        this.report("RADD209", where("type"), `Field '${name}' sets both type and domain; a domain type's base type cannot be overridden.`, `Remove 'type'; ${raw.domain} provides it.`);
      }
      if (raw.domain !== undefined && !field.domain && !this.loaded.invalidNames.has(raw.domain)) {
        this.report("RADD201", where("domain"), `Unknown domain type '${raw.domain}'.`, suggest(raw.domain, this.loaded.types.keys()));
      }

      this.checkConstraints(field.type, raw, (k) => where(k), `Field '${name}'`, field);
      if (raw.pattern !== undefined) this.checkPattern(raw.pattern, where("pattern"));
      if (raw.default !== undefined && field.type) this.checkDefault(field.type, raw.default, where("default"));
      if (raw.lookup) this.checkLookupRef(field.type, raw.lookup, where("lookup"), { entity: e, fieldNames });
      if (raw.references) {
        const target = this.entityRef(raw.references.entity, where("references", "entity"));
        if (target) {
          const refField = raw.references.field ?? (primaryKeyOf(target.data).length === 1 ? primaryKeyOf(target.data)[0] : undefined);
          if (refField === undefined) {
            this.report("RADD204", where("references"), `${target.name} has a composite primary key; name the referenced field.`);
          } else if (!(refField in target.data.fields)) {
            this.report("RADD204", where("references", "field"), `'${refField}' is not a field of ${target.name}.`, suggest(refField, Object.keys(target.data.fields)));
          } else {
            this.checkSameType(field.type, target, refField, where("references"));
          }
        }
      }
      if (raw.computed) {
        const c = raw.computed;
        if (raw.readOnly !== undefined && raw.readOnly !== "always") {
          this.report("RADD211", where("readOnly"), `Computed field '${name}' is always read-only; remove readOnly or set it to always.`);
        }
        if (c.source === "database") {
          for (const db of this.loaded.dictionary?.data.databases ?? []) {
            if (!c.sql?.[db]) this.report("RADD702", where("computed", "sql"), `Database-computed field '${name}' has no SQL for '${db}', an enabled database.`);
          }
        }
        if (c.calculator !== undefined && !this.loaded.calculators.has(c.calculator)) {
          this.report("RADD206", where("computed", "calculator"), `Unknown calculator '${c.calculator}'; declare it in calculators.yaml.`, suggest(c.calculator, this.loaded.calculators.keys()));
        }
        if (c.expression !== undefined) this.checkExpression(c.expression, where("computed", "expression"));
      }
      (raw.rules ?? []).forEach((r, i) => this.checkRule(r, where("rules", i)));
      (raw.validators ?? []).forEach((v, i) => {
        this.checkValidatorUse(v, where("validators", i), "field");
        this.checkValidatorMessage(e, name, v, where("validators", i));
      });
      for (const v of field.validators.filter((x) => x.fromDomain)) {
        this.checkValidatorMessage(e, name, v.use, where("domain"));
      }

      for (const [constraint, frameworkKey] of constraintMessages(field)) {
        const chain = constraintChain(e.name, field, constraint, frameworkKey);
        for (const k of chain) this.used.add(k);
        if (!firstPresent(chain, this.defaultMessages)) this.missingFramework.add(frameworkKey);
      }

      if (raw.renamedFrom !== undefined) {
        const r = raw.renamedFrom;
        if (r === name) this.report("RADD601", where("renamedFrom"), `Field '${name}' cannot be renamed from itself.`);
        else if (r in fields) this.report("RADD601", where("renamedFrom"), `renamedFrom '${r}' names a field of ${e.name} that still exists.`);
        else if (renamed.has(r)) this.report("RADD601", where("renamedFrom"), `Fields '${renamed.get(r)}' and '${name}' both claim to be renamed from '${r}'.`);
        renamed.set(r, name);
      }
    }
  }

  private entityRef(name: string, where: Where): Def<RawEntity> | undefined {
    const target = this.loaded.entities.get(name);
    if (!target && !this.loaded.invalidNames.has(name)) {
      this.report("RADD203", where, `Unknown entity '${name}'.`, suggest(name, this.loaded.entities.keys()));
    }
    return target;
  }

  private checkSameType(type: LogicalType | undefined, target: Def<RawEntity>, fieldName: string, where: Where): void {
    const raw = target.data.fields[fieldName];
    if (!raw || type === undefined) return;
    const targetType = effectiveField(this.loaded, fieldName, raw).type;
    if (targetType !== undefined && targetType !== type) {
      this.report("RADD210", where, `This field is ${type} but ${target.name}.${fieldName} is ${targetType}.`);
    }
  }

  private checkPhysicalName(dbName: string, apiName: string, dbWhere: Where, apiWhere: Where): void {
    if (!SQL_IDENTIFIER.test(dbName)) this.report("RADD303", dbWhere, `Database name '${dbName}' is not a plain SQL identifier (letters, digits and underscores, not starting with a digit).`);
    if (!API_IDENTIFIER.test(apiName)) this.report("RADD303", apiWhere, `API name '${apiName}' is not a plain identifier (letters, digits and underscores, not starting with a digit).`);
  }

  private unique(seen: Map<string, string>, value: string, owner: string, where: Where, what: string): void {
    const key = value.toLowerCase();
    const other = seen.get(key);
    if (other !== undefined) this.report("RADD303", where, `'${owner}' and '${other}' have the same ${what} '${value}' (names are compared ignoring case).`);
    else seen.set(key, owner);
  }

  // Shared checks -------------------------------------------------------------

  private checkConstraints(type: LogicalType | undefined, own: RawConstraints & { readOnly?: string }, where: (k: string) => Where, what: string, field?: EffectiveField): void {
    if (type === undefined) return;
    const c = field?.constraints ?? own;
    const bad = (k: keyof RawConstraints, message: string) => {
      const w = own[k] !== undefined ? where(k) : where(field?.raw.domain !== undefined ? "domain" : k);
      this.report("RADD211", w, message);
    };
    const lengthTypes = new Set<LogicalType>(["string", "text", "binary"]);
    const numberTypes = new Set<LogicalType>(["integer", "long", "decimal"]);
    if (c.maxLength !== undefined && !lengthTypes.has(type)) bad("maxLength", `${what}: maxLength applies to string, text and binary, not ${type}.`);
    if (c.minLength !== undefined && type !== "string" && type !== "text") bad("minLength", `${what}: minLength applies to string and text, not ${type}.`);
    for (const k of ["precision", "scale"] as const) {
      if (c[k] !== undefined && type !== "decimal") bad(k, `${what}: ${k} applies to decimal, not ${type}.`);
    }
    for (const k of ["min", "max"] as const) {
      if (c[k] !== undefined && !numberTypes.has(type)) bad(k, `${what}: ${k} applies to integer, long and decimal, not ${type}.`);
    }
    for (const k of ["format", "pattern", "mask"] as const) {
      if (c[k] !== undefined && type !== "string") bad(k, `${what}: ${k} applies to string, not ${type}.`);
    }
    if (type === "decimal" && (c.precision === undefined || c.scale === undefined)) {
      this.report("RADD211", where("type"), `${what}: decimal needs both precision and scale.`);
    }
    if (type === "string" && c.maxLength === undefined) {
      this.report("RADD211", where("type"), `${what}: string needs a maxLength; use text for unbounded text.`);
    }
    if (c.precision !== undefined && c.scale !== undefined && c.scale > c.precision) bad("scale", `${what}: scale (${c.scale}) cannot exceed precision (${c.precision}).`);
    if (c.min !== undefined && c.max !== undefined && c.min > c.max) bad("min", `${what}: min (${c.min}) is greater than max (${c.max}).`);
    if (c.minLength !== undefined && c.maxLength !== undefined && c.minLength > c.maxLength) bad("minLength", `${what}: minLength (${c.minLength}) is greater than maxLength (${c.maxLength}).`);
  }

  private checkDefault(type: LogicalType, value: unknown, where: Where): void {
    if (typeof value === "object" && value !== null && "expression" in value) {
      this.checkExpression(String((value as { expression: string }).expression), { ...where, path: [...where.path, "expression"] });
    } else if (!literalFits(type, value)) {
      this.report("RADD211", where, `Default ${JSON.stringify(value)} is not a valid ${type} literal.`, "Use { expression: \"...\" } for a computed default.");
    }
  }

  private checkPattern(pattern: string, where: Where): void {
    try {
      RE2JS.compile(pattern);
    } catch (err) {
      this.report("RADD703", where, `Invalid RE2 pattern: ${(err as Error).message}`, "RE2 has no lookbehind or backreferences.");
    }
  }

  private checkLookupRef(type: LogicalType | undefined, lookup: RawLookup, where: Where, ctx: { entity: Def<RawEntity>; fieldNames: string[] } | undefined): void {
    const sub = (...p: PathSegment[]) => ({ ...where, path: [...where.path, ...p] });
    if (lookup.list !== undefined) {
      const list = this.loaded.lookups.get(lookup.list);
      if (!list && !this.loaded.invalidNames.has(lookup.list)) {
        this.report("RADD202", sub("list"), `Unknown lookup '${lookup.list}'.`, suggest(lookup.list, this.loaded.lookups.keys()));
      }
      if (list && !fitsValueType(type, list.data.valueType)) {
        this.report("RADD210", sub("list"), `Lookup '${list.name}' has ${list.data.valueType} codes but this field is ${type}.`);
      }
    }
    if (lookup.entity !== undefined) {
      const target = this.entityRef(lookup.entity, sub("entity"));
      if (target) {
        for (const k of ["value", "display"] as const) {
          const f = lookup[k];
          if (f !== undefined && !(f in target.data.fields)) {
            this.report("RADD204", sub(k), `'${f}' is not a field of ${target.name}.`, suggest(f, Object.keys(target.data.fields)));
          }
        }
        if (lookup.value !== undefined && lookup.value in target.data.fields) this.checkSameType(type, target, lookup.value, sub("value"));
      }
    }
    if (ctx) {
      (lookup.dependsOn ?? []).forEach((d, i) => {
        if (!ctx.fieldNames.includes(d)) this.report("RADD204", sub("dependsOn", i), `dependsOn '${d}' is not a field of ${ctx.entity.name}.`, suggest(d, ctx.fieldNames));
      });
    }
    if (lookup.filter !== undefined) this.checkExpression(lookup.filter, sub("filter"));
  }

  private checkRule(rule: RawRule, where: Where): void {
    if (rule.when !== undefined) this.checkExpression(rule.when, { ...where, path: [...where.path, "when"] });
    if (rule.expression !== undefined) this.checkExpression(rule.expression, { ...where, path: [...where.path, "expression"] });
    if (rule.message !== undefined) this.need(rule.message, { ...where, path: [...where.path, "message"] });
  }

  private checkValidatorUse(use: RawValidatorUse, where: Where, scope: "field" | "entity"): void {
    const v = this.loaded.validators.get(use.name);
    const name = { ...where, path: [...where.path, "name"] };
    if (!v) {
      this.report("RADD205", name, `Unknown validator '${use.name}'; declare it in validators.yaml.`, suggest(use.name, this.loaded.validators.keys()));
      return;
    }
    if (v.data.scope !== scope) {
      this.report("RADD205", name, `Validator '${use.name}' has scope '${v.data.scope}' and cannot be used on ${scope === "field" ? "a field" : "an entity"}.`);
    }
    const params = v.data.parameters ?? [];
    const names = params.map((p) => p.name);
    for (const p of Object.keys(use.params ?? {})) {
      if (!names.includes(p)) this.report("RADD205", { ...where, path: [...where.path, "params", p], atKey: true }, `Validator '${use.name}' has no parameter '${p}'.`, suggest(p, names));
    }
    for (const p of params.filter((x) => x.required)) {
      if (!(p.name in (use.params ?? {}))) this.report("RADD205", name, `Validator '${use.name}' needs parameter '${p.name}'.`);
    }
  }

  private checkValidatorMessage(e: Def<RawEntity>, fieldName: string | undefined, use: RawValidatorUse, where: Where): void {
    const chain = validatorChain(this.loaded, e.name, fieldName, use);
    for (const k of chain) this.used.add(k);
    if (use.message) {
      this.need(use.message, { ...where, path: [...where.path, "message"] });
    } else if (!firstPresent(chain, this.defaultMessages)) {
      this.need(chain[0] ?? use.name, where);
    }
  }

  private checkExpression(expr: string, where: Where): void {
    const scan = scanCel(expr);
    for (const e of scan.errors) this.report("RADD701", where, `${e.message} (at character ${e.offset + 1} of the expression)`);
    for (const call of scan.calls) {
      const result = checkCall(call, this.enabledExtensions, this.declaredFunctions);
      if (result.ok) continue;
      if (result.reason === "extension") {
        this.report("RADD208", where, `'${call.name}' belongs to the CEL '${result.extension}' extension, which is not enabled.`, `Add ${result.extension} to expressions.extensions in dictionary.yaml.`);
      } else {
        this.report("RADD207", where, `Unknown function '${call.name}'.`, suggest(call.name, [...RADD_BUILTINS, ...this.declaredFunctions]) ?? "Declare custom functions in functions.yaml.");
      }
    }
  }

  // Messages -------------------------------------------------------------------

  private checkMessages(): void {
    const dict = this.loaded.dictionary;
    if (!dict) return;
    const defaultLocale = dict.data.locales.default;

    for (const [key, where] of this.needed) {
      if (!this.defaultMessages.has(key)) {
        this.report("RADD501", where, `Message key '${key}' is missing in the default locale '${defaultLocale}'.`, `Add it to i18n/${defaultLocale}.yaml.`);
      }
    }
    for (const key of [...this.missingFramework].sort()) {
      this.report("RADD501", { file: dict.file, path: ["locales", "default"] }, `Framework message '${key}' is missing in the default locale '${defaultLocale}'.`, `Add ${key} to i18n/${defaultLocale}.yaml.`);
    }

    // Usage is unknown while some file is left out of semantic checks, so unused keys are not reported then.
    const usageKnown = this.loaded.files.every((f) => f.valid);
    for (const [locale, messages] of this.loaded.messages) {
      for (const [key, m] of messages) {
        if (!m.file) continue;
        const where = { file: m.file, path: [key], atKey: false };
        try {
          parseIcu(m.text);
        } catch (err) {
          this.report("RADD504", where, `Message '${key}' is not valid ICU MessageFormat: ${(err as Error).message}.`);
        }
        if (locale !== defaultLocale && !this.defaultMessages.has(key)) {
          this.report("RADD503", { ...where, atKey: true }, `Key '${key}' exists in '${locale}' but not in the default locale '${defaultLocale}'.`);
        } else if (usageKnown && !this.used.has(key)) {
          this.report("RADD503", { ...where, atKey: true }, `Key '${key}' is not used by the dictionary.`, suggest(key, this.used));
        }
      }
      if (locale === defaultLocale || !dict.data.locales.supported.includes(locale)) continue;
      const file = this.loaded.files.find((f) => f.kind === "i18n" && f.locale === locale);
      for (const key of this.defaultMessages.keys()) {
        if (!messages.has(key) && file) {
          this.report("RADD502", { file, path: [] }, `Key '${key}' is missing in '${locale}'; the '${defaultLocale}' text will be used.`);
        }
      }
    }
  }
}


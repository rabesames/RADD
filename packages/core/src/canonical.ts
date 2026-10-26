import { dictionaryHash, sortKeys } from "./hash.js";
import type { Def, LoadedDictionary } from "./loader.js";
import type { RawEntity, RawLookup, RawRule, RawValidatorUse } from "./model.js";
import { camelCase, titleCase } from "./names.js";
import {
  CONSTRAINT_KEYS,
  constraintChain,
  constraintMessages,
  defaultLocaleMessages,
  durationSeconds,
  type EffectiveField,
  effectiveField,
  firstPresent,
  OPTIONAL_ENTITY_KEYS,
  OPTIONAL_FIELD_KEYS,
  primaryKeyOf,
  validatorChain,
} from "./resolve.js";

const DEFAULT_TTL = "10m";

type Json = Record<string, unknown>;

/** Set-like arrays are sorted and de-duplicated so their order carries no meaning. */
function asSet(values: readonly string[] | undefined): string[] {
  return [...new Set(values ?? [])].sort();
}

function compact(o: Json): Json {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
}

/**
 * Builds the canonical document from a dictionary that passed lint without errors: defaults
 * made explicit, domain types expanded, message keys resolved, and the version hash computed.
 */
export function buildCanonical(loaded: LoadedDictionary): Json {
  const dict = loaded.dictionary?.data;
  if (!dict) throw new Error("Cannot build a dictionary without dictionary.yaml.");
  const messages = defaultLocaleMessages(loaded);
  const defaultTtl = dict.lookups?.defaultTtl ?? DEFAULT_TTL;
  const present = (key: string) => (messages.has(key) ? key : undefined);
  const resolve = (chain: string[]) => firstPresent(chain, messages) ?? chain[chain.length - 1];

  const rule = (r: RawRule, entityName: string, fieldName: string | undefined, field: EffectiveField | undefined): Json => {
    const severity = r.severity ?? "error";
    if (r.expression !== undefined) {
      const message = r.message as string;
      return compact({
        kind: "expression",
        when: r.when?.trim(),
        expression: r.expression.trim(),
        severity,
        message,
        code: r.code ?? message,
        description: r.description,
      });
    }
    const effects = compact({ required: r.required, readOnly: r.readOnly, visible: r.visible });
    const out: Json = { kind: "conditional", when: (r.when ?? "").trim(), effects, description: r.description };
    if (r.required === true) {
      const message =
        r.message ??
        (field ? resolve(constraintChain(entityName, field, "required", "radd.required")) : "radd.required");
      out.severity = severity;
      out.message = message;
      out.code = r.code ?? r.message ?? [camelCase(entityName), fieldName, "required"].filter(Boolean).join(".");
    }
    return compact(out);
  };

  const validatorUse = (u: RawValidatorUse, entityName: string, fieldName: string | undefined): Json => {
    const chain = validatorChain(loaded, entityName, fieldName, u);
    const specific = fieldName ? `${camelCase(entityName)}.${fieldName}.${u.name}` : `${camelCase(entityName)}.${u.name}`;
    return compact({
      name: u.name,
      params: u.params ?? {},
      severity: u.severity ?? "error",
      message: resolve(chain),
      code: u.code ?? u.message ?? specific,
    });
  };

  const lookup = (l: RawLookup): Json => {
    if (l.list !== undefined) {
      return compact({ list: l.list, filter: l.filter?.trim(), dependsOn: asSet(l.dependsOn) });
    }
    const cache = l.cache ?? "ttl";
    return compact({
      entity: l.entity,
      value: l.value,
      display: l.display,
      cache,
      ttlSeconds: cache === "ttl" ? durationSeconds(l.ttl ?? defaultTtl) : undefined,
      filter: l.filter?.trim(),
      dependsOn: asSet(l.dependsOn),
      search: l.search ?? false,
    });
  };

  const entity = (e: Def<RawEntity>): Json => {
    const ek = camelCase(e.name);
    const raw = e.data;
    const fieldOrder = Object.keys(raw.fields);
    const fields: Json = {};
    const indexes = new Map<string, Json>();
    const tableName = raw.dbName ?? e.name;
    const columnOf = (f: string) => raw.fields[f]?.dbName ?? titleCase(f);
    const addIndex = (fieldsList: string[], unique: boolean, dbName: string | undefined, description: string | undefined) => {
      const name = dbName ?? `${unique ? "UX" : "IX"}_${tableName}_${fieldsList.map(columnOf).join("_")}`;
      const key = `${unique}|${fieldsList.join(",")}`;
      const existing = indexes.get(key);
      if (existing) {
        if (description && !existing.description) existing.description = description;
        return;
      }
      indexes.set(key, compact({ fields: fieldsList, unique, dbName: name, description }));
    };

    for (const name of fieldOrder) {
      const f = raw.fields[name];
      if (!f) continue;
      const field = effectiveField(loaded, name, f);
      const constraints: Json = {};
      for (const k of CONSTRAINT_KEYS) constraints[k] = field.constraints[k];
      const fieldMessages: Json = {};
      for (const [constraint, frameworkKey] of constraintMessages(field)) {
        fieldMessages[constraint] = resolve(constraintChain(e.name, field, constraint, frameworkKey));
      }
      const optional: Json = {};
      for (const k of OPTIONAL_FIELD_KEYS) optional[k] = present(`${ek}.${name}.${k}`);

      let references: Json | undefined;
      if (f.references) {
        const target = loaded.entities.get(f.references.entity);
        references = {
          entity: f.references.entity,
          field: f.references.field ?? (target ? primaryKeyOf(target.data)[0] : undefined),
          onDelete: f.references.onDelete ?? "restrict",
        };
      } else if (field.lookup?.entity !== undefined) {
        references = { entity: field.lookup.entity, field: field.lookup.value, onDelete: "restrict" };
      }

      let computed: Json | undefined;
      if (f.computed) {
        const c = f.computed;
        computed =
          c.source === "database"
            ? { source: "database", sql: c.sql, stored: c.stored ?? false }
            : compact({
                source: "application",
                expression: c.expression?.trim(),
                calculator: c.calculator,
                persisted: c.persisted ?? true,
              });
      }

      const def = field.default;
      if (f.unique) addIndex([name], true, undefined, undefined);

      fields[name] = compact({
        description: f.description,
        tags: field.tags.length ? field.tags : undefined,
        type: field.type,
        domain: f.domain,
        dbName: f.dbName ?? titleCase(name),
        apiName: f.apiName ?? name,
        required: f.required ?? false,
        readOnly: f.computed ? "always" : (f.readOnly ?? "never"),
        ...constraints,
        default:
          def === undefined
            ? undefined
            : typeof def === "object"
              ? { expression: def.expression.trim() }
              : { value: def },
        lookup: field.lookup ? lookup(field.lookup) : undefined,
        references,
        computed,
        rules: field.rules.map((r) => rule(r.rule, e.name, name, field)),
        validators: field.validators.map((v) => validatorUse(v.use, e.name, name)),
        label: `${ek}.${name}.label`,
        ...optional,
        messages: fieldMessages,
        renamedFrom: f.renamedFrom,
      });
    }

    for (const ix of raw.indexes ?? []) addIndex(ix.fields, ix.unique ?? false, ix.dbName, ix.description);

    const relationships: Json = {};
    for (const [name, r] of Object.entries(raw.relationships ?? {})) {
      relationships[name] = compact({ kind: r.kind, entity: r.entity, foreignKey: r.foreignKey, through: r.through, description: r.description });
    }
    const optional: Json = {};
    for (const k of OPTIONAL_ENTITY_KEYS) optional[k] = present(`${ek}.${k}`);

    return compact({
      description: raw.description,
      tags: raw.tags?.length ? asSet(raw.tags) : undefined,
      dbName: tableName,
      apiName: raw.apiName ?? ek,
      label: `${ek}.label`,
      ...optional,
      primaryKey: primaryKeyOf(raw),
      fieldOrder,
      fields,
      indexes: [...indexes.values()].sort((a, b) => String(a.dbName).localeCompare(String(b.dbName))),
      relationships,
      rules: (raw.rules ?? []).map((r) => rule(r, e.name, undefined, undefined)),
      validators: (raw.validators ?? []).map((v) => validatorUse(v, e.name, undefined)),
      audit: raw.audit ?? false,
      softDelete: raw.softDelete ?? false,
      concurrencyToken: raw.concurrencyToken,
      renamedFrom: raw.renamedFrom,
    });
  };

  const byName = <T>(map: Map<string, Def<T>>, f: (d: Def<T>) => Json): Json =>
    Object.fromEntries([...map.values()].map((d) => [d.name, f(d)]));

  const allMessages: Json = {};
  for (const locale of asSet(dict.locales.supported)) {
    const m = loaded.messages.get(locale);
    allMessages[locale] = Object.fromEntries([...(m ?? new Map())].map(([k, v]) => [k, v.text]));
  }

  const document: Json = {
    formatVersion: dict.formatVersion,
    name: dict.name,
    description: dict.description,
    locales: { default: dict.locales.default, supported: asSet(dict.locales.supported) },
    databases: asSet(dict.databases),
    expressions: { extensions: asSet(dict.expressions?.extensions) },
    lookupDefaults: { ttlSeconds: durationSeconds(defaultTtl) },
    types: byName(loaded.types, (t) => {
      const d = t.data;
      const constraints: Json = {};
      for (const k of CONSTRAINT_KEYS) constraints[k] = d[k];
      return compact({
        description: d.description,
        tags: d.tags?.length ? asSet(d.tags) : undefined,
        type: d.type,
        ...constraints,
        default: d.default === undefined ? undefined : typeof d.default === "object" ? { expression: d.default.expression.trim() } : { value: d.default },
        lookup: d.lookup ? lookup(d.lookup) : undefined,
        rules: (d.rules ?? []).map((r) => rule(r, t.name, undefined, undefined)),
        validators: (d.validators ?? []).map((u) =>
          compact({ name: u.name, params: u.params ?? {}, severity: u.severity ?? "error", code: u.code, message: u.message }),
        ),
      });
    }),
    lookups: byName(loaded.lookups, (l) =>
      compact({
        description: l.data.description,
        valueType: l.data.valueType,
        items: l.data.items.map((i) => compact({ code: i.code, label: i.label, sortOrder: i.sortOrder, active: i.active ?? true, description: i.description })),
      }),
    ),
    entities: byName(loaded.entities, entity),
    validators: byName(loaded.validators, (v) =>
      compact({ description: v.data.description, scope: v.data.scope, parameters: (v.data.parameters ?? []).map(param), message: v.data.message }),
    ),
    calculators: byName(loaded.calculators, (c) => compact({ description: c.data.description, parameters: (c.data.parameters ?? []).map(param) })),
    functions: byName(loaded.functions, (f) =>
      compact({ description: f.data.description, parameters: f.data.parameters.map((p) => compact({ ...p })), returns: f.data.returns, clientSafe: f.data.clientSafe ?? false }),
    ),
    messages: allMessages,
  };
  const sorted = sortKeys(compact(document));
  sorted.version = dictionaryHash(sorted);
  return sortKeys(sorted);
}

function param(p: { name: string; type: string; required?: boolean; description?: string }): Json {
  return compact({ name: p.name, type: p.type, required: p.required ?? false, description: p.description });
}

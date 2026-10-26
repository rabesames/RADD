import type { Def, LoadedDictionary } from "./loader.js";
import type {
  LogicalType,
  RawConstraints,
  RawDefault,
  RawDomainType,
  RawField,
  RawLookup,
  RawRule,
  RawValidatorUse,
} from "./model.js";
import { camelCase } from "./names.js";

export const CONSTRAINT_KEYS = [
  "maxLength",
  "minLength",
  "precision",
  "scale",
  "min",
  "max",
  "format",
  "pattern",
  "mask",
] as const satisfies readonly (keyof RawConstraints)[];

/** A field with its domain type applied: field values win, rules and validators are domain-first. */
export interface EffectiveField {
  name: string;
  raw: RawField;
  domain?: Def<RawDomainType>;
  type?: LogicalType;
  constraints: RawConstraints;
  default?: RawDefault;
  lookup?: RawLookup;
  /** Rules and validators with the definition that declared them. */
  rules: { rule: RawRule; fromDomain: boolean; index: number }[];
  validators: { use: RawValidatorUse; fromDomain: boolean; index: number }[];
  tags: string[];
}

export function effectiveField(
  loaded: LoadedDictionary,
  name: string,
  raw: RawField,
): EffectiveField {
  const domain = raw.domain ? loaded.types.get(raw.domain) : undefined;
  const d = domain?.data;
  const constraints: RawConstraints = {};
  for (const key of CONSTRAINT_KEYS) {
    const value = raw[key] ?? d?.[key];
    if (value !== undefined) (constraints as Record<string, unknown>)[key] = value;
  }
  const type = raw.type ?? d?.type;
  const def = raw.default ?? d?.default;
  const lookup = raw.lookup ?? d?.lookup;
  return {
    name,
    raw,
    ...(domain ? { domain } : {}),
    ...(type ? { type } : {}),
    constraints,
    ...(def !== undefined ? { default: def } : {}),
    ...(lookup ? { lookup } : {}),
    rules: [
      ...(d?.rules ?? []).map((rule, index) => ({ rule, fromDomain: true, index })),
      ...(raw.rules ?? []).map((rule, index) => ({ rule, fromDomain: false, index })),
    ],
    validators: [
      ...(d?.validators ?? []).map((use, index) => ({ use, fromDomain: true, index })),
      ...(raw.validators ?? []).map((use, index) => ({ use, fromDomain: false, index })),
    ],
    tags: [...new Set([...(d?.tags ?? []), ...(raw.tags ?? [])])].sort(),
  };
}

/** Constraint name (as used in message keys) to its framework message key, for the constraints a field has. */
export function constraintMessages(field: EffectiveField): Map<string, string> {
  const out = new Map<string, string>();
  const c = field.constraints;
  out.set("type", "radd.type");
  const conditionallyRequired = field.rules.some((r) => r.rule.required === true);
  if (field.raw.required || conditionallyRequired) out.set("required", "radd.required");
  if (c.maxLength !== undefined) out.set("maxLength", "radd.maxLength");
  if (c.minLength !== undefined) out.set("minLength", "radd.minLength");
  if (c.min !== undefined) out.set("min", "radd.min");
  if (c.max !== undefined) out.set("max", "radd.max");
  if (c.precision !== undefined) out.set("precision", "radd.precision");
  if (c.scale !== undefined) out.set("scale", "radd.scale");
  if (c.format !== undefined) out.set("format", `radd.format.${c.format}`);
  if (c.pattern !== undefined) out.set("pattern", "radd.pattern");
  if (field.lookup) out.set("lookup", "radd.lookup");
  return out;
}

/** Message-key candidates for a constraint, in resolution order: field, domain type, framework. */
export function constraintChain(
  entityName: string,
  field: EffectiveField,
  constraint: string,
  frameworkKey: string,
): string[] {
  const chain = [`${camelCase(entityName)}.${field.name}.${constraint}`];
  if (field.domain) chain.push(`${camelCase(field.domain.name)}.${constraint}`);
  chain.push(frameworkKey);
  return chain;
}

/** Message-key candidates for a validator use: field- or entity-specific, then the validator's declared message. */
export function validatorChain(
  loaded: LoadedDictionary,
  entityName: string,
  fieldName: string | undefined,
  use: RawValidatorUse,
): string[] {
  if (use.message) return [use.message];
  const specific = fieldName
    ? `${camelCase(entityName)}.${fieldName}.${use.name}`
    : `${camelCase(entityName)}.${use.name}`;
  const declared = loaded.validators.get(use.name)?.data.message;
  return declared ? [specific, declared] : [specific];
}

export function firstPresent(
  chain: readonly string[],
  messages: ReadonlyMap<string, unknown>,
): string | undefined {
  return chain.find((k) => messages.has(k));
}

export function defaultLocaleMessages(loaded: LoadedDictionary): ReadonlyMap<string, unknown> {
  const locale = loaded.dictionary?.data.locales.default;
  return (locale && loaded.messages.get(locale)) || new Map();
}

/** Optional derived keys that are included when present in the default locale. */
export const OPTIONAL_FIELD_KEYS = ["shortLabel", "help", "placeholder"] as const;
export const OPTIONAL_ENTITY_KEYS = ["pluralLabel", "help"] as const;

export function primaryKeyOf(raw: { primaryKey: string | string[] }): string[] {
  return Array.isArray(raw.primaryKey) ? raw.primaryKey : [raw.primaryKey];
}

const STRING_TYPES: ReadonlySet<LogicalType> = new Set([
  "string",
  "text",
  "guid",
  "date",
  "time",
  "datetime",
  "datetimeOffset",
]);

/** Whether a literal default fits the field's type. */
export function literalFits(type: LogicalType, value: unknown): boolean {
  if (STRING_TYPES.has(type)) return typeof value === "string";
  if (type === "integer" || type === "long") return Number.isInteger(value);
  if (type === "decimal") return typeof value === "number";
  if (type === "boolean") return typeof value === "boolean";
  return false;
}

/** Field types compatible with a static lookup's value type. */
export function fitsValueType(
  type: LogicalType | undefined,
  valueType: "string" | "integer",
): boolean {
  if (type === undefined) return true;
  return valueType === "string" ? type === "string" : type === "integer" || type === "long";
}

/** Parses a duration such as 10m into seconds. */
export function durationSeconds(d: string): number {
  const n = Number(d.slice(0, -1));
  const unit = d.slice(-1);
  return n * (unit === "s" ? 1 : unit === "m" ? 60 : unit === "h" ? 3600 : 86400);
}

/** Shapes of the YAML files after schema validation. See schema/v1. */

export type LogicalType =
  | "string"
  | "text"
  | "integer"
  | "long"
  | "decimal"
  | "boolean"
  | "date"
  | "time"
  | "datetime"
  | "datetimeOffset"
  | "guid"
  | "binary";

export type Severity = "error" | "warning" | "info";

export interface RawDictionary {
  name: string;
  description?: string;
  formatVersion: 1;
  locales: { default: string; supported: string[] };
  databases: string[];
  expressions?: { extensions?: string[] };
  lookups?: { defaultTtl?: string };
}

export type RawDefault = string | number | boolean | { expression: string };

export interface RawRule {
  when?: string;
  required?: boolean;
  readOnly?: boolean;
  visible?: boolean;
  expression?: string;
  severity?: Severity;
  code?: string;
  message?: string;
  description?: string;
}

export interface RawValidatorUse {
  name: string;
  params?: Record<string, unknown>;
  severity?: Severity;
  code?: string;
  message?: string;
}

export interface RawLookup {
  list?: string;
  entity?: string;
  value?: string;
  display?: string;
  cache?: "static" | "ttl" | "dynamic";
  ttl?: string;
  filter?: string;
  dependsOn?: string[];
  search?: boolean;
}

export interface RawReferences {
  entity: string;
  field?: string;
  onDelete?: "restrict" | "cascade" | "setNull";
}

export interface RawComputed {
  source: "database" | "application";
  sql?: Record<string, string>;
  stored?: boolean;
  expression?: string;
  calculator?: string;
  persisted?: boolean;
}

export interface RawConstraints {
  maxLength?: number;
  minLength?: number;
  precision?: number;
  scale?: number;
  min?: number;
  max?: number;
  format?: "email" | "url" | "phone";
  pattern?: string;
  mask?: string;
}

export interface RawField extends RawConstraints {
  type?: LogicalType;
  domain?: string;
  description?: string;
  tags?: string[];
  dbName?: string;
  apiName?: string;
  required?: boolean;
  readOnly?: "never" | "always" | "onUpdate";
  unique?: boolean;
  default?: RawDefault;
  lookup?: RawLookup;
  references?: RawReferences;
  rules?: RawRule[];
  validators?: RawValidatorUse[];
  computed?: RawComputed;
  renamedFrom?: string;
}

export interface RawIndex {
  fields: string[];
  unique?: boolean;
  dbName?: string;
  description?: string;
}

export interface RawRelationship {
  kind: "manyToOne" | "oneToMany" | "manyToMany";
  entity: string;
  foreignKey?: string;
  through?: string;
  description?: string;
}

export interface RawEntity {
  entity: string;
  description?: string;
  tags?: string[];
  dbName?: string;
  apiName?: string;
  primaryKey: string | string[];
  fields: Record<string, RawField>;
  indexes?: RawIndex[];
  relationships?: Record<string, RawRelationship>;
  rules?: RawRule[];
  validators?: RawValidatorUse[];
  audit?: boolean;
  softDelete?: boolean;
  concurrencyToken?: string;
  renamedFrom?: string;
}

export interface RawDomainType extends RawConstraints {
  domainType: string;
  description?: string;
  tags?: string[];
  type: LogicalType;
  default?: RawDefault;
  lookup?: RawLookup;
  rules?: RawRule[];
  validators?: RawValidatorUse[];
}

export interface RawStaticLookup {
  lookup: string;
  description?: string;
  valueType: "string" | "integer";
  items: {
    code: string | number;
    label: string;
    sortOrder?: number;
    active?: boolean;
    description?: string;
  }[];
}

export interface RawParameter {
  name: string;
  type: string;
  required?: boolean;
  description?: string;
}

export interface RawValidator {
  description?: string;
  scope: "field" | "entity";
  parameters?: RawParameter[];
  message?: string;
}

export interface RawCalculator {
  description?: string;
  parameters?: RawParameter[];
}

export interface RawFunction {
  description?: string;
  parameters: { name: string; type: string; description?: string }[];
  returns: string;
  clientSafe?: boolean;
}

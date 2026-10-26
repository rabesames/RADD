import { describe, expect, it } from "vitest";
import { build } from "../src/index.js";
import { writeDictionary } from "./helpers.js";

// biome-ignore lint/suspicious/noExplicitAny: the tests read deep into the canonical JSON.
type Json = Record<string, any>;

const DICT = {
  "dictionary.yaml": `name: shop
description: Shop.
formatVersion: 1
locales: { default: en, supported: [fil, en] }
databases: [sqlite]
lookups: { defaultTtl: 2h }
`,
  "types/money.yaml": `domainType: Money
description: Money.
type: decimal
precision: 12
scale: 2
min: 0
displayFormat: { kind: currency, pattern: "¤#,##0.00", currency: PHP, symbols: { group: ",", decimal: "." } }
editFormat: { kind: number, grouping: false }
rules:
  - { expression: "dec.round(this, 2) == this", message: money.rounded }
`,
  "entities/order-line.yaml": `entity: OrderLine
description: A line.
primaryKey: id
fields:
  id:
    type: long
    generated: { kind: identity, noReuse: true }
    description: Key.
  orderId:
    type: guid
    required: true
    references: { entity: Order }
    description: Order.
  price:
    domain: Money
    max: 1000
    unique: true
    description: Price.
  status:
    type: string
    maxLength: 10
    default: Open
    description: Status.
  total:
    type: decimal
    precision: 14
    scale: 2
    computed: { source: application, expression: " dec.mul(price, 2) " }
    description: Total.
`,
  "entities/order.yaml": `entity: Order
description: An order.
dbName: Orders
apiName: purchase
primaryKey: id
fields:
  id:
    type: guid
    generated: uuid
    description: Key.
  customerName:
    type: string
    maxLength: 50
    dbName: CUST_NAME
    apiName: customer
    description: Customer.
  parentId:
    type: guid
    lookup: { entity: Order, value: id, display: customerName }
    description: Parent order.
`,
  "i18n/en.yaml": `orderLine.displayLabel: Line
orderLine.id.displayLabel: ID
orderLine.orderId.displayLabel: Order
orderLine.price.displayLabel: Price
orderLine.price.max: Price is too high.
orderLine.price.displayHint: Unit <b>price</b>.
orderLine.status.displayLabel: Status
orderLine.total.displayLabel: Total
order.displayLabel: Order
order.id.displayLabel: ID
order.customerName.displayLabel: Customer
order.parentId.displayLabel: Parent
money.min: Amounts cannot be negative.
money.rounded: Use whole centavos.
`,
  "i18n/fil.yaml": `orderLine.displayLabel: Linya
`,
};

describe("canonical build", () => {
  const result = build(writeDictionary(DICT, {}));
  const doc = result.document as Json;
  const line = doc.entities.OrderLine;
  const order = doc.entities.Order;

  it("builds without errors", () => {
    expect(result.errorCount).toBe(0);
    expect(result.version).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(doc.version).toBe(result.version);
  });

  it("writes dictionary-level defaults and sorted sets", () => {
    expect(doc.formatVersion).toBe(1);
    expect(doc.locales).toEqual({ default: "en", supported: ["en", "fil"] });
    expect(doc.lookupDefaults).toEqual({ ttlSeconds: 7200 });
    expect(doc.expressions).toEqual({ extensions: [] });
  });

  it("derives database and API names, and keeps overrides", () => {
    expect(line.dbName).toBe("OrderLine");
    expect(line.apiName).toBe("orderLine");
    expect(line.fields.orderId).toMatchObject({ dbName: "OrderId", apiName: "orderId" });
    expect(order).toMatchObject({ dbName: "Orders", apiName: "purchase" });
    expect(order.fields.customerName).toMatchObject({ dbName: "CUST_NAME", apiName: "customer" });
  });

  it("keeps the declared field order", () => {
    expect(line.fieldOrder).toEqual(["id", "orderId", "price", "status", "total"]);
    expect(line.primaryKey).toEqual(["id"]);
  });

  it("makes field defaults explicit", () => {
    expect(line.fields.orderId).toMatchObject({
      required: true,
      readOnly: "never",
      rules: [],
      validators: [],
    });
    expect(line.fields.status.default).toEqual({ value: "Open" });
  });

  it("normalizes generated keys and makes them read-only", () => {
    expect(line.fields.id).toMatchObject({
      generated: { kind: "identity", seed: 1, increment: 1, noReuse: true },
      readOnly: "always",
    });
    expect(order.fields.id).toMatchObject({ generated: { kind: "uuid" }, readOnly: "always" });
    expect(line.fields.orderId.generated).toBeUndefined();
  });

  it("inherits display and edit formats from the domain type, with edit defaults", () => {
    expect(line.fields.price.displayFormat).toEqual({
      kind: "currency",
      pattern: "¤#,##0.00",
      currency: "PHP",
      symbols: { group: ",", decimal: "." },
    });
    expect(line.fields.price.editFormat).toEqual({
      kind: "number",
      decimals: 2,
      grouping: false,
      allowNegative: true,
    });
  });

  it("expands domain types, letting field values win", () => {
    expect(line.fields.price).toMatchObject({
      domain: "Money",
      type: "decimal",
      precision: 12,
      scale: 2,
      min: 0,
      max: 1000,
    });
    expect(line.fields.price.rules).toEqual([
      {
        kind: "expression",
        expression: "dec.round(this, 2) == this",
        severity: "error",
        message: "money.rounded",
        code: "money.rounded",
      },
    ]);
  });

  it("resolves constraint messages: field key, then domain key, then framework", () => {
    expect(line.fields.price.messages).toEqual({
      type: "radd.type",
      min: "money.min",
      max: "orderLine.price.max",
      precision: "radd.precision",
      scale: "radd.scale",
    });
  });

  it("includes optional keys only when they exist in the default locale", () => {
    expect(line.fields.price.displayLabel).toBe("orderLine.price.displayLabel");
    expect(line.fields.price.displayHint).toBe("orderLine.price.displayHint");
    expect(line.fields.orderId.displayHint).toBeUndefined();
  });

  it("makes computed fields read-only and fills computed defaults", () => {
    expect(line.fields.total.readOnly).toBe("always");
    expect(line.fields.total.computed).toEqual({
      source: "application",
      expression: "dec.mul(price, 2)",
      persisted: true,
    });
  });

  it("adds foreign keys for references and reference lookups", () => {
    expect(line.fields.orderId.references).toEqual({
      entity: "Order",
      field: "id",
      onDelete: "restrict",
    });
    expect(order.fields.parentId.references).toEqual({
      entity: "Order",
      field: "id",
      onDelete: "restrict",
    });
    expect(order.fields.parentId.lookup).toEqual({
      entity: "Order",
      value: "id",
      display: "customerName",
      cache: "ttl",
      ttlSeconds: 7200,
      dependsOn: [],
      search: false,
    });
  });

  it("turns unique fields into named indexes", () => {
    expect(line.indexes).toEqual([
      { fields: ["price"], unique: true, dbName: "UX_OrderLine_Price" },
    ]);
  });

  it("carries messages for every supported locale, with framework messages for en", () => {
    expect(doc.messages.en["radd.required"]).toBe("{label} is required.");
    expect(doc.messages.en["orderLine.displayLabel"]).toBe("Line");
    expect(doc.messages.fil).toEqual({ "orderLine.displayLabel": "Linya" });
  });

  it("produces key-sorted JSON text with a trailing newline", () => {
    expect(result.json?.endsWith("}\n")).toBe(true);
    expect(Object.keys(JSON.parse(result.json as string))).toEqual(Object.keys(doc).sort());
  });
});

describe("build with errors", () => {
  it("returns diagnostics and no document", () => {
    const r = build(writeDictionary({ "dictionary.yaml": null }));
    expect(r.ok).toBe(false);
    expect(r.document).toBeUndefined();
    expect(r.json).toBeUndefined();
  });
});

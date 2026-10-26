import { describe, expect, it } from "vitest";
import { checkCall, scanCel } from "../src/cel.js";

const calls = (expr: string) => scanCel(expr).calls.map((c) => `${c.member ? "." : ""}${c.name}`);

describe("scanCel", () => {
  it("finds global, namespaced and member calls", () => {
    // ident.name(...) is reported qualified; checkCall decides whether it is a namespace or a receiver.
    expect(
      calls("isBlank(name) && dec.mul(quantity, unitPrice) > 0 && (a + b).endsWith('.ph')"),
    ).toEqual(["isBlank", "dec.mul", ".endsWith"]);
    expect(calls("email.endsWith('.ph')")).toEqual(["email.endsWith"]);
  });

  it("treats a call on a chained receiver as a member call", () => {
    expect(calls("customer.name.lowerAscii()")).toEqual([".lowerAscii"]);
  });

  it("ignores names inside string literals", () => {
    expect(calls(`"foo(" + 'bar(' + r"baz(" + """qux(""" == x`)).toEqual([]);
    expect(scanCel(`"a\\"b(" == x`).errors).toEqual([]);
  });

  it("reports unterminated strings and unbalanced brackets", () => {
    expect(scanCel("'abc == x").errors.map((e) => e.message)).toEqual([
      "Unterminated string literal.",
    ]);
    expect(scanCel("(a > b").errors.map((e) => e.message)).toEqual(["Unclosed '('."]);
    expect(scanCel("a > b)").errors.map((e) => e.message)).toEqual(["Unexpected ')'."]);
    expect(scanCel("[a, (b])").errors.length).toBeGreaterThan(0);
  });

  it("accepts CEL number forms", () => {
    expect(scanCel("x > 1000000.0 && y < 0x1F && z == 3u && w > 1e-3").errors).toEqual([]);
  });
});

describe("checkCall", () => {
  const none = new Set<string>();
  const call = (expr: string) => scanCel(expr).calls[0] as Parameters<typeof checkCall>[0];

  it("accepts standard functions, macros and RADD built-ins", () => {
    for (const e of [
      "size(x)",
      "has(a.b)",
      "x.all(i, i > 0)",
      "x.matches('a')",
      "newGuid()",
      "dec.round(x, 2)",
    ]) {
      expect(checkCall(call(e), none, none)).toEqual({ ok: true });
    }
  });

  it("rejects unknown functions and unknown dec.* functions", () => {
    expect(checkCall(call("foo(x)"), none, none)).toEqual({ ok: false, reason: "unknown" });
    expect(checkCall(call("dec.pow(x, 2)"), none, none)).toEqual({ ok: false, reason: "unknown" });
    expect(checkCall(call("x.frobnicate()"), none, none)).toEqual({ ok: false, reason: "unknown" });
  });

  it("requires the extension a function belongs to", () => {
    expect(checkCall(call("x.lowerAscii()"), none, none)).toEqual({
      ok: false,
      reason: "extension",
      extension: "strings",
    });
    expect(checkCall(call("x.lowerAscii()"), new Set(["strings"]), none)).toEqual({ ok: true });
    expect(checkCall(call("math.greatest(a, b)"), none, none)).toEqual({
      ok: false,
      reason: "extension",
      extension: "math",
    });
  });

  it("accepts declared custom functions, namespaced or not", () => {
    const declared = new Set(["isWeekday", "geo.distance"]);
    expect(checkCall(call("isWeekday(d)"), none, declared)).toEqual({ ok: true });
    expect(checkCall(call("geo.distance(a, b)"), none, declared)).toEqual({ ok: true });
    expect(checkCall(call("geo.area(a)"), none, declared)).toEqual({
      ok: false,
      reason: "unknown",
    });
  });
});

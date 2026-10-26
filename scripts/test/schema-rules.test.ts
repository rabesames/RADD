import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { compileSchema, OUT_DIR, outputName, SRC_DIR } from "../schema-rules.mjs";

const id = (name: string) =>
  `https://raw.githubusercontent.com/rabesames/RADD/main/schema/v1/${name}.schema.json`;

describe("compileSchema", () => {
  it("drops comments and names the source in $comment, after $id", () => {
    const text = [
      "// A test schema.",
      "{",
      '  "$schema": "https://json-schema.org/draft/2020-12/schema",',
      `  "$id": "${id("thing")}",`,
      "  /* Block comment. */",
      '  "type": "object" // trailing comment',
      "}",
    ].join("\n");
    const result = compileSchema(text, "thing.schema.jsonc");
    expect(result).toEqual({
      json: `${JSON.stringify(
        {
          $schema: "https://json-schema.org/draft/2020-12/schema",
          $id: id("thing"),
          $comment:
            "Generated from schema/src/thing.schema.jsonc by npm run schema:build. Do not edit.",
          type: "object",
        },
        null,
        2,
      )}\n`,
    });
  });

  it("reports syntax errors with line and column", () => {
    const result = compileSchema(
      `{\n  "$id": "${id("thing")}",\n  "type": "object",\n}`,
      "thing.schema.jsonc",
    );
    expect(result).toHaveProperty("errors");
    expect((result as { errors: string[] }).errors[0]).toBe(
      "thing.schema.jsonc:4:1: PropertyNameExpected",
    );
  });

  it("requires the $id to match the published file", () => {
    const result = compileSchema(`{ "$id": "${id("other")}" }`, "thing.schema.jsonc");
    expect(result).toEqual({ errors: [`thing.schema.jsonc: $id must be ${id("thing")}`] });
  });

  it("names the output file", () => {
    expect(outputName("domain-type.schema.jsonc")).toBe("domain-type.schema.json");
  });
});

describe("schema/v1", () => {
  const sources = readdirSync(SRC_DIR).filter((n) => n.endsWith(".schema.jsonc"));

  it("has one generated file per source and nothing else", () => {
    expect(readdirSync(OUT_DIR).sort()).toEqual(sources.map(outputName).sort());
  });

  it.each(sources)("%s is in sync (run npm run schema:build)", (name) => {
    const result = compileSchema(readFileSync(join(SRC_DIR, name), "utf8"), name);
    expect(result).toHaveProperty("json");
    const committed = readFileSync(join(OUT_DIR, outputName(name)), "utf8").replaceAll(
      "\r\n",
      "\n",
    );
    expect(committed).toBe((result as { json: string }).json);
  });
});

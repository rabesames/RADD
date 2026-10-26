import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { BASE, writeDictionary } from "../../core/test/helpers.js";
import { EXIT_LINT_ERRORS, EXIT_OK, EXIT_USAGE, main } from "../src/main.js";

async function run(args: string[], cwd: string) {
  let stdout = "";
  let stderr = "";
  const code = await main(["node", "radd", ...args], {
    cwd,
    stdout: (t) => {
      stdout += t;
    },
    stderr: (t) => {
      stderr += t;
    },
  });
  return { code, stdout, stderr };
}

const broken = {
  "entities/item.yaml": (BASE["entities/item.yaml"] as string).replace(
    "primaryKey: id",
    "primaryKey: ident",
  ),
};

describe("radd lint", () => {
  it("exits 0 and says so for a clean dictionary", async () => {
    const dir = writeDictionary();
    const r = await run(["lint", "."], dir);
    expect(r).toMatchObject({ code: EXIT_OK, stdout: "No problems found.\n" });
  });

  it("exits 1 and prints file:line:column, severity, code and message", async () => {
    const dir = writeDictionary(broken);
    const r = await run(["lint", dir], dir);
    expect(r.code).toBe(EXIT_LINT_ERRORS);
    expect(r.stdout).toContain(
      "entities/item.yaml:3:13  error  RADD204  Primary key 'ident' is not a field of Item.",
    );
    expect(r.stdout).toContain("1 error, 0 warnings");
  });

  it("prints file paths relative to the working directory", async () => {
    const dir = writeDictionary(broken);
    const r = await run(["lint", basename(dir)], dirname(dir));
    expect(r.stdout).toContain(`${basename(dir)}/entities/item.yaml:3:13  error  RADD204`);
  });

  it("prints JSON with --json", async () => {
    const dir = writeDictionary(broken);
    const r = await run(["lint", ".", "--json"], dir);
    expect(r.code).toBe(EXIT_LINT_ERRORS);
    const out = JSON.parse(r.stdout);
    expect(out).toMatchObject({ ok: false, errorCount: 1, warningCount: 0 });
    expect(out.diagnostics[0]).toMatchObject({
      code: "RADD204",
      rule: "unknown-field",
      severity: "error",
      file: "entities/item.yaml",
      line: 3,
      column: 13,
      path: "/primaryKey",
    });
  });

  it("exits 2 for a missing folder, in text and JSON", async () => {
    const dir = writeDictionary();
    expect(await run(["lint", "nope"], dir)).toMatchObject({
      code: EXIT_USAGE,
      stderr: "radd: Dictionary folder 'nope' not found.\n",
    });
    const json = await run(["lint", "nope", "--json"], dir);
    expect(json.code).toBe(EXIT_USAGE);
    expect(JSON.parse(json.stdout)).toEqual({
      ok: false,
      error: "Dictionary folder 'nope' not found.",
    });
  });

  it("exits 2 for an unknown command", async () => {
    expect((await run(["frob"], writeDictionary())).code).toBe(EXIT_USAGE);
  });
});

describe("radd build", () => {
  it("writes the canonical JSON next to the dictionary by default", async () => {
    // Nest the dictionary so the default output lands inside this test's temporary folder.
    const nested = Object.fromEntries(Object.entries(BASE).map(([k, v]) => [`dictionary/${k}`, v]));
    const project = writeDictionary(nested, {});
    const r = await run(["build"], project);
    expect(r.code).toBe(EXIT_OK);
    const out = join(project, ".radd", "dictionary.json");
    const doc = JSON.parse(readFileSync(out, "utf8"));
    expect(r.stdout).toContain(`Version ${doc.version}`);
  });

  it("writes to --out and reports version and path with --json", async () => {
    const dir = writeDictionary();
    const r = await run(["build", ".", "--out", "out/dict.json", "--json"], dir);
    expect(r.code).toBe(EXIT_OK);
    const result = JSON.parse(r.stdout);
    expect(result).toMatchObject({ ok: true, errorCount: 0, out: "out/dict.json" });
    expect(result.version).toMatch(/^sha256:[0-9a-f]{64}$/);
    const text = readFileSync(join(dir, "out", "dict.json"), "utf8");
    expect(JSON.parse(text).version).toBe(result.version);
    expect(text.endsWith("\n")).toBe(true);
  });

  it("writes nothing and exits 1 when lint has errors", async () => {
    const dir = writeDictionary(broken);
    const r = await run(["build", ".", "--out", "out.json"], dir);
    expect(r.code).toBe(EXIT_LINT_ERRORS);
    expect(r.stdout).toContain("Nothing written");
    expect(existsSync(join(dir, "out.json"))).toBe(false);
  });
});

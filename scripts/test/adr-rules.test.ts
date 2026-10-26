import { describe, expect, it } from "vitest";
import { checkImmutability, checkIndex, parseAdr } from "../adr-rules.mjs";

function adr(
  n: string,
  status: string,
  opts: { supersedes?: string; supersededBy?: string; body?: string; title?: string } = {},
) {
  return [
    `# ADR-${n}: ${opts.title ?? `Decision ${n}`}`,
    "",
    `- Status: ${status}`,
    "- Date: 2026-10-26",
    "- Deciders: Rommel",
    ...(opts.supersedes ? [`- Supersedes: ${opts.supersedes}`] : []),
    ...(opts.supersededBy ? [`- Superseded by: ${opts.supersededBy}`] : []),
    "",
    "## Context",
    "",
    opts.body ?? "Some context.",
    "",
  ].join("\n");
}

const files = (entries: Record<string, string>) => new Map(Object.entries(entries));

describe("parseAdr", () => {
  it("reads the title and header lines", () => {
    expect(parseAdr(adr("0003", "Hardened", { supersedes: "ADR-0001, ADR-0002" }))).toEqual({
      number: "ADR-0003",
      title: "Decision 0003",
      status: "Hardened",
      date: "2026-10-26",
      supersedes: ["ADR-0001", "ADR-0002"],
      supersededBy: [],
    });
  });

  it("rejects an unknown status", () => {
    expect(parseAdr(adr("0001", "Final"))).toMatch(/Status must be one of/);
  });
});

describe("checkImmutability", () => {
  it("allows any change to Proposed and Accepted ADRs", () => {
    for (const status of ["Proposed", "Accepted"]) {
      const base = files({ "ADR-0001.md": adr("0001", status) });
      const head = files({ "ADR-0001.md": adr("0001", "Hardened", { body: "Rewritten." }) });
      expect(checkImmutability(base, head)).toEqual([]);
    }
  });

  it("blocks deleting any ADR", () => {
    const base = files({ "ADR-0001.md": adr("0001", "Proposed") });
    expect(checkImmutability(base, files({}))).toEqual([
      "ADR-0001.md: ADRs are never deleted; mark it Superseded or Obsolete instead.",
    ]);
  });

  it("blocks editing the body of a Hardened ADR", () => {
    const base = files({ "ADR-0001.md": adr("0001", "Hardened") });
    const head = files({ "ADR-0001.md": adr("0001", "Hardened", { body: "Changed." }) });
    expect(checkImmutability(base, head)).toEqual([
      "ADR-0001.md: a Hardened ADR can only change its status to Superseded or Obsolete; found 'Hardened'.",
    ]);
  });

  it("blocks moving a Hardened ADR back to Accepted", () => {
    const base = files({ "ADR-0001.md": adr("0001", "Hardened") });
    const head = files({ "ADR-0001.md": adr("0001", "Accepted") });
    expect(checkImmutability(base, head)).toHaveLength(1);
  });

  it("allows Hardened to Superseded when the replacement names it", () => {
    const base = files({ "ADR-0001.md": adr("0001", "Hardened") });
    const head = files({
      "ADR-0001.md": adr("0001", "Superseded", { supersededBy: "ADR-0002" }),
      "ADR-0002.md": adr("0002", "Proposed", { supersedes: "ADR-0001" }),
    });
    expect(checkImmutability(base, head)).toEqual([]);
  });

  it("blocks Superseded when the replacement does not list it under Supersedes", () => {
    const base = files({ "ADR-0001.md": adr("0001", "Hardened") });
    const head = files({
      "ADR-0001.md": adr("0001", "Superseded", { supersededBy: "ADR-0002" }),
      "ADR-0002.md": adr("0002", "Proposed"),
    });
    expect(checkImmutability(base, head)).toEqual([
      "ADR-0001.md: ADR-0002 must list ADR-0001 under Supersedes.",
    ]);
  });

  it("blocks Superseded by an ADR that does not exist", () => {
    const base = files({ "ADR-0001.md": adr("0001", "Hardened") });
    const head = files({ "ADR-0001.md": adr("0001", "Superseded", { supersededBy: "ADR-0009" }) });
    expect(checkImmutability(base, head)).toEqual([
      "ADR-0001.md: Superseded by names ADR-0009, which does not exist in this branch.",
    ]);
  });

  it("blocks Superseded without a Superseded by line", () => {
    const base = files({ "ADR-0001.md": adr("0001", "Hardened") });
    const head = files({ "ADR-0001.md": adr("0001", "Superseded") });
    expect(checkImmutability(base, head)).toEqual([
      "ADR-0001.md: a Superseded ADR needs a 'Superseded by' line naming its replacement.",
    ]);
  });

  it("allows Hardened to Obsolete, with or without a Superseded by line", () => {
    const base = files({ "ADR-0001.md": adr("0001", "Hardened") });
    expect(checkImmutability(base, files({ "ADR-0001.md": adr("0001", "Obsolete") }))).toEqual([]);
    const head = files({
      "ADR-0001.md": adr("0001", "Obsolete", { supersededBy: "ADR-0002" }),
      "ADR-0002.md": adr("0002", "Accepted"),
    });
    expect(checkImmutability(base, head)).toEqual([]);
  });

  it("blocks a body change made together with the status change", () => {
    const base = files({ "ADR-0001.md": adr("0001", "Hardened") });
    const head = files({ "ADR-0001.md": adr("0001", "Obsolete", { body: "Sneaky edit." }) });
    expect(checkImmutability(base, head)).toEqual([
      "ADR-0001.md: only the Status and Superseded by lines of a Hardened ADR may change.",
    ]);
  });

  it("blocks any change to Superseded, Obsolete and Rejected ADRs", () => {
    for (const status of ["Superseded", "Obsolete", "Rejected"]) {
      const base = files({ "ADR-0001.md": adr("0001", status) });
      const head = files({ "ADR-0001.md": adr("0001", status, { body: "Edited." }) });
      expect(checkImmutability(base, head)).toEqual([
        `ADR-0001.md: a ${status} ADR cannot change.`,
      ]);
    }
  });

  it("ignores line-ending differences", () => {
    const text = adr("0001", "Hardened");
    const base = files({ "ADR-0001.md": text });
    const head = files({ "ADR-0001.md": text.replaceAll("\n", "\r\n") });
    expect(checkImmutability(base, head)).toEqual([]);
  });
});

describe("checkIndex", () => {
  const index = (rows: string[]) =>
    [
      "# Architecture decision records",
      "",
      "| ADR | Title | Status | Date | Links |",
      "| --- | --- | --- | --- | --- |",
      ...rows,
      "",
    ].join("\n");

  it("passes when the index matches the files", () => {
    const f = files({
      "README.md": index(["| [ADR-0001](ADR-0001.md) | Decision 0001 | Accepted | 2026-10-26 | |"]),
      "ADR-0001.md": adr("0001", "Accepted"),
      "template.md": "# ADR-NNNN: Title",
    });
    expect(checkIndex(f)).toEqual([]);
  });

  it("reports missing rows, extra rows, and title or status mismatches", () => {
    const f = files({
      "README.md": index([
        "| [ADR-0001](ADR-0001.md) | Old title | Proposed | 2026-10-26 | |",
        "| [ADR-0003](ADR-0003.md) | Gone | Accepted | 2026-10-26 | |",
      ]),
      "ADR-0001.md": adr("0001", "Accepted"),
      "ADR-0002.md": adr("0002", "Accepted"),
    });
    expect(checkIndex(f)).toEqual([
      "README.md: ADR-0001 title is 'Old title' but the ADR says 'Decision 0001'.",
      "README.md: ADR-0001 status is 'Proposed' but the ADR says 'Accepted'.",
      "README.md: ADR-0002 is missing from the index.",
      "README.md: the index lists ADR-0003, but ADR-0003.md does not exist.",
    ]);
  });

  it("reports badly named files and dangling references", () => {
    const f = files({
      "README.md": index(["| [ADR-0001](ADR-0001.md) | Decision 0001 | Accepted | 2026-10-26 | |"]),
      "ADR-0001.md": adr("0001", "Accepted", { supersedes: "ADR-0007" }),
      "adr-2.md": "x",
    });
    expect(checkIndex(f)).toEqual([
      "ADR-0001.md: refers to ADR-0007, which does not exist.",
      "adr-2.md: ADR files are named ADR-NNNN.md.",
    ]);
  });
});

import { describe, expect, it } from "vitest";
import { checkDatePattern, checkHintHtml, checkMask, checkNumberPattern } from "../src/formats.js";

describe("checkNumberPattern", () => {
  it.each([
    "#,##0.00",
    "0.0%",
    "¤#,##0.00",
    "#,##0.00;(#,##0.00)",
    "0.00E0",
    "@@#",
    "#",
    "0",
    "##0.0#",
    "PHP #,##0",
    "#,##0 'pcs'",
  ])("accepts %s", (p) => {
    expect(checkNumberPattern(p)).toBeUndefined();
  });

  it.each([
    ["#.##0", "is not an ICU number pattern"],
    ["0#.00", "is not an ICU number pattern"],
    ["#,,0", "misplaced grouping separator"],
    ["abc", "has no digits"],
    ["0;0;0", "more than one ';'"],
    ["'0.00", "unterminated quote"],
  ])("rejects %s", (p, problem) => {
    expect(checkNumberPattern(p)).toContain(problem);
  });
});

describe("checkDatePattern", () => {
  it.each(["yyyy-MM-dd", "h:mm a", "EEEE, d MMMM y", "yyyy-MM-dd 'at' HH:mm", "HH:mm:ss.SSS"])(
    "accepts %s",
    (p) => {
      expect(checkDatePattern(p)).toBeUndefined();
    },
  );

  it("rejects unquoted literal letters, missing fields and open quotes", () => {
    expect(checkDatePattern("yyyy-MM-dd at HH:mm")).toContain(
      "'t' is not an ICU date pattern letter",
    );
    expect(checkDatePattern("--")).toBe("it has no date or time fields");
    expect(checkDatePattern("yyyy 'at")).toBe("it has an unterminated quote");
  });
});

describe("checkMask", () => {
  it("needs at least one placeholder", () => {
    expect(checkMask("0000-000-0000")).toBeUndefined();
    expect(checkMask("AA-***")).toBeUndefined();
    expect(checkMask("---")).toContain("no placeholders");
  });
});

describe("checkHintHtml", () => {
  it("accepts the allowlisted tags and https links", () => {
    expect(
      checkHintHtml(
        'Max <b>credit</b>.<br/><ul><li><em>a</em></li></ul> See <a href="https://x.ph">docs</a>.',
      ),
    ).toEqual([]);
  });

  it("treats '<' followed by a space as text", () => {
    expect(checkHintHtml("a < b and c > d")).toEqual([]);
  });

  it.each([
    ["<script>x</script>", "<script> is not allowed"],
    ["<img src=x>", "<img> is not allowed"],
    ['<b onclick="x">y</b>', "<b> cannot have attributes"],
    ['<a href="javascript:x">y</a>', "<a href> must be an https link"],
    ['<a href="https://x" target="_blank">y</a>', "<a> may only have an href attribute"],
    ["<!-- hidden -->", "HTML comments are not allowed"],
    ["text <b", "a tag is not closed with '>'"],
  ])("rejects %s", (html, problem) => {
    expect(checkHintHtml(html)).toEqual([problem]);
  });
});

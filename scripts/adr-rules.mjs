// @ts-check
/**
 * Rules for architecture decision records (see docs/implementation-plan.md, "Standard:
 * architecture decision records"). Pure functions over file contents, so they can be tested
 * without git.
 */

export const STATUSES = ["Proposed", "Accepted", "Hardened", "Rejected", "Superseded", "Obsolete"];
const FROZEN = new Set(["Superseded", "Obsolete", "Rejected"]);
const FILE_NAME = /^ADR-(\d{4})\.md$/;

/**
 * @typedef {{ number: string, title: string, status: string, date: string,
 *   supersedes: string[], supersededBy: string[] }} Adr
 */

/** @param {string} line */
function listValue(line) {
  return line
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter((s) => /^ADR-\d{4}$/.test(s));
}

/**
 * Parses an ADR's title and header lines.
 * @param {string} text
 * @returns {Adr | string} the ADR, or an error message
 */
export function parseAdr(text) {
  const lines = text.replaceAll("\r\n", "\n").split("\n");
  const title = /^# (ADR-\d{4}): (.+)$/.exec(lines[0] ?? "");
  if (!title) return "The first line must be '# ADR-NNNN: Title'.";
  /** @type {Record<string, string>} */
  const fields = {};
  for (const line of lines.slice(1)) {
    const m = /^- (Status|Date|Deciders|Supersedes|Superseded by): (.*)$/.exec(line);
    if (m) fields[m[1] ?? ""] = (m[2] ?? "").trim();
    if (line.startsWith("## ")) break;
  }
  const status = fields.Status ?? "";
  if (!STATUSES.includes(status))
    return `Status must be one of ${STATUSES.join(", ")}; found '${status}'.`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fields.Date ?? "")) return "Date must be YYYY-MM-DD.";
  return {
    number: title[1] ?? "",
    title: (title[2] ?? "").trim(),
    status,
    date: fields.Date ?? "",
    supersedes: listValue(fields.Supersedes ?? ""),
    supersededBy: listValue(fields["Superseded by"] ?? ""),
  };
}

/** Removes the lines a Hardened ADR may change: Status and Superseded by. */
function withoutMutableLines(/** @type {string} */ text) {
  return text
    .replaceAll("\r\n", "\n")
    .split("\n")
    .filter((l) => !/^- (Status|Superseded by): /.test(l))
    .join("\n");
}

/**
 * Checks that a change from `base` to `head` respects ADR immutability.
 * @param {Map<string, string>} base ADR files on the base branch, by file name
 * @param {Map<string, string>} head ADR files on the head branch, by file name
 * @returns {string[]} violations
 */
export function checkImmutability(base, head) {
  /** @type {string[]} */
  const errors = [];
  for (const [file, before] of base) {
    if (!FILE_NAME.test(file)) continue;
    const after = head.get(file);
    if (after === undefined) {
      errors.push(`${file}: ADRs are never deleted; mark it Superseded or Obsolete instead.`);
      continue;
    }
    if (after.replaceAll("\r\n", "\n") === before.replaceAll("\r\n", "\n")) continue;
    const old = parseAdr(before);
    if (typeof old === "string") continue;
    if (FROZEN.has(old.status)) {
      errors.push(`${file}: a ${old.status} ADR cannot change.`);
      continue;
    }
    if (old.status !== "Hardened") continue;
    const now = parseAdr(after);
    if (typeof now === "string") {
      errors.push(`${file}: a Hardened ADR cannot change (${now}).`);
      continue;
    }
    if (now.status !== "Superseded" && now.status !== "Obsolete") {
      errors.push(
        `${file}: a Hardened ADR can only change its status to Superseded or Obsolete; found '${now.status}'.`,
      );
      continue;
    }
    if (withoutMutableLines(before) !== withoutMutableLines(after)) {
      errors.push(`${file}: only the Status and Superseded by lines of a Hardened ADR may change.`);
      continue;
    }
    if (now.status === "Superseded" && now.supersededBy.length === 0) {
      errors.push(`${file}: a Superseded ADR needs a 'Superseded by' line naming its replacement.`);
    }
    for (const by of now.supersededBy) {
      const replacement = head.get(`${by}.md`);
      if (replacement === undefined) {
        errors.push(`${file}: Superseded by names ${by}, which does not exist in this branch.`);
        continue;
      }
      const r = parseAdr(replacement);
      if (
        now.status === "Superseded" &&
        (typeof r === "string" || !r.supersedes.includes(now.number))
      ) {
        errors.push(`${file}: ${by} must list ${now.number} under Supersedes.`);
      }
    }
  }
  return errors;
}

/**
 * Parses the index table in docs/adr/README.md.
 * @param {string} text
 * @returns {Map<string, { title: string, status: string }>}
 */
export function parseIndex(text) {
  const rows = new Map();
  for (const line of text.replaceAll("\r\n", "\n").split("\n")) {
    const m = /^\| \[(ADR-\d{4})\]\(\1\.md\) \| (.+?) \| (\w+) \| /.exec(line);
    if (m) rows.set(m[1] ?? "", { title: (m[2] ?? "").trim(), status: m[3] ?? "" });
  }
  return rows;
}

/**
 * Checks that every ADR file is well formed and that the index lists exactly the ADRs, with
 * matching titles and statuses.
 * @param {Map<string, string>} files ADR files by file name, including README.md
 * @returns {string[]} violations
 */
export function checkIndex(files) {
  /** @type {string[]} */
  const errors = [];
  const indexText = files.get("README.md");
  if (indexText === undefined) return ["docs/adr/README.md (the index) is missing."];
  const index = parseIndex(indexText);
  const seen = new Set();
  for (const [file, text] of files) {
    if (file === "README.md" || file === "template.md") continue;
    const name = FILE_NAME.exec(file);
    if (!name) {
      errors.push(`${file}: ADR files are named ADR-NNNN.md.`);
      continue;
    }
    const adr = parseAdr(text);
    if (typeof adr === "string") {
      errors.push(`${file}: ${adr}`);
      continue;
    }
    const number = `ADR-${name[1]}`;
    seen.add(number);
    if (adr.number !== number) errors.push(`${file}: the title says ${adr.number}.`);
    const row = index.get(number);
    if (!row) errors.push(`README.md: ${number} is missing from the index.`);
    else {
      if (row.title !== adr.title)
        errors.push(
          `README.md: ${number} title is '${row.title}' but the ADR says '${adr.title}'.`,
        );
      if (row.status !== adr.status)
        errors.push(
          `README.md: ${number} status is '${row.status}' but the ADR says '${adr.status}'.`,
        );
    }
    for (const ref of [...adr.supersedes, ...adr.supersededBy]) {
      if (!files.has(`${ref}.md`)) errors.push(`${file}: refers to ${ref}, which does not exist.`);
    }
  }
  for (const number of index.keys()) {
    if (!seen.has(number))
      errors.push(`README.md: the index lists ${number}, but ${number}.md does not exist.`);
  }
  return errors;
}

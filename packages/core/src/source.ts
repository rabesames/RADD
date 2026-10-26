import {
  type Document,
  isAlias,
  isMap,
  isNode,
  isPair,
  isScalar,
  isSeq,
  LineCounter,
  type Node,
  parseDocument,
  visit,
} from "yaml";
import type { PathSegment, PendingDiagnostic } from "./diagnostics.js";

export type FileKind =
  | "dictionary"
  | "entity"
  | "domainType"
  | "lookup"
  | "validators"
  | "calculators"
  | "functions"
  | "i18n";

/** One parsed YAML file of a dictionary. */
export interface SourceFile {
  /** Path relative to the dictionary folder, with forward slashes. */
  path: string;
  kind: FileKind;
  /** For i18n files, the locale. */
  locale?: string;
  doc: Document;
  lineCounter: LineCounter;
  /** The file's content as plain data. */
  data: unknown;
  /** False when the file has YAML or schema errors; such files are left out of semantic checks. */
  valid: boolean;
}

/**
 * Parses YAML 1.2 (core schema) and reports RADD101 for syntax errors, duplicate keys and
 * the features RADD does not allow: anchors, aliases, merge keys and explicit tags.
 */
export function parseYaml(
  path: string,
  kind: FileKind,
  text: string,
  locale?: string,
): { file: SourceFile; diagnostics: PendingDiagnostic[] } {
  const lineCounter = new LineCounter();
  const doc = parseDocument(text, {
    lineCounter,
    version: "1.2",
    schema: "core",
    merge: false,
    uniqueKeys: true,
    prettyErrors: false,
  });
  const diagnostics: PendingDiagnostic[] = [];
  const offsets: { offset: number; message: string }[] = [];

  for (const e of [...doc.errors, ...doc.warnings]) {
    offsets.push({ offset: e.pos[0], message: firstLine(e.message) });
  }
  visit(doc, {
    Alias(_, node) {
      offsets.push({
        offset: node.range?.[0] ?? 0,
        message: "YAML aliases are not allowed; write the value out.",
      });
    },
    Node(_, node) {
      if (node.anchor) {
        offsets.push({
          offset: node.range?.[0] ?? 0,
          message: `YAML anchors are not allowed (&${node.anchor}); use a domain type to share definitions.`,
        });
      }
      if (node.tag && !isAlias(node)) {
        offsets.push({
          offset: node.range?.[0] ?? 0,
          message: `YAML tags are not allowed (${node.tag}).`,
        });
      }
    },
    Pair(_, pair) {
      if (isScalar(pair.key) && pair.key.value === "<<") {
        offsets.push({
          offset: pair.key.range?.[0] ?? 0,
          message: "YAML merge keys (<<) are not allowed; write the properties out.",
        });
      }
    },
  });

  const file: SourceFile = {
    path,
    kind,
    doc,
    lineCounter,
    data: offsets.length === 0 ? doc.toJS() : undefined,
    valid: offsets.length === 0,
    ...(locale !== undefined ? { locale } : {}),
  };
  for (const o of offsets) {
    const pos = lineCounter.linePos(o.offset);
    diagnostics.push({
      code: "RADD101",
      message: o.message,
      file: path,
      line: pos.line,
      column: pos.col,
    });
  }
  return { file, diagnostics };
}

function firstLine(s: string): string {
  return (s.split("\n")[0] ?? s).trim();
}

/**
 * Finds the line and column for a path in a file. When the path does not exist in full,
 * the deepest existing node is used. With `atKey`, the key of the last segment is used.
 */
export function locate(
  file: SourceFile,
  path: readonly PathSegment[],
  atKey = false,
): { line: number; column: number } {
  let node: unknown = file.doc.contents;
  let offset = rangeStart(node) ?? 0;
  for (let i = 0; i < path.length; i++) {
    const seg = path[i];
    const last = i === path.length - 1;
    if (isMap(node)) {
      const pair = node.items.find(
        (p) => isPair(p) && isScalar(p.key) && String(p.key.value) === String(seg),
      );
      if (!pair) break;
      if (last && atKey) {
        offset = rangeStart(pair.key) ?? offset;
        break;
      }
      node = pair.value;
      offset = rangeStart(node) ?? rangeStart(pair.key) ?? offset;
    } else if (isSeq(node) && typeof seg === "number") {
      const item = node.items[seg];
      if (item === undefined) break;
      node = item;
      offset = rangeStart(node) ?? offset;
    } else {
      break;
    }
  }
  const pos = file.lineCounter.linePos(offset);
  return { line: pos.line, column: pos.col };
}

function rangeStart(node: unknown): number | undefined {
  return isNode(node) ? (node as Node).range?.[0] : undefined;
}

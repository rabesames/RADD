/**
 * A small CEL lexer used by lint until the stage 2 library pick: it finds lexical errors and
 * function calls, which is enough to check function references and the declared subset.
 * It does not parse, resolve identifiers or type-check.
 */

export type CelExtension = "strings" | "math" | "lists" | "sets" | "encoders";

/** Standard CEL global functions and macros. */
const STANDARD_GLOBALS = new Set([
  "has",
  "size",
  "int",
  "uint",
  "double",
  "string",
  "bytes",
  "bool",
  "type",
  "dyn",
  "duration",
  "timestamp",
  "matches",
]);

/** Standard CEL member functions and macros. */
const STANDARD_MEMBERS = new Set([
  "contains",
  "startsWith",
  "endsWith",
  "matches",
  "size",
  "all",
  "exists",
  "exists_one",
  "map",
  "filter",
  "getFullYear",
  "getMonth",
  "getDayOfYear",
  "getDayOfMonth",
  "getDate",
  "getDayOfWeek",
  "getHours",
  "getMinutes",
  "getSeconds",
  "getMilliseconds",
]);

/** Functions every RADD runtime provides. */
export const RADD_BUILTINS = new Set([
  "isBlank",
  "newGuid",
  "dec.add",
  "dec.sub",
  "dec.mul",
  "dec.eq",
  "dec.round",
]);

const EXTENSION_GLOBALS: Record<CelExtension, string[]> = {
  strings: ["strings.quote"],
  math: [
    "math.greatest",
    "math.least",
    "math.ceil",
    "math.floor",
    "math.round",
    "math.trunc",
    "math.abs",
    "math.sign",
    "math.isInf",
    "math.isNaN",
    "math.isFinite",
    "math.sqrt",
    "math.bitAnd",
    "math.bitOr",
    "math.bitXor",
    "math.bitNot",
    "math.bitShiftLeft",
    "math.bitShiftRight",
  ],
  lists: ["lists.range"],
  sets: ["sets.contains", "sets.equivalent", "sets.intersects"],
  encoders: ["base64.encode", "base64.decode"],
};

const EXTENSION_MEMBERS: Record<CelExtension, string[]> = {
  strings: [
    "charAt",
    "indexOf",
    "lastIndexOf",
    "lowerAscii",
    "upperAscii",
    "replace",
    "split",
    "substring",
    "trim",
    "join",
    "format",
    "reverse",
  ],
  math: [],
  lists: ["slice", "flatten", "distinct", "reverse", "sort", "sortBy", "first", "last"],
  sets: [],
  encoders: [],
};

export interface CelCall {
  /** Function name; namespaced functions include the namespace (dec.mul). */
  name: string;
  /** True for a receiver-style call (value.contains(...)). */
  member: boolean;
  offset: number;
}

export interface CelScan {
  calls: CelCall[];
  errors: { offset: number; message: string }[];
}

type Token = { kind: "ident" | "punct" | "other"; text: string; offset: number };

export function scanCel(source: string): CelScan {
  const tokens: Token[] = [];
  const errors: CelScan["errors"] = [];
  const brackets: { ch: string; offset: number }[] = [];
  const closers: Record<string, string> = { ")": "(", "]": "[", "}": "{" };
  let i = 0;
  while (i < source.length) {
    const ch = source.charAt(i);
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    // String and bytes literals, with optional r/b prefixes and triple quotes.
    const prefix = /^[rRbB]{0,2}(?=["'])/.exec(source.slice(i))?.[0] ?? "";
    const q = source.charAt(i + prefix.length);
    if ((q === '"' || q === "'") && (prefix === "" || !/[A-Za-z0-9_]/.test(source.charAt(i - 1)))) {
      const start = i;
      const raw = /r/i.test(prefix);
      i += prefix.length;
      const triple = source.startsWith(q.repeat(3), i);
      const delim = triple ? q.repeat(3) : q;
      i += delim.length;
      let closed = false;
      while (i < source.length) {
        if (!raw && source.charAt(i) === "\\") {
          i += 2;
          continue;
        }
        if (source.startsWith(delim, i)) {
          i += delim.length;
          closed = true;
          break;
        }
        if (!triple && source.charAt(i) === "\n") break;
        i++;
      }
      if (!closed) errors.push({ offset: start, message: "Unterminated string literal." });
      tokens.push({ kind: "other", text: "string", offset: start });
      continue;
    }
    const ident = /^[A-Za-z_][A-Za-z0-9_]*/.exec(source.slice(i));
    if (ident) {
      tokens.push({ kind: "ident", text: ident[0], offset: i });
      i += ident[0].length;
      continue;
    }
    const num =
      /^(0x[0-9a-fA-F]+u?|[0-9]+(\.[0-9]+)?([eE][+-]?[0-9]+)?u?|\.[0-9]+([eE][+-]?[0-9]+)?)/.exec(
        source.slice(i),
      );
    if (num) {
      tokens.push({ kind: "other", text: num[0], offset: i });
      i += num[0].length;
      continue;
    }
    if ("([{".includes(ch)) brackets.push({ ch, offset: i });
    if (")]}".includes(ch)) {
      const open = brackets.pop();
      if (!open || open.ch !== closers[ch]) {
        errors.push({ offset: i, message: `Unexpected '${ch}'.` });
        if (open) brackets.push(open);
      }
    }
    const op = /^(&&|\|\||==|!=|<=|>=|[-+*/%!<>?:.,()[\]{}])/.exec(source.slice(i));
    if (!op) {
      errors.push({ offset: i, message: `Unexpected character '${ch}'.` });
      i++;
      continue;
    }
    tokens.push({ kind: "punct", text: op[0], offset: i });
    i += op[0].length;
  }
  for (const b of brackets) errors.push({ offset: b.offset, message: `Unclosed '${b.ch}'.` });

  const calls: CelCall[] = [];
  for (let t = 0; t < tokens.length; t++) {
    const tok = tokens[t];
    if (tok?.kind !== "ident" || tokens[t + 1]?.text !== "(") continue;
    const prev = tokens[t - 1];
    if (prev?.text === ".") {
      // a.b( : a namespaced function when a is a bare identifier, else a member call.
      const ns = tokens[t - 2];
      const beforeNs = tokens[t - 3];
      const qualified =
        ns?.kind === "ident" && beforeNs?.text !== "." ? `${ns.text}.${tok.text}` : undefined;
      calls.push(
        qualified
          ? { name: qualified, member: false, offset: ns?.offset ?? tok.offset }
          : { name: tok.text, member: true, offset: tok.offset },
      );
    } else {
      calls.push({ name: tok.text, member: false, offset: tok.offset });
    }
  }
  return { calls, errors };
}

export type CallCheck =
  | { ok: true }
  | { ok: false; reason: "unknown" }
  | { ok: false; reason: "extension"; extension: CelExtension };

/**
 * Decides whether a call is allowed. A qualified call (a.b) that is not a known namespaced
 * function is treated as a member call b on the value a.
 */
export function checkCall(
  call: CelCall,
  enabled: ReadonlySet<string>,
  declared: ReadonlySet<string>,
): CallCheck {
  const asMember = call.member
    ? call.name
    : call.name.includes(".")
      ? call.name.split(".")[1]
      : undefined;
  if (!call.member) {
    if (
      STANDARD_GLOBALS.has(call.name) ||
      RADD_BUILTINS.has(call.name) ||
      declared.has(call.name)
    ) {
      return { ok: true };
    }
    const ext = extensionOf(call.name, EXTENSION_GLOBALS);
    if (ext)
      return enabled.has(ext) ? { ok: true } : { ok: false, reason: "extension", extension: ext };
    if (!call.name.includes(".")) return { ok: false, reason: "unknown" };
    const ns = call.name.split(".")[0] ?? "";
    if (isKnownNamespace(ns, declared)) return { ok: false, reason: "unknown" };
  }
  if (asMember === undefined) return { ok: false, reason: "unknown" };
  if (STANDARD_MEMBERS.has(asMember) || declared.has(asMember)) return { ok: true };
  const exts = (Object.keys(EXTENSION_MEMBERS) as CelExtension[]).filter((e) =>
    EXTENSION_MEMBERS[e].includes(asMember),
  );
  if (exts.length === 0) return { ok: false, reason: "unknown" };
  if (exts.some((e) => enabled.has(e))) return { ok: true };
  return { ok: false, reason: "extension", extension: exts[0] as CelExtension };
}

function extensionOf(
  name: string,
  table: Record<CelExtension, string[]>,
): CelExtension | undefined {
  return (Object.keys(table) as CelExtension[]).find((e) => table[e].includes(name));
}

function isKnownNamespace(ns: string, declared: ReadonlySet<string>): boolean {
  if (ns === "dec") return true;
  if (Object.values(EXTENSION_GLOBALS).some((names) => names.some((n) => n.startsWith(`${ns}.`))))
    return true;
  return [...declared].some((n) => n.startsWith(`${ns}.`));
}

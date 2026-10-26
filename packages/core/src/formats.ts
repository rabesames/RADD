/**
 * Syntax checks for display and edit formats (ICU number and date patterns, masks) and for
 * display-hint HTML. They check what a pattern is allowed to say, not how a runtime renders it.
 */

/** Returns an error message, or undefined when the ICU decimal-format pattern is valid. */
export function checkNumberPattern(pattern: string): string | undefined {
  const parts = splitUnquoted(pattern, ";");
  if (parts === undefined) return "it has an unterminated quote";
  if (parts.length > 2) return "it has more than one ';' (positive;negative)";
  for (const part of parts) {
    const start = indexOfUnquoted(part, /[0-9#@]/);
    if (start < 0) return `'${part}' has no digits (0, # or @)`;
    let end = start;
    while (end < part.length && /[0-9#@,.E+]/.test(part.charAt(end))) end++;
    const number = part.slice(start, end);
    const suffix = part.slice(end);
    if (indexOfUnquoted(suffix, /[0-9#@]/) >= 0)
      return `'${part}' has digits after the suffix starts`;
    // Optional digits (#) come before required ones (0-9); @ marks significant digits.
    const integer = "(?:(?=[#,0-9]*[#0-9])[#,]*[0-9,]*|[#,]*@+#*)";
    if (!new RegExp(`^${integer}(?:\\.[0-9]*#*)?(?:E\\+?0+)?$`).test(number)) {
      return `'${number}' is not an ICU number pattern (use # for optional digits, 0 for required digits, then zeros before #s after the decimal point)`;
    }
    if (/,,|,\.|,$|,E/.test(number)) return `'${number}' has a misplaced grouping separator`;
  }
  return undefined;
}

/** ICU date and time pattern letters. */
const DATE_LETTERS = new Set("GyYuUrQqMLlwWdDFgEecabBhHKkjJCmsSAzZOvVXx");

/** Returns an error message, or undefined when the ICU date/time pattern is valid. */
export function checkDatePattern(pattern: string): string | undefined {
  let fields = 0;
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern.charAt(i);
    if (ch === "'") {
      if (pattern.charAt(i + 1) === "'") {
        i++;
        continue;
      }
      const close = pattern.indexOf("'", i + 1);
      if (close < 0) return "it has an unterminated quote";
      i = close;
      continue;
    }
    if (/[A-Za-z]/.test(ch)) {
      if (!DATE_LETTERS.has(ch))
        return `'${ch}' is not an ICU date pattern letter; quote literal text ('at')`;
      fields++;
    }
  }
  return fields === 0 ? "it has no date or time fields" : undefined;
}

/** Returns an error message, or undefined when the mask has at least one placeholder. */
export function checkMask(mask: string): string | undefined {
  return /[0A*]/.test(mask)
    ? undefined
    : "it has no placeholders (0 for a digit, A for a letter, * for any character)";
}

const ALLOWED_TAGS = new Set(["b", "strong", "i", "em", "br", "p", "ul", "ol", "li", "code", "a"]);

/**
 * Checks display-hint HTML against the allowlist: b, strong, i, em, br, p, ul, ol, li, code,
 * and a with an https href. Returns one message per problem.
 */
export function checkHintHtml(html: string): string[] {
  const problems: string[] = [];
  if (/<!--/.test(html)) problems.push("HTML comments are not allowed");
  // As in HTML, "<" followed by a space is text, not a tag.
  const tag = /<(\/?)([A-Za-z][A-Za-z0-9-]*)([^>]*)>/g;
  for (const m of html.matchAll(tag)) {
    const closing = m[1] === "/";
    const name = (m[2] ?? "").toLowerCase();
    const attrs = (m[3] ?? "").replace(/\/\s*$/, "").trim();
    if (!ALLOWED_TAGS.has(name)) {
      problems.push(`<${name}> is not allowed`);
      continue;
    }
    if (closing || attrs === "") continue;
    if (name !== "a") {
      problems.push(`<${name}> cannot have attributes`);
      continue;
    }
    const href = /^href\s*=\s*(?:"([^"]*)"|'([^']*)')$/i.exec(attrs);
    if (!href) {
      problems.push("<a> may only have an href attribute");
    } else if (!/^https:\/\//i.test(href[1] ?? href[2] ?? "")) {
      problems.push("<a href> must be an https link");
    }
  }
  if (/<[A-Za-z/!?][^>]*$/.test(html)) problems.push("a tag is not closed with '>'");
  return [...new Set(problems)];
}

function splitUnquoted(s: string, sep: string): string[] | undefined {
  const out: string[] = [];
  let current = "";
  let quoted = false;
  for (const ch of s) {
    if (ch === "'") quoted = !quoted;
    if (ch === sep && !quoted) {
      out.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  if (quoted) return undefined;
  out.push(current);
  return out;
}

function indexOfUnquoted(s: string, re: RegExp): number {
  let quoted = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charAt(i);
    if (ch === "'") quoted = !quoted;
    else if (!quoted && re.test(ch)) return i;
  }
  return -1;
}

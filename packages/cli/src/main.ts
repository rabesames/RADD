import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { type BuildResult, build, type Diagnostic, type LintResult, lint } from "@radd/core";
import { Command, CommanderError } from "commander";

/** Exit codes: 0 success (warnings allowed), 1 lint errors, 2 usage or internal errors. */
export const EXIT_OK = 0;
export const EXIT_LINT_ERRORS = 1;
export const EXIT_USAGE = 2;

/** A problem with the command line itself, reported with exit code 2. */
class UsageError extends Error {}

const VERSION = (
  JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
    version: string;
  }
).version;

function dictionaryRoot(io: Io, dir: string): string {
  const root = resolve(io.cwd, dir);
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    throw new UsageError(`Dictionary folder '${dir}' not found.`);
  }
  return root;
}

export interface Io {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  cwd: string;
}

const defaultIo: Io = {
  stdout: (t) => process.stdout.write(t),
  stderr: (t) => process.stderr.write(t),
  cwd: process.cwd(),
};

function display(io: Io, root: string, file: string | undefined): string {
  if (file === undefined) return relative(io.cwd, root).replaceAll("\\", "/") || ".";
  return relative(io.cwd, join(root, file)).replaceAll("\\", "/");
}

function formatDiagnostic(io: Io, root: string, d: Diagnostic): string {
  const where =
    d.line !== undefined
      ? `${display(io, root, d.file)}:${d.line}:${d.column}`
      : display(io, root, d.file);
  const hint = d.hint ? `\n    ${d.hint}` : "";
  return `${where}  ${d.severity}  ${d.code}  ${d.message}${hint}\n`;
}

function summary(r: LintResult): string {
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
  return `${plural(r.errorCount, "error")}, ${plural(r.warningCount, "warning")}\n`;
}

/** Diagnostics in --json output carry a path relative to the working directory, like the text output. */
function jsonDiagnostics(io: Io, root: string, r: LintResult): Diagnostic[] {
  return r.diagnostics.map((d) => ({ ...d, file: display(io, root, d.file) }));
}

export async function main(argv: string[], io: Io = defaultIo): Promise<number> {
  let exitCode = EXIT_OK;
  const program = new Command()
    .name("radd")
    .description("RADD data dictionary tools.")
    .version(VERSION)
    .exitOverride()
    .configureOutput({ writeOut: io.stdout, writeErr: io.stderr })
    .showHelpAfterError();

  program
    .command("lint")
    .description("Check a dictionary against the schema and conventions.")
    .argument("[dir]", "dictionary folder", "dictionary")
    .option("--json", "print the result as JSON")
    .action((dir: string, opts: { json?: boolean }) => {
      const root = dictionaryRoot(io, dir);
      const r = lint(root);
      if (opts.json) {
        io.stdout(
          `${JSON.stringify({ ok: r.ok, errorCount: r.errorCount, warningCount: r.warningCount, diagnostics: jsonDiagnostics(io, root, r) }, null, 2)}\n`,
        );
      } else {
        for (const d of r.diagnostics) io.stdout(formatDiagnostic(io, root, d));
        io.stdout(r.ok && r.warningCount === 0 ? "No problems found.\n" : summary(r));
      }
      exitCode = r.ok ? EXIT_OK : EXIT_LINT_ERRORS;
    });

  program
    .command("build")
    .description("Lint a dictionary and write its canonical JSON and version hash.")
    .argument("[dir]", "dictionary folder", "dictionary")
    .option("--out <file>", "output file (default: <dir>/../.radd/dictionary.json)")
    .option("--json", "print the result as JSON")
    .action((dir: string, opts: { json?: boolean; out?: string }) => {
      const root = dictionaryRoot(io, dir);
      const out = opts.out
        ? resolve(io.cwd, opts.out)
        : join(root, "..", ".radd", "dictionary.json");
      const r: BuildResult = build(root);
      if (r.ok && r.json !== undefined) {
        mkdirSync(dirname(out), { recursive: true });
        writeFileSync(out, r.json, "utf8");
      }
      const outPath = relative(io.cwd, out).replaceAll("\\", "/");
      if (opts.json) {
        const result = {
          ok: r.ok,
          errorCount: r.errorCount,
          warningCount: r.warningCount,
          ...(r.ok ? { version: r.version, out: outPath } : {}),
          diagnostics: jsonDiagnostics(io, root, r),
        };
        io.stdout(`${JSON.stringify(result, null, 2)}\n`);
      } else {
        for (const d of r.diagnostics) io.stdout(formatDiagnostic(io, root, d));
        if (r.ok)
          io.stdout(
            `${r.warningCount > 0 ? summary(r) : ""}Wrote ${outPath}\nVersion ${r.version}\n`,
          );
        else io.stdout(`${summary(r)}Nothing written: fix the errors first.\n`);
      }
      exitCode = r.ok ? EXIT_OK : EXIT_LINT_ERRORS;
    });

  try {
    await program.parseAsync(argv);
  } catch (err) {
    if (err instanceof CommanderError) {
      return err.exitCode === 0 ? EXIT_OK : EXIT_USAGE;
    }
    if (err instanceof UsageError) {
      if (argv.includes("--json"))
        io.stdout(`${JSON.stringify({ ok: false, error: err.message }, null, 2)}
`);
      else
        io.stderr(`radd: ${err.message}
`);
      return EXIT_USAGE;
    }
    io.stderr(`radd: ${(err as Error).stack ?? String(err)}\n`);
    return EXIT_USAGE;
  }
  return exitCode;
}

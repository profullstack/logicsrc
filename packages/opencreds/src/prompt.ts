/**
 * Terminal input for secrets.
 *
 * A master password must not appear in the shell history, the process list, or
 * the terminal scrollback, which rules out an argument, an environment variable
 * and an unmuted read. So: read from the TTY with echo off, and offer stdin for
 * the scripted case.
 */

import { createInterface } from "node:readline";
import { stdin, stdout } from "node:process";

/** Read a line with the terminal's echo turned off. */
export async function promptSecret(label: string): Promise<string> {
  if (!stdin.isTTY) {
    // Not a terminal: read one line from stdin instead of failing. This is the
    // `echo … | opencreds …` path, and it is why every secret flag accepts `-`.
    return readLineFromStdin();
  }

  const rl = createInterface({ input: stdin, output: stdout, terminal: true });
  const asMutable = rl as unknown as { output: { write: (chunk: string) => void }; _writeToOutput?: (s: string) => void };

  let muted = false;
  asMutable._writeToOutput = function write(chunk: string): void {
    if (!muted) {
      asMutable.output.write(chunk);
      return;
    }
    // Echo nothing at all rather than asterisks: a length is information, and
    // it is the one piece of a password an observer gets for free otherwise.
    if (chunk.includes("\n")) asMutable.output.write("\n");
  };

  const answer = await new Promise<string>((resolve) => {
    rl.question(label, (value) => resolve(value));
    muted = true;
  });
  muted = false;
  rl.close();
  return answer;
}

/** Ask twice and require agreement. A typo'd master password is an empty vault. */
export async function promptNewSecret(label: string, confirmLabel = "Repeat: "): Promise<string> {
  const first = await promptSecret(label);
  if (first.length === 0) throw new Error("A password is required");
  const second = await promptSecret(confirmLabel);
  if (first !== second) throw new Error("The two entries did not match");
  return first;
}

export async function promptLine(label: string): Promise<string> {
  const rl = createInterface({ input: stdin, output: stdout });
  const answer = await new Promise<string>((resolve) => rl.question(label, resolve));
  rl.close();
  return answer;
}

/** A yes/no gate. Anything but an explicit yes is a no. */
export async function confirm(question: string): Promise<boolean> {
  if (!stdin.isTTY) return false;
  const answer = await promptLine(`${question} [y/N] `);
  return /^y(es)?$/i.test(answer.trim());
}

export function readLineFromStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    stdin.setEncoding("utf8");
    stdin.on("data", (chunk) => {
      data += chunk;
    });
    stdin.on("end", () => resolve(data.replace(/\r?\n$/, "")));
    stdin.on("error", reject);
  });
}

/**
 * Resolve a flag value that may be `-`, meaning "read it from stdin".
 *
 * Every secret-bearing flag goes through here, so a secret need never appear in
 * an argument vector that `ps` will happily print to anyone on the box.
 */
export async function resolveSecretFlag(value: string | undefined): Promise<string | undefined> {
  if (value === undefined) return undefined;
  if (value === "-") return readLineFromStdin();
  return value;
}

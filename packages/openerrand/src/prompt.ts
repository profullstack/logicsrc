/**
 * Terminal prompts. Without a terminal they answer null: the runner then
 * moves to the next source, or stops and says what it needed, rather than
 * read a secret from a pipe it cannot see the other end of.
 */

import type { Prompt } from "./inputs.js";

function readSecret(label: string): Promise<string> {
  process.stderr.write(label);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  return new Promise((resolve) => {
    let value = "";
    const onData = (chunk: Buffer): void => {
      for (const byte of chunk) {
        if (byte === 0x0d || byte === 0x0a || byte === 0x04) return finish();
        if (byte === 0x03) {
          process.stdin.setRawMode(false);
          process.stderr.write("\n");
          process.exit(130);
        }
        if (byte === 0x7f || byte === 0x08) {
          value = value.slice(0, -1);
          continue;
        }
        value += String.fromCharCode(byte);
      }
    };
    const finish = (): void => {
      process.stdin.off("data", onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stderr.write("\n");
      resolve(value.trim());
    };
    process.stdin.on("data", onData);
  });
}

function readLine(label: string): Promise<string> {
  process.stderr.write(label);
  return new Promise((resolve) => {
    process.stdin.setEncoding("utf8");
    process.stdin.resume();
    process.stdin.once("data", (chunk) => {
      process.stdin.pause();
      resolve(String(chunk).trim());
    });
  });
}

/** Secrets do not echo. */
export const terminalPrompt: Prompt = async (question, { secret }) => {
  if (!process.stdin.isTTY) return null;
  return secret ? readSecret(question) : readLine(question);
};

export async function confirm(question: string): Promise<boolean> {
  if (!process.stdin.isTTY) return false;
  const answer = await readLine(`${question} [y/N] `);
  return /^y(es)?$/i.test(answer);
}

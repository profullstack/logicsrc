import { InvalidArgumentError } from "commander";

export function parsePositiveInteger(value: string): number {
  const parsed = Number(value);
  if (value.trim() === "" || !Number.isSafeInteger(parsed) || parsed < 1) {
    throw new InvalidArgumentError("must be a positive integer");
  }
  return parsed;
}

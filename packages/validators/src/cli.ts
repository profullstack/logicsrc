#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { assertSchemaKind, parseDocument, validate } from "./index.js";

function main(argv: string[]) {
  const [, , kindArg, fileArg] = argv;

  if (!kindArg || !fileArg) {
    console.error("Usage: logicsrc-validate <task|agent|run|event|plugin|agentad-ad|agentad-placement|...> <file.yaml|file.json>");
    process.exitCode = 2;
    return;
  }

  const kind = assertSchemaKind(kindArg);
  const filePath = resolve(process.cwd(), fileArg);
  const input = readFileSync(filePath, "utf8");
  const data = parseDocument(input, filePath);
  const result = validate(kind, data);

  if (!result.ok) {
    console.error(`Invalid LogicSRC ${kind} document: ${filePath}`);
    for (const error of result.errors) {
      console.error(`- ${error.instancePath || "/"} ${error.message ?? "failed validation"}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(`Valid LogicSRC ${kind} document: ${filePath}`);
}

main(process.argv);

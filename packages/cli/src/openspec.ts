import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

export interface OpenSpecChangeInput {
  id: string;
  title: string;
  summary: string;
  capability: string;
  repo?: string;
  agents?: string[];
  outDir?: string;
  tasks?: string[];
}

export interface OpenSpecImportSummary {
  root: string;
  specs: Array<{ id: string; path: string; title: string }>;
  changes: Array<{ id: string; path: string; files: string[] }>;
}

export function writeOpenSpecChange(input: OpenSpecChangeInput) {
  const root = input.outDir ?? join("openspec", "changes", input.id);
  const specRoot = join(root, "specs", input.capability);
  mkdirSync(specRoot, { recursive: true });

  const tasks = input.tasks?.length ? input.tasks : [
    "Review existing LogicSRC schemas and CLI conventions.",
    "Open the AgentSwarm master agent session.",
    "Assign slave agents to reproduction, patching, review, and evidence.",
    "Export audit artifacts back into LogicSRC run/event documents."
  ];

  const proposal = `# ${input.title}

## Summary

${input.summary}

## Repository

${input.repo ?? "not specified"}

## Compatibility

This change uses OpenSpec.dev-style repo-local planning artifacts while preserving LogicSRC task, agent, run, event, plugin, SDK, MCP, CLI, TUI, PWA, and API contract names.
`;

  const design = `# ${input.title} Design

## Architecture

- A master agent owns the session goal, policy, and final decision packet.
- Slave agents execute scoped work such as reproduction, patching, review, documentation, and release evidence.
- LogicSRC records agent runs, model/tool use, artifacts, audit events, and schema versions.

## OpenSpec Compatibility

OpenSpec-compatible files stay under \`openspec/changes/${input.id}\` and can be reviewed through normal git workflows.
`;

  const taskList = tasks.map((task, index) => `- [ ] ${index + 1}. ${task}`).join("\n");
  const spec = `# ${input.capability} Specification

## Purpose

${input.summary}

## Requirements

### Requirement: Master agent session

The system SHALL create a master agent session that can coordinate scoped slave agents.

#### Scenario: YOLO AgentSwarm session

- GIVEN a repository target${input.repo ? ` of \`${input.repo}\`` : ""}
- WHEN \`logicsrc --openspec agentswarm --yolo\` runs
- THEN create OpenSpec-compatible proposal, design, task, and spec-delta artifacts
- AND keep LogicSRC audit and run contracts available for export

### Requirement: Slave agent coordination

The system SHALL record slave agent roles for reproducible review.

#### Scenario: Declared slave agents

- GIVEN slave agents ${input.agents?.length ? input.agents.map((agent) => `\`${agent}\``).join(", ") : "are declared"}
- WHEN the session opens
- THEN include those roles in the LogicSRC session output
- AND include them in the repo-local OpenSpec artifacts
`;

  const files = [
    { path: join(root, "proposal.md"), content: proposal },
    { path: join(root, "design.md"), content: design },
    { path: join(root, "tasks.md"), content: `# ${input.title} Tasks\n\n${taskList}\n` },
    { path: join(specRoot, "spec.md"), content: spec }
  ];

  for (const file of files) {
    writeFileSync(file.path, file.content);
  }

  return {
    id: input.id,
    root,
    files: files.map((file) => file.path)
  };
}

export function importOpenSpec(root = "openspec"): OpenSpecImportSummary {
  const specsRoot = join(root, "specs");
  const changesRoot = join(root, "changes");
  const specs = existsSync(specsRoot)
    ? listDirectories(specsRoot).map((directory) => {
        const specPath = join(specsRoot, directory, "spec.md");
        return {
          id: directory,
          path: specPath,
          title: readMarkdownTitle(specPath) ?? directory
        };
      })
    : [];

  const changes = existsSync(changesRoot)
    ? listDirectories(changesRoot).map((directory) => {
        const changePath = join(changesRoot, directory);
        return {
          id: directory,
          path: changePath,
          files: listFiles(changePath).map((file) => file.slice(changePath.length + 1))
        };
      })
    : [];

  return { root, specs, changes };
}

export function exportOpenSpecSummary(summary: OpenSpecImportSummary, outFile: string) {
  const markdown = `# OpenSpec Import Summary

Root: \`${summary.root}\`

## Specs

${summary.specs.length ? summary.specs.map((spec) => `- \`${spec.id}\` — ${spec.title} (${spec.path})`).join("\n") : "- none"}

## Changes

${summary.changes.length ? summary.changes.map((change) => `- \`${change.id}\` — ${change.files.length} file(s) (${change.path})`).join("\n") : "- none"}
`;

  writeFileSync(outFile, markdown);
  return outFile;
}

function listDirectories(root: string) {
  return readdirSync(root).filter((entry) => statSync(join(root, entry)).isDirectory()).sort();
}

function listFiles(root: string): string[] {
  const entries = readdirSync(root);
  return entries.flatMap((entry) => {
    const path = join(root, entry);
    return statSync(path).isDirectory() ? listFiles(path) : [path];
  }).sort();
}

function readMarkdownTitle(path: string) {
  if (!existsSync(path)) {
    return null;
  }

  const line = readFileSync(path, "utf8").split(/\r?\n/).find((entry) => entry.startsWith("# "));
  return line ? line.replace(/^#\s+/, "").trim() : basename(path);
}

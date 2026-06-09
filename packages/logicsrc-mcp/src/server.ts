import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { assertSchemaKind, parseDocument, schemas, validate, type SchemaKind } from "@logicsrc/validators";

const docs = {
  "communication-accounts": `LogicSRC Communication Accounts defines shared contracts for connecting social and email identities, granting scoped human/agent/plugin access, evaluating policy gates, brokering credentials, and auditing every account action without exposing raw secrets.`,
  positioning: `LogicSRC is an open standards initiative for human and AI agent coordination, maintained by Profullstack, Inc.

CommandBoard.run is a hosted product by Profullstack, Inc., built on LogicSRC. LogicSRC defines identity, boards, posts, tasks, bounties, agents, agent runs, permissions, payments, escrow, reputation, events, webhooks, CLI commands, API schemas, and plugin contracts.`,
  roadmap: `LogicSRC v1.0 focuses on schemas, validation tooling, plugin manifests, CLI/TUI conventions, event streams, agent profiles, permissions, and reference implementations.`,
  primitives: `Core LogicSRC primitives: users, DIDs, OAuth accounts, profiles, organizations, boards, posts, threads, comments, tasks, bids, submissions, agents, agent runs, payments, escrows, wallets, reputation events, files, API keys, permissions, audit logs, webhooks, schema versions, and plugin audit logs.`
} as const;

const schemaKinds = Object.keys(schemas) as SchemaKind[];

export function createLogicSrcMcpServer() {
  const server = new McpServer(
    {
      name: "@profullstack/logicsrc-mcp",
      version: "0.1.0"
    },
    {
      capabilities: {
        resources: {},
        tools: {},
        prompts: {}
      },
      instructions: "Use this server for LogicSRC standards, schema resources, validation, and draft object generation. Treat CommandBoard.run as a reference implementation, not the standards identity."
    }
  );

  for (const [name, text] of Object.entries(docs)) {
    const uri = `logicsrc://docs/${name}`;
    server.registerResource(
      `logicsrc-${name}`,
      uri,
      {
        title: `LogicSRC ${titleCase(name)}`,
        description: `LogicSRC ${name} reference text.`,
        mimeType: "text/markdown"
      },
      async () => ({ contents: [{ uri, mimeType: "text/markdown", text }] })
    );
  }

  for (const kind of schemaKinds) {
    const uri = `logicsrc://schemas/${kind}`;
    server.registerResource(
      `logicsrc-schema-${kind}`,
      uri,
      {
        title: `LogicSRC ${kind} schema`,
        description: `JSON Schema for LogicSRC ${kind} documents.`,
        mimeType: "application/schema+json"
      },
      async () => ({
        contents: [
          {
            uri,
            mimeType: "application/schema+json",
            text: JSON.stringify(schemas[kind], null, 2)
          }
        ]
      })
    );
  }

  server.registerTool(
    "list_schema_kinds",
    {
      title: "List LogicSRC Schema Kinds",
      description: "Lists the LogicSRC schema kinds exposed by this standards server.",
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async () => textResult(JSON.stringify({ schemaKinds }, null, 2))
  );

  server.registerTool(
    "validate_document",
    {
      title: "Validate LogicSRC Document",
      description: "Validates a JSON or YAML document against a LogicSRC schema kind.",
      inputSchema: {
        kind: z.enum(["account-audit-event", "account-grant", "account-provider", "agent", "connected-account", "email-message", "event", "plugin", "run", "social-post", "task"]),
        document: z.string().describe("JSON or YAML document text."),
        fileName: z.string().optional().describe("Optional file name used to select JSON parsing when it ends with .json.")
      },
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async ({ kind, document, fileName }) => {
      const parsed = parseDocument(document, fileName ?? "document.yaml");
      const result = validate(assertSchemaKind(kind), parsed);
      return textResult(JSON.stringify(result.ok ? { ok: true, kind: result.kind } : { ok: false, kind: result.kind, errors: result.errors }, null, 2));
    }
  );

  server.registerTool(
    "example_document",
    {
      title: "Generate Example LogicSRC Document",
      description: "Returns a minimal example document for a LogicSRC schema kind.",
      inputSchema: {
        kind: z.enum(["account-audit-event", "account-grant", "account-provider", "agent", "connected-account", "email-message", "event", "plugin", "run", "social-post", "task"])
      },
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async ({ kind }) => textResult(JSON.stringify(exampleFor(kind), null, 2))
  );

  server.registerPrompt(
    "create-valid-task",
    {
      title: "Create Valid LogicSRC Task",
      description: "Prompt template for turning a workflow request into a valid LogicSRC task.",
      argsSchema: {
        request: z.string().describe("Human description of the desired task.")
      }
    },
    async ({ request }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Create a valid LogicSRC task JSON document for this request. Use logicsrc://schemas/task and keep it minimal unless details are required.\n\nRequest:\n${request}`
          }
        }
      ]
    })
  );

  server.registerPrompt(
    "review-plugin-manifest",
    {
      title: "Review LogicSRC Plugin Manifest",
      description: "Prompt template for reviewing a plugin manifest against the LogicSRC plugin schema.",
      argsSchema: {
        manifest: z.string().describe("Plugin manifest JSON or YAML.")
      }
    },
    async ({ manifest }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Review this LogicSRC plugin manifest against logicsrc://schemas/plugin. Identify schema issues, security concerns, missing permissions, and unclear capabilities.\n\nManifest:\n${manifest}`
          }
        }
      ]
    })
  );

  return server;
}

function textResult(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

function titleCase(value: string) {
  return value.replace(/(^|-)([a-z])/g, (_match, prefix: string, letter: string) => `${prefix ? " " : ""}${letter.toUpperCase()}`);
}

function exampleFor(kind: SchemaKind) {
  switch (kind) {
    case "account-audit-event":
      return {
        id: "acct_audit_123",
        provider: "gmail",
        kind: "email",
        principal: { type: "agent", id: "marketing-agent" },
        action: "email:send",
        decision: "approval_required",
        riskScore: 0.35,
        requestPreview: { draft_id: "draft_123" },
        resultPreview: {},
        createdAt: new Date(0).toISOString()
      };
    case "account-grant":
      return {
        id: "grant_123",
        accountId: "account_123",
        principal: { type: "agent", id: "marketing-agent" },
        permissions: ["email:headers:read", "email:draft"],
        policy: [],
        createdAt: new Date(0).toISOString()
      };
    case "account-provider":
      return {
        id: "gmail",
        name: "Gmail",
        kind: "email",
        authMethods: ["oauth2"],
        capabilities: ["email.headers.read", "email.search"]
      };
    case "agent":
      return {
        type: "logicsrc.agent",
        version: "0.1",
        agent_did: "qa-agent-01.coinpay",
        name: "QA Agent",
        capabilities: ["browser.qa", "report.write"],
        status: "active"
      };
    case "connected-account":
      return {
        id: "account_123",
        ownerUserId: "user_123",
        kind: "email",
        provider: "gmail",
        displayName: "Founder Inbox",
        email: "founder@example.com",
        status: "connected",
        scopes: ["gmail.metadata"],
        capabilities: ["email.headers.read", "email.search"],
        credentialRef: "cred://gmail/account_123",
        metadata: {},
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString()
      };
    case "email-message":
      return {
        id: "email_msg_123",
        providerMessageId: "provider_msg_123",
        subject: "Hello",
        toAddresses: ["founder@example.com"],
        ccAddresses: [],
        labels: ["inbox"],
        hasAttachments: false
      };
    case "event":
      return {
        type: "logicsrc.event",
        version: "0.1",
        event_id: "evt_123",
        event_type: "task.created",
        resource_type: "task",
        resource_id: "task_123",
        actor_did: "anthony.coinpay",
        created_at: new Date(0).toISOString()
      };
    case "plugin":
      return {
        type: "logicsrc.plugin",
        version: "0.1",
        id: "example-plugin",
        name: "Example Plugin",
        description: "Example LogicSRC plugin manifest.",
        capabilities: ["tasks.read"],
        permissions: ["tasks:read"]
      };
    case "run":
      return {
        type: "logicsrc.run",
        version: "0.1",
        run_id: "run_123",
        task_id: "task_123",
        agent_did: "qa-agent-01.coinpay",
        status: "completed",
        started_at: new Date(0).toISOString()
      };
    case "social-post":
      return {
        id: "social_post_123",
        accountId: "account_123",
        status: "draft",
        text: "Launching today",
        media: [],
        metadata: {},
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString()
      };
    case "task":
      return {
        type: "logicsrc.task",
        version: "0.1",
        title: "Test checkout flow",
        description: "Verify checkout flow across desktop and mobile.",
        board: "/qa",
        creator_did: "anthony.coinpay",
        status: "open",
        budget: { amount: 25, currency: "USDC" },
        agent_allowed: true,
        human_allowed: true
      };
  }
}

import "./styles.css";

const primitives = [
  { name: "Identity", detail: "DIDs, OAuth accounts, profiles, and organization membership." },
  { name: "Coordination", detail: "Boards, posts, threads, comments, tasks, bids, and submissions." },
  { name: "Agents", detail: "Agent profiles, capabilities, runs, logs, permissions, and audit trails." },
  { name: "Value", detail: "Payments, escrow, wallets, reputation events, and settlement hooks." },
  { name: "Events", detail: "Event streams, webhooks, schema versions, and integration audit logs." }
];

const schemas = [
  { name: "logicsrc-task", path: "packages/schemas/schemas/logicsrc-task.schema.json" },
  { name: "logicsrc-agent", path: "packages/schemas/schemas/logicsrc-agent.schema.json" },
  { name: "logicsrc-run", path: "packages/schemas/schemas/logicsrc-run.schema.json" },
  { name: "logicsrc-event", path: "packages/schemas/schemas/logicsrc-event.schema.json" },
  { name: "logicsrc-plugin", path: "packages/schemas/schemas/logicsrc-plugin.schema.json" }
];

const implementations = [
  { name: "CommandBoard.run", detail: "Hosted reference product implementing the LogicSRC primitives." },
  { name: "CLI and TUI", detail: "`logicsrc` is the standards CLI; `commandboard` and `cb` remain compatible product aliases." },
  { name: "SDKs", detail: "`@logicsrc/sdk` defines contract types now; Rust, Bun, Node, Python, and curl surfaces mirror the same resources." },
  { name: "sh1pt CLI", detail: "`sh1pt logicsrc ...` lets sh1pt users choose LogicSRC OpenSpec-only workflows." },
  { name: "Reference API", detail: "Sample REST API available under `/api/*` for contract testing." },
  { name: "Plugins", detail: "CoinPay, uGig, and sh1pt adapters prove the plugin manifest shape." }
];

const upcoming = [
  { name: "Model routing", detail: "Switch across major AI model providers from one open spec interface." },
  { name: "Cost controls", detail: "Prefer the cheapest capable model, or rotate providers by price, latency, and task fit." },
  { name: "Master/slave agent workflows", detail: "Fan out a bug report from a master agent into scoped slave agents for reproduction, patching, review, and evidence." },
  { name: "GitHub integration", detail: "Target Profullstack repos, create issues and branches, and keep task history auditable." }
];

const agentByteSurfaces = [
  { name: "CLI", detail: "`logicsrc agentbyte` for plans, sessions, scorecards, audits, and artifacts." },
  { name: "TUI", detail: "Terminal panes for live transcripts, policy events, model use, evidence, and scorecards." },
  { name: "SDKs", detail: "Rust, Bun, Node, Python, and curl surfaces with the same screening session API." },
  { name: "PWA", detail: "Plan builder, candidate intake, live screening room, artifact review, and decision packet." }
];

const pages = [
  { id: "docs", title: "Docs", detail: "Specification guides, CLI conventions, schemas, plugin contracts, SDK conventions, and MCP resources." },
  { id: "blog", title: "Blog", detail: "Project notes for LogicSRC, AgentSwarm, AgentByte, OpenSpec workflows, and reference implementations." },
  { id: "openspec", title: "OpenSpec", detail: "Comparison and compatibility notes for OpenSpec.dev-style repo-local specs, proposals, tasks, and deltas." },
  { id: "about", title: "About", detail: "LogicSRC is the Profullstack open specification project for human and AI agent coordination." },
  { id: "terms", title: "Terms", detail: "Draft terms will cover acceptable use, reference implementation boundaries, and hosted-product responsibilities." },
  { id: "privacy", title: "Privacy", detail: "Draft privacy notes will cover telemetry, audit events, identity data, and hosted-product data boundaries." }
];

const comparisonRows = [
  {
    area: "Primary scope",
    logicsrc: "Open coordination standards for humans, agents, plugins, payments, hosted products, and reference implementations.",
    openspec: "Lightweight spec-driven planning for code changes and agent work."
  },
  {
    area: "Artifacts",
    logicsrc: "Schemas, plugin manifests, task/agent/run docs, event contracts, `@logicsrc/sdk`, MCP resources, CLI/TUI/PWA/API surfaces.",
    openspec: "Repo-local specs, proposals, design docs, implementation tasks, and spec deltas."
  },
  {
    area: "Agents",
    logicsrc: "Agent profiles, runs, audit logs, model routing, AgentSwarm orchestration, and provider-neutral execution records.",
    openspec: "Persistent requirements and planning context for coding agents."
  },
  {
    area: "CLI",
    logicsrc: "`logicsrc`, `commandboard`, `cb`, and `sh1pt logicsrc ...`.",
    openspec: "`@fission-ai/openspec` plus native coding-tool slash command integrations."
  },
  {
    area: "MCP",
    logicsrc: "Standards MCP server with schemas, validation tools, and prompts.",
    openspec: "OpenSpec.dev currently positions itself as no-MCP."
  },
  {
    area: "Compatibility",
    logicsrc: "`--openspec` should read/write OpenSpec.dev-style repo-local planning artifacts where useful.",
    openspec: "Can remain the lightweight planning layer inside repos."
  }
];

document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
  <main class="shell">
    <aside class="rail">
      <div class="brand">
        <span class="mark">LS</span>
        <div>
          <strong>LogicSRC</strong>
          <small>Open coordination standards</small>
        </div>
      </div>
      <nav aria-label="LogicSRC sections">
        <a class="active" href="#overview">Overview</a>
        <a href="#schemas">Schemas</a>
        <a href="/agent-swarm">Soon</a>
        <a href="/agentbyte">AgentByte</a>
        <a href="#cli">CLI</a>
        <a href="/docs">Docs</a>
        <a href="/blog">Blog</a>
        <a href="/openspec">OpenSpec</a>
        <a href="/about">About</a>
        <a href="/terms">Terms</a>
        <a href="/privacy">Privacy</a>
        <a href="#reference">Reference</a>
      </nav>
    </aside>
    <section class="workspace">
      <header id="overview" class="hero">
        <div>
          <p class="eyebrow">Profullstack open spec project</p>
          <h1>LogicSRC</h1>
          <p class="lede">Open schemas, primitives, and conventions for coordination between humans, AI agents, plugins, payment systems, and hosted products.</p>
        </div>
        <div class="status-grid" aria-label="Project status">
          <span><strong>0.1</strong>draft spec</span>
          <span><strong>5</strong>schemas</span>
          <span><strong>3</strong>reference plugins</span>
        </div>
      </header>

      <section class="band">
        <div class="section-head">
          <h2>Standards Surface</h2>
          <p>LogicSRC defines the shared language; products can implement it without owning the standard.</p>
        </div>
        <div class="primitive-grid">
          ${primitives.map((item) => `
            <article class="tile">
              <h3>${item.name}</h3>
              <p>${item.detail}</p>
            </article>
          `).join("")}
        </div>
      </section>

      <section id="agent-swarm" class="band coming-soon">
        <div class="section-head">
          <h2>AgentSwarm</h2>
          <p>An open spec AI agent platform for routing work across models, tools, providers, and repositories.</p>
        </div>
        <div class="soon-layout">
          <article class="soon-lead">
            <span>slug: agent-swarm</span>
            <h3>Provider-neutral agent orchestration</h3>
            <p>LogicSRC is adding model-provider integration primitives so a CLI or agent runtime can switch between major AI models, choose the cheapest capable option, or rotate models automatically for resilience and cost control.</p>
            <pre><code>logicsrc agentswarm --yolo \\
  --repo profullstack/logicsrc \\
  --agents reproduce,patch,review</code></pre>
          </article>
          <div class="soon-grid">
            ${upcoming.map((item) => `
              <article>
                <h3>${item.name}</h3>
                <p>${item.detail}</p>
              </article>
            `).join("")}
          </div>
        </div>
      </section>

      <section id="agentbyte" class="band coming-soon agentbyte">
        <div class="section-head">
          <h2>AgentByte</h2>
          <p>A coming-soon LogicSRC plugin spec for AI-era screening, assessments, interviews, and auditable agent-assisted answers.</p>
        </div>
        <div class="soon-layout">
          <article class="soon-lead">
            <span>slug: agentbyte</span>
            <h3>Screening where AI use is declared, measured, and auditable</h3>
            <p>AgentByte defines open screening sessions for humans, AI-assisted humans, autonomous agents, and human-agent pairs. Instead of pretending AI is absent, the spec records model use, tools, artifacts, scorecards, policy decisions, and evidence.</p>
            <pre><code>logicsrc agentbyte plan create \\
  --role "AI Engineer" \\
  --repo profullstack/logicsrc

logicsrc agentbyte session audit \\
  --session ssn_123 \\
  --format markdown</code></pre>
          </article>
          <div class="soon-grid">
            ${agentByteSurfaces.map((item) => `
              <article>
                <h3>${item.name}</h3>
                <p>${item.detail}</p>
              </article>
            `).join("")}
          </div>
        </div>
      </section>

      <section id="schemas" class="band two-col">
        <div>
          <div class="section-head">
            <h2>Open Schemas</h2>
            <p>Versioned JSON Schema files are the contract source for tasks, agents, runs, events, and plugins.</p>
          </div>
          <div class="schema-list">
            ${schemas.map((schema) => `
              <article>
                <strong>${schema.name}</strong>
                <code>${schema.path}</code>
              </article>
            `).join("")}
          </div>
        </div>
        <div id="cli" class="cli-panel">
          <h2>CLI Validation</h2>
          <pre><code>npm install
npm run schemas:validate
npm --workspace @logicsrc/cli run dev -- \\
  --openspec-only task validate ./task.yaml

sh1pt logicsrc --openspec-only \\
  task validate ./task.yaml</code></pre>
          <p>The CLI belongs here as standards tooling: validate schemas, inspect objects, drive SDK/TUI/PWA/MCP contracts, and exercise compatible implementations.</p>
        </div>
      </section>

      <section id="openspec" class="band">
        <div class="section-head">
          <h2>LogicSRC vs OpenSpec.dev</h2>
          <p>OpenSpec.dev is adjacent: it focuses on lightweight repo-local planning artifacts. LogicSRC is the broader coordination standard and can support OpenSpec-compatible workflows.</p>
        </div>
        <div class="compare-table" role="table" aria-label="LogicSRC and OpenSpec.dev comparison">
          <div class="compare-row compare-head" role="row">
            <strong role="columnheader">Area</strong>
            <strong role="columnheader">LogicSRC.com</strong>
            <strong role="columnheader">OpenSpec.dev</strong>
          </div>
          ${comparisonRows.map((row) => `
            <div class="compare-row" role="row">
              <strong role="cell">${row.area}</strong>
              <p role="cell">${row.logicsrc}</p>
              <p role="cell">${row.openspec}</p>
            </div>
          `).join("")}
        </div>
        <div class="cli-panel compare-note">
          <h2>Compatibility Mode</h2>
          <pre><code>logicsrc --openspec agentswarm --yolo \\
  --repo profullstack/logicsrc

sh1pt logicsrc --openspec \\
  agentswarm --yolo</code></pre>
          <p><code>--openspec</code> enables OpenSpec.dev-compatible repo-local specs, proposals, tasks, and deltas where supported. <code>openspec import</code> and <code>openspec export</code> summarize those artifacts for LogicSRC workflows. <code>--openspec-only</code> restricts work to LogicSRC-published contracts.</p>
        </div>
      </section>

      <section id="reference" class="band">
        <div class="section-head">
          <h2>Reference Implementations</h2>
          <p>These prove the standard, but they are not the LogicSRC identity.</p>
        </div>
        <div class="implementation-list">
          ${implementations.map((item) => `
            <article>
              <span></span>
              <div>
                <h3>${item.name}</h3>
                <p>${item.detail}</p>
              </div>
            </article>
          `).join("")}
        </div>
      </section>

      <section id="pages" class="band">
        <div class="section-head">
          <h2>Top-Level Pages</h2>
          <p>LogicSRC.com should expose stable project pages for docs, publishing, company context, and legal basics.</p>
        </div>
        <div class="implementation-list">
          ${pages.map((page) => `
            <article id="${page.id}">
              <span></span>
              <div>
                <h3>/${page.id} · ${page.title}</h3>
                <p>${page.detail}</p>
              </div>
            </article>
          `).join("")}
        </div>
      </section>
    </section>
  </main>
`;

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js").catch(() => undefined);
  });
}

if (window.location.pathname === "/agent-swarm") {
  document.querySelector("#agent-swarm")?.scrollIntoView();
}

if (window.location.pathname === "/agentbyte") {
  document.querySelector("#agentbyte")?.scrollIntoView();
}

const pageRoute = window.location.pathname.slice(1);
if (["docs", "blog", "openspec", "about", "terms", "privacy"].includes(pageRoute)) {
  document.querySelector(`#${pageRoute}`)?.scrollIntoView();
}

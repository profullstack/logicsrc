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
  { name: "LogicSRC CLI", detail: "`logicsrc` is the canonical OpenStandards CLI for schemas, specs, plugins, and audits." },
  { name: "TUI and PWA", detail: "Terminal and browser reference surfaces mirror the same open contracts." },
  { name: "SDKs", detail: "`@logicsrc/sdk` defines contract types now; Rust, Bun, Node, Python, and curl surfaces mirror the same resources." },
  { name: "Reference API", detail: "Sample REST API available under `/api/*` for contract testing." },
  { name: "Plugins", detail: "Open plugin contracts let external products consume LogicSRC without LogicSRC calling proprietary tools." }
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

const credentialProviders = [
  { name: ".env", detail: "Parse, diff, redact, and write local env files without leaking values into logs." },
  { name: "Doppler", detail: "Sync project/config scoped secrets through provider adapters and auditable key fingerprints." },
  { name: "Railway", detail: "Read and write service variables as a deployment target with explicit approval gates." },
  { name: "GitHub Secrets", detail: "Manage repo, organization, and environment secrets through provider-neutral operations." }
];

const credentialSurfaces = [
  { name: "CLI", detail: "`logicsrc credentials` for provider listing, dry-run plans, diffs, approvals, sync, and audit exports." },
  { name: "TUI", detail: "Review key diffs, target providers, approval prompts, fingerprints, and failure states without showing raw secrets." },
  { name: "SDKs", detail: "Rust, Bun, Node, Python, and curl APIs share the same credential source, target, policy, and audit objects." },
  { name: "PWA", detail: "Provider connection health, dry-run previews, approval history, and redacted sync evidence." }
];

const hireUsWork = [
  { name: "AI agent workflow specs", detail: "Open schemas, repo-local plans, AgentSwarm flows, AgentByte screening contracts, and MCP resources." },
  { name: "Reference implementations", detail: "CLI, TUI, SDK, PWA, API, curl, and provider-neutral plugin surfaces that prove the spec can be used." },
  { name: "Integration hardening", detail: "GitHub, CoinPay, model providers, webhooks, audit logs, permissions, and deployment-ready contracts." },
  { name: "Open infrastructure", detail: "Portable code and specs first: no closed workflow lock-in, no one-off agent scripts that cannot be audited." }
];

const pages = [
  { id: "docs", title: "Docs", detail: "Specification guides, CLI conventions, schemas, plugin contracts, SDK conventions, and MCP resources." },
  { id: "blog", title: "Blog", detail: "Project notes for LogicSRC, AgentSwarm, AgentByte, OpenSpec workflows, and reference implementations." },
  { id: "openspec", title: "OpenSpec", detail: "Comparison and compatibility notes for OpenSpec.dev-style repo-local specs, proposals, tasks, and deltas." },
  { id: "credential-sharing", title: "Credential Sharing", detail: "Open replacement architecture for portable secret sync across .env, Doppler, Railway variables, GitHub Secrets, and future providers." },
  { id: "hire-us", title: "Hire Us", detail: "$250/week LogicSRC work on open infrastructure, specs, AI agent workflows, and reference implementations paid through CoinPay after project acceptance." },
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
    logicsrc: "`logicsrc` as the canonical OpenStandards CLI.",
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
        <a href="/credential-sharing">Credentials</a>
        <a href="#cli">CLI</a>
        <a href="/docs">Docs</a>
        <a href="/blog">Blog</a>
        <a href="/openspec">OpenSpec</a>
        <a href="/hire-us">Hire Us</a>
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
          <div class="hero-actions">
            <a class="button-primary" href="/api/oauth/coinpay/start">Connect CoinPay</a>
          </div>
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
  task validate ./task.yaml</code></pre>
          <p>The CLI belongs here as standards tooling: validate schemas, inspect objects, drive SDK/TUI/PWA/MCP contracts, and exercise compatible implementations.</p>
        </div>
      </section>

      <section id="credential-sharing" class="band coming-soon credentials">
        <div class="section-head">
          <h2>Credential Sharing</h2>
          <p>A coming-soon LogicSRC OpenSpec for replacing closed credential-sharing workflows with auditable, provider-neutral secret sync.</p>
        </div>
        <div class="soon-layout">
          <article class="soon-lead">
            <span>slug: credential-sharing</span>
            <h3>Open replacement architecture for secrets</h3>
            <p>LogicSRC defines the credential source, target, diff, approval, sync, rollback, and audit objects. External tools can consume the contract, but LogicSRC remains the open standards CLI and does not call out to proprietary product commands.</p>
            <pre><code>logicsrc credentials providers
logicsrc credentials plan --from env --to railway
logicsrc credentials plan --from doppler --to github-secrets</code></pre>
          </article>
          <div class="soon-grid">
            ${credentialProviders.map((item) => `
              <article>
                <h3>${item.name}</h3>
                <p>${item.detail}</p>
              </article>
            `).join("")}
          </div>
        </div>
        <div class="surface-strip" aria-label="Credential sharing reference surfaces">
          ${credentialSurfaces.map((item) => `
            <article>
              <h3>${item.name}</h3>
              <p>${item.detail}</p>
            </article>
          `).join("")}
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
  --repo profullstack/logicsrc</code></pre>
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

      <section id="hire-us" class="band hire-us">
        <div class="section-head">
          <h2>Hire Us</h2>
          <p>$250/week for accepted LogicSRC work using open infrastructure and open specs for AI agent systems.</p>
        </div>
        <div class="hire-layout">
          <article class="hire-panel">
            <p class="eyebrow">Profullstack standards work</p>
            <h3>Open-spec AI agent implementation help</h3>
            <p>Hire us to turn agent ideas into portable LogicSRC specs, CLIs, SDKs, MCP resources, PWAs, APIs, and provider-neutral plugin workflows. We prioritize auditable contracts, repo-local artifacts, and integrations that can move between model providers and infrastructure.</p>
            <div class="price-row">
              <strong>$250</strong>
              <span>per week</span>
            </div>
            <form id="project-request-form" class="project-request-form">
              <label>
                <span>Contact</span>
                <input id="project-contact" name="contact" type="email" autocomplete="email" placeholder="you@example.com" required />
              </label>
              <label>
                <span>Project</span>
                <textarea id="project-description" name="project" rows="6" minlength="20" placeholder="Describe the agent workflow, spec, CLI, plugin, API, or integration you want help with." required></textarea>
              </label>
              <div class="cta-row">
                <button id="project-request-button" class="button-primary" type="submit">Request review</button>
                <a class="button-secondary" href="/docs">Read specs</a>
              </div>
            </form>
            <div id="project-request-result" class="coinpay-result" aria-live="polite"></div>
          </article>
          <div class="hire-stack">
            <div class="hire-grid">
              ${hireUsWork.map((item) => `
                <article>
                  <h3>${item.name}</h3>
                  <p>${item.detail}</p>
                </article>
              `).join("")}
            </div>
            <article id="coinpay-setup" class="coinpay-panel">
              <h3>CoinPay recurring invoice</h3>
              <p>After we accept the project, we create a recurring CoinPay invoice for the weekly plan without exposing merchant credentials to the browser.</p>
              <pre><code>COINPAY_ORG=profullstack
COINPAY_PRODUCT=logicsrc-hire-us
COINPAY_AMOUNT_USD=250
COINPAY_INTERVAL=week
COINPAY_STATUS=pending_acceptance</code></pre>
            </article>
          </div>
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

document.querySelector<HTMLFormElement>("#project-request-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = document.querySelector<HTMLButtonElement>("#project-request-button");
  const result = document.querySelector<HTMLDivElement>("#project-request-result");
  const contact = document.querySelector<HTMLInputElement>("#project-contact");
  const project = document.querySelector<HTMLTextAreaElement>("#project-description");
  if (!button || !result || !contact || !project) return;

  button.disabled = true;
  button.textContent = "Submitting...";
  result.replaceChildren(buildParagraph("Submitting project request."));

  try {
    const response = await fetch("/api/hire-us/project-request", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contact: contact.value, project: project.value })
    });
    const payload = await response.json();

    if (!response.ok || !payload.success) {
      throw new Error(payload.error || "Project request could not be submitted.");
    }

    result.replaceChildren(buildParagraph("Request received. If it is a fit, we will send a $250/week recurring CoinPay invoice."));
  } catch (error) {
    result.replaceChildren(
      buildParagraph(error instanceof Error ? error.message : "Project request could not be submitted.")
    );
  } finally {
    button.disabled = false;
    button.textContent = "Request review";
  }
});

function buildCoinPayResult(payment: {
  amount_usd?: number;
  crypto_amount?: string | null;
  currency?: string;
  address?: string | null;
  id?: string;
  qr_code?: string | null;
}) {
  const fragment = document.createDocumentFragment();
  const heading = document.createElement("strong");
  heading.textContent = "CoinPay payment ready";
  fragment.append(heading);

  const details = document.createElement("dl");
  details.append(
    buildDetail("Amount", `$${payment.amount_usd ?? 250} / ${payment.crypto_amount ?? "quoted at checkout"} ${payment.currency ?? "USDC_POL"}`),
    buildDetail("Address", payment.address ?? "Open CoinPay to complete payment", true),
    buildDetail("Payment ID", payment.id ?? "pending", true)
  );
  fragment.append(details);

  if (payment.qr_code) {
    const image = document.createElement("img");
    image.src = payment.qr_code;
    image.alt = "CoinPay payment QR code";
    fragment.append(image);
  }

  return fragment;
}

function buildDetail(label: string, value: string, code = false) {
  const row = document.createElement("div");
  const term = document.createElement("dt");
  const definition = document.createElement("dd");
  term.textContent = label;
  if (code) {
    const codeElement = document.createElement("code");
    codeElement.textContent = value;
    definition.append(codeElement);
  } else {
    definition.textContent = value;
  }
  row.append(term, definition);
  return row;
}

function buildParagraph(text: string) {
  const paragraph = document.createElement("p");
  paragraph.textContent = text;
  return paragraph;
}

if (window.location.pathname === "/agent-swarm") {
  document.querySelector("#agent-swarm")?.scrollIntoView();
}

if (window.location.pathname === "/agentbyte") {
  document.querySelector("#agentbyte")?.scrollIntoView();
}

const pageRoute = window.location.pathname.slice(1);
if (["docs", "blog", "openspec", "credential-sharing", "hire-us", "about", "terms", "privacy"].includes(pageRoute)) {
  document.querySelector(`#${pageRoute}`)?.scrollIntoView();
}

// CoinPay OAuth connection status
const coinpayParam = new URLSearchParams(window.location.search).get("coinpay_oauth");
if (coinpayParam) {
  const url = new URL(window.location.href);
  url.searchParams.delete("coinpay_oauth");
  url.searchParams.delete("error");
  history.replaceState(null, "", url.pathname + (url.search || ""));
}

async function updateCoinPayButton() {
  const connectBtn = document.querySelector<HTMLAnchorElement>(".hero-actions a[href='/api/oauth/coinpay/start']");
  if (!connectBtn) return;

  try {
    const res = await fetch("/api/oauth/coinpay/session");
    const data = await res.json();

    if (data.authenticated && data.user) {
      const label = data.user.email || data.user.name || data.user.sub || "CoinPay";
      connectBtn.textContent = `Connected: ${label}`;
      connectBtn.style.background = "#3a9e7e";
      connectBtn.removeAttribute("href");
      connectBtn.style.cursor = "default";
      connectBtn.title = `Connected via CoinPay since ${new Date(data.user.connected_at).toLocaleDateString()}`;
    } else if (coinpayParam === "connected") {
      connectBtn.textContent = "CoinPay Connected";
      connectBtn.style.background = "#3a9e7e";
    } else if (coinpayParam === "error") {
      connectBtn.textContent = "Connect CoinPay (retry)";
    }
  } catch {
    // session check failed — leave button as-is
  }
}

updateCoinPayButton();

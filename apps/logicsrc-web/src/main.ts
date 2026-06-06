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
  { name: "CLI and TUI", detail: "`commandboard` and `cb` clients for standards-compatible workflows." },
  { name: "Reference API", detail: "Sample REST API available under `/api/*` for contract testing." },
  { name: "Plugins", detail: "CoinPay, uGig, and sh1pt adapters prove the plugin manifest shape." }
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
        <a href="#cli">CLI</a>
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
npm --workspace @logicsrc/cli run dev -- task validate ./task.yaml</code></pre>
          <p>The CLI belongs here as standards tooling: validate schemas, inspect objects, and exercise compatible implementations.</p>
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
    </section>
  </main>
`;

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js").catch(() => undefined);
  });
}

// Server-rendered views in the LogicSRC brand (matches logicsrc.com):
// light ground (#f6f7f4), ink text (#101418), green accent (#0a7d59), Inter.
// Keeps the same class vocabulary the auth routes use so they reskin for free.

export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

export const BRAND_CSS = `
:root{
  color-scheme:light;
  --bg:#f6f7f4;--surface:#ffffff;--surface-2:#f0f2ec;
  --ink:#101418;--text:#101418;--dim:#58615b;--faint:#8b938a;
  --line:#d9ded4;--line-2:#c7cec1;
  --green:#0a7d59;--green-2:#0b8f66;--green-ink:#ffffff;--mint:#5ac8a6;
  --danger:#c23a3a;--warn:#b7791f;
  --rail:#101418;--rail-text:#f6f7f4;--rail-dim:#b5beb2;--rail-line:#263039;
  --mono:ui-monospace,"JetBrains Mono","SF Mono",SFMono-Regular,Menlo,Consolas,monospace;
  --sans:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
  --maxw:72rem;--r:10px;
}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font-family:var(--sans);line-height:1.55;-webkit-font-smoothing:antialiased}
.wrap{max-width:var(--maxw);margin:0 auto;padding:0 24px}
a{color:var(--green);text-decoration:none}
a:hover{text-decoration:underline}
::selection{background:var(--mint);color:#06110c}
h1,h2,h3{margin:0;font-weight:800;letter-spacing:-.01em;text-wrap:balance}
h1{font-size:2.2rem;line-height:1.05}
.label{font-family:var(--mono);font-size:.64rem;letter-spacing:.18em;text-transform:uppercase;color:var(--faint)}
.mono{font-family:var(--mono)}
.dim{color:var(--dim)}.faint{color:var(--faint)}.acid,.green{color:var(--green)}
.pill{font-family:var(--mono);font-size:.62rem;letter-spacing:.1em;text-transform:uppercase;padding:3px 9px;border-radius:999px;border:1px solid var(--line-2);color:var(--dim);white-space:nowrap}
.pill.on{color:var(--green);border-color:color-mix(in srgb,var(--green) 45%,var(--line));background:color-mix(in srgb,var(--green) 8%,transparent)}
.pill.warn{color:var(--warn);border-color:color-mix(in srgb,var(--warn) 40%,var(--line))}
.btn{font-family:var(--sans);font-size:.85rem;font-weight:600;padding:10px 16px;border-radius:8px;cursor:pointer;border:1px solid var(--line-2);background:var(--surface);color:var(--text);display:inline-flex;align-items:center;justify-content:center;gap:8px;transition:border-color .14s,background .14s,transform .05s;white-space:nowrap;text-align:center}
.btn:hover{border-color:var(--faint);background:var(--surface-2);text-decoration:none}
.btn:active{transform:translateY(1px)}
.btn.acid,.btn.primary{background:var(--green);color:var(--green-ink);border-color:var(--green);font-weight:700}
.btn.acid:hover,.btn.primary:hover{background:var(--green-2);border-color:var(--green-2)}
.btn.danger{color:var(--danger);border-color:color-mix(in srgb,var(--danger) 45%,var(--line))}
.btn.danger:hover{background:color-mix(in srgb,var(--danger) 10%,transparent);border-color:var(--danger)}
.btn.block{width:100%}
.btn:focus-visible{outline:2px solid var(--green);outline-offset:2px}
input,textarea,select{font-family:var(--mono);font-size:.85rem;color:var(--text);background:var(--surface);border:1px solid var(--line-2);border-radius:9px;padding:11px 13px;width:100%}
input:focus,textarea:focus{outline:none;border-color:var(--green)}
input::placeholder,textarea::placeholder{color:var(--faint)}
label.field{display:block;margin-bottom:14px}
label.field span{display:block;font-family:var(--mono);font-size:.66rem;letter-spacing:.14em;text-transform:uppercase;color:var(--faint);margin-bottom:6px}
.card{border:1px solid var(--line);border-radius:var(--r);background:var(--surface)}
.card-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:13px 16px;border-bottom:1px solid var(--line)}
.card-head .h{font-family:var(--mono);font-size:.72rem;letter-spacing:.14em;text-transform:uppercase;color:var(--faint)}
.card-body{padding:18px}
.bar{position:sticky;top:0;z-index:30;background:var(--rail);color:var(--rail-text);border-bottom:1px solid var(--rail-line)}
.bar a{color:var(--rail-text)}
.bar-inner{display:flex;align-items:center;gap:16px;height:60px}
.brand{display:flex;align-items:center;gap:10px;font-weight:800;letter-spacing:-.01em;font-size:1.12rem}
.brand .mark{width:26px;height:26px;border-radius:6px;border:1px solid var(--mint);color:var(--mint);display:grid;place-items:center;font-family:var(--mono);font-weight:800;font-size:.8rem;background:transparent}
.brand .app{font-family:var(--mono);font-weight:600;font-size:.62rem;letter-spacing:.2em;color:var(--faint);text-transform:uppercase;border:1px solid var(--line-2);padding:2px 6px;border-radius:5px}
.bar .brand .app{color:var(--rail-dim);border-color:var(--rail-line)}
.bar-right{margin-left:auto;display:flex;align-items:center;gap:12px}
.grid{display:grid;grid-template-columns:1.55fr .95fr;gap:22px;align-items:start}
.col{display:flex;flex-direction:column;gap:22px}
.section-title{display:flex;align-items:baseline;gap:12px;margin-bottom:14px}
.section-title h2{font-size:1.24rem}
.section-title .count{font-family:var(--mono);font-size:.74rem;color:var(--green)}
.notice{border:1px solid var(--line-2);border-radius:9px;padding:11px 14px;font-family:var(--mono);font-size:.78rem;margin-bottom:16px}
.notice.err{color:var(--danger);border-color:color-mix(in srgb,var(--danger) 45%,var(--line));background:color-mix(in srgb,var(--danger) 6%,transparent)}
.notice.ok{color:var(--green);border-color:color-mix(in srgb,var(--green) 45%,var(--line));background:color-mix(in srgb,var(--green) 6%,transparent)}
.divider{display:flex;align-items:center;gap:12px;color:var(--faint);font-family:var(--mono);font-size:.66rem;letter-spacing:.16em;text-transform:uppercase;margin:18px 0}
.divider::before,.divider::after{content:"";height:1px;background:var(--line);flex:1}
table{width:100%;border-collapse:collapse;font-size:.9rem}
th{text-align:left;padding:8px 10px;border-bottom:1px solid var(--line);font-family:var(--mono);font-size:.66rem;letter-spacing:.1em;text-transform:uppercase;color:var(--faint);font-weight:600}
td{padding:8px 10px;border-bottom:1px solid var(--line)}
code{font-family:var(--mono);font-size:.85em;background:var(--surface-2);padding:1px 5px;border-radius:4px}
footer{border-top:1px solid var(--line);padding:26px 0;margin-top:40px}
.foot{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;align-items:center;font-family:var(--mono);font-size:.74rem;color:var(--faint)}
.foot .green b{color:var(--green);font-weight:600}
@media (max-width:940px){.grid{grid-template-columns:1fr}}
`;

/** Full HTML document with the brand shell. */
export function page({ title = "LogicSRC ▸ credentials", body = "", head = "" }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#101418">
<title>${esc(title)}</title>
<link rel="manifest" href="/manifest.webmanifest">
<link rel="icon" href="/icon.svg" type="image/svg+xml">
<style>${BRAND_CSS}</style>
${head}
</head>
<body>${body}
<script>if('serviceWorker' in navigator){navigator.serviceWorker.register('/sw.js').catch(()=>{})}</script>
</body>
</html>`;
}

export function appBar(user) {
  return `<header class="bar"><div class="wrap bar-inner">
    <a class="brand" href="/"><span class="mark">LS</span>LogicSRC<span class="app">credentials</span></a>
    <div class="bar-right">
      ${user
        ? `<span class="mono faint" style="font-size:.78rem">${esc(user.email || user.display_name || "signed in")}</span>
      <a class="btn" href="/settings">Settings</a>
      <form method="post" action="/auth/logout" style="margin:0"><button class="btn">Sign out</button></form>`
        : `<a class="btn acid" href="/">Sign in</a>`}
    </div>
  </div></header>`;
}

export const footer = `<footer><div class="wrap foot">
  <div class="brand" style="font-size:.9rem;color:var(--ink)"><span class="mark" style="width:20px;height:20px;font-size:.62rem">LS</span>LogicSRC</div>
  <div style="display:flex;gap:20px;flex-wrap:wrap"><a href="https://logicsrc.com">logicsrc.com</a><a href="/">Teams</a><a href="/settings">Settings</a></div>
  <div class="green">end-to-end encrypted. <b>the server never sees your secrets.</b></div>
</div></footer>`;

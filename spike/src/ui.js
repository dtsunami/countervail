import { config, gate } from './config.js';
import { summarise, gradeRun } from './metrics.js';

const esc = (s) =>
  String(s === null || s === undefined ? '' : s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );

const CSS = `
:root{--bg:#0e1013;--panel:#171a1f;--line:#262b33;--fg:#e4e7eb;--dim:#8a9099;
--ok:#4ade80;--warn:#fbbf24;--bad:#f87171;--acc:#60a5fa}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 ui-sans-serif,-apple-system,"Segoe UI",Roboto,sans-serif}
a{color:var(--acc);text-decoration:none}a:hover{text-decoration:underline}
header{position:sticky;top:0;z-index:20;background:#0e1013ee;backdrop-filter:blur(8px);
border-bottom:1px solid var(--line);padding:10px 16px;display:flex;gap:16px;align-items:center;flex-wrap:wrap}
header .brand{font-weight:650;letter-spacing:-.01em}
header .tag{color:var(--dim);font-size:13px}
main{max-width:1100px;margin:0 auto;padding:16px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:16px;margin-bottom:16px}
h1{font-size:20px;margin:0 0 12px}h2{font-size:15px;margin:0 0 10px;color:var(--dim);
text-transform:uppercase;letter-spacing:.06em;font-weight:600}
label{display:block;font-size:13px;color:var(--dim);margin:12px 0 4px}
input,select,textarea{width:100%;background:#0e1013;color:var(--fg);border:1px solid var(--line);
border-radius:7px;padding:9px 11px;font:inherit}
textarea{min-height:64px;resize:vertical}
.row{display:flex;gap:12px;flex-wrap:wrap}.row>*{flex:1;min-width:200px}
button{background:var(--acc);color:#07101f;border:0;border-radius:7px;padding:11px 18px;
font:inherit;font-weight:620;cursor:pointer}
button.ghost{background:transparent;color:var(--fg);border:1px solid var(--line)}
button.danger{background:var(--bad);color:#2a0606}
button.ok{background:var(--ok);color:#052e16}
.check{display:flex;align-items:center;gap:8px;margin:8px 0;font-size:14px}
.check input{width:auto}.check label{margin:0;color:var(--fg)}
table{width:100%;border-collapse:collapse;font-size:13px}
th,td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--line)}
th{color:var(--dim);font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:.05em}
.mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12.5px}
pre{background:#0b0d10;border:1px solid var(--line);border-radius:7px;padding:11px;
overflow-x:auto;font-family:ui-monospace,Menlo,monospace;font-size:12.5px;margin:8px 0;
white-space:pre-wrap;word-break:break-word}
.pill{display:inline-block;padding:2px 9px;border-radius:999px;font-size:11.5px;font-weight:620}
.pill.read{background:#1e293b;color:#93c5fd}
.pill.write{background:#3b2f14;color:#fbbf24}
.pill.irreversible{background:#3f1d1d;color:#fca5a5}
.pill.terminal,.pill.done{background:#1e3a2a;color:#86efac}
.pill.running,.pill.starting{background:#1e293b;color:#93c5fd}
.pill.escalate{background:#3b2f14;color:#fbbf24}
.pill.error,.pill.killed,.pill.budget{background:#3f1d1d;color:#fca5a5}
.ok{color:var(--ok)}.bad{color:var(--bad)}.warn{color:var(--warn)}.dim{color:var(--dim)}
.turn{border-left:2px solid var(--line);padding:0 0 4px 14px;margin:0 0 18px}
.turn.rejected{border-left-color:var(--bad)}
.turn h3{font-size:13px;color:var(--dim);margin:0 0 6px;font-weight:600}
.approval{background:#2a1512;border:1px solid #7f1d1d;border-radius:10px;padding:16px;margin-bottom:16px}
.approval h2{color:#fca5a5}
.approval .target{font-size:18px;font-weight:650;margin:8px 0}
.approval .btns{display:flex;gap:10px;margin-top:14px}
.approval .btns form{flex:1}.approval .btns button{width:100%}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px}
.metric{background:#0b0d10;border:1px solid var(--line);border-radius:8px;padding:10px 12px}
.metric .k{font-size:11px;color:var(--dim);text-transform:uppercase;letter-spacing:.05em}
.metric .v{font-size:19px;font-weight:620;margin-top:3px;font-variant-numeric:tabular-nums}
.note{background:#111827;border-left:3px solid var(--acc);padding:10px 14px;border-radius:0 7px 7px 0;
font-size:13.5px;color:#cbd5e1;margin-bottom:16px}
@media(max-width:620px){main{padding:10px}.card{padding:13px}header{padding:9px 12px}}
`;

export function layout(title, body, opts = {}) {
  const sse = opts.sse
    ? `<script>
const es=new EventSource(${JSON.stringify(opts.sse)});
let t=null;
es.onmessage=()=>{clearTimeout(t);t=setTimeout(async()=>{
  try{const r=await fetch(location.pathname.replace(/\\/$/,'')+'/fragment');
  if(r.ok){document.getElementById('live').innerHTML=await r.text();}}catch(e){}
},150)};
</script>`
    : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} — Countervail spike</title><style>${CSS}</style></head><body>
<header>
  <span class="brand">Countervail</span>
  <span class="tag">spike · ${esc(config.model)}</span>
  <span style="flex:1"></span>
  <a href="/">Runs</a><a href="/metrics">Metrics</a>
</header>
<main>${body}</main>${sse}
</body></html>`;
}

const fmtBytes = (b) => (b === null || b === undefined ? '—' : (b / 1024 / 1024).toFixed(0) + ' MB');
const fmtTok = (n) => (n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n));
const ago = (t) => {
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return s + 's ago';
  if (s < 3600) return Math.round(s / 60) + 'm ago';
  return Math.round(s / 3600) + 'h ago';
};

export function dashboard(runs) {
  const rows = runs.length
    ? runs
        .map(
          (r) => `<tr>
<td><a href="/runs/${r.id}" class="mono">${r.id}</a></td>
<td>${esc(r.vendor)}</td>
<td><span class="pill ${esc(r.status)}">${esc(r.status)}</span></td>
<td class="mono">${r.metrics.turns}</td>
<td class="mono">$${r.metrics.spend.toFixed(3)}</td>
<td class="dim">${ago(r.createdAt)}</td></tr>`,
        )
        .join('')
    : '<tr><td colspan="6" class="dim">No runs yet.</td></tr>';

  return layout(
    'Runs',
    `
<div class="note"><strong>This is the spike.</strong> No vault, no policy gate, no audit chain.
Credentials entered below are held in memory for the run only and are never encrypted at rest.
Point it only at an account you are prepared to lose. The measurements are the deliverable —
the cancellation is not.</div>

<div class="card">
<h1>Start a run</h1>
<form method="post" action="/runs">
  <div class="row">
    <div><label>Vendor</label><input name="vendor" placeholder="Acme Streaming" required></div>
    <div><label>Start URL</label><input name="startUrl" type="url" placeholder="https://acme.example/account" required></div>
  </div>
  <label>Allowed origins <span class="dim">— space separated. Any goto outside these is refused at plan time.</span></label>
  <input name="allowOrigins" placeholder="https://acme.example https://login.acme.example" required>
  <label>Objective</label>
  <textarea name="objective" required>Cancel the active subscription on this account so that billing stops, and capture a confirmation artifact proving it.</textarea>

  <h2 style="margin-top:22px">Mandate <span class="dim" style="text-transform:none;letter-spacing:0">— answered once, so the agent never asks mid-run</span></h2>
  <div class="check"><input type="checkbox" name="declineOffers" value="1" checked id="a"><label for="a">Decline all retention offers</label></div>
  <div class="check"><input type="checkbox" name="refuseDowngrade" value="1" checked id="b"><label for="b">Refuse a downgrade to a cheaper tier</label></div>
  <div class="check"><input type="checkbox" name="refusePause" value="1" checked id="c"><label for="c">Refuse a pause instead of a cancellation</label></div>
  <label>Identity evidence the agent may use <span class="dim">— free text, e.g. "billing zip 94110, card ending 4242"</span></label>
  <input name="identityEvidence" placeholder="leave empty to escalate on any identity challenge">

  <h2 style="margin-top:22px">Secrets <span class="dim" style="text-transform:none;letter-spacing:0">— referenced as @secret:name, never shown to the model</span></h2>
  <div class="row">
    <div><label>username</label><input name="s_username" autocomplete="off"></div>
    <div><label>password</label><input name="s_password" type="password" autocomplete="off"></div>
  </div>

  <div style="margin-top:20px"><button type="submit">Start run</button></div>
</form>
</div>

<div class="card">
<h2>Runs</h2>
<table><thead><tr><th>ID</th><th>Vendor</th><th>Status</th><th>Turns</th><th>Spend</th><th>Started</th></tr></thead>
<tbody>${rows}</tbody></table>
</div>`,
  );
}

function approvalPanel(run) {
  if (!run.pending) return '';
  const p = run.pending;
  return `<div class="approval">
<h2>Approval required — irreversible</h2>
<div class="dim">The agent wants to click a target whose accessible name matches the commit heuristics.</div>
<div class="target">${esc(p.targetName || p.op.text || p.op.ref || '(unnamed target)')}</div>
<div class="mono dim">${esc(p.url)}</div>
<pre>${esc(JSON.stringify(p.op, null, 2))}</pre>
<div class="btns">
<form method="post" action="/runs/${run.id}/approve"><input type="hidden" name="decision" value="approve"><button class="ok" type="submit">Approve</button></form>
<form method="post" action="/runs/${run.id}/approve"><input type="hidden" name="decision" value="deny"><button class="danger" type="submit">Deny</button></form>
</div></div>`;
}

function metricPanel(run) {
  const s = summarise(run);
  const g = gradeRun(s);
  const cell = (k, v, pass) =>
    `<div class="metric"><div class="k">${k}</div><div class="v ${pass === null || pass === undefined ? '' : pass ? 'ok' : 'bad'}">${v}</div></div>`;
  return `<div class="card"><h2>Measurements <span class="dim" style="text-transform:none;letter-spacing:0">— coloured against the gate</span></h2>
<div class="grid">
${cell('Turns', s.turns, g.turns)}
${cell('Spend', '$' + s.spend.toFixed(3), g.spend)}
${cell('Snapshot p95', fmtTok(s.snapshotP95Tokens) + ' tok', g.snapshotP95Tokens)}
${cell('Snapshot max', fmtTok(s.snapshotMaxTokens))}
${cell('Peak RSS', fmtBytes(s.peakRssBytes), g.peakRssBytes)}
${cell('Wall clock', s.wallClockS.toFixed(0) + 's', g.wallClockS)}
${cell('Truncated turns', s.truncatedTurns)}
${cell('Human seconds', s.humanSeconds.toFixed(0) + 's')}
${cell('Approvals', s.approvalsGranted + '/' + s.approvalsRequested)}
${cell('Tokens in/out', fmtTok(s.inputTokens) + ' / ' + fmtTok(s.outputTokens))}
</div>
<div class="dim" style="margin-top:12px;font-size:12.5px">Snapshot mode: ${esc(JSON.stringify(s.modes))}.
Cost assumes $${config.priceIn}/$${config.priceOut} per MTok and no prompt caching — verify before quoting it.</div>
</div>`;
}

export function runFragment(run) {
  const turns = run.turns
    .map((t) => {
      const rejected = t.results.some((r) => r.op.op === 'plan' || r.op.op === 'parse');
      const prose = t.text.replace(/```cv_ops[\s\S]*?```/g, '').trim();
      const opsList = t.ops.length ? `<pre>${t.ops.map((o) => esc(JSON.stringify(o))).join('\n')}</pre>` : '';
      const res = t.results.length
        ? `<pre>${t.results
            .map(
              (r) =>
                `${r.ok ? '<span class="ok">ok</span>' : '<span class="bad">FAILED</span>'} ${esc(r.op.op)} — ${esc(r.detail)}` +
                (r.artifact ? ` <a href="/artifacts/${esc(r.artifact)}">[artifact]</a>` : ''),
            )
            .join('\n')}</pre>`
        : '';
      return `<div class="turn ${rejected ? 'rejected' : ''}">
<h3>Turn ${t.n} · ${t.latencyMs}ms · $${t.spend.toFixed(4)} · snapshot ${fmtTok(t.snapshotTokensEst)} tok${t.truncated ? ' <span class="warn">(truncated)</span>' : ''} · ${fmtBytes(t.rssBytes)}</h3>
${prose ? `<div style="margin-bottom:6px">${esc(prose)}</div>` : ''}
${opsList}${res}</div>`;
    })
    .join('');

  return `${approvalPanel(run)}${metricPanel(run)}
<div class="card"><h2>Transcript</h2>${turns || '<div class="dim">Waiting for the first turn…</div>'}</div>`;
}

export function runPage(run) {
  return layout(
    `Run ${run.id}`,
    `<div class="card">
<h1>${esc(run.vendor)} <span class="pill ${esc(run.status)}">${esc(run.status)}</span></h1>
<div class="mono dim">${esc(run.id)} · ${esc(run.startUrl)}</div>
${run.outcomeNote ? `<div class="note" style="margin-top:12px"><strong>${esc(run.status)}:</strong> ${esc(run.outcomeNote)}</div>` : ''}
<div style="margin-top:12px"><form method="post" action="/runs/${run.id}/kill"><button class="danger" type="submit">Kill switch</button></form></div>
</div>
<div id="live">${runFragment(run)}</div>`,
    { sse: `/runs/${run.id}/events` },
  );
}

export function metricsPage(runs) {
  const rows = runs
    .map((r) => {
      const s = summarise(r);
      const g = gradeRun(s);
      const c = (v, pass) =>
        `<td class="mono ${pass === null || pass === undefined ? '' : pass ? 'ok' : 'bad'}">${v}</td>`;
      return `<tr><td><a href="/runs/${r.id}" class="mono">${r.id}</a></td>
<td>${esc(r.vendor)}</td><td><span class="pill ${esc(r.status)}">${esc(r.status)}</span></td>
${c(s.turns, g.turns)}${c('$' + s.spend.toFixed(3), g.spend)}
${c(fmtTok(s.snapshotP95Tokens), g.snapshotP95Tokens)}${c(fmtBytes(s.peakRssBytes), g.peakRssBytes)}
${c(s.wallClockS.toFixed(0) + 's', g.wallClockS)}
<td class="mono">${s.humanSeconds.toFixed(0)}s</td><td class="mono">${s.approvalsGranted}/${s.approvalsRequested}</td></tr>`;
    })
    .join('');

  return layout(
    'Metrics',
    `<div class="card"><h1>Gate</h1>
<div class="dim" style="margin-bottom:12px">Thresholds from spike/README.md. Numbers to argue with, not to trust.</div>
<table><thead><tr><th>Metric</th><th>Threshold</th><th>Why it matters</th></tr></thead><tbody>
<tr><td>Turns</td><td class="mono">&le; ${gate.turns}</td><td class="dim">More turns means the a11y tree is not legible enough to act on</td></tr>
<tr><td>Spend / run</td><td class="mono">&le; $${gate.spend.toFixed(2)}</td><td class="dim">Decides whether deterministic path caching is required rather than nice</td></tr>
<tr><td>Snapshot p95</td><td class="mono">&le; ${fmtTok(gate.snapshotTokens)} tok</td><td class="dim">The single biggest token cost in the system</td></tr>
<tr><td>Peak RSS</td><td class="mono">&le; ${fmtBytes(gate.rssBytes)}</td><td class="dim">The Pi 4 4GB assumption in appliance.md</td></tr>
<tr><td>Wall clock</td><td class="mono">&le; ${gate.wallClockS}s</td><td class="dim">Session expiry on hostile sites is real</td></tr>
</tbody></table></div>

<div class="card"><h2>Runs</h2>
<table><thead><tr><th>ID</th><th>Vendor</th><th>Status</th><th>Turns</th><th>Spend</th><th>Snap p95</th><th>Peak RSS</th><th>Wall</th><th>Human</th><th>Appr</th></tr></thead>
<tbody>${rows || '<tr><td colspan="10" class="dim">No runs yet.</td></tr>'}</tbody></table>
<div class="dim" style="margin-top:12px;font-size:12.5px">Per-turn detail is appended to <span class="mono">var/runs/&lt;id&gt;.jsonl</span>.
That file is the artifact worth keeping when this directory is deleted.</div>
</div>`,
  );
}
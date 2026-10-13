# spike/

**Throwaway. Delete this directory when it has answered its questions.**

The one exception is `src/ui.js` and `src/server.js` — the web chassis is
built as the real thing and is intended to survive into the Phase 1.5 admin
UI. Everything else here is scaffolding with a short life.

## What it is for

Two questions can invalidate the architecture, and both are currently
scheduled for week 8+ where finding out is expensive:

1. **Can a model drive a hostile SPA through an accessibility tree at
   acceptable token cost?** `docs/harness.md` calls a11y serialisation "the
   single biggest token cost in the system and deserves measurement before
   design" — and then schedules the measurement after the runtime that
   depends on it.
2. **Does headless Chromium fit on a Pi 4?** `docs/appliance.md` calls this
   "the load-bearing assumption… most likely to be wrong".

The cancellation is not the deliverable. **The measurements are.**

## Gate

Run against one real vendor you hold a real account with. Numbers to argue
with, not to trust:

| | Target |
|---|---|
| Turns to completion | < 25 |
| Cost per run | < $0.50 |
| p95 snapshot, post-truncation | < 15k tokens |
| Peak browser RSS (process tree) | < 2.5 GB |
| Wall clock | < 5 min |

Run it on arm64 if you can — ideally on the Pi itself, which gets you the
`appliance.md` week-8 measurement in week 1.

## Running

    cp spike/env.sample .env      # see the template below
    npm install
    npm run spike:install-browser
    npm run spike

Open http://127.0.0.1:8080.

On a Pi, reach it over WireGuard or an SSH tunnel. Do not bind 0.0.0.0.

### Config template

Write this to `.env` in the repo root, mode 600:

    ANTHROPIC_API_KEY=

    # Model + output ceiling. Check the model id is current before
    # trusting any cost number this produces.
    CV_MODEL=claude-sonnet-4-5
    CV_MAX_TOKENS=4096

    # Pricing assumption, USD per million tokens, used only to compute
    # $/run. VERIFY against current pricing or every cost figure the
    # spike reports is wrong by a constant factor.
    CV_PRICE_IN=3.00
    CV_PRICE_OUT=15.00

    # Budget ceilings. The run hard-stops on any of them.
    CV_MAX_TURNS=25
    CV_MAX_SPEND_PER_RUN=0.50
    CV_MAX_WALL_CLOCK_S=600

    # Accessibility-tree truncation. The single biggest token cost in
    # the system; this value is what the spike exists to calibrate.
    CV_MAX_SNAPSHOT_CHARS=60000

    # Browser
    CV_HEADLESS=true
    # Set on Raspberry Pi OS if Playwright's bundled arm64 Chromium
    # will not run:
    # CV_CHROMIUM_PATH=/usr/bin/chromium

    # Web chassis
    CV_WEB_BIND=127.0.0.1
    CV_WEB_PORT=8080

## What is deliberately missing

No vault, no policy gate, no audit chain, no proof-of-relationship check, no
rate limiting, no hash chain, no mandate engine. Credentials go in the start
form in plaintext and are held in memory for the run only. **This is not a
security boundary and this code must never be pointed at anything you are not
prepared to lose.**

The one safety property it does have is the irreversible-op class: any click
whose accessible name matches the commit heuristics stops for human approval
in the web UI, with the exact target shown. That is also the main thing being
user-tested.

## Reading the results

Every turn appends to `var/runs/<id>.jsonl`. `/metrics` renders the
cross-run table and colours each cell against the gate. The JSONL is the
artifact worth keeping when the rest of this directory is deleted.

## Known shortcuts

- **Op reordering.** Irreversible ops are pushed to the end of their batch so
  they can be approved one at a time. Order is preserved among everything
  else. A model that interleaves a commit click mid-batch will see its ops
  run out of order; the real harness will need to split the batch instead.
- **Ref stability.** Element refs come from Playwright's internal
  `_snapshotForAI()` when available, falling back to a ref-less public
  `ariaSnapshot()` where the model must address elements by text. Which of
  these you got is recorded per turn — if the fallback fires, the token
  numbers are not comparable.
- **Token estimate for snapshots** is `chars / 4`. Real totals come from the
  API response and are exact; the snapshot-specific figure is not.
- **No prompt caching.** Every turn resends the whole transcript. This
  inflates `$/run` against what the real harness will pay, so treat the cost
  figure as a pessimistic bound.
- **RSS** is summed over the Chromium process tree by walking `/proc` and is
  Linux-only. Elsewhere it records null.
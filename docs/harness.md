# The local harness

**Status: design only. No code exists.** This document fixes the shape of the
runtime so that Phase 0 can be built without relitigating it. Where a decision
is provisional it says so.

The harness is the thing that holds the API key, decides what the model is
allowed to do, does it, and writes down what happened. It runs on the user's
own machine — a Raspberry Pi 4 appliance is the reference deployment
([appliance.md](appliance.md)) — and it is the whole product minus the
channels.

## Shape

One long-running Node 22 process. No agent framework, no tool-calling API, no
Docker at runtime, no database server.

    countervail/
      bin/countervail.js          CLI entry
      src/harness/
        loop.js                   turn loop, budget, escalation
        parser.js                 cv_ops block -> ops[]
        plan.js                   validate + policy gate (touches nothing)
        apply.js                  execute, journal, snapshot
        policy.js                 proof-of-relationship, rate limits, kill switch
        vault.js                  secret handles; secrets never enter a prompt
        audit.js                  hash-chained append-only log
        budget.js                 token and wall-clock ceilings per run
      src/providers/anthropic.js  the only provider at first
      src/channels/web/           Playwright driver
      src/channels/email/         SMTP relay out, IMAP in
      src/channels/voice/         AudioSocket bridge to Asterisk
      src/maneuvers/              YAML maneuver definitions
      src/web/                    admin UI (same process, Fastify)
      var/                        state, audit chain, artifacts  (gitignored)

Single process keeps the Pi honest: one systemd unit, one memory ceiling, one
place the key lives. The web UI is a route table inside the harness rather than
a second service, because the thing it mostly does — show the escalation queue
and take a yes/no — needs the live run state anyway.

Node, not Python, because the browser channel is Playwright and the provider
SDK is first-class there. Orata's FastAPI UI is the better-trodden path for a
Pi admin page, but two runtimes on one appliance is a maintenance tax we would
pay forever to avoid writing a few hundred lines of HTML.

## cv_ops — the protocol

The model emits one fenced block per turn. The harness parses it, validates the
whole batch, and only then executes. Same envelope discipline as davai: JSON
for structure, out-of-band payload blocks for anything multi-line, so email
bodies keep their exact whitespace and need no escaping.

````
```cv_ops
{"ops": [
  {"op": "browse.read", "what": "main"},
  {"op": "browse.fill", "field": "password", "value": "@vault:acme/password"},
  {"op": "browse.click", "target": "Cancel membership"},
  {"op": "capture", "label": "post-cancel confirmation"}
]}
```
````

### Op table

| Op | Class | Notes |
|---|---|---|
| `browse.goto` | read | allowlisted origin only |
| `browse.read` | read | accessibility tree, not raw DOM; truncated and budgeted |
| `browse.find` | read | text/role query, returns stable handles |
| `browse.fill` | write | value may be a `@vault:` handle |
| `browse.click` | write | **irreversible** if the target matches the commit heuristics |
| `mail.search` / `mail.read` | read | the maneuver's own address only |
| `mail.send` | write | always irreversible |
| `voice.call` | write | always irreversible |
| `voice.say` / `voice.dtmf` / `voice.listen` / `voice.hangup` | write | live call only |
| `capture` | read | screenshot + DOM snapshot + transcript slice -> artifact store |
| `assert` | read | records a success-criterion check against the maneuver contract |
| `escalate` | terminal | hands to the human with a question and the context |
| `schedule` | write | re-enter this maneuver at a future time (deadline follow-up) |
| `done` | terminal | claims an outcome; must cite captured artifacts |

Three classes, and the distinction is the whole safety model:

- **read** ops run freely inside the batch.
- **write** ops that are reversible run after the read ops, still unattended.
- **irreversible** ops are segregated exactly as davai segregates `shell`: the
  rest of the batch commits first, then each one stops for human approval, one
  at a time, with the exact payload shown. A denial kills the remainder.

What counts as irreversible is decided by the harness, never by the model. Any
`mail.send`, any `voice.call`, and any `browse.click` whose target text or
destination matches the commit heuristics (confirm, pay, delete, accept offer,
agree) is irreversible by default. A maneuver may pre-authorise a specific
irreversible op in its definition — that is how `cancel-subscription` clicks
its own cancel button without a prompt — but it cannot pre-authorise a class.

### Atomic plan/apply

Borrowed wholesale from davai, because the failure mode is the same: a batch
that half-applies leaves the agent and the world disagreeing about state.

1. **Plan.** Every op validated — target exists, origin allowlisted, vault
   handle resolvable, maneuver permits this channel. Then the policy gate runs
   over the batch as a unit. Nothing is executed. A failure returns the op
   index and reason to the model and the batch is discarded whole.
2. **Apply.** Journal the intent, execute, record each result and artifact into
   the audit chain. Browser state is snapshotted before each write op so a
   failed step can be reported with the page as it was.

There is no rollback for the world — you cannot un-send an email. That is
precisely why the irreversible class exists and why plan/apply is strict: the
only real protection is refusing to start.

## Secrets never enter the context

The model sees `@vault:acme/password`, never the password. Substitution happens
in `apply.js`, after the op has passed policy. A captured screenshot is scanned
for input values before it is stored and the model only ever receives the
artifact id, not the image.

This is a hard rule because the alternative — trusting a prompt instruction not
to echo a credential — is not a security boundary. It also means the provider
never receives user credentials, which is a materially different sentence to
put in front of a user than "we send them but ask nicely".

Vault at rest: libsodium secretbox, key derived from the admin password with
Argon2id, held in memory only while the harness is unlocked. A reboot requires
an unlock before any credentialed maneuver can run. Uncredentialed ones —
statutory email, which needs no login — keep running. This is a deliberate
split: the highest-leverage channel is also the one that needs no secret.

## The policy gate

Every batch passes through it. It is not advisory and it is not in the prompt.

- **Proof of relationship.** The maneuver run carries a proof record — a parsed
  confirmation email, a successful login, a billing line item. No proof, the
  gate refuses every write op against that target. Checked per batch, not once
  at maneuver start, because the target can change mid-run.
- **Per-target rate limit.** Local counters, and a signed count published to a
  shared coordinator if one ever exists. On a single-user appliance the global
  limit of PLAN.md §2.2 cannot be enforced locally; say so plainly rather than
  pretending otherwise. What the appliance *can* enforce is a per-target
  ceiling that makes a single box useless as an attack tool.
- **Budget.** Tokens, wall clock, and spend per maneuver run, with a hard stop.
  A stuck agent that loops a page read is the common failure, and on metered
  API credit it is an expensive one.
- **Kill switch.** One file, one UI button. Stops all runs, hangs up live
  calls, refuses new ones.
- **Disclosure.** Any outbound text or speech is checked to contain the
  self-identification clause before it leaves. Truthful self-identification is
  in §2.3 as a principle; this is where it becomes a mechanism.
- **Mandate.** The user's standing answers for this run, captured before it
  started. The gate consults it to decide whether an action is already
  authorised, needs a human, or must be refused outright. An op the mandate
  covers runs unattended; one it does not becomes an `escalate`. See
  [decisions.md](decisions.md).

## Verification is a separate loop

The agent run ends at "cancellation submitted, confirmation id captured". That
is not success. `schedule` re-enters the maneuver one billing cycle later to
check the charge is absent — which is the actual success criterion, and the
reason this is a daemon rather than a CLI one-shot.

The appliance is always on. That is the single strongest argument for this
deployment over a hosted service: longitudinal verification was the thing that
looked like it required hosting, and a Pi in a cupboard does it for free with
none of the credential-custody liability.

## Configuration

`~/.countervail/.env`, mode 600, dotenv, same conventions as davai:

    CV_PROVIDER=anthropic
    ANTHROPIC_API_KEY=
    #CV_MODEL=
    CV_EFFORT=high
    CV_MAX_SPEND_PER_RUN=0.50
    CV_UNATTENDED=false          # fire safe defaults instead of waiting for a human
    CV_UNATTENDED_MAX_HOURS=12   # a session toggle expires; scheduled runs never inherit it
    CV_WEB_BIND=127.0.0.1
    CV_WEB_PORT=8080

Anthropic first and only. A provider interface exists from day one so the
second one is not a rewrite, but shipping one adapter well beats three that
mostly work. Model choice is a per-maneuver setting too: the web channel wants
a strong model, hold-queue DTMF navigation does not.

## Open

- Accessibility-tree serialisation format and truncation policy. This is the
  single biggest token cost in the system and deserves measurement before
  design.
- Whether `assert` results should be model-authored at all, or derived purely
  by the harness from the maneuver's `success_criteria`. Leaning harness-only:
  letting the model grade its own homework is how you get fake success.
- Multi-user on one appliance. Assumed single-household for now.
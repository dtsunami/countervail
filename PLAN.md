# Countervail — Plan

Living document. Written at project inception; expect the later phases to be wrong in
ways that only become visible after Phase 1 ships.

---

## 1. Framing

### The problem, stated precisely

Friction asymmetry is a deliberate business strategy. The cost of imposing friction on
a customer is near zero and falls on the company; the cost of absorbing it is high and
falls on the customer. Companies optimize this gap because it converts directly into
retained subscriptions, unclaimed refunds, and harvested consent.

### The intervention

Drive the cost of *absorbing* friction toward zero. The point is not to win individual
arguments but to make the strategy stop paying.

### Why now

- Voice models can hold a real-time phone conversation well enough to sit in a queue
  and answer scripted retention questions.
- Browser agents can navigate hostile, changing DOMs without per-site scrapers.
- Privacy law gives machine-actionable rights with statutory deadlines (GDPR 30 days,
  CCPA 45 days) — these are the highest-leverage maneuvers because non-compliance is
  itself a violation.

### The honest risks

| Risk | Severity | Note |
|---|---|---|
| Bot detection and IP blocking | High | Expect an arms race. Statutory email/post channels are the durable fallback precisely because they cannot be CAPTCHA'd. |
| ToS violation / account termination | High | The user bears this risk. It must be disclosed per-maneuver, not buried once at signup. |
| Agent errors with financial impact | High | Cancelling the wrong service. Mitigation: confirm-before-commit on anything irreversible. |
| Abuse as a harassment vector | High | See anti-abuse posture. Design constraint from day one. |
| Credential custody | High | We will hold the keys to people's accounts. This is the single largest liability in the project. |
| Voice-cloning / consent law | Medium | Two-party consent states require call-recording disclosure. Synthetic voice disclosure law is moving. Posture and bright lines in [docs/tts.md](docs/tts.md). |

---

## 2. Anti-abuse posture

Non-negotiable, because the failure mode is that we build a harassment platform by
accident.

1. **Proof of relationship.** An agent acts against a target only when the user can
   demonstrate an existing relationship — a confirmation email, an account login, a
   billing record. No proof, no maneuver.
2. **Per-target rate limits.** Enforced globally across all users, not just per user.
   If a thousand accounts suddenly target one small business, that is an attack and the
   system should stall, not scale.
3. **Truthful self-identification.** The agent states it is an automated agent acting
   for a named principal when asked, and in every written communication. We are not
   building a deception tool, and the legal footing for agency is much stronger when
   disclosed.
4. **No third-party impersonation.** The agent is never a person other than the
   authenticated user's authorized representative.
5. **Full audit trail, user-exportable.** If we cannot show exactly what the agent did,
   we should not have done it.
6. **Target appeal path.** A documented way for a company to report misuse and get a
   human response. Build it before we need it.

---

## 3. Core abstraction: the maneuver

A maneuver declares an **outcome**, not a script. Scripts break when a page changes;
outcomes survive.

```yaml
maneuver: cancel-subscription
outcome:
  billing_stops: true
  confirmation_artifact: required
inputs:
  - vendor
  - account_identity
  - billing_proof
strategies:                      # ordered by cost, cheapest first
  - web.self_serve
  - web.chat_agent
  - email.statutory              # ROSCA / state auto-renewal law
  - voice.retention_queue
  - post.certified               # slow, but creates legal record
mandate:                         # the user's standing answers, captured at start
  retention_offers: decline_all  # so the agent never asks mid-call
  downgrade_instead: false
  pause_instead: false
  spend_authority: 0.00          # yes is not delegable by default
escalate_when:                   # only what the mandate genuinely cannot cover
  - identity_verification_required
  - offer_outside_mandate
  - irreversible_side_effect_detected
success_criteria:
  - confirmation_id_captured OR
  - billing_absent_for_one_cycle
```

Design notes:

- **Strategies are ordered by cost**, and the runtime walks down the list. Most
  cancellations should resolve in the web tier.
- **Success is verified, not assumed.** "The agent clicked cancel" is not success. The
  charge not appearing next cycle is success. This requires longitudinal tracking and
  is the main reason the system needs persistent state rather than one-shot runs.
- **Escalation is a first-class outcome**, not an error. Any offer, legal threat, or
  irreversible action goes to the human.
- **The mandate is how the human decides without being interrupted.** Every decision a
  maneuver is *known* to hit — a retention offer, a downgrade pitch — is answered once
  in the start form rather than paged about mid-run. The agent may say no on the user's
  behalf; saying yes to cost or commitment is not delegable by default. The full
  decision model, escalation tiers and the friction budget are in
  [docs/decisions.md](docs/decisions.md).

---

## 4. Phasing

### Phase 0 — Foundations (weeks 1–3)

Goal: the boring parts, done properly, because retrofitting them is painful.

- [ ] Repo scaffolding, CI, license decision
- [ ] Maneuver schema + validator
- [ ] Audit log: append-only, hash-chained, user-exportable
- [ ] Identity vault spike — evaluate client-side encryption so the server cannot
      decrypt credentials at rest. **This constrains the whole architecture; decide early.**
- [ ] Policy engine skeleton: proof-of-relationship checks and rate limits as a gate
      every maneuver passes through

**Exit:** a maneuver can be defined, validated, and rejected by policy. Nothing
executes yet.

### Phase 1 — One channel, one maneuver, end to end (weeks 4–9)

Goal: prove the hardest honest thing — that verified success is achievable.

- [ ] Browser agent runtime (headless, with a visible-session debug mode)
- [ ] `cancel-subscription` via `web.self_serve` only
- [ ] Five named target vendors, chosen for *difficulty spread*: one easy, two
      moderate, two with known retention gauntlets
- [ ] Confirmation artifact capture: screenshot, DOM snapshot, confirmation ID, email receipt
- [ ] Human escalation UI — minimal, but real
- [ ] Longitudinal verification: did the charge actually stop?

**Exit:** 5/5 vendors cancelled with captured artifacts, verified against the next
billing cycle, at **under 60 human-seconds per cancellation** end to end. If this
phase cannot clear a 60% success rate, the thesis needs revisiting before more is
built — and if it clears the success rate but not the friction budget, it has failed
its own argument. See [docs/decisions.md](docs/decisions.md#the-friction-budget).

### Phase 1.5 — Appliance substrate (weeks 8–12, overlaps Phase 1)

Goal: the thing the user actually touches. Deferred until the browser channel
has proven something, but not to the end, because the deployment target
constrains the runtime and finding that out late is expensive.

- [ ] Harness daemon: `cv_ops` parser, plan/apply, policy gate, budget ceiling
      — see [docs/harness.md](docs/harness.md)
- [ ] Vault: Argon2id-derived key, secretbox at rest, secrets never enter a prompt
- [ ] Web UI: dashboard, **approvals queue**, runs, receipts, diagnostics
- [ ] Privileged helper over a unix socket with an enumerated schema, no
      "write this file" verb
- [ ] First-boot provisioning: per-device password and secrets
- [ ] **Measure headless Chromium on a Pi 4 against the two hardest Phase 1
      vendors.** This is the load-bearing hardware assumption; if it fails, the
      deployment story changes and it is better to know in week 9 than week 30.

**Exit:** a Phase 1 cancellation driven start to finish from the web UI on a
Pi, with approval taken on a phone over WireGuard.

### Phase 2 — Statutory channel (weeks 10–16)

The highest-leverage tier, because the law supplies deadlines and the channel cannot be
CAPTCHA'd.

- [ ] Email channel with per-user sending identity and deliverability hygiene
- [ ] GDPR Art. 15 (access) and Art. 17 (erasure) maneuvers
- [ ] CCPA/CPRA deletion maneuver
- [ ] Jurisdiction detection — which rights does this user actually have against this entity?
- [ ] Statutory deadline tracking with automatic follow-up
- [ ] Non-compliance escalation: generate the regulator complaint, let the user file it

**Exit:** erasure requests tracked to statutory deadline with automated follow-up and a
complaint package on expiry.

### Phase 3 — Voice (weeks 17–26)

Hardest tier. Deferred deliberately.

- [ ] Telephony integration, per-jurisdiction call-recording consent
- [ ] Hold-queue navigation (IVR traversal, hold detection, callback handling)
- [ ] Retention-script handling with hard escalation on any offer
- [ ] Call transcript as audit artifact
- [ ] Synthetic-voice disclosure at call open

**Exit:** a cancellation completed by phone, with a transcript and confirmation ID,
where the web tier dead-ended.

### Phase 4 — Surface (weeks 27+)

- [ ] CLI
- [ ] Consumer app — inbox/subscription discovery, "cancel this" affordance
- [ ] Maneuver authoring for third parties
- [ ] Public maneuver library

---

## 5. Legal grounding

**This section needs review by an actual lawyer before any of it is relied upon.** It
is a research starting point, not advice.

Useful footings:

- **ROSCA** (Restore Online Shoppers' Confidence Act, 15 U.S.C. §8403) — statutory,
  requires simple cancellation mechanisms for negative-option features. Durable anchor.
- **FTC Negative Option / "click-to-cancel" rule** — ⚠️ **status uncertain.** The
  amended rule was vacated by the Eighth Circuit in July 2025 on procedural grounds
  (inadequate preliminary regulatory analysis). The FTC may have repromulgated it since.
  **Verify current status before citing it in any maneuver.**
- **State auto-renewal laws** — California (BPC §17600 et seq.) and New York are the
  strongest; several states have click-to-cancel equivalents that survive independently
  of the federal rule.
- **GDPR Art. 12–22** — access, erasure, objection, with a one-month response deadline.
  Applies to any entity processing EU residents' data.
- **CCPA/CPRA** — deletion and opt-out rights, 45-day deadline, and explicit
  **authorized agent** provisions. The agent provisions matter enormously: they are
  arguably direct statutory authorization for exactly this product.
- **EU DSA Art. 25** — prohibits dark patterns on platforms. Newer, less tested.

Open legal questions:

- Does automated submission of statutory requests at scale change their legal
  character? CCPA contemplates authorized agents but likely not fleets of them.
- CFAA exposure for ToS-violating automation. The *Van Buren* and *hiQ* lines narrowed
  this considerably, but "narrowed" is not "resolved."
- Where does liability sit when the agent makes a costly mistake?
- Is credential custody alone a regulated activity in any target jurisdiction?

---

## 6. Open questions

Ranked by how much they block.

1. **Credential custody model.** Client-side encryption, OAuth-only, or a hosted vault?
   This decides the entire trust and architecture story and cannot be changed cheaply
   later. *Blocks Phase 0.*

   **Proposed answer (2026-10-12): we never hold them.** Secrets live encrypted
   on the user's own appliance, keyed from their password, and are substituted
   into ops by the harness after the policy gate — so they never enter a model
   prompt either. See [docs/harness.md](docs/harness.md#secrets-never-enter-the-context).
   This is contingent on 2.

2. **Hosted service or local-first?** Local-first dramatically reduces liability and
   credential risk; hosted is required for longitudinal verification and voice. A hybrid
   — local credentials, hosted orchestration — may thread it, at real complexity cost.

   **Proposed answer (2026-10-12): an always-on local appliance.** The dilemma
   assumed "local" meant a laptop. A Pi 4 in a cupboard is local *and* always
   running, so it can verify next month's billing statement and hold a DID.
   See [docs/appliance.md](docs/appliance.md). The honest cost: global
   per-target rate limits (§2.2) cannot be enforced across boxes we do not
   control, and there is no update mechanism yet. Both are open.
3. **License.** AGPL discourages a hosted competitor taking the work closed. Apache-2.0
   maximizes adoption and the shared maneuver library. The maneuver library arguably
   wants to be permissive even if the runtime is not.
4. **Business model.** If the product's purpose is to break an extractive economy, a
   subscription is an awkward fit. Per-maneuver pricing? Nonprofit or co-op?
   Contingency on recovered refunds? This also shapes the anti-abuse surface.
5. **How adversarial do we get?** There is a real line between "navigates the cancel
   flow for you" and "defeats bot detection." The second is a different product with a
   different risk profile. Decide deliberately rather than drifting across it.
6. **Naming inside the repo.** Working proposal from early discussion:
   `countervail` (org/platform) → `deburr` (runtime) → `squelch` (consumer app).
   Not settled; check package namespaces before committing.

---

## 7. Near-term next actions

1. Decide the credential custody model — it blocks everything in Phase 0.
   A proposal is now on the table (§6.1/§6.2): local appliance, local vault,
   secrets never reach the provider. Confirm or reject it before Phase 0 code.
2. Pick a license
3. Write the maneuver schema and validate it against three hand-written real-world
   cancellation flows, before writing any runtime code
4. Research current status of the FTC Negative Option Rule
5. Pick the five Phase 1 vendors and document their actual cancellation flows by hand —
   doing it manually first is the cheapest way to find out what the runtime must handle
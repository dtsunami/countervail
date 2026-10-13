# Who decides what

Two goals that sound compatible and are not:

- **Eliminate friction for the human.**
- **The human makes every real decision.**

Taken literally, the second destroys the first. An agent that asks before each
step has not absorbed the friction, it has reformatted it — forty minutes on
hold becomes forty notifications, which is arguably worse because it is forty
interruptions instead of one contiguous block you could at least plan around.

The resolution is not to take decisions away from the human. It is to **collect
them before they are needed**. Nearly every decision an agent hits mid-run is
one the user could have answered in advance, in bulk, calmly, in two minutes —
instead of being pinged about it individually while in a meeting.

> **The agent must never ask a question whose answer it already has.**
> Most escalations in a naive design are exactly that.

## The four classes

Every action the agent is about to take falls into one of these. The
classification is made by the harness from the maneuver definition and the
mandate, never by the model.

| Class | Agent | Example |
|---|---|---|
| **Mechanical** | acts, logs, does not report | click "next", read the page, press 2 for billing, sit on hold |
| **Within mandate** | acts, logs, reports in the summary | decline a retention offer when the mandate says decline all offers |
| **Needs a human** | stops, asks, waits | an offer outside the mandate, an identity challenge it cannot answer, anything irreversible and unanticipated |
| **Bright line** | refuses, tells the human, never asks | voiceprint authentication, impersonating a third party, acting without proof of relationship |

The fourth class matters and is easy to miss: some things are not escalations.
Asking "shall I defeat this voiceprint check?" is not giving the human a
decision, it is offering them a liability. The harness refuses and says why.
A question only goes to a human when "yes" is an answer we are willing to act on.

## The mandate

A mandate is the user's standing answers, captured once when the maneuver is
started, covering the decisions this maneuver class is known to hit. It is part
of the maneuver definition — the maneuver *knows* a cancellation will meet a
retention offer, because that is what retention queues are for.

```yaml
mandate:                       # answered once, at start, before anything runs
  retention_offers:
    policy: decline_all        # decline_all | escalate_all | accept_under
    accept_under: null         # e.g. "50% off for 12 months" — needs a human to set
  downgrade_instead:  false    # they will offer a cheaper tier. Still no?
  pause_instead:      false    # and a pause. Still no?
  identity_evidence:           # answer their verification questions from this
    - last_four_card
    - billing_zip
    - account_email
  spend_authority:    0.00     # currency the agent may commit. Default zero.
  contact_sharing:    minimal  # what it may disclose to establish identity
  deadline_followup:  auto     # chase a statutory deadline without asking
  complaint_package:  prepare  # prepare | prepare_and_notify | ask_first
```

Defaults are set per maneuver and are always the conservative answer. The user
can change them, and the ones that matter get surfaced in the start form in
plain language — three or four questions, not twelve. The rest live behind
"advanced" with sane values.

This is where the friction goes to die. A cancellation that would have
generated four mid-run interrupts generates zero, because the four answers were
given in one twenty-second form before the run started, when the user was
already thinking about it.

### Mandates do not expand

A mandate authorises the agent to say **no** on the user's behalf without
asking. Saying **yes** to anything with cost, commitment or an irreversible
side effect is not delegable by default — `spend_authority` exists and defaults
to zero deliberately. The asymmetry is the point: declining is always
reversible (you can always accept later), accepting usually is not.

## When the human is genuinely required

Three tiers, distinguished by who is waiting:

**Tier 1 — live blocking.** A call is in progress, a human rep is on the line,
and silence is costly. Seconds matter. The agent says it needs to check with
the account holder; the UI rings the phone as a call-like alert rather than a
notification. If no answer within the window, the **safe default** fires.

**Tier 2 — async blocking.** A web flow is paused mid-session. Minutes to an
hour, bounded by session expiry. Push notification, one tap, full payload
visible without scrolling. On expiry the agent records exactly where it stopped
and re-enters later rather than guessing.

**Tier 3 — non-blocking.** A deadline has passed, a complaint package is ready,
a verification found the charge still present. Nothing is waiting. These go
into a **daily digest**, never an individual notification. Most decisions are
Tier 3 and the common design error is paging the user for them.

The notification policy follows directly: ring for Tier 1, push for Tier 2,
digest for Tier 3, silence for everything else. An agent that sends a push
saying "starting your cancellation" has misunderstood the product.

## Safe defaults and the timeout rule

Every escalation is defined with a default that fires if the human does not
answer in time. The rule governing all of them:

> **A timeout resolves toward the user's stated outcome and never toward the
> counterparty's interest. Silence is never consent.**

For `cancel-subscription` every ambiguous mid-call decision has the same safe
answer — decline, and proceed with cancelling — because that is what the user
asked for. So a Tier 1 timeout is cheap: the agent declines the offer and
carries on, which is what the mandate would have said anyway.

What a timeout can never do is accept an offer, agree to a pause, confirm a
downgrade, incur a charge, or abandon the outcome. If the only available
default is one of those, it is not a defaultable decision and the agent holds
or hangs up with the state preserved.

## Unattended mode

The user may decide they do not want to be asked at all. That is a legitimate
setting and the product should have it. What it must not become is a switch
labelled "do whatever you want".

The definition that makes it safe is narrow and reuses machinery that already
exists:

> **Unattended mode does not grant permission. It fires the safe default
> immediately instead of waiting for the human.**

Every escalation already carries a safe default and a timeout. Unattended mode
sets that timeout to zero. Nothing else about the run changes, and in
particular the timeout rule above still governs: the default resolves toward
the user's stated outcome and never toward the counterparty's interest.

| Class | Attended | Unattended |
|---|---|---|
| Mechanical | act | act |
| Within mandate | act | act |
| Needs a human, has a safe default | ring or push, wait, default on timeout | fire the default now, log it, digest it |
| Needs a human, **no** safe default | ring or push, wait | **still stops** |
| Bright line | refuse | refuse |

Two rows carry the whole design.

**Row four.** A decision with no safe default is one where every available
answer is accepting a cost, a commitment or an irreversible side effect. There
is nothing for unattended mode to fire. The run parks with its state preserved
and goes to the digest. "The human is not available" is not an argument that
the counterparty's offer should be accepted.

**Row five.** Unattended mode is the absence of a prompt, not the presence of
authority. `spend_authority` stays wherever the mandate put it, which is zero
unless the user moved it. The bright lines are harness refusals and do not
consult this flag at all — a box in the user's house that will defeat a
voiceprint check if nobody is watching is the exact failure the bright lines
exist to prevent.

### Authentication is the clearest stop, but not the only one

Anything that needs a credential the vault does not hold stops regardless of
mode: an MFA or OTP code, a knowledge-based challenge outside
`identity_evidence`, a photo ID upload, a callback to a number on file. There
is no safe default for these because the only alternative to asking is
guessing, and guessing at an identity check is both useless and the fastest
way to get the user's account locked.

Voiceprint authentication is a bright line, not an escalation. It is refused,
not deferred, and unattended mode never sees it.

### Scope and expiry

davai's discipline, tightened, because the blast radius is different. There,
unattended mode risks a working directory that `git restore` brings back. Here
it risks money, legal correspondence and a phone call to a stranger.

- One run, or one explicit toggle with a time box. Never persisted to settings,
  never restored when a session resumes.
- **A scheduled re-entry never inherits it.** The verification loop re-enters a
  maneuver a month later to check the charge actually stopped; a flag set in a
  kitchen in March must not still be live in April. Scheduled runs always begin
  attended. This is the single most important line in this section, because a
  daemon that runs for months is exactly where a session flag goes to quietly
  outlive its task.
- The UI shows it persistently and in red while it is on, and the receipt
  distinguishes human-approved decisions from auto-resolved ones. If a run is
  ever contested, which of the two it was will be the first question.

### It should barely matter

If turning this on noticeably improves the experience, the mandate schema is
missing fields. A well-designed maneuver has already collected the answers to
everything it can anticipate, so unattended mode should find very little left
to resolve. The delta in human-seconds between attended and unattended runs of
the same maneuver is therefore a direct measurement of design rule 6 — and a
maneuver where that delta is large has a bad mandate, not a good yolo switch.

## The friction budget

Make it measurable or it will not survive contact with feature work.

> **Human-seconds per completed maneuver** is the primary product metric,
> measured end to end: the start form, every notification read, every approval
> tap, and the digest time attributable to the run.

Targets, to be argued with once there is data:

| | Target | Doing it yourself |
|---|---|---|
| `cancel-subscription`, web tier | < 60s | 5–40 min |
| `cancel-subscription`, voice tier | < 120s | 20–60 min |
| GDPR erasure incl. follow-ups | < 90s | 15 min + remembering for 30 days |

If a maneuver costs more human attention than doing it manually, it has failed
its own thesis regardless of its success rate, and shipping it makes the
project a worse version of its own argument. This belongs in the Phase 1 exit
criteria, next to the success rate.

Corollary worth stating: **a run that needed no human at all is the success
case, not a worrying one.** Full autonomy within a mandate the human wrote is
the human deciding — in advance, which is the only form of deciding that is
compatible with eliminating friction.

## Design rules

1. Never ask what the mandate answers.
2. Never ask what the harness should refuse.
3. Batch anything not blocking into the digest.
4. Every ask carries a safe default and a timeout.
5. Every ask is one tap, with the full payload visible without scrolling.
6. Every ask records *why the mandate did not cover it* — that log is the
   backlog for the next version of the mandate schema. A question asked twice
   across different runs is a missing mandate field, and should be reviewed as
   a defect rather than accepted as normal.
7. The summary afterwards says what the agent decided under mandate, not just
   what it did. The user should be able to audit delegated decisions without
   having been present for them.
8. Unattended mode removes the waiting, never the bounds. It fires safe
   defaults early; it does not create authority the mandate withheld.

Rule 6 is the mechanism that makes this get better over time instead of
plateauing. Instrument it from the first run.

## Open

- Can a mandate be saved as a reusable profile across maneuvers? Obvious
  convenience, but a standing mandate the user wrote six months ago and has
  forgotten is a worse form of consent than a fresh twenty-second form. Leaning
  toward per-run, pre-filled from last time, always shown.
- Tier 1 windows are unmeasured. How long a retention rep will actually hold
  while the agent "checks with the account holder" is an empirical question.
- Whether `accept_under` should exist at all in v1. It is the only mandate
  field that delegates a yes, and the one most likely to produce a bad outcome
  the user did not anticipate.
- Whether unattended mode should be per-channel rather than per-run. "Never ask
  me about erasure emails, always ask me about phone calls" is a reasonable
  thing to want and maps to how much the user stands to lose in each channel.
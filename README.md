# Countervail

**An agent platform that absorbs manufactured friction.**

Companies spend real engineering effort making some interactions easy and others
deliberately hard. Subscribing takes one click; cancelling takes a phone call during
business hours. Accepting cookies is a button; rejecting them is four nested menus.
Buying is instant; a refund requires three transfers and a reference number you were
never given. None of this friction is incidental. It is designed, measured, and
optimized — and the asymmetry is the product.

Countervail builds agents that take the other side of that asymmetry. You state the
outcome you want. The agent sits through the phone tree, clicks the dark pattern,
re-sends the email, and files the complaint — and gives you back a receipt.

> **Status: pre-alpha. Nothing here runs yet.** This repo currently contains a thesis
> and a plan. See [PLAN.md](./PLAN.md) for the roadmap and
> [open questions](./PLAN.md#open-questions).

---

## The thesis

The annoyance economy works because friction is cheap to impose and expensive to
absorb. A retention script costs a company pennies per call. It costs you forty
minutes and a measurable amount of goodwill. That gap is where the money is.

Agents invert the economics. The marginal cost of a machine waiting on hold is near
zero. Once absorbing friction is cheap, imposing it stops paying — not because anyone
was persuaded, but because the arbitrage closed.

This is a deliberately adversarial product. We should be honest about that rather
than dressing it up as a productivity tool.

## What it is meant to do

- **Cancel things.** Subscriptions, trials, gym memberships, services that require a
  phone call on a weekday.
- **Exercise rights you already have.** GDPR Art. 15/17 access and erasure requests,
  CCPA/CPRA deletion, opt-outs from data brokers. These are legally-backed and
  high-leverage.
- **Pursue what you are owed.** Refunds, delayed-flight compensation, billing-error
  disputes, warranty claims.
- **Reduce inbound noise.** Unsubscribes, marketing opt-outs, do-not-call
  registration, preference-center archaeology.
- **Keep the receipts.** Every run produces a timestamped, tamper-evident record of
  what was requested, when, through which channel, and what was said back. This is the
  part that matters when a company claims you never cancelled.

## What it is explicitly not

- Not a spam cannon. Agents act only on relationships the user can demonstrate they
  already have. See [anti-abuse](./PLAN.md#anti-abuse-posture).
- Not a way to generate volume against a target. Per-user, per-target rate limits are
  a core requirement, not a later hardening pass.
- Not a fraud tool. The agent represents the user truthfully, as an authorized agent.
  It does not impersonate third parties.
- Not a guarantee. Hostile interfaces change, bot detection improves, and some
  companies will simply refuse. The agent reports honest failure rather than fake
  success.

## Name

*Countervail* (v.): to counteract with equal force. It is the thesis stated as a verb.

## Architecture sketch

Three layers, deliberately separable:

```
  interface      consumer app / CLI / API
      |
   runtime       maneuver execution, state, retries, escalation
      |
  channels       web · voice · email · post
      |
  substrate      identity vault · audit log · policy engine
```

Deployment is **local-first and always-on**: a Raspberry Pi 4 appliance that
holds its own credentials, runs the agent against your own API key, and is
still there next month to check the charge actually stopped. Hardware under
$120, services under $40/year. See [docs/appliance.md](docs/appliance.md),
[docs/harness.md](docs/harness.md), [docs/channel-email.md](docs/channel-email.md)
and [docs/channel-voice.md](docs/channel-voice.md).

The **maneuver** is the core abstraction: a declarative description of an outcome
("cancel this subscription") plus a set of channel-specific strategies for achieving
it, ordered by cost. Try the self-serve web flow. If that dead-ends, send the
statutory email. If that is ignored, place the call. Escalate to the human only when
a decision genuinely requires one.

Details, phasing, and the unresolved parts are in [PLAN.md](./PLAN.md).

## Contributing

Too early. The useful contribution right now is adversarial review of the plan —
particularly the legal and anti-abuse sections, where being wrong is expensive.

## License

Not yet chosen. See [open questions](./PLAN.md#open-questions).
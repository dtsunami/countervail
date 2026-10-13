# Email channel

The statutory tier. Highest leverage, lowest cost, cannot be CAPTCHA'd, and —
unlike the web and voice channels — the law supplies a deadline the other side
has to meet. If only one channel ever works, it should be this one.

**Status: design only.**

## What it has to do

1. Send from an address that is credibly the user's, not a shared robot.
2. Reliably land in a corporate `privacy@` or `dpo@` inbox — i.e. not spam.
3. Receive the reply, and correlate it to the maneuver run that caused it
   without the human filing anything.
4. Survive a 30–45 day statutory clock with automated follow-up.
5. Produce a receipt that would mean something to a regulator.

(3) is the part that quietly dictates the design.

## Correlation: one address per run

The user owns a domain with a catch-all. Each maneuver run sends from a tagged
address:

    erasure.a7f3c2@user-domain.example

A reply to that address is unambiguously that run's. No subject-line parsing,
no thread-id heuristics, no mailbox scanning for "probably about Acme". The
harness polls one mailbox over IMAP and routes purely on the local part.

Subaddressing (`user+a7f3c2@`) is the same idea and works with any provider,
but a non-trivial number of corporate web forms reject a `+` in an email field,
and a privacy request often starts at a web form. A catch-all with a dotted tag
avoids that entirely. Use the catch-all; keep plus-addressing as the fallback
for providers that will not do catch-all.

The address tag is also the lookup key for the audit chain, so a reply that
arrives eight months later still files itself correctly.

## Why not host the mail server

Self-hosting outbound SMTP on a residential connection does not work. The IP
has no reputation, probably no PTR record you control, and is very likely in a
consumer-dynamic blocklist that most corporate filters consult. A GDPR Art. 17
request that silently lands in spam is worse than one never sent: the clock
does not start and you believe it did.

So: **own the domain, relay the outbound, receive wherever is easiest.**

| Piece | Choice | Cost (verify current pricing) |
|---|---|---|
| Domain | any cheap registrar; Cloudflare at cost is the usual answer | ~$10–15/yr |
| DNS | Cloudflare free tier | $0 |
| Mailbox + catch-all | Migadu (flat rate, unlimited addresses, catch-all) or Purelymail (very cheap, catch-all) | ~$10–20/yr |
| Outbound relay | the same provider's SMTP, or a transactional relay if volume grows | included |
| Inbound to harness | IMAP poll/IDLE from the Pi | $0 |

Total marginal cost of the statutory channel: roughly **$2/month, all in**,
with no per-message fee at household volume. That number matters — it is the
whole "cheap DIY" claim, and it is the channel that does the most work.

Migadu-style flat-rate providers are named because unlimited addresses on one
domain is exactly the shape this needs; a per-mailbox provider prices the
per-run addressing model out of existence. Transactional relays (Postmark, SES,
Mailgun) are deliberately *not* the first choice: they are built for bulk, they
look like bulk to a receiving filter, and some of their terms sit awkwardly
with "automated legal correspondence". A normal mailbox sending a handful of
plain messages a week is the correct shape and the correct reputation.

Self-hosting inbound MX on the Pi is viable later and is a reasonable Phase 4+
option for users who want nothing in the middle. It does not change the
outbound problem, which is the one that matters.

## Deliverability hygiene — non-negotiable

- SPF, DKIM and DMARC aligned, all three, before the first send. The setup
  wizard refuses to enable the channel until it has verified the published
  records itself by DNS lookup.
- Plain text or very simple HTML. No tracking pixels, no link shorteners, no
  images. These messages must read as correspondence, because they are.
- One message per request. Follow-ups threaded via `In-Reply-To`, not resent.
- Real `From` display name — the user's actual name, because the agent is a
  disclosed authorised agent acting for a named principal, and that name is
  load-bearing both legally and for deliverability.
- Rate: single digits per day per user. Anything more is a different product
  and a blocklisting.
- Bounce handling: a hard bounce fails the maneuver loudly rather than retrying
  into a wall. A soft bounce retries with backoff, max three.

## Message construction

The model drafts; the harness assembles. Three fixed parts the model cannot
remove:

1. **Disclosure block.** "This request is sent by an automated agent acting on
   behalf of [name], who is the data subject. Replies to this address reach
   them." Legally useful and honest.
2. **Statutory citation**, selected by the jurisdiction resolver — not by the
   model. GDPR Art. 15/17 with the one-month deadline, or CCPA/CPRA §1798.105
   with 45 days, including the authorised-agent provisions where they apply.
   Getting the citation wrong is the failure that makes the whole message
   ignorable, and an LLM will cheerfully invent an article number.
3. **Identity evidence**, from the proof-of-relationship record already
   required by the policy gate.

The model writes the human paragraph in between and nothing else. This is a
deliberately narrow brief.

## Deadline tracking

Each sent request writes a deadline record: statute, sent timestamp, due date,
state. A scheduler walks it daily.

    sent -> acknowledged -> fulfilled
                  |
                  +-> overdue -> follow-up -> still overdue -> complaint package

The complaint package is generated, not filed. It assembles the full hash-
chained thread — original request, delivery evidence, every reply or the
absence of one, the deadline arithmetic — into something the user can submit to
their supervisory authority or state AG. The user files it. We do not file on
anyone's behalf; that is a line worth not crossing without a lawyer's sign-off.

## Setup wizard (the web UI does this)

The point of the appliance is that a non-expert gets here. The wizard:

1. Asks for the domain. Shows the exact DNS records to paste, including the
   provider's DKIM key.
2. Verifies them by live lookup and will not continue until they resolve.
3. Takes SMTP and IMAP credentials, stores them in the vault, sends a test
   message to a verification address and waits to receive it back through the
   catch-all — proving the whole round trip, not just the login.
4. Sends to a deliverability check service, if configured, and reports the
   score before the user is allowed to enable the channel.

Step 3 is the one that catches the real failures. "SMTP auth succeeded" tells
you almost nothing about whether a reply will ever find its way home.

## Open

- Whether to support the user's existing Gmail/Fastmail address via OAuth as a
  zero-setup path. It removes the domain cost and the entire wizard, but loses
  per-run addressing and puts the agent inside the user's main mailbox — a much
  larger blast radius. Probably offer it, read-scoped to a label, clearly
  marked as the degraded mode.
- Certified post for the tier below email. Lob-style APIs exist and are the
  only way to create a hard legal record against a company that ignores email.
  Phase 4 at the earliest, but the maneuver schema should already have the
  strategy slot (it does).
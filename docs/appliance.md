# The appliance

A Raspberry Pi 4 that you plug in, open in a browser, point at a domain, and
use. This is the reference deployment and — more importantly — the answer to
two of PLAN.md's blocking open questions.

**Status: design only. No image has been built or booted.**

## Why this resolves the hosted/local tension

Open question §6.2 framed it as a dilemma: local-first kills the credential
liability but cannot do longitudinal verification or voice; hosted can do both
but means we hold everyone's passwords.

An always-on box in the user's house is local-first *and* always running. It
verifies next month's billing statement because it is still there next month.
It answers the phone because it has a DID. The dilemma was an artefact of
assuming local meant a laptop.

What that buys:

- **Credential custody (§6.1) stops being our problem.** Secrets are encrypted
  at rest on the user's hardware with a key derived from their password. We
  cannot decrypt them because we do not have them. This is a stronger claim
  than any hosted-vault design and it is strictly simpler.
- **The business model question (§6.4) changes shape.** An appliance is a
  one-off, or an image you flash yourself for free, or hardware at cost. It is
  a much better fit for a project whose stated purpose is to break an
  extractive subscription economy than a subscription would be.
- **The anti-abuse story gets weaker in one specific way** and we should say so:
  global per-target rate limits (§2.2) cannot be enforced across independent
  boxes we do not control. Per-box limits make a single appliance useless as an
  attack tool; coordinated abuse at scale would need a signed-count coordinator,
  which is a hosted component and a later problem. Do not claim the global
  limit exists when it does not.

Costs: no telemetry, so failures are invisible to us. Updates are hard — see
below, it is the unsolved one. And the user's home IP is the one making all the
requests, which is a privacy improvement and a deliverability problem, hence
the relayed email in [channel-email.md](channel-email.md).

## Bill of materials

| | | Cost |
|---|---|---|
| Raspberry Pi 4, 4GB | 2GB is too tight with a browser | ~$55 |
| USB SSD + adapter | **not** an SD card — Playwright plus a browser profile will destroy one | ~$30 |
| PSU, case, fan | the browser pegs all four cores | ~$25 |
| Domain | | ~$12/yr |
| Mailbox with catch-all | | ~$15/yr |
| voip.ms DID | Phase 3 only | ~$12/yr + usage |
| Anthropic API | metered, per-run budget capped in the harness | usage |

Under $120 of hardware and under $40/year of services, with model usage on top.
A single prevented year of a forgotten $15/month subscription pays for the box.

Chromium on a Pi 4 is the load-bearing assumption and it is the one most likely
to be wrong. Headless Chromium against a modern hostile SPA may simply be too
slow or too memory-hungry at 4GB. **Measure this in Phase 1 before committing to
the hardware**, against the two hardest of the five Phase 1 vendors. If it
fails, a Pi 5 with 8GB is the fallback and the cost story survives; if it fails
there too, the web channel runs on the user's desktop and the Pi keeps the
email and voice channels.

## Services

    cv-firstboot.service   cv-firstboot.sh      oneshot, root
    cv-admin.service       cv-admin-helper      daemon, root, unix socket
    cv.service             countervail          daemon, unprivileged

Exactly orata's split, for the same reason. The main daemon runs unprivileged
with `NoNewPrivileges`, `ProtectSystem=strict` and a narrow `ReadWritePaths`.
When it needs to write `/etc/asterisk` or pair a Bluetooth device it sends a
JSON request to the helper over a unix socket; the helper checks the peer UID
and accepts only enumerated operations with per-field validators.

There is deliberately **no** "write this file" verb. A compromised web process
can change the SIP POP to another valid POP; it cannot append a dialplan
extension or read `/etc/shadow`. The most important validator rejects `\r`,
`\n` and NUL in any value — a newline in an INI value is config injection, and
everything else is defence in depth.

Orata learned four defects from deploying this against a live Pi, and all four
were the same class: the schema was written against the repo template rather
than the deployed file. Validate every schema field against a real config
before shipping it.

## First boot

A cloned image that ships a working password is the failure this whole design
exists to prevent. `cv-firstboot` runs before the UI can serve, and:

1. regenerates SSH host keys,
2. regenerates `/etc/machine-id`,
3. generates a random admin password, stores it Argon2id-hashed with
   `must_change: true`,
4. generates the session-signing secret and the vault salt,
5. prints the URL and password to the console and to the attached display,
6. stamps `.firstboot-done`.

Every page except `/password` and `/logout` refuses until the password is
changed. The API key is *not* generated or shipped — the user pastes their own
Anthropic key in the setup wizard, and the box does nothing until they do.

## The web UI

Fastify with server-rendered HTML inside the harness process. No SPA, no build
step, no npm audit surface beyond what the harness already carries. It must
work well on a phone, because the escalation queue is the page that matters and
it gets used standing in a kitchen.

| Page | Does |
|---|---|
| Dashboard | what is running, what is waiting on you, what is overdue, trunk and mail health |
| **Approvals** | the escalation queue. The single most important page. Each item: what the agent wants to do, the exact payload, the context, approve/deny/edit |
| Maneuvers | start one; pick target, outcome, proof of relationship |
| Runs | history, live transcript, artifacts |
| Receipts | the exportable evidence bundle per completed run |
| Channels | setup wizards: API key, email domain, voip.ms trunk |
| Diagnostics | DNS records, SMTP round trip, trunk registration, browser health, disk |

Approvals is where the product lives or dies. If approving a cancellation takes
more effort than cancelling it yourself, nothing has been gained. Target: push
notification (ntfy, as orata uses — independent of everything else), one tap to
open, one tap to approve, the full payload visible without scrolling.

The best approvals page is a mostly empty one. Decisions the maneuver can
anticipate are answered in the start form as a *mandate*, before the run begins,
so they never reach this queue at all; three notification tiers keep the rest
from interrupting when nothing is waiting. Decision model and the human-seconds
budget: [decisions.md](decisions.md).

## Security posture

Same as orata's, same reasoning, and it should not drift:

- **No TLS, no port forward.** Bind loopback by default; reach it by SSH tunnel
  or over WireGuard. Optionally bind a trusted LAN address. Refuse `0.0.0.0`
  without an explicit override flag.
- Username and password over plain HTTP on a home LAN is the posture of a
  consumer router. Anyone who can sniff the LAN can take the session cookie.
  That is the accepted trade and it should be stated to the user, not hidden.
- Login throttled per IP. Sessions HMAC-signed, `HttpOnly`, `SameSite=Strict`.
- Config writes keep numbered backups. Restore is by hand over SSH.
- The vault is locked after reboot until someone logs in. Credentialed
  maneuvers wait; statutory email continues.

WireGuard is effectively required rather than optional here, because the
approval queue has to be reachable from a phone away from home or the whole
interaction model collapses.

## Unsolved

- **Updates.** An appliance in someone's house needs an update mechanism and
  `git pull && npm install` is not it. This is the hardest unsolved problem and
  it blocks distributing the image to anyone who is not the author. Signed
  image-based A/B updates are probably the answer and are a significant piece of
  work.
- **Backup and restore.** The audit chain is the product's value. Losing it to a
  dead SSD is unacceptable. Needs an encrypted off-box target and a tested
  restore, not just a tested backup.
- **Factory reset** other than re-flashing.
- **Failure notification.** A box that quietly stopped working looks exactly
  like a box with nothing to do.
- Single admin user. No recovery except SSH.
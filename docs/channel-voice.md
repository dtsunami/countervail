# Voice channel

Asterisk on the Pi, a voip.ms DID, and a media bridge from a live call into the
agent. Phase 3 — deliberately last, because it is the only channel where a bug
is audible to a stranger in real time.

**Status: design only.** The telephony half is well-trodden
(see the orata project, which runs this stack on a Pi 4 today); the
agent-on-the-call half is not.

## Why this stack

voip.ms plus a source-built Asterisk on a Pi 4 is the cheapest credible
PSTN presence available, and it is already proven to work on exactly this
hardware:

| Item | Cost (verify current pricing) |
|---|---|
| DID | ~$1/month |
| Inbound | ~$0.01/minute |
| Outbound US/CA | ~$0.01/minute |
| Asterisk | free, built from source |
| Pi 4 | already owned |

A forty-minute hold queue costs about forty cents. That is the thesis as a
line item: the cost of absorbing friction, driven to roughly nothing.

Debian 13 has no Asterisk package, so it is a source build. This is a real
maintenance obligation — CVEs are yours to track and rebuild for — and it
should be scripted and documented before anyone else runs it.

## Carrier configuration — mandatory, not hardening

A compromised PBX gets drained to premium-rate numbers overnight, and this one
places outbound calls by design, which makes it a more attractive target than a
home phone. Before the trunk is registered:

1. **Spending cap** set in the voip.ms portal.
2. **International dialling blocked.** The maneuvers only need NANP.
3. **Sub-account** for the trunk, never the main login.
4. **IP whitelist** on that sub-account.
5. **No port forward.** Asterisk registers outbound; nothing needs to be open.

The web UI cannot enforce any of these — they live in the carrier portal — so
the setup wizard must verify them by asking the user to confirm each one
explicitly, and the dashboard should keep showing a warning until they do.
Additionally the harness enforces its own destination allowlist and a per-day
outbound minute ceiling, because carrier-side caps are a backstop, not a
control.

## Media path

Asterisk's `AudioSocket` is the integration point: a dialplan application that
streams 8 kHz signed-linear audio over a plain TCP socket to a local process,
bidirectionally, with a UUID per call. It is simple enough to debug with
`nc`, which matters a great deal at 3am.

    [countervail-out]
    exten => _X.,1,NoOp(maneuver ${CV_RUN})
     same => n,Set(CHANNEL(hangup_handler_push)=cv-hangup,s,1)
     same => n,Dial(PJSIP/${EXTEN}@voipms,,U(cv-connect))
     same => n,Hangup()

    ; on answer, bridge the far end into the agent socket
    [cv-connect]
    exten => s,1,AudioSocket(${CV_RUN},127.0.0.1:9092)
     same => n,Return()

Verify the exact `AudioSocket`/`chan_audiosocket` syntax against Asterisk 22
before building on it — it has moved between versions. ARI `externalMedia` is
the documented alternative and is more flexible, at the cost of running an ARI
client and a WebSocket; prefer AudioSocket unless something forces otherwise.

The agent process on the other end of the socket runs the duplex loop:

    far-end audio -> VAD -> STT -> transcript -> model -> text -> TTS -> far-end

plus DTMF out of band through AMI/ARI rather than as audio tones, which is both
more reliable and easier to log.

Synthesis options, voice cloning and the argument that realism is not the
binding constraint here are in [tts.md](tts.md).

## The latency problem, stated honestly

A Pi 4 cannot run local STT, a frontier LLM and TTS inside a conversational
latency budget. It cannot run the LLM at all. whisper.cpp tiny is borderline
real-time on short utterances and that is only one of the three legs.

So the voice channel is **cloud speech plus cloud model, orchestrated locally**.
The Pi holds the call, the audio, the recording and the transcript; the
inference happens elsewhere. Budget roughly: STT 300ms, model 700–1500ms, TTS
first-byte 200–400ms, network 100ms. That is 1.3–2.3 seconds to first word,
which is poor for conversation and entirely fine for a hold queue and a
scripted retention agent — the two things this channel actually faces.

Mitigations that are worth the complexity: stream STT partials rather than
waiting for an endpoint; start TTS on the model's first sentence rather than
its last; keep a small bank of pre-rendered filler ("yes, I'm still here") for
the gaps. Mitigations that are not: trying to run any of it locally on the Pi.

This does mean call audio leaves the house. It must be disclosed to the user in
the channel setup, not buried.

## Call structure

1. **Pre-flight.** Destination allowlisted, maneuver authorises voice, minute
   budget available, human approval obtained — `voice.call` is always
   irreversible.
2. **Disclosure at open.** Synthetic-voice and recording disclosure, played
   before anything else, scripted by jurisdiction. Two-party consent states
   require the recording notice; synthetic-voice disclosure law is moving and
   the safe posture is to always disclose. This is also just the honest thing,
   and it is already a stated principle in PLAN.md §2.3.
3. **IVR traversal.** Menu prompts are a DTMF navigation problem, not a
   conversation. Cache the tree per target number — these change rarely, and a
   cached tree turns a four-minute menu crawl into eight seconds.
4. **Hold detection.** Music-on-hold versus a human is detectable from energy
   and spectral pattern well before STT would notice. Hold is the cheap state;
   stay in it, poll, do not burn model tokens.
5. **Human reached.** Now the model engages, with the maneuver's outcome and the
   escalation triggers in context.
6. **Hard escalation.** Any retention offer, any request for a decision, any
   legal threat, any identity challenge the harness cannot answer from the
   vault — the agent says it needs to check with the account holder and the
   call either holds or ends. The agent never accepts an offer. This is a
   bright line, enforced in the harness by refusing the op, not by prompting.
7. **Artifacts.** Full recording, timestamped transcript, confirmation id if
   spoken, hold duration, and the agent's own disclosure as the first entry.

## Legal

Call recording consent is per-jurisdiction and two-party states require
notification. The harness resolves consent rules from the destination area code
and the user's own state before dialling, and refuses the call if it cannot
determine them. Area code is a weak proxy for physical location — a mobile
number tells you nothing — so this is a floor, not a guarantee, and the
conservative default (always disclose, always record the disclosure) is what
makes it defensible.

## Reuse from orata

The same hardware, the same carrier, the same build. Directly reusable:

- Asterisk 22 source-build procedure and CVE maintenance notes.
- `pjsip.conf` trunk template, including the four places the voip.ms POP
  appears — a lesson learned the expensive way there.
- The security checklist above, verbatim.
- The privileged-helper pattern for letting a web UI write `/etc/asterisk`
  without running as root.

Not reusable: the dialplan itself (orata terminates inbound calls to handsets;
countervail originates outbound calls into a socket), and anything Alexa.
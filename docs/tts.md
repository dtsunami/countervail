# Speech synthesis and voice cloning

**Status: design only, nothing measured.** Latency and price figures below are
vendor claims or rough recollection and several are probably stale — treat
every number as something to verify before it is relied on.

## The short version

Use a **phone-optimised streaming cloud TTS** (Rime or Cartesia first choice,
ElevenLabs Flash if quality wins the bake-off), keep **Piper on the Pi** as an
offline fallback, and **defer voice cloning to Phase 3+**. If cloning is done
at all it is the user's own voice, with a recorded consent statement, and it
does **not** replace the synthetic-voice disclosure at call open.

The rest of this document is why.

## Realism is not the binding constraint

This is the uncomfortable part. Four reasons the "super realistic" objective is
mostly aimed at the wrong target for this specific channel:

**1. The PSTN throws the quality away.** A voip.ms call is G.711 μ-law at 8 kHz,
narrowband, 64 kbit/s. Everything above 4 kHz — the breath, the sibilance, the
air around a voice, most of what separates a premium model from a competent one
— is gone before the other party hears a syllable. You can pay ElevenLabs
Multilingual v2 prices for 44.1 kHz studio output and have it arrive sounding
remarkably like Deepgram Aura. Any evaluation that is not done *through an
actual 8 kHz μ-law encode* will pick the wrong model. Build that into the
bake-off harness before listening to anything.

**2. The agent has already disclosed itself.** By design
([channel-voice.md](channel-voice.md#call-structure)) the first thing said on
every call is that this is an automated agent acting for a named principal.
Once that sentence has been spoken, a photorealistic voice buys exactly nothing
— the deception value is zero by construction, because we gave the game away on
purpose and intend to keep doing so. Realism only has instrumental value if you
are trying to pass as human, and PLAN.md §2.3 says we are not.

**3. Latency and barge-in dominate perceived naturalness.** An agent with a
gorgeous voice that takes 2.5 seconds to respond and talks over the retention
rep sounds like a robocall. An agent with a plain voice that responds in 600ms
and stops mid-word when interrupted sounds like a person on a bad line. Interrupt
handling is the single highest-return thing to build and it is usually not
budgeted for at all. Spend the effort there.

**4. The audience is a retention script.** The other end is a person reading
from a flowchart, with their own quality bar set by decades of IVR. Whether a
very good synthetic voice performs *better* with them than an obviously
synthetic one is genuinely unknown and might go either way — an obvious robot
may get escalated to a supervisor faster, which is often the outcome we want.
Worth an actual experiment in Phase 3 rather than an assumption.

None of this means ship something bad. Intelligibility over narrowband, correct
prosody on digits and account numbers, and not mangling the user's name are
real requirements. It means the ceiling on useful quality is a lot lower than
the ceiling on available quality, and the money is better spent on latency.

## Cloud streaming TTS

The realistic shortlist. All stream audio chunks so you can start playback on
the first sentence rather than the last.

| Provider | TTFB (claimed) | Cloning | Notes |
|---|---|---|---|
| **Rime** (Mist v2/Arcana) | ~100ms | limited | Trained on conversational and phone-domain speech specifically. Built for contact centres, which is exactly this. Strong default. |
| **Cartesia** (Sonic) | ~40–90ms | instant, ~10s sample | Fastest credible option. Good quality, cheaper than ElevenLabs. Strong default. |
| **ElevenLabs** (Flash v2.5) | ~75ms model, ~150ms+ e2e | instant (~1min) and professional (~30min+) | Best-in-class realism and by far the best cloning. Most expensive. Flash trades quality for speed; Multilingual v2 is the pretty one and too slow for duplex. |
| **Deepgram** (Aura-2) | ~150ms | no | Cheapest per character, phone-oriented, perfectly adequate. Good fallback. |
| **OpenAI** (gpt-4o-mini-tts) | ~300ms | no | Steerable by natural-language instruction ("sound patient, slightly bored"), which is an underrated feature for hold queues. Fixed voices only. |
| **Google** (Chirp 3 HD) | ~200ms | enterprise only, gated | Cloning requires a consent process and approval. |
| **Azure** (Neural TTS) | ~200ms | Custom Neural Voice, gated | CNV is behind a formal application and a recorded consent statement. The gating is the point — see below. |
| **PlayHT** (Play 3.0 Mini) | ~150ms | yes | Credible, less differentiated than the top three. |
| **Hume** (Octave) | higher | yes | Emotional control. Interesting, not obviously useful here. |

Cost shape at household volume: an agent on a forty-minute call *speaks* for
maybe two to four minutes — hold is silence, and silence is free. Call it
2–4k characters per call. At typical per-character pricing that is pennies, and
even ElevenLabs' entry tiers cover a few dozen calls a month. **TTS is not where
the money goes.** The model and the minutes are.

## Speech-to-speech — the real latency option

OpenAI's Realtime API and Gemini Live collapse STT → LLM → TTS into one hop and
land somewhere around 300–800ms end to end, roughly half the cascaded budget in
[channel-voice.md](channel-voice.md#the-latency-problem-stated-honestly). They
also handle barge-in natively, which is the hard part.

**And they are probably still wrong for this channel.** The cascade's
intermediate text is not a performance tax, it is where the control points live:

- The disclosure block the model cannot remove is enforced by inspecting text
  before it reaches TTS. There is no text to inspect in speech-to-speech.
- The hard escalation on any retention offer is a harness refusal, not a prompt
  instruction. Same problem.
- The transcript is an audit artifact derived from what was actually sent to
  synthesis. Speech-to-speech gives you a transcript of what the model *says it
  said*.

A channel whose bright line is "the agent never accepts an offer" should not be
built on an architecture where the agent's output cannot be inspected before it
is audible. Revisit if these APIs expose a pre-speech text hook with a veto.

Hybrid worth prototyping: speech-to-speech for the IVR and hold phases where
nothing consequential can be said, cascade with full inspection once a human is
reached. Added complexity, real latency win where latency is cheap to want.

## Local, on the Pi

For completeness, and because the offline fallback matters when the network
drops mid-call:

| | Fits a Pi 4 CPU? | Quality | Cloning |
|---|---|---|---|
| **Piper** | Yes, comfortably, faster than realtime | Intelligible, flat, obviously synthetic | Fine-tunable on ~30–60 min of recordings (needs a GPU to train, then runs on the Pi) |
| **Kokoro-82M** | Marginal — measure it | Notably better than Piper | No |
| **MeloTTS** | Marginal | Decent | No |
| XTTS-v2, F5-TTS, StyleTTS2, Chatterbox, Orpheus, Fish Speech | **No** — GPU required | Good to very good | Yes, zero-shot from seconds of audio |

The dividing line is clean and worth stating plainly: **nothing that clones a
voice convincingly runs on a Pi 4.** Every zero-shot cloning model in the open
ecosystem wants a GPU. Local cloning means either a second machine in the house
with a GPU, or it means Piper fine-tuning, which is a different quality tier
entirely.

Note XTTS-v2's licence — Coqui's CPML is non-commercial, and Coqui itself is
gone. Do not build on it. Chatterbox (MIT) and Orpheus (Apache-2.0) are the
permissively-licensed cloning options.

## Can we train on the user's voice?

Technically, yes, three tiers:

1. **Zero-shot / instant cloning** — 10 seconds to a minute of audio, available
   immediately, from Cartesia, ElevenLabs, PlayHT, or self-hosted Chatterbox.
   Recognisably the person. Not convincing to someone who knows them well.
2. **Professional / fine-tuned cloning** — 30 minutes to a few hours of clean
   recordings, hours of training. ElevenLabs PVC and Azure CNV are the mature
   hosted versions. Genuinely convincing.
3. **Piper fine-tune** — 30–60 minutes of recordings, a few GPU-hours, runs
   locally afterwards. Produces something *recognisably the user and obviously
   synthetic*.

The appliance already has the recording infrastructure this needs — the
approvals UI could walk someone through reading a script in twenty minutes.

## Should we?

The user cloning their own voice is the clean consent case: it is their voice,
they are the one asking, and PLAN.md §2.4's prohibition is on impersonating
*third parties*, which this is not. So the rule as written permits it.

The harder question is what it is **for**. Work through it:

- It does not help pass as human — we disclose at call open, deliberately.
- It does not help with authentication, and must not. See bright lines.
- It does marginally help if the call is escalated to the user mid-conversation
  and the handoff should not sound like two different people. Thin.
- It is, honestly, mostly an aesthetic preference. Which is a legitimate thing
  to want and a bad thing to misprice.

Against it: it is the single feature most likely to end up in a news story about
this project, it invites exactly the misuse the anti-abuse posture exists to
prevent, and holding a trained model of someone's voice is a new and
unattractive category of custody liability — the one thing the appliance
architecture was specifically designed to avoid having
([appliance.md](appliance.md#why-this-resolves-the-hostedlocal-tension)). A
cloned-voice model on a hosted provider's servers is a credential we chose to
hand over after deciding not to hand over credentials.

**The interesting middle.** A voice that is *recognisably the user and audibly
synthetic* may be the correct design target rather than a compromise. It is
honest by construction — nobody mistakes it for a person — while still being
personal, and it degrades gracefully when the disclosure requirement tightens
further, which it will. Piper fine-tuning lands exactly there and runs entirely
on the user's own hardware with no cloned model leaving the house. That is a
defensible feature. "Indistinguishable from the user" is not, and the gap
between them is small in effort and enormous in exposure.

## Legal

**Needs a lawyer, like PLAN.md §5. This is a research starting point.**

- **FCC, February 2024** — AI-generated voices are "artificial" under the TCPA,
  so calls using them to residential and mobile lines need prior express
  consent. Note the direction of travel though: TCPA's robocall provisions
  target calls *to* consumers. These are single, manually-authorised calls
  *from* a consumer to a business they have an existing relationship with,
  which is a materially different posture. Not obviously covered. Not obviously
  not. Verify current FCC position — it has been moving.
- **State synthetic-media and AI-disclosure laws** are multiplying and are not
  uniform. California, Utah and others have disclosure requirements of
  different shapes. Jurisdiction resolution already exists in the harness for
  recording consent; this rides on it.
- **EU AI Act Art. 50** — transparency obligations for synthetic audio
  interacting with people.
- **Two-party consent recording** is separate and already handled
  ([channel-voice.md](channel-voice.md#legal)).
- **Provider terms.** ElevenLabs and Azure both require a recorded consent
  statement from the speaker before professional cloning, and both prohibit
  using cloned voices to deceive. Complying with this is easy when the speaker
  is the user; it is also good evidence that we did the right thing.

The posture that survives all of it: **always disclose, always record the
disclosure as the first audit artifact, never clone anyone but the
authenticated user.** That is already the plan and cloning does not change it.

## Bright lines

Enforced in the harness, not in a prompt:

1. **Never clone a voice other than the authenticated user's**, with a recorded
   consent statement from that user held as an artifact.
2. **Never use a synthetic voice to defeat voice biometric authentication.**
   Banks and telcos use voiceprint auth; a cloned voice against it is fraud, it
   is a felony in most places, and it is a different product. The harness
   refuses: on detecting a voiceprint challenge, escalate to the human, always.
   This is not negotiable and should be in the code before cloning exists at
   all.
3. **Disclosure is not removable by cloning.** The synthetic-voice notice plays
   whether the voice is stock or cloned.
4. **No cloned-voice export.** The model stays on the appliance or in the
   provider account; the UI offers no download. Reduces the blast radius if the
   box is compromised.

## Recommendation and phasing

**Phase 3, initial:** stock voice from Rime or Cartesia, chosen by a bake-off
*through an 8 kHz μ-law encode*. Piper on the Pi as the network-failure
fallback. No cloning. Effort goes into barge-in, endpointing and hold detection.

**Phase 3, later:** if quality is genuinely the limiter after measurement — and
measure before believing it — add ElevenLabs Flash. Revisit speech-to-speech for
the IVR/hold phases only.

**Phase 4, optional:** user voice via Piper fine-tune, local, recognisably them
and audibly synthetic, with recorded consent. Hosted professional cloning only
if there is a demonstrated reason that is not aesthetics, and with the custody
tradeoff written down.

## To measure

- All of the above through G.711 μ-law 8 kHz, blind, scored for intelligibility
  and naturalness. Vendor demos at 44.1 kHz are not evidence.
- Real end-to-end time to first audible word on the Pi, over the actual trunk —
  not vendor TTFB, which excludes network, Asterisk and jitter buffer.
- Kokoro-82M realtime factor on a Pi 4 CPU. If it is comfortably under 1.0 the
  offline fallback gets much better than Piper.
- Whether a retention agent behaves measurably differently with a high-quality
  versus an obviously-synthetic voice. Cheap to test once the channel works and
  it settles this whole argument with data.
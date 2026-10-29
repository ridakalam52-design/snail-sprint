# Snail Sprint — Devpost submission (Meta VR Start Developer Competition 2026)

Copy-paste ready text and the checklist of what the Devpost form needs.
Submission page: https://start-developer-competition-26.devpost.com/ → "Enter a Submission" (My projects: https://devpost.com/submit-to/31024-meta-vr-start-developer-competition-2026/manage/submissions)
**Deadline: November 18, 2026, 12:00 PM PT (= November 19, 2026, 1:30 AM IST).**

---

## Form fields

| Field | Value |
| --- | --- |
| Project name | **Snail Sprint** |
| Tagline / elevator pitch | Pinch, pull back and flick a cartoon snail around a race track on your real table — then smash the 0.03 km/h speed limit. A seated, hands-first MR game for Meta Quest. |
| Track | **Gaming** |
| Division | **New Experience** (conceived and built within the competition window, after Sept 24, 2026) |
| Platform | **Meta Quest (WebXR in the Meta Quest Browser)** — built with the Immersive Web SDK (IWSDK) |
| Link to project (required for IWSDK/WebXR) | https://ridakalam52-design.github.io/snail-sprint/ |
| Source code | https://github.com/ridakalam52-design/snail-sprint |
| Demo video (required, < 3 min, public on **YouTube or Vimeo**) | ⚠️ Upload `demo.mp4` to YouTube/Vimeo as Public (or Unlisted only if Devpost accepts it — the rules say "publicly visible") and paste the link here: `TODO` |
| Target launch date | **Q1 2027** (not yet published on the Meta Horizon Store) |
| Built with (tags) | immersive-web-sdk, iwsdk, webxr, three.js, typescript, vite, hand-tracking, passthrough, plane-detection, web-audio, github-pages |
| Image gallery | `media/screenshot-1-placement.png`, `media/screenshot-2-boost.png`, `media/screenshot-3-results.png` |
| Thumbnail (3:2) | `media/thumbnail.jpg` (1500×1000) |

---

## Inspiration

A garden snail's top speed is about **0.03 km/h**. That felt like the funniest speed limit you could ever put on a race track — and the most satisfying thing we could imagine doing in mixed reality was to put that track on the table right in front of you and fling a snail past the sign at sixty times the limit.

We also wanted a game that passes the "airplane seat test" and the "one bus stop test": everything within arm's reach, no controllers, no standing up, and a complete race in under a minute.

## What it does

Snail Sprint turns any table into a tiny race track.

- **The track finds your table.** Using WebXR plane detection, the game looks for a horizontal surface at table/desk height in front of you and snaps a glowing ghost of the track onto it. Pinch once to place it. No table detected? It sits at a comfortable seated height ~0.5 m in front of you instead.
- **Slingshot launch.** Pinch the snail, pull back, let go. Pull distance and the flick of your hand as you release set the launch speed ("Nice flick!", "MEGA FLICK!").
- **Boost pads with perfect timing.** Four pads per lap glow when the snail is on them. Pinch at that moment to boost; hit the centre for a PERFECT boost and chain them for combos. Pinch too early and you lose your combo.
- **Smash the speed limit.** On the final lap a "SPEED LIMIT 0.03 km/h" sign pops up across the track. Hit it at speed, watch it fly off the table, and find out how many times over the limit you were.
- **Quick, replayable runs.** Two laps, 60 seconds on the clock, results card with your time, boosts, top speed and best time (saved on device). Pinch to go again.

First-time players are taught by a **ghost hand** that demonstrates each gesture right on the table — no wall of text. Every hint appears next to the action, inside a narrow field of view.

Hands are the primary input end-to-end; controllers (trigger) and a mouse fallback on desktop also work.

## How we built it

- **Meta Immersive Web SDK (IWSDK) 1.1.0-rc.2** on three.js + WebXR, written in TypeScript and bundled with Vite. IWSDK's declarative `iwsdk.config.json` requests an `immersive-ar` (passthrough) session with **hand tracking** and **plane detection**; locomotion, grabbing and physics are switched off because this is a seated game.
- The game is a single IWSDK ECS system with a state machine (`placing → ready → aiming → racing → results`).
- Hands, controllers and mouse are unified into one "pointer" abstraction: hand index-fingertip spaces with pinch-as-select, controller grip spaces with trigger, and a mouse ray projected onto the track plane — so the same rules drive every input.
- Table placement scores each detected horizontal `XRPlane` (semantic label table/desk preferred, plausible table height, in front of and within reach of the player), clamps the board inside the plane polygon and rotates it to face you.
- The track is an arc-length-parameterised "stadium" oval, so snail, pads, sign and slime trail are all placed by distance along the racing line. Launch speed comes from pull distance plus flick velocity measured over the last ~120 ms of hand motion; the snail never drops below a real snail's 0.03 km/h.
- **100% procedural content:** the snail, shell, track, pads, sign, ghost hand, particles, slime trail and all UI labels are generated in code from three.js primitives and canvas textures; every sound effect is synthesised with WebAudio and spatialised on the snail with an HRTF panner. No downloaded models, textures, music or sounds, and no AI-generated assets.
- Deployed as a static site on GitHub Pages via a GitHub Actions workflow. The demo video was captured from the real game running in the IWER Meta Quest 3 emulator, driven by a script with an emulated hand.

## Challenges we ran into

- **Making a flick feel right.** Pinch-release is noisy; we compute launch speed from both pull distance and a short window of hand-velocity history so a gentle pull still works but a confident flick feels powerful.
- **Placing content on "a table" in rooms we've never seen.** Picking the right plane (not the floor, not a shelf, not the table behind your chair) and keeping the whole 0.5 m track inside the surface took several iterations, plus a fallback when no plane is detected.
- **Readable UI at arm's length.** World-space labels had to stay legible and inside a narrow field of view; we built canvas-texture labels that auto-shrink text to fit and always face the player.
- **Timing windows.** Boost pads needed a forgiving "hit" window but a tight, satisfying "perfect" window, with clear visual telegraphing (pads brighten and pulse as the snail approaches).

## Accomplishments that we're proud of

- A complete, polished game loop with zero external assets — every model, texture and sound is generated in code.
- Truly hands-first and seated: the whole experience works within arm's reach without ever picking up a controller.
- Passthrough with a purpose: your real table *is* the level.
- A first-run tutorial that teaches by showing (ghost hand) instead of telling.

## What we learned

- IWSDK makes it fast to stand up an MR WebXR app with hand tracking and scene understanding, and its emulator (IWER) let us script and test full runs without a headset.
- Small, physical gestures (pinch, pull, flick) on a real surface feel surprisingly tactile — scale and placement matter more than visual fidelity.
- Clear telegraphing (glow, pulse, sound) is what makes timing mechanics feel fair.

## What's next for Snail Sprint

- Tuning on Quest hardware with playtesters at real tables (pinch thresholds, flick feel, 72/90 Hz performance).
- Spatial anchors so your track stays where you left it.
- Tracks that use more of the room (climbing onto nearby surfaces via mesh detection).
- Daily challenge tracks, streaks and unlockable shells; ghost replays of your best run.
- Shared-table multiplayer and pass-the-headset party mode.
- Accessibility options: one-handed mode, wider timing windows, high-contrast track, gaze-to-boost.

**Target launch: Q1 2027** as a free WebXR game, with a Meta Horizon Store listing to follow.

---

## Testing instructions for judges

1. On a Meta Quest 3 / 3S / Pro, open **https://ridakalam52-design.github.io/snail-sprint/** in the Meta Quest Browser.
2. Tap **Enter Mixed Reality** and allow the permissions (hand tracking / spatial data). Put the controllers down.
3. Sit at a table and look at it — the ghost track snaps onto it. **Pinch** to place it.
4. **Pinch the snail, pull back towards you, let go.** Pinch whenever the pad under the snail glows. Smash the speed-limit sign on lap 2 and beat your best time.

No headset? Open the same link on a desktop browser: drag the snail back with the mouse and release, then click when it's on a glowing pad.

---

## Official rules — requirements checklist

Source: https://start-developer-competition-26.devpost.com/rules (read 2026-10-30)

- **Entry period:** Sept 24, 2026 10:00 AM PT → **Nov 18, 2026 12:00 PM PT**. Judging ~Nov 18 – Dec 9; winners ~Dec 11, 2026. No changes after the entry period ends.
- **Eligibility:** 18+; Meta account with **Developer Access** enabled; submitter must be a **Meta VR Start Program member** by the time of submission (✅ application accepted); one entry per individual.
- **App:** VR/MR app built for Meta VR devices, aligned with one Track (Entertainment / **Gaming** / Productivity). Gaming track: hands-first required, genres that thrive seated without controllers.
- **Division:** **New Experience** = conceived and built within the competition window (from Sept 24, 2026), no pre-existing codebase.
- **Content requirements:** Hands-first is required ("can someone complete the entire experience without ever pairing a controller?"). Guidelines: seated-optimised (2 ft radius), fast cold start / satisfying in ≤10 min, original (not a wrapper).
- **Submission for IWSDK/WebXR:** a **link** judges can use to access and test the app (GitHub Pages or other hosting), which must **stay available until the winner announcement** (~Dec 11, 2026). Must be free of charge.
- **Required on the Devpost form:**
  1. Link to the project (GitHub Pages URL for IWSDK/WebXR).
  2. **Demonstration video < 3 minutes**, showing footage on a Meta Quest device **or via XR Simulator / equivalent emulator**, **uploaded publicly to YouTube or Vimeo**, link pasted in the form. Judges needn't watch past 3 min.
  3. **Text description** covering inspiration, how you built it, **future plans** and a **target launch date** (if not already on the Meta VR Store). Screenshots/changelogs/demo videos highly recommended.
  4. **Track** selection and **Division** selection.
- **Language:** English (✅).
- **Other rules to respect:** original work; only publicly available / Start-released tools (✅ IWSDK is public); licensed third-party assets only (✅ none used); no commercial logos/brands/ads; no identifiable people other than entrants; no implied Meta endorsement; must comply with Meta developer policies and content guidelines; must not have received direct Meta funding.
- **Judging (25% each):** Innovation & Creativity; Experience Design (seated, hands-first, onboarding, purposeful passthrough, FoV-aware UI); Technical Implementation (hand tracking, passthrough, plane anchoring, **≥ 60 fps on Quest**, bug-free, works in untested rooms); Polish & Presentation (UI/UX, art, sound, quality of text/images/video — real gameplay, not AI-generated video).
- **Special awards** worth considering in the write-up: Best First Five Minutes (ghost-hand onboarding), Boldest Original Concept, Best Reason to Come Back (best time — more planned).
- Note: the rules void entries "generated by a macro, bot, or other automated means" — the Devpost form itself should be filled in and submitted by you.

## Media files in this repo

- `demo.mp4` — demo video (H.264, 1280×720, 30 fps, ~70 s, title card + emulator gameplay). Upload to YouTube/Vimeo.
- `media/screenshot-1-placement.png`, `media/screenshot-2-boost.png`, `media/screenshot-3-results.png` — 1280×720 gallery screenshots.
- `media/thumbnail.jpg` — 1500×1000 (3:2) thumbnail.

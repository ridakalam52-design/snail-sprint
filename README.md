# 🐌 Snail Sprint

**Pinch, pull back and flick a cartoon snail around a race track that sits on your real table — then smash the 0.03 km/h speed limit.**

Snail Sprint is a seated, hands-first mixed-reality tabletop racing game for **Meta Quest**, built with Meta's **Immersive Web SDK (IWSDK)** and running in the Meta Quest Browser (WebXR, `immersive-ar` with passthrough). One run lasts at most 60 seconds, so you can finish a race in a single bus stop.

**▶ Play it:** https://ridakalam52-design.github.io/snail-sprint/
Open the link in the **Meta Quest Browser**, tap **Enter Mixed Reality**, put your controllers down and use your hands.

> Target launch: **Q1 2027** (public release as a free WebXR game; Meta Horizon Store listing to follow).
> Entry for the Meta VR Start Developer Competition 2026 — Track: **Gaming** · Division: **New Experience**.

---

## Inspiration

A garden snail's real top speed is about **0.03 km/h**. We thought that was the funniest possible speed limit to put on a race track — and that the most satisfying thing you could do in MR is put that track on the table in front of you and fling a snail past the sign at 60× the limit.

We also wanted a game that passes the "airplane seat test": everything happens within arm's reach, with no controllers, no standing and no room-scale movement — just your table and a pinch.

## What it does

1. **The track finds your table.** Snail Sprint uses WebXR plane detection (scene understanding) to find a horizontal surface at table/desk height in front of you and snaps a glowing ghost of the oval track onto it ("Table found! Pinch to place"). No table? It falls back to a comfortable spot ~0.5 m in front of you at seated table height. Pinch once to place it.
2. **Slingshot launch.** Pinch the snail, pull your hand back and let go. The harder you pull (and the faster you flick forward as you release), the faster it shoots off — "Nice flick!", "MEGA FLICK!".
3. **Boost pads.** Four pads sit around the lap. When the snail is on a pad it glows — pinch anywhere at that moment to boost. Nail the centre for a **PERFECT** boost; chain boosts for combos (`x2`, `x3`…). Pinch too early and you'll get "Wait for the glow…" and lose your combo.
4. **Smash the speed limit.** On the final lap a **SPEED LIMIT 0.03 km/h** sign springs up across the track. Hit it at speed and it gets smashed off the table — the game tells you how many times over the limit you were going.
5. **Results and best time.** Two laps, 60 seconds on the clock. You get your time (or how far you got), boosts hit, top speed and your best time, saved on the device. Pinch to race again.

First-time players get a **ghost-hand tutorial**: a translucent hand demonstrates the pinch to place the track and then the pinch → pull back → let go launch, directly on the table, so there is no wall of text. Hints only appear next to where the action is, within a narrow field of view.

### Controls (hands — no controllers needed)

| Action | Hands |
| --- | --- |
| Place the track | Look at your table, **pinch** (thumb + index) anywhere |
| Launch | **Pinch the snail**, **pull back** towards you, **let go** (a forward flick adds speed) |
| Boost | **Pinch** when the pad under the snail glows (centre = PERFECT) |
| Race again | **Pinch** on the results card |

Controllers also work (trigger = pinch, using the controller's grip position). On a desktop browser without a headset, a virtual desk is shown: drag the snail back with the mouse and release, then click when it's on a glowing pad.

## How we built it

- **Meta Immersive Web SDK 1.1.0-rc.2** (`@iwsdk/core`) on top of three.js (super-three 0.185) and WebXR. The project uses IWSDK's declarative `iwsdk.config.json` to request an `immersive-ar` session with **hand tracking** and **plane detection**, with locomotion/grabbing/physics turned off — this is a seated game.
- The whole game loop is one IWSDK ECS system (`src/game.ts`) with a small state machine: `placing → ready → aiming → racing → results`.
- **Input is unified into "pointers"**: each tracked hand's index fingertip (via `player.indexTipSpaces`) with pinch as select, each controller's grip with trigger as select, and the mouse on desktop all drive the same rules, read through IWSDK's `input.xr.getSelectState()`.
- **Table placement** scores every detected horizontal `XRPlane` (semantic label `table`/`desk` preferred, height 0.4–1.25 m, in front of and within reach of the player), clamps the board inside the plane's polygon, and turns the track to face the player.
- **Track maths** (`src/track.ts`): a "stadium" oval described by arc length, so the snail, pads, sign and slime trail are all positioned by distance along the racing line.
- **Physics-lite racing**: launch speed from pull distance + flick velocity (measured over the last ~120 ms of hand history), exponential drag, boosts with a perfect-timing window, never slower than a real snail's 0.03 km/h.
- **Everything is procedural** (`src/models.ts`, `src/label.ts`, `src/audio.ts`): the snail, shell spiral, track, pads, sign, ghost hand, particles and slime trail are built from three.js primitives and canvas textures; all in-world UI is canvas-texture labels; all sound effects are synthesised with WebAudio and positioned on the snail with an HRTF panner.
- Shipped as a static site on **GitHub Pages** (Vite build, GitHub Actions workflow in `.github/workflows/deploy.yml`).

### Asset disclosure

**Snail Sprint contains no third-party or AI-generated art, models, textures, music or sound files.** Every mesh, texture and sound in the game is generated procedurally in code at runtime. Hand and controller models shown in the headset/emulator are provided by the platform (WebXR Input Profiles), not bundled by the game. The demo video was captured from the real game running in the IWER Meta Quest 3 emulator.

## Run it locally

Requires Node 20.19+ / 22.12+.

```sh
npm install
npx vite            # dev server with the IWER Meta Quest emulator injected → https://localhost:8081/
npm run build       # production build into dist/ (base path /snail-sprint/)
VITE_BASE=/ npm run build   # build for hosting at a domain root
```

`npm run dev` starts the IWSDK managed dev workspace instead. To play on a Quest during development, open the dev server's network URL in the Quest Browser.

`scripts/record-demo.py` drives the game end-to-end in the emulator with an emulated hand (placement → launch → boosts → sign smash → results) and is how the demo video was captured.

## What's next

- Quest-hardware tuning pass (pinch thresholds, flick feel, 72/90 Hz performance checks) with playtesters at real tables.
- Persistent spatial anchors so the track stays on your table between sessions.
- More tracks that use the room: tracks that climb from the table onto a nearby shelf or wrap around objects using mesh detection.
- Daily challenge track + streaks and unlockable shells for a reason to come back.
- Ghost replays of your best run, and pass-the-headset / shared-table multiplayer.
- Accessibility options: one-handed mode, bigger timing windows, high-contrast track, gaze-to-boost alternative.

**Target launch: Q1 2027.**

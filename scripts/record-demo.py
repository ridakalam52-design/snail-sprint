"""Scripted demo capture for Snail Sprint.

Runs the real game in headless Chromium inside the IWER Meta Quest 3 emulator (dev server only,
`npx vite`), seats the player at the emulated living room's dining table, and plays two races with
an emulated right hand: placement -> ghost-hand onboarding -> pinch-pull-release launch -> pad
boosts -> speed-limit sign smash (slow motion) -> results -> race again for a new best.

Time is virtualised (vtime.js), so every captured frame is exactly 1/30 s of game time even on a
software GPU. Output: numbered JPEG frames + events.json (frame-accurate sound cues) in OUT.

usage: python3 scripts/record-demo.py OUT_DIR [--preview]
"""
import base64, json, math, os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pw import launch, sync_playwright, URL
from drive import R, V, SEAT, PITCH, LAP, PAD_S, dbg, hide

OUT = sys.argv[1]
PREVIEW = "--preview" in sys.argv
FPS = 30
W, H = (640, 360) if PREVIEW else (1280, 720)
SIGN_S = 0.17
os.makedirs(OUT, exist_ok=True)

GRAB_JS = """window.__grab = (q) => {
  window.__vt.step(1);
  if (!q) return '';
  const app = window.__snail.world.renderer.domElement;
  const cvs = [...document.querySelectorAll('canvas')]
    .filter(c => c.width > 100 && getComputedStyle(c).display !== 'none')
    .map(c => [c, +getComputedStyle(c).zIndex || 0])
    // layers: emulated room (passthrough stand-in) under the app; skip IWER's debug overlay above it
    .filter(([c, z]) => c === app || z < (+getComputedStyle(app).zIndex || 2))
    .sort((a, b) => a[1] - b[1]);
  const o = window.__out || (window.__out = document.createElement('canvas'));
  o.width = app.width; o.height = app.height;
  const x = o.getContext('2d');
  x.fillStyle = '#000'; x.fillRect(0, 0, o.width, o.height);
  for (const [c] of cvs) x.drawImage(c, 0, 0, o.width, o.height);
  return o.toDataURL('image/jpeg', q);
};"""


class Rec:
    def __init__(self, pg):
        self.pg, self.n, self.events, self.cur = pg, 0, [], None
        self.d = None
        self.slow = 1.0
        self.marks = {}

    def frame(self, k=1):
        for _ in range(k):
            data = self.pg.evaluate("window.__grab(0.9)")
            self.n += 1
            with open(os.path.join(OUT, f"f{self.n:05d}.jpg"), "wb") as f:
                f.write(base64.b64decode(data.split(",", 1)[1]))
            self.watch()

    def watch(self):
        """Turn game-state changes into frame-accurate sound cues."""
        prev, d = self.d, dbg(self.pg)
        self.d = d
        if prev is None: return
        if d["flashCount"] != prev["flashCount"]:
            t = d["flash"]
            kind = ("perfect" if t.startswith("PERFECT") else "boost" if t.startswith("BOOST")
                    else "miss" if t.startswith("Wait") else "smash" if t.startswith("SMASHED")
                    else "sign" if t.startswith("SPEED LIMIT") else "launch" if d["state"] == "racing" and prev["state"] == "aiming"
                    else "flash")
            self.ev(kind, text=t, combo=d["combo"], speed=d["speed"])
        if d["state"] != prev["state"]:
            if d["state"] == "ready" and prev["state"] == "placing": self.ev("place")
            if d["state"] == "aiming": self.ev("grab")
            if d["state"] == "results": self.ev("finish", win=d["win"], newBest=d["newBest"], time=d["elapsed"])

    def ev(self, kind, **kw):
        self.events.append({"frame": self.n, "t": self.n / FPS, "kind": kind, **kw})
        print(f"  [{self.n:5d}] {kind} {kw}", flush=True)

    def secs(self, s):
        self.frame(max(1, round(s * FPS)))

    def tip(self, p):
        self.cur = list(p)
        R(self.pg, "set_transform", {"device": "hand-right", "position": V(p), "anchor": "index-tip"})

    def glide(self, b, s, ease=True):
        a = self.cur or b
        k = max(1, round(s * FPS))
        for i in range(1, k + 1):
            f = i / k
            if ease: f = f * f * (3 - 2 * f)
            self.tip([a[j] + (b[j] - a[j]) * f for j in range(3)])
            self.frame()

    def pinch(self, v):
        R(self.pg, "set_select_value", {"device": "hand-right", "value": v})

    def set_slow(self, k):
        if k != self.slow:
            self.slow = k
            self.pg.evaluate(f"window.__vt.dt = {1000 / FPS / k}")
            self.ev("slowmo", factor=k)


def add(a, b, s=1.0):
    return [a[i] + b[i] * s for i in range(3)]


def launch_snail(r, pull, flick=0.05):
    d = r.d or dbg(r.pg)
    st, fw = d["start"], d["forward"]
    above, at = [st[0], st[1] + 0.06, st[2] + 0.01], [st[0], st[1] + 0.012, st[2]]
    r.glide(above, 0.6)
    r.glide(at, 0.3)
    r.pinch(1); r.frame(6)
    back = add(at, fw, -pull)
    r.glide(back, 0.75)
    r.frame(9)
    fl = add(back, fw, flick)
    r.glide(fl, 0.1, ease=False)
    r.pinch(0); r.frame(2)
    r.glide([fl[0], fl[1] + 0.07, fl[2] + 0.07], 0.35)


def race(r, miss_at=None, slowmo=True):
    """Follow the snail with the hand and pinch on each glowing pad (on the closest frame)."""
    used, missed = set(), False
    while True:
        d = r.d
        if d["state"] != "racing" or r.n > 6000: return
        # slow motion around the speed-limit sign on the final lap
        if slowmo:
            smash_at = LAP + SIGN_S
            r.set_slow(0.25 if smash_at - 0.07 < d["dist"] < smash_at + 0.12 else 1.0)
        dt = 1 / FPS * r.slow
        s = d["dist"] % LAP
        lap = int(d["dist"] // LAP)
        # hand hovers just behind/above the snail, eased
        sn = d["snail"]
        goal = [sn[0] + 0.02, sn[1] + 0.075, sn[2] + 0.085]
        cur = r.cur or goal
        r.tip([cur[i] + (goal[i] - cur[i]) * 0.18 for i in range(3)])
        tapped = False
        step_m = d["speed"] * dt
        for c in PAD_S:
            x = (s - c) % LAP
            if x > LAP / 2: x -= LAP
            key = (lap, c)
            if key in used: continue
            if miss_at is not None and not missed and key == miss_at and -0.09 < x < -0.07:
                missed = True  # pinch too early once to show the "wait for the glow" feedback
                r.pinch(1); r.frame(); r.pinch(0); tapped = True
                break
            if x < 0 and x + step_m >= -step_m / 2 and x > -0.03:
                used.add(key)
                r.pinch(1); r.frame(); r.pinch(0); tapped = True
                break
        if not tapped: r.frame()
    

with sync_playwright() as p:
    b, c, pg, logs = launch(p, W, H, vtime=True)
    c.add_init_script("try{localStorage.clear()}catch(e){}")
    pg.goto(URL, wait_until="load", timeout=90000)
    pg.wait_for_function("window.__snail && window.__snail.game", timeout=90000)
    pg.click("#enter-xr")
    pg.wait_for_timeout(3000)
    pg.evaluate(GRAB_JS)
    pg.evaluate(f"window.__vt.start({FPS})")
    r = Rec(pg)
    T0 = time.time()

    # seat the player at the table, switch to hands, hide emulator UI
    s_, c_ = math.sin(PITCH / 2), math.cos(PITCH / 2)
    R(pg, "set_input_mode", {"mode": "hand"})
    R(pg, "set_transform", {"device": "headset", "position": V(SEAT), "orientation": {"x": s_, "y": 0, "z": 0, "w": c_}})
    R(pg, "set_transform", {"device": "hand-left", "position": V([SEAT[0] - 0.32, SEAT[1] - 0.55, SEAT[2] - 0.12])})
    r.tip([SEAT[0] + 0.24, SEAT[1] - 0.42, SEAT[2] - 0.2])
    hide(pg)
    pg.evaluate("window.IWER_DEVICE.fovy = 1.0")
    pg.evaluate("window.__vt.step(4)")
    r.d = dbg(pg)
    print("start", r.d["state"], r.d["tableFound"], flush=True)

    # 1) placement: ghost board snaps to the detected table, ghost hand shows the pinch
    r.ev("scene", name="placing")
    r.secs(2.6)
    tr = r.d["track"]
    r.glide([tr[0] + 0.06, tr[1] + 0.09, tr[2] + 0.12], 0.8)
    r.pinch(1); r.frame(3); r.pinch(0)
    r.secs(1.2)
    print("placed", r.d["state"], round(time.time() - T0), flush=True)

    # 2) onboarding: ghost hand demonstrates pinch -> pull back -> let go
    r.ev("scene", name="onboarding")
    st = r.d["start"]
    r.glide([st[0] + 0.16, st[1] + 0.1, st[2] + 0.12], 0.6)
    r.secs(3.0)

    # 3) first race: a solid launch, one early pinch, slow-mo smash
    r.ev("scene", name="race1")
    launch_snail(r, pull=0.07)
    race(r, miss_at=(0, 0.66), slowmo=True)
    r.set_slow(1.0)
    print("race1", r.d["state"], r.d["elapsed"], r.d["boosts"], round(time.time() - T0), flush=True)
    r.secs(3.6)

    # 4) race again for a new best
    r.ev("scene", name="race2")
    sn = r.d["snail"]
    r.glide([sn[0], sn[1] + 0.07, sn[2] + 0.06], 0.4)
    r.pinch(1); r.frame(3); r.pinch(0)
    r.secs(1.2)
    launch_snail(r, pull=0.09, flick=0.07)
    race(r, slowmo=False)
    print("race2", r.d["state"], r.d["elapsed"], r.d["boosts"], r.d["newBest"], round(time.time() - T0), flush=True)
    r.glide(add(r.cur, [0.05, 0.04, 0.08]), 0.6)
    r.secs(3.4)

    json.dump({"fps": FPS, "frames": r.n, "events": r.events}, open(os.path.join(OUT, "events.json"), "w"), indent=1)
    errs = [l for l in logs if ("pageerror" in l or "[error]" in l) and "jsdelivr" not in l and "Failed to load resource" not in l]
    print("DONE frames", r.n, "secs", round(time.time() - T0), "errors", len(errs), flush=True)
    for l in errs[:20]: print("  ", l[:300])
    b.close()

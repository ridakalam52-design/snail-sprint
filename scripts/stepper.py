"""Frame-stepped driving of Snail Sprint in the IWER emulator (see vtime.js).
Every action advances the game by whole frames; if `shots` is set, each frame is saved."""
import json, math, os
from drive import R, V, SEAT, PITCH, LAP, PAD_S, pad_delta, dbg, tip, hide

class Stepper:
    def __init__(self, pg, fps=30, shots=None, fmt="jpeg"):
        self.pg, self.fps, self.shots, self.fmt = pg, fps, shots, fmt
        self.n = 0
        self.events = []          # (frame, name) for the sound track
        self.cur = None
        if shots: os.makedirs(shots, exist_ok=True)

    def start(self):
        self.pg.evaluate(f"window.__vt.start({self.fps})")

    def step(self, k=1):
        for _ in range(k):
            self.pg.evaluate("window.__vt.step(1)")
            self.n += 1
            if self.shots:
                p = os.path.join(self.shots, f"f{self.n:05d}.{ 'jpg' if self.fmt=='jpeg' else 'png'}")
                if self.fmt == "jpeg": self.pg.screenshot(path=p, type="jpeg", quality=92)
                else: self.pg.screenshot(path=p)

    def secs(self, s):
        self.step(max(1, round(s * self.fps)))

    def ev(self, name):
        self.events.append((self.n, name))

    def tip_to(self, p):
        self.cur = list(p)
        R(self.pg, "set_transform", {"device": "hand-right", "position": V(p), "anchor": "index-tip"})

    def glide(self, b, secs, ease=True):
        a = self.cur or b
        k = max(1, round(secs * self.fps))
        for i in range(1, k + 1):
            f = i / k
            if ease: f = f * f * (3 - 2 * f)
            self.tip_to([a[j] + (b[j] - a[j]) * f for j in range(3)])
            self.step()

    def pinch(self, v):
        R(self.pg, "set_select_value", {"device": "hand-right", "value": v})

    def setup(self, fovy=None):
        s, c = math.sin(PITCH / 2), math.cos(PITCH / 2)
        R(self.pg, "set_input_mode", {"mode": "hand"})
        R(self.pg, "set_transform", {"device": "headset", "position": V(SEAT), "orientation": {"x": s, "y": 0, "z": 0, "w": c}})
        R(self.pg, "set_transform", {"device": "hand-left", "position": V([SEAT[0]-0.3, SEAT[1]-0.5, SEAT[2]-0.1])})
        self.tip_to([SEAT[0] + 0.2, SEAT[1] - 0.32, SEAT[2] - 0.28])
        hide(self.pg)
        if fovy: self.pg.evaluate(f"window.IWER_DEVICE.fovy = {fovy}")

    def dbg(self):
        return dbg(self.pg)

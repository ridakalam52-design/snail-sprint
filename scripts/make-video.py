"""Assemble demo.mp4 from frames captured by record-demo.py.

Adds a title card, lower-third captions, an end card and a procedurally synthesised sound track
(game-style SFX placed on the frame-accurate events from events.json + a light music bed).

usage: python3 scripts/make-video.py FRAMES_DIR OUT.mp4
"""
import json, os, subprocess, sys, wave
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

FR, OUT = sys.argv[1], sys.argv[2]
EV = json.load(open(os.path.join(FR, "events.json")))
FPS = EV["fps"]; N = EV["frames"]; events = EV["events"]
W, H = 1280, 720
TITLE0, HOW, END = 4.5, 5.5, 7.0
TITLE = TITLE0 + HOW
SR = 44100
BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
REG = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
YEL, CYAN, BG = (255, 207, 51), (127, 240, 255), (27, 29, 41)

def font(p, s): return ImageFont.truetype(p, s)

def ev(kind, nth=0):
    xs = [e for e in events if e["kind"] == kind or (kind == "scene" and False)]
    return xs[nth]["frame"] if len(xs) > nth else None

def scene(name):
    for e in events:
        if e["kind"] == "scene" and e.get("name") == name: return e["frame"]
    return None

# ---------------------------------------------------------------- captions (frame ranges)
caps = []
def cap(a, b, text, sub=None):
    if a is not None and b is not None and b > a: caps.append((a, b, text, sub))

f_place, f_onb, f_r1, f_r2 = scene("placing"), scene("onboarding"), scene("race1"), scene("race2")
f_launch = next((e["frame"] for e in events if e["kind"] == "launch"), None)
boosts = [e["frame"] for e in events if e["kind"] in ("boost", "perfect")]
f_miss = next((e["frame"] for e in events if e["kind"] == "miss"), None)
f_sign = next((e["frame"] for e in events if e["kind"] == "sign"), None)
f_smash = next((e["frame"] for e in events if e["kind"] == "smash"), None)
fins = [e["frame"] for e in events if e["kind"] == "finish"]
placed = next((e["frame"] for e in events if e["kind"] == "place"), None)

cap(0, placed, "Your real table is the level", "Plane detection snaps the track onto the table in front of you")
cap(placed, f_onb + 15 if f_onb else None, "Pinch to place it", "Hands only — no controllers, no standing up")
cap(f_onb + 15 if f_onb else None, f_r1 + 20 if f_r1 else None, "A ghost hand teaches every gesture", "Pinch the snail, pull back, let go")
cap(f_r1 + 20 if f_r1 else None, (f_launch or 0) + 40, "Slingshot launch", "Pull further and flick harder for a faster start")
b1 = boosts[0] if boosts else None
cap(b1 - 25 if b1 else None, (f_sign - 10) if f_sign else None, "Pinch when the pad glows", "Hit the centre for PERFECT boosts and combos · too early breaks the combo")
cap(f_sign, f_smash, "Final lap: SPEED LIMIT 0.03 km/h", "A real garden snail's top speed")
cap(f_smash, (fins[0] if fins else f_smash + 60), "…smash it", "How many times over the limit were you?")
cap(fins[0] if fins else None, f_r2, "60-second runs · best time saved", "Boosts, top speed and your best, right on the table")
cap(f_r2, fins[1] if len(fins) > 1 else N, "Race again", "Chain perfect boosts to beat your best")
fin_evs = [e for e in events if e["kind"] == "finish"]
if len(fin_evs) > 1:
    e2 = fin_evs[1]
    cap(e2["frame"], N + 1, "New best!" if e2.get("newBest") else "Pinch to go again", f"{e2.get('time', 0):.2f} s · pinch to go again")

def draw_caption(im, text, sub):
    d = ImageDraw.Draw(im, "RGBA")
    f1, f2 = font(BOLD, 34), font(REG, 21)
    w1 = d.textlength(text, font=f1); w2 = d.textlength(sub, font=f2) if sub else 0
    bw = max(w1, w2) + 56; bh = 92 if sub else 62
    x0, y0 = (W - bw) / 2, H - bh - 28
    d.rounded_rectangle([x0, y0, x0 + bw, y0 + bh], radius=22, fill=(20, 22, 32, 215), outline=YEL + (255,), width=3)
    d.text((W / 2, y0 + 14), text, font=f1, fill=(255, 255, 255), anchor="mt")
    if sub: d.text((W / 2, y0 + 58), sub, font=f2, fill=CYAN, anchor="mt")

def badge(im):
    d = ImageDraw.Draw(im, "RGBA")
    f = font(BOLD, 16)
    t = "SNAIL SPRINT · real gameplay · IWER Meta Quest 3 emulator"
    w = d.textlength(t, font=f)
    d.rounded_rectangle([16, 16, 16 + w + 24, 16 + 32], radius=14, fill=(20, 22, 32, 170))
    d.text((28, 32), t, font=f, fill=(255, 255, 255, 230), anchor="lm")

# ---------------------------------------------------------------- title / end cards
def snail_logo(d, cx, cy, s):
    # procedural snail, like the in-game one: green body, orange shell with yellow spiral
    d.rounded_rectangle([cx - 1.25 * s, cy + 0.25 * s, cx + 1.15 * s, cy + 0.7 * s], radius=0.22 * s, fill=(143, 227, 168))
    for i, (ex, ey) in enumerate([(0.85, -0.55), (1.08, -0.45)]):
        d.line([cx + 0.85 * s, cy + 0.35 * s, cx + ex * s, cy + ey * s], fill=(143, 227, 168), width=max(3, int(0.08 * s)))
        d.ellipse([cx + ex * s - 0.1 * s, cy + ey * s - 0.1 * s, cx + ex * s + 0.1 * s, cy + ey * s + 0.1 * s], fill=(255, 255, 255))
        d.ellipse([cx + ex * s - 0.04 * s, cy + ey * s - 0.04 * s, cx + ex * s + 0.05 * s, cy + ey * s + 0.05 * s], fill=(20, 20, 30))
    d.ellipse([cx - 0.95 * s, cy - 0.65 * s, cx + 0.45 * s, cy + 0.6 * s], fill=(255, 122, 61))
    pts = []
    import math
    for i in range(200):
        a = i * 0.11; r = (0.03 + i * 0.0029) * s
        pts.append((cx - 0.25 * s + math.cos(a) * r, cy - 0.02 * s + math.sin(a) * r))
    d.line(pts, fill=(255, 211, 90), width=max(3, int(0.07 * s)), joint="curve")

def card(bg_frame, lines, logo=True):
    base = Image.open(bg_frame).convert("RGB").resize((W, H)).filter(ImageFilter.GaussianBlur(14))
    dark = Image.new("RGB", (W, H), BG)
    im = Image.blend(base, dark, 0.72)
    d = ImageDraw.Draw(im, "RGBA")
    y = 150
    if logo:
        snail_logo(d, W / 2, 175, 70); y = 270
    for text, size, col, fnt in lines:
        d.text((W / 2, y), text, font=font(fnt, size), fill=col, anchor="mt")
        y += size + 22
    return im

mid = os.path.join(FR, f"f{max(1, (f_r1 or 1) + 200):05d}.jpg")
title = card(mid, [("SNAIL SPRINT", 92, YEL, BOLD),
                   ("Smash the 0.03 km/h speed limit — on your own table.", 30, (255, 255, 255), BOLD),
                   ("A seated, hands-first mixed-reality race for Meta Quest", 24, CYAN, REG),
                   ("Built with the Meta Immersive Web SDK (WebXR)", 20, (200, 203, 224), REG)])
endc = card(os.path.join(FR, f"f{N:05d}.jpg"), [
    ("SNAIL SPRINT", 80, YEL, BOLD),
    ("Play in the Meta Quest Browser:", 26, (255, 255, 255), REG),
    ("ridakalam52-design.github.io/snail-sprint", 32, CYAN, BOLD),
    ("Hands-first · seated · passthrough · 60-second runs", 22, (255, 255, 255), REG),
    ("All models, textures and sounds are generated procedurally in code.", 19, (200, 203, 224), REG),
    ("Target launch: Q1 2027", 24, YEL, BOLD)])

def howto(bg_frame):
    base = Image.open(bg_frame).convert("RGB").resize((W, H)).filter(ImageFilter.GaussianBlur(14))
    im = Image.blend(base, Image.new("RGB", (W, H), BG), 0.72)
    d = ImageDraw.Draw(im, "RGBA")
    d.text((W / 2, 92), "HOW TO PLAY — hands only", font=font(BOLD, 46), fill=YEL, anchor="mt")
    steps = [("1", "Look at your table", "The track snaps onto it. Pinch to place."),
             ("2", "Pinch the snail, pull back, let go", "A harder pull and flick = a faster launch."),
             ("3", "Pinch when a pad glows", "Hit the centre for PERFECT combos."),
             ("4", "Smash the 0.03 km/h speed limit", "Two laps, 60 seconds. Beat your best.")]
    y = 200
    for n_, t1, t2 in steps:
        d.ellipse([250, y - 4, 306, y + 52], fill=YEL)
        d.text((278, y + 24), n_, font=font(BOLD, 32), fill=BG, anchor="mm")
        d.text((330, y - 2), t1, font=font(BOLD, 32), fill=(255, 255, 255))
        d.text((330, y + 38), t2, font=font(REG, 22), fill=CYAN)
        y += 112
    return im
howc = howto(os.path.join(FR, f"f{max(1, (f_r1 or 1) + 260):05d}.jpg"))

# ---------------------------------------------------------------- video
total_frames = None
tmp_v = OUT + ".v.mp4"
ff = subprocess.Popen(["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
                       "-r", str(FPS), "-i", "-", "-c:v", "libx264", "-preset", "medium", "-crf", "18",
                       "-pix_fmt", "yuv420p", "-profile:v", "high", "-movflags", "+faststart", tmp_v], stdin=subprocess.PIPE)
def put(im): ff.stdin.write(im.convert("RGB").tobytes())
tn = int(TITLE * FPS)
first = Image.open(os.path.join(FR, "f00001.jpg")).convert("RGB")
t0n, hn = int(TITLE0 * FPS), int(HOW * FPS)
for i in range(t0n):
    k = i / t0n
    put(title if k < 0.9 else Image.blend(title, howc, (k - 0.9) / 0.1))
for i in range(hn):
    k = i / hn
    put(howc if k < 0.9 else Image.blend(howc, first, (k - 0.9) / 0.1))
smashes = [e["frame"] for e in events if e["kind"] == "smash"]
SLOWS = [(f - 6, f + 18) for f in smashes]
SLOWK = 3
def frame_img(n):
    im = Image.open(os.path.join(FR, f"f{n:05d}.jpg")).convert("RGB")
    return im if im.size == (W, H) else im.resize((W, H))
def deco(im, n, slow=False):
    badge(im)
    for a, b, t, s in caps:
        if a <= n < b: draw_caption(im, t, s); break
    if slow:
        d = ImageDraw.Draw(im, "RGBA")
        d.rounded_rectangle([W - 210, 16, W - 16, 48], radius=14, fill=(232, 69, 60, 220))
        d.text((W - 113, 32), "SLOW MOTION", font=font(BOLD, 16), fill=(255, 255, 255), anchor="mm")
    return im
out_index = []  # output frame -> source frame (for audio timing)
for n in range(1, N + 1):
    im = frame_img(n)
    if any(a <= n < b for a, b in SLOWS) and n < N:
        nxt = frame_img(n + 1)
        for k in range(SLOWK):
            put(deco(Image.blend(im, nxt, k / SLOWK), n, True)); out_index.append(n + k / SLOWK)
    else:
        put(deco(im, n)); out_index.append(n)
last = Image.open(os.path.join(FR, f"f{N:05d}.jpg")).convert("RGB")
en = int(END * FPS)
for i in range(en):
    k = i / en
    put(endc if k > 0.12 else Image.blend(last, endc, k / 0.12))
ff.stdin.close(); ff.wait()
total_frames = tn + len(out_index) + en

# ---------------------------------------------------------------- audio
dur = total_frames / FPS
t = np.arange(int(dur * SR)) / SR
mix = np.zeros_like(t)
rng = np.random.default_rng(7)

def env(n, a=0.005, r=0.1):
    e = np.ones(n); na, nr = int(a * SR), int(r * SR)
    if na: e[:na] = np.linspace(0, 1, na)
    if nr and nr < n: e[-nr:] *= np.linspace(1, 0, nr)
    return e

def tone(f0, f1, d, wave_="sine", vol=0.3, a=0.005, r=None):
    n = int(d * SR); tt = np.arange(n) / SR
    f = np.linspace(f0, f1, n); ph = 2 * np.pi * np.cumsum(f) / SR
    s = np.sin(ph) if wave_ == "sine" else np.sign(np.sin(ph)) * 0.6 if wave_ == "sq" else 2 * (ph / (2 * np.pi) % 1) - 1
    return s * env(n, a, r if r is not None else d * 0.6) * vol

def noise(d, vol=0.3, lp=0.2, r=None):
    n = int(d * SR); s = rng.standard_normal(n)
    y = np.zeros(n); acc = 0.0
    for i in range(n): acc += lp * (s[i] - acc); y[i] = acc
    return y / (np.abs(y).max() + 1e-9) * env(n, 0.002, r if r is not None else d * 0.8) * vol

def at(sec, s):
    i = int(sec * SR); j = min(len(mix), i + len(s))
    if i < len(mix): mix[i:j] += s[: j - i]

import bisect
def T(frame):
    # map a captured frame to output time, accounting for the slow-motion stretch
    i = bisect.bisect_left(out_index, frame)
    return TITLE + i / FPS

# music bed: soft 112 bpm bass + arpeggio, ducked at the cards' edges
bpm = 112; beat = 60 / bpm
notes = [[57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 67], [52, 55, 59, 64]]  # Am F G Em
def midi(m): return 440 * 2 ** ((m - 69) / 12)
k = 0; s = 0.0
while s < dur - 0.5:
    ch = notes[(k // 8) % 4]
    at(s, tone(midi(ch[0] - 12), midi(ch[0] - 12), beat * 0.9, "sine", 0.10, 0.01, beat * 0.5))
    at(s + beat / 2, tone(midi(ch[(k * 2 + 1) % 4] + 12), midi(ch[(k * 2 + 1) % 4] + 12), beat * 0.35, "tri", 0.035, 0.005, 0.2))
    at(s, tone(midi(ch[(k * 2) % 4] + 12), midi(ch[(k * 2) % 4] + 12), beat * 0.35, "tri", 0.035, 0.005, 0.2))
    if k % 2 == 1: at(s, noise(0.05, 0.03, 0.9))
    s += beat; k += 1

at(0.2, noise(0.6, 0.12, 0.08))  # title whoosh
for e in events:
    s0 = T(e["frame"]); kd = e["kind"]
    if kd == "place":
        at(s0, tone(320, 900, 0.14, "sine", 0.35)); at(s0 + 0.05, tone(900, 1300, 0.12, "sine", 0.2))
    elif kd == "grab":
        at(s0, tone(1200, 800, 0.05, "sq", 0.12))
        for q in range(5): at(s0 + 0.2 + q * 0.12, tone(180 + q * 30, 200 + q * 30, 0.08, "tri", 0.08))  # stretch creaks
    elif kd == "launch":
        at(s0, noise(0.45, 0.35, 0.25)); at(s0, tone(220, 880, 0.3, "tri", 0.25))
    elif kd in ("boost", "perfect"):
        c = max(1, e.get("combo", 1)); base = 440 * 2 ** (min(c, 8) / 12)
        at(s0, tone(base, base * 2, 0.16, "sq", 0.16)); at(s0, noise(0.2, 0.08, 0.5))
        if kd == "perfect":
            for q, m in enumerate([0, 4, 7, 12]): at(s0 + 0.04 + q * 0.035, tone(base * 2 * 2 ** (m / 12), base * 2 * 2 ** (m / 12), 0.18, "sine", 0.12))
    elif kd == "miss":
        at(s0, tone(140, 110, 0.25, "sq", 0.16))
    elif kd == "sign":
        at(s0, tone(180, 520, 0.18, "sine", 0.3)); at(s0 + 0.15, tone(520, 400, 0.2, "sine", 0.2))
    elif kd == "smash":
        at(s0, noise(1.2, 0.55, 0.35, 1.0)); at(s0, tone(110, 45, 0.5, "sine", 0.6)); at(s0 + 0.05, noise(0.6, 0.25, 0.9))
    elif kd == "finish":
        seq = [60, 64, 67, 72] if e.get("win") else [64, 60]
        for q, m in enumerate(seq): at(s0 + q * 0.11, tone(midi(m + 12), midi(m + 12), 0.3 if q < len(seq) - 1 else 0.7, "tri", 0.22))
        if e.get("newBest"):
            for q in range(8): at(s0 + 0.5 + q * 0.05, tone(midi(84 + q % 4 * 3), midi(84 + q % 4 * 3), 0.15, "sine", 0.08))
# fade in/out
fade = int(0.4 * SR); mix[:fade] *= np.linspace(0, 1, fade); mix[-int(1.2 * SR):] *= np.linspace(1, 0, int(1.2 * SR))
mix = np.tanh(mix * 1.1) * 0.85
pcm = (mix * 32767).astype(np.int16)
tmp_a = OUT + ".a.wav"
with wave.open(tmp_a, "wb") as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", tmp_v, "-i", tmp_a, "-c:v", "copy", "-c:a", "aac", "-b:a", "160k",
                "-ac", "2", "-shortest", "-movflags", "+faststart", OUT], check=True)
os.remove(tmp_v); os.remove(tmp_a)
print("wrote", OUT, f"{dur:.1f}s", total_frames, "frames")

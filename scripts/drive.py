"""Drives Snail Sprint through the IWER emulator (dev server only): seat the player at the
emulated living room's dining table, switch to hand tracking, and move/pinch the right hand."""
import json, math
SEAT = [-0.95, 1.13, 2.1]          # seated at the 0.74 m dining table in the emulated sunlit_living_room
PITCH = -0.78                        # look down at the table (radians)

def J(pg, js):
    return pg.evaluate(js)

def dbg(pg):
    return json.loads(J(pg, "JSON.stringify(window.__snail.game.debug())"))

def V(p):
    return {"x": float(p[0]), "y": float(p[1]), "z": float(p[2])}

def R(pg, method, params):
    """Send a command through IWER's programmatic remote-control queue (what the IWSDK dev MCP uses)."""
    # fire-and-forget: the command applies at the start of the next XR frame
    pg.evaluate("([m,p])=>{window.IWER_DEVICE.remote.enqueueDiscrete(m,p).catch(e=>console.error('[remote]',m,e.message))}", [method, params])

def setup(pg, hide_ui=True):
    s, c = math.sin(PITCH / 2), math.cos(PITCH / 2)
    R(pg, "set_input_mode", {"mode": "hand"})
    R(pg, "set_transform", {"device": "headset", "position": V(SEAT), "orientation": {"x": s, "y": 0, "z": 0, "w": c}})
    R(pg, "set_transform", {"device": "hand-left", "position": V([SEAT[0]-0.28, SEAT[1]-0.42, SEAT[2]-0.2])})
    R(pg, "set_transform", {"device": "hand-right", "position": V([SEAT[0]+0.18, SEAT[1]-0.3, SEAT[2]-0.3]), "anchor": "index-tip"})
    if hide_ui: hide(pg)

def hide(pg):
    J(pg, """(()=>{const d=window.IWER_DEVICE; const u=d.devui; if(u&&u.devUIContainer) u.devUIContainer.style.display='none';
      const st=document.getElementById('__hide_devui')||Object.assign(document.createElement('style'),{id:'__hide_devui'});
      st.textContent='#overlay{display:none!important}'; document.head.appendChild(st);})()""")

def tip(pg):
    return json.loads(J(pg, "JSON.stringify(window.__snail.game.tips())")).get("right")

_cur = [0, 0, 0]
def move_tip(pg, target):
    """Pin the right index fingertip to a world position (XR origin == world here)."""
    _cur[:] = target
    R(pg, "set_transform", {"device": "hand-right", "position": V(target), "anchor": "index-tip"})

def glide_tip(pg, a, b, ms, steps=None):
    steps = steps or max(2, ms // 33)
    for k in range(1, steps + 1):
        f = k / steps
        f = f * f * (3 - 2 * f)
        move_tip(pg, [a[i] + (b[i] - a[i]) * f for i in range(3)])
        pg.wait_for_timeout(ms // steps)

def pinch(pg, v):
    R(pg, "set_select_value", {"device": "hand-right", "value": v})

def tap(pg, hold=140):
    pinch(pg, 1); pg.wait_for_timeout(hold); pinch(pg, 0)

LAP = 2 * 0.32 + 2 * math.pi * 0.09
PAD_S = [0.24, 0.66, 0.86, 1.1]

def pad_delta(d):
    """Signed distance from the snail to the nearest pad centre (negative = pad still ahead)."""
    s = d["dist"] % LAP
    best = None
    for c in PAD_S:
        x = (s - c) % LAP
        if x > LAP / 2: x -= LAP
        if best is None or abs(x) < abs(best): best = x
    return best

def launch_snail(pg, pull=0.085, hold_ms=600):
    d = dbg(pg)
    st, fw = d["start"], d["forward"]
    above = [st[0], st[1] + 0.06, st[2]]
    at = [st[0], st[1] + 0.012, st[2]]
    glide_tip(pg, tip(pg) or above, above, 700)
    glide_tip(pg, above, at, 350)
    pinch(pg, 1); pg.wait_for_timeout(250)
    back = [at[i] - fw[i] * pull for i in range(3)]
    glide_tip(pg, at, back, hold_ms)
    pg.wait_for_timeout(350)
    fwd = [back[i] + fw[i] * 0.05 for i in range(3)]
    glide_tip(pg, back, fwd, 90, steps=3)
    pinch(pg, 0)
    pg.wait_for_timeout(100)
    lift = [fwd[0], fwd[1] + 0.08, fwd[2] + 0.05]
    glide_tip(pg, fwd, lift, 400)

def race(pg, max_s=70, on_tick=None, hover=True):
    """Pinch on each pad as the snail reaches it until the results card appears."""
    import time
    t0 = time.time(); last_tap = 0; used = set()
    while time.time() - t0 < max_s:
        d = dbg(pg)
        if d["state"] != "racing": return d
        pd = pad_delta(d)
        key = (int(d["dist"] // LAP), round((d["dist"] % LAP) - pd, 2))
        lead = max(0.004, d["speed"] * 0.03)   # tap slightly early to absorb frame latency
        if -0.012 - lead <= pd <= 0.006 and key not in used and time.time() - last_tap > 0.25:
            used.add(key); last_tap = time.time()
            if hover:
                # bring the hand over the snail so the pinch reads on camera
                sn = d["snail"]; move_tip(pg, [sn[0] + 0.03, sn[1] + 0.07, sn[2] + 0.06])
            tap(pg, 90)
        if on_tick: on_tick(d)
        pg.wait_for_timeout(5)
    return dbg(pg)

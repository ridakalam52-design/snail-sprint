"""Shared Playwright launcher for local headless testing against the IWSDK dev server."""
import os
os.environ.setdefault("PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS", "1")
from playwright.sync_api import sync_playwright
URL = os.environ.get("SNAIL_URL", "https://localhost:8081/")
ARGS = ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
        "--ignore-certificate-errors", "--autoplay-policy=no-user-gesture-required"]
from urllib.parse import urlsplit, unquote
def _proxy():
    u = os.environ.get("HTTPS_PROXY") or os.environ.get("https_proxy")
    if not u: return None
    s = urlsplit(u)
    d = {"server": f"{s.scheme}://{s.hostname}:{s.port}", "bypass": "localhost,127.0.0.1"}
    if s.username: d["username"] = unquote(s.username); d["password"] = unquote(s.password or "")
    return d
HERE = os.path.dirname(os.path.abspath(__file__))
def launch(p, w=1280, h=720, video_dir=None, vtime=False):
    b = p.chromium.launch(args=ARGS)
    kw = dict(viewport={"width": w, "height": h}, ignore_https_errors=True)
    if video_dir: kw.update(record_video_dir=video_dir, record_video_size={"width": w, "height": h})
    c = b.new_context(**kw)
    if vtime: c.add_init_script(path=os.path.join(HERE, "vtime.js"))
    _cache = {}
    def _cdn(route):
        # The sandbox only reaches the internet via an env proxy, which Chromium can't use for
        # localhost; fetch CDN assets (hand/controller models) from Python instead.
        u = route.request.url
        try:
            if u not in _cache:
                import urllib.request
                with urllib.request.urlopen(u, timeout=30) as r:
                    _cache[u] = (r.status, r.read(), r.headers.get("content-type", "application/octet-stream"))
            st, body, ct = _cache[u]
            route.fulfill(status=st, body=body, headers={"content-type": ct, "access-control-allow-origin": "*"})
        except Exception:
            route.abort()
    c.route("https://cdn.jsdelivr.net/**", _cdn)
    pg = c.new_page()
    logs = []
    pg.on("console", lambda m: logs.append(f"[{m.type}] {m.text}"))
    pg.on("pageerror", lambda e: logs.append(f"[pageerror] {e}"))
    return b, c, pg, logs

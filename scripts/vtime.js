// Deterministic frame stepping for headless recording on a slow software GPU.
// Before window.__vt.start(), time and requestAnimationFrame behave normally. After it,
// rAF callbacks are queued and only run on window.__vt.step(), each step advancing
// performance.now() by exactly 1/fps seconds, so the game plays at true speed per frame.
(() => {
  const realNow = performance.now.bind(performance);
  const realRaf = window.requestAnimationFrame.bind(window);
  const realCancel = window.cancelAnimationFrame.bind(window);
  const vt = { on: false, t: 0, dt: 1000 / 30, frame: 0, q: new Map(), id: 1e9 };
  window.__vt = vt;
  performance.now = () => (vt.on ? vt.t : realNow());
  window.requestAnimationFrame = (cb) => {
    if (!vt.on) return realRaf(cb);
    const id = ++vt.id;
    vt.q.set(id, cb);
    return id;
  };
  window.cancelAnimationFrame = (id) => {
    if (vt.q.has(id)) vt.q.delete(id);
    else realCancel(id);
  };
  vt.start = (fps) => {
    vt.dt = 1000 / (fps || 30);
    vt.t = realNow();
    vt.on = true;
  };
  vt.step = (n) => {
    n = n || 1;
    for (let i = 0; i < n; i++) {
      vt.t += vt.dt;
      vt.frame++;
      const cbs = [...vt.q.values()];
      vt.q.clear();
      for (const cb of cbs) {
        try { cb(vt.t); } catch (e) { console.error('[vt] frame error', e && e.stack || e); }
      }
    }
    return vt.frame;
  };
})();

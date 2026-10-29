/**
 * Snail Sprint — the whole game loop lives in one IWSDK system.
 *
 * States: placing → ready → aiming → racing → results → ready …
 * Input is unified into "pointers": each tracked hand (pinch) or controller
 * (trigger) in XR, plus the mouse on desktop, so the same rules drive both.
 */
import { createSystem, VisibilityState } from '@iwsdk/core';
import {
  BoxGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Plane,
  Quaternion,
  Raycaster,
  Vector2,
  Vector3,
} from 'three';
import { Sfx } from './audio.js';
import { Label } from './label.js';
import {
  buildHandHint,
  buildSign,
  buildSnail,
  buildTrack,
  Particles,
  setGhost,
  SlimeTrail,
} from './models.js';
import {
  LAP,
  LAPS,
  lapDelta,
  PAD_LENGTH,
  PAD_S,
  RACE_LENGTH,
  RADIUS,
  SIGN_S,
  STRAIGHT,
  trackPoint,
  trackTangent,
} from './track.js';

type State = 'placing' | 'ready' | 'aiming' | 'racing' | 'results';
type Pointer = {
  id: string;
  connected: boolean;
  active: boolean;
  started: boolean;
  ended: boolean;
  pos: Vector3; // world space
};

const RUN_SECONDS = 60;
const MIN_SPEED = 0.03 / 3.6; // a snail's honest top speed: 0.03 km/h in m/s
const DRAG = 0.16; // 1/s exponential slowdown
const MAX_SPEED = 0.5;
const TOP = 0.006; // track surface height above the table plate
const BEST_KEY = 'snailSprint.bestTime';
const ONBOARD_KEY = 'snailSprint.onboarded';
const GRAB_RADIUS = 0.15;
const SIGN_YAW = -0.6;
const START = trackPoint(0);
const START_FWD = new Vector3(1, 0, 0);

const store = {
  get(k: string) {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string) {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* private mode */
    }
  },
};

export class GameSystem extends createSystem({}) {
  static instance: GameSystem | null = null;

  private state: State = 'placing';
  private stateTime = 0;
  private readonly root = new Group(); // world-space container
  private readonly trackRoot = new Group(); // the board on the table
  private readonly uiRoot = new Group(); // world-space labels
  private track!: ReturnType<typeof buildTrack>;
  private snail!: ReturnType<typeof buildSnail>;
  private sign!: ReturnType<typeof buildSign>;
  private hint3d!: ReturnType<typeof buildHandHint>;
  private particles!: Particles;
  private slime!: SlimeTrail;
  private desk!: Mesh;
  private readonly sfx = new Sfx();

  private hud!: Label;
  private hint!: Label;
  private pop!: Label;
  private results!: Label;
  private popTime = 99;
  private readonly popPos = new Vector3();

  // race
  private dist = 0;
  private speed = 0;
  private elapsed = 0;
  private combo = 0;
  private boosts = 0;
  private padsPassed = 0;
  private topSpeed = 0;
  private missCooldown = 0;
  private readonly padUsedLap = PAD_S.map(() => -1);
  private lastTrailDist = 0;
  private lastTick = 99;
  private signState: 'hidden' | 'rising' | 'up' | 'smashed' = 'hidden';
  private signT = 0;
  private readonly boardVel = new Vector3();
  private readonly boardSpin = new Vector3();
  private finishedWin = false;
  private finishTime = 0;
  private newBest = false;
  private best: number | null = null;
  private onboarded = false;
  private firstBoostHint = true;

  // aiming
  private aimPtr: Pointer | null = null;
  private readonly grabPos = new Vector3();
  private pull = 0;
  private lastStretchSfx = 0;
  private readonly history: { t: number; p: Vector3 }[] = [];

  // placement
  private tableFound = false;
  private placed = false;
  private readonly candPos = new Vector3();
  private candYaw = 0;

  // input
  private readonly pointers: Record<string, Pointer> = {};
  private readonly mouse = { down: false, started: false, ended: false, ndc: new Vector2() };
  private readonly raycaster = new Raycaster();
  private readonly plane = new Plane();

  // scratch
  private readonly v1 = new Vector3();
  private readonly v2 = new Vector3();
  private readonly v3 = new Vector3();
  private readonly q1 = new Quaternion();
  private readonly m1 = new Matrix4();
  private readonly m2 = new Matrix4();
  private readonly headPos = new Vector3();
  private readonly headQuat = new Quaternion();
  private clock = 0;

  init(): void {
    GameSystem.instance = this;
    const best = Number(store.get(BEST_KEY));
    this.best = best > 0 ? best : null;
    this.onboarded = store.get(ONBOARD_KEY) === '1';

    this.root.name = 'snail-sprint';
    this.world.scene.add(this.root);
    const hemi = new HemisphereLight(0xffffff, 0x8a7f70, 1.6);
    const sun = new DirectionalLight(0xffffff, 1.6);
    sun.position.set(0.4, 2, 0.8);
    this.root.add(hemi, sun);

    // Desktop-only virtual desk (hidden in mixed reality where the real table is used).
    this.desk = new Mesh(
      new BoxGeometry(1.4, 0.04, 0.8),
      new MeshStandardMaterial({ color: 0xb98a5e, roughness: 0.8 }),
    );
    this.root.add(this.desk);

    this.track = buildTrack();
    this.trackRoot.add(this.track.root);
    this.snail = buildSnail();
    this.trackRoot.add(this.snail.root);
    this.sign = buildSign();
    const sp = trackPoint(SIGN_S);
    this.sign.root.position.set(sp.x, TOP, sp.z);
    this.sign.root.rotation.y = SIGN_YAW; // angled to face both the oncoming snail and the player
    this.trackRoot.add(this.sign.root);
    this.hint3d = buildHandHint();
    this.trackRoot.add(this.hint3d.root);
    this.slime = new SlimeTrail();
    this.trackRoot.add(this.slime.mesh);
    this.particles = new Particles();
    this.trackRoot.add(this.particles.mesh);
    this.root.add(this.trackRoot);

    this.hud = new Label(0.2, 0.05);
    this.hint = new Label(0.32, 0.045);
    this.pop = new Label(0.24, 0.045);
    this.results = new Label(0.28, 0.17);
    this.uiRoot.add(this.hud.mesh, this.hint.mesh, this.pop.mesh, this.results.mesh);
    this.root.add(this.uiRoot);
    this.pop.opacity = 0;
    this.results.opacity = 0;

    this.bindMouse();
    this.cleanupFuncs.push(
      this.world.visibilityState.subscribe((vs) => {
        if (vs === VisibilityState.NonImmersive) this.enterDesktop();
        else if (!this.inXR) this.enterXR();
      }),
    );
    this.enterDesktop();
  }

  private inXR = false;

  private enterDesktop() {
    this.inXR = false;
    this.desk.visible = true;
    this.desk.position.set(0, 0.72, -0.5);
    this.trackRoot.position.set(0, 0.74, -0.5);
    this.trackRoot.rotation.set(0, 0, 0);
    this.placed = true;
    setGhost(this.track, false);
    this.resetRace();
    this.setState('ready');
  }

  private enterXR() {
    this.inXR = true;
    this.desk.visible = false;
    this.placed = false;
    this.tableFound = false;
    this.sfx.unlock();
    this.resetRace();
    this.setState('placing');
  }

  private setState(s: State) {
    this.state = s;
    this.stateTime = 0;
  }

  /* --------------------------------------------------------------- input */

  private bindMouse() {
    const el = this.world.renderer.domElement;
    const toNdc = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      this.mouse.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    };
    const down = (e: PointerEvent) => {
      if (this.inXR) return;
      toNdc(e);
      this.mouse.down = true;
      this.mouse.started = true;
      this.sfx.unlock();
    };
    const move = (e: PointerEvent) => toNdc(e);
    const up = () => {
      if (!this.mouse.down) return;
      this.mouse.down = false;
      this.mouse.ended = true;
    };
    el.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    this.cleanupFuncs.push(() => {
      el.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    });
  }

  private ptr(id: string): Pointer {
    return (this.pointers[id] ??= { id, connected: false, active: false, started: false, ended: false, pos: new Vector3() });
  }

  private gatherPointers() {
    if (this.inXR) {
      const xr = this.input.xr;
      for (const h of ['left', 'right'] as const) {
        const p = this.ptr(h);
        const src = xr.getPrimaryInputSource(h);
        if (!src) {
          p.ended = p.active;
          p.started = false;
          p.active = false;
          p.connected = false;
          continue;
        }
        p.connected = true;
        const sel = xr.getSelectState(h);
        const space = src.hand ? this.player.indexTipSpaces[h] : this.player.gripSpaces[h];
        space.getWorldPosition(p.pos);
        p.started = sel.start;
        p.ended = sel.end;
        p.active = sel.active;
      }
      const m = this.ptr('mouse');
      m.connected = m.active = m.started = m.ended = false;
    } else {
      for (const h of ['left', 'right']) {
        const p = this.ptr(h);
        p.connected = p.active = p.started = p.ended = false;
      }
      const m = this.ptr('mouse');
      m.connected = true;
      m.started = this.mouse.started;
      m.ended = this.mouse.ended;
      m.active = this.mouse.down;
      this.mouse.started = this.mouse.ended = false;
      // project the mouse onto the track's surface plane
      this.trackRoot.getWorldPosition(this.v1);
      this.plane.set(new Vector3(0, 1, 0), -(this.v1.y + TOP));
      this.raycaster.setFromCamera(this.mouse.ndc, this.world.camera);
      this.raycaster.ray.intersectPlane(this.plane, m.pos);
    }
  }

  private anyStarted(): Pointer | null {
    for (const k in this.pointers) {
      const p = this.pointers[k];
      if (p.connected && p.started) return p;
    }
    return null;
  }

  /* ----------------------------------------------------------- placement */

  private updatePlacement() {
    const frame = this.world.xrFrame;
    const ref = this.world.xrReferenceSpace;
    this.player.head.getWorldPosition(this.headPos);
    const fwd = this.v2.set(0, 0, -1).applyQuaternion(this.player.head.getWorldQuaternion(this.q1));
    fwd.y = 0;
    if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1);
    fwd.normalize();

    let found = false;
    const planes = (frame as XRFrame & { detectedPlanes?: Set<XRPlane> } | null)?.detectedPlanes;
    if (frame && ref && planes && planes.size) {
      let bestScore = -Infinity;
      planes.forEach((plane) => {
        if (plane.orientation !== 'horizontal') return;
        const pose = frame.getPose(plane.planeSpace, ref);
        if (!pose) return;
        this.m1.fromArray(pose.transform.matrix).premultiply(this.player.matrixWorld);
        this.v1.setFromMatrixPosition(this.m1);
        const h = this.v1.y;
        if (h < 0.4 || h > 1.25) return; // tables and desks, not floors or shelves
        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        for (const pt of plane.polygon) {
          minX = Math.min(minX, pt.x); maxX = Math.max(maxX, pt.x);
          minZ = Math.min(minZ, pt.z); maxZ = Math.max(maxZ, pt.z);
        }
        // desired point: ~0.45 m in front of the head, clamped onto the surface
        this.v3.copy(this.headPos).addScaledVector(fwd, 0.45);
        this.m2.copy(this.m1).invert();
        this.v3.applyMatrix4(this.m2);
        const mx = 0.13, mz = 0.09;
        this.v3.x = maxX - minX > 2 * mx ? Math.min(maxX - mx, Math.max(minX + mx, this.v3.x)) : (minX + maxX) / 2;
        this.v3.z = maxZ - minZ > 2 * mz ? Math.min(maxZ - mz, Math.max(minZ + mz, this.v3.z)) : (minZ + maxZ) / 2;
        this.v3.y = 0;
        this.v3.applyMatrix4(this.m1);
        const horiz = Math.hypot(this.v3.x - this.headPos.x, this.v3.z - this.headPos.z);
        if (horiz > 1.4) return;
        // only surfaces in front of the player (never a table behind their chair)
        const ahead = (this.v3.x - this.headPos.x) * fwd.x + (this.v3.z - this.headPos.z) * fwd.z;
        if (ahead < 0.15) return;
        const label = (plane as XRPlane & { semanticLabel?: string }).semanticLabel ?? '';
        const score = (label === 'table' || label === 'desk' ? 2 : 0) - horiz;
        if (score > bestScore) {
          bestScore = score;
          this.candPos.copy(this.v3);
          found = true;
        }
      });
    }
    if (!found) {
      // No table detected: float the board ~0.5 m ahead at a comfortable seated table height.
      this.candPos.copy(this.headPos).addScaledVector(fwd, 0.5);
      this.candPos.y = Math.max(0.55, this.headPos.y - 0.45);
    }
    this.tableFound = found;
    this.candYaw = Math.atan2(this.headPos.x - this.candPos.x, this.headPos.z - this.candPos.z);
    this.trackRoot.position.lerp(this.candPos, this.stateTime < 0.05 ? 1 : 0.25);
    this.trackRoot.rotation.y = this.candYaw;
    setGhost(this.track, true);

    const p = this.anyStarted();
    if (p && this.stateTime > 0.6) {
      this.trackRoot.position.copy(this.candPos);
      setGhost(this.track, false);
      this.placed = true;
      this.sfx.place();
      this.burstAtLocal(this.v1.set(0, 0.01, 0), 40, 0.25, [0x5cc46b, 0xffffff, 0xffcf33]);
      this.setState('ready');
    }
  }

  /* ---------------------------------------------------------------- race */

  private resetRace() {
    this.dist = 0;
    this.speed = 0;
    this.elapsed = 0;
    this.combo = 0;
    this.boosts = 0;
    this.padsPassed = 0;
    this.topSpeed = 0;
    this.pull = 0;
    this.missCooldown = 0;
    this.padUsedLap.fill(-1);
    this.signState = 'hidden';
    this.sign.root.visible = false;
    this.sign.board.position.set(0, 0.088, 0);
    this.sign.board.rotation.set(0, 0, 0);
    this.sign.post.rotation.set(0, 0, 0);
    this.sign.post.position.set(0, 0.035, 0);
    this.slime.clear();
    this.lastTrailDist = 0;
    this.aimPtr = null;
    this.newBest = false;
    this.results.opacity = 0;
  }

  private worldToLocal(p: Vector3, out: Vector3) {
    return this.trackRoot.worldToLocal(out.copy(p));
  }

  private updateReady() {
    const p = this.anyStarted();
    if (!p) return;
    this.worldToLocal(p.pos, this.v1);
    const snailLocal = this.v2.set(START.x, TOP, START.z);
    const near = p.id === 'mouse' || this.v1.distanceTo(snailLocal) < GRAB_RADIUS;
    if (!near) {
      this.flash('Pinch near the snail!', '#ffe066');
      return;
    }
    this.aimPtr = p;
    this.grabPos.copy(this.v1);
    this.history.length = 0;
    this.setState('aiming');
  }

  private updateAiming() {
    const p = this.aimPtr;
    if (!p) return this.setState('ready');
    this.worldToLocal(p.pos, this.v1);
    this.history.push({ t: this.clock, p: this.v1.clone() });
    while (this.history.length > 16) this.history.shift();
    const back = -this.v3.subVectors(this.v1, this.grabPos).dot(START_FWD);
    this.pull = Math.min(0.09, Math.max(0, back));
    if (Math.abs(this.pull - this.lastStretchSfx) > 0.012) {
      this.lastStretchSfx = this.pull;
      this.sfx.stretch(this.pull / 0.09);
    }
    if (p.ended || !p.active) {
      // flick: forward hand velocity over the last ~120 ms
      let flick = 0;
      const now = this.history[this.history.length - 1];
      for (let i = this.history.length - 1; i >= 0; i--) {
        const h = this.history[i];
        if (now && this.clock - h.t >= 0.12) {
          flick = this.v3.subVectors(now.p, h.p).dot(START_FWD) / Math.max(0.016, now.t - h.t);
          break;
        }
      }
      const v0 = Math.min(0.34, 2.6 * this.pull + 0.12 * Math.max(0, flick));
      this.aimPtr = null;
      this.pull = 0;
      if (v0 < 0.04) {
        this.flash('Pull back further!', '#ffe066');
        this.setState('ready');
        return;
      }
      this.speed = v0;
      this.topSpeed = v0;
      this.sfx.launch(v0 / 0.34);
      this.burstAtLocal(this.v1.set(START.x, TOP + 0.005, START.z), 18, 0.12, [0xb8ffd0, 0xffffff]);
      this.flash(v0 > 0.25 ? 'MEGA FLICK!' : v0 > 0.15 ? 'Nice flick!' : 'Go, snail, go!', '#7ff0ff');
      this.setState('racing');
    }
  }

  private updateRacing(dt: number) {
    this.elapsed += dt;
    this.missCooldown -= dt;
    const prevDist = this.dist;
    this.speed = Math.max(MIN_SPEED, this.speed - this.speed * DRAG * dt);
    this.dist += this.speed * dt;
    this.topSpeed = Math.max(this.topSpeed, this.speed);
    const lap = Math.floor(this.dist / LAP);
    const s = this.dist - lap * LAP;

    // pads passed (for the results ratio)
    for (let i = 0; i < PAD_S.length; i++) {
      for (let k = 0; k < LAPS; k++) {
        const c = PAD_S[i] + k * LAP;
        if (prevDist < c && this.dist >= c) this.padsPassed++;
      }
    }

    // pinch to boost
    const p = this.anyStarted();
    if (p && this.missCooldown <= 0) {
      let hit = -1;
      let off = 1;
      for (let i = 0; i < PAD_S.length; i++) {
        const d = lapDelta(s, PAD_S[i]);
        if (Math.abs(d) <= PAD_LENGTH / 2 + 0.014 && this.padUsedLap[i] !== lap) {
          hit = i;
          off = Math.abs(d);
        }
      }
      if (hit >= 0) {
        const perfect = off <= 0.013;
        this.padUsedLap[hit] = lap;
        this.combo++;
        this.boosts++;
        this.firstBoostHint = false;
        this.speed = Math.min(MAX_SPEED, this.speed + (perfect ? 0.11 : 0.075));
        this.sfx.boost(this.combo, perfect);
        this.burstAtLocal(this.snail.root.position, perfect ? 26 : 14, 0.18, perfect ? [0x7ff0ff, 0xffffff, 0xffe066] : [0x7ff0ff, 0x23d5ff]);
        this.flash(perfect ? `PERFECT! x${this.combo}` : `BOOST x${this.combo}`, perfect ? '#ffe066' : '#7ff0ff');
      } else {
        this.combo = 0;
        this.missCooldown = 0.4;
        this.sfx.miss();
        this.flash('Wait for the glow…', '#ff9b8a');
      }
    }

    // the sign pops up for the final lap…
    if (this.signState === 'hidden' && this.dist >= LAP * (LAPS - 1) - 0.25) {
      this.signState = 'rising';
      this.signT = 0;
      this.sign.root.visible = true;
      this.flash('SPEED LIMIT AHEAD!', '#ffffff');
    }
    if (this.signState === 'rising') {
      this.signT += dt;
      const k = Math.min(1, this.signT / 0.45);
      const e = 1 + 2.7 * Math.pow(k - 1, 3) + 1.7 * Math.pow(k - 1, 2); // back-out
      this.sign.root.scale.set(1, Math.max(0.01, e), 1);
      if (k >= 1) this.signState = 'up';
    }
    // …and gets smashed.
    if ((this.signState === 'up' || this.signState === 'rising') && this.dist >= LAP * (LAPS - 1) + SIGN_S - 0.016) {
      this.signState = 'smashed';
      this.sign.root.scale.set(1, 1, 1);
      this.signT = 0;
      const fwd = trackTangent(SIGN_S, this.v1);
      // board velocity in the sign's local frame (the sign is rotated SIGN_YAW about Y)
      this.v2.copy(fwd).applyAxisAngle(this.v3.set(0, 1, 0), -SIGN_YAW);
      this.boardVel.copy(this.v2).multiplyScalar(0.35 + this.speed * 2.2);
      this.boardVel.y = 0.55;
      this.boardSpin.set(6 + Math.random() * 6, Math.random() * 6, 4 + Math.random() * 4);
      this.sfx.smash();
      const at = this.v3.copy(this.sign.root.position);
      at.y += 0.085;
      this.burstAtLocal(at, 50, 0.32, [0xffffff, 0xe8453c, 0xffcf33, 0x222222], 0.6);
      const x = (this.speed * 3.6) / 0.03;
      this.flash(`SMASHED IT! ${x.toFixed(0)}x the limit`, '#ffcf33', 2.2);
    }
    if (this.signState === 'smashed') this.animateSmash(dt);

    // trail
    if (this.dist - this.lastTrailDist > 0.008) {
      this.lastTrailDist = this.dist;
      this.slime.drop(this.v1.set(this.snail.root.position.x, TOP + 0.0006, this.snail.root.position.z));
    }

    // countdown ticks
    const left = RUN_SECONDS - this.elapsed;
    if (left < 5.5 && Math.ceil(left) !== this.lastTick) {
      this.lastTick = Math.ceil(left);
      this.sfx.tick();
    }

    if (this.dist >= RACE_LENGTH) return this.finish(true);
    if (left <= 0) return this.finish(false);
  }

  private animateSmash(dt: number) {
    this.signT += dt;
    const b = this.sign.board;
    if (b.position.y > 0.004) {
      this.boardVel.y -= 1.8 * dt;
      b.position.addScaledVector(this.boardVel, dt);
      b.rotation.x += this.boardSpin.x * dt;
      b.rotation.y += this.boardSpin.y * dt;
      b.rotation.z += this.boardSpin.z * dt;
      if (b.position.y <= 0.004) {
        b.position.y = 0.002;
        b.rotation.set(-Math.PI / 2, b.rotation.y, 0);
      }
    }
    const k = Math.min(1, this.signT / 0.35);
    this.sign.post.rotation.x = -k * 1.35;
    this.sign.post.position.set(0, 0.035 * Math.cos(k * 1.35), -Math.sin(k * 1.35) * 0.035);
  }

  private finish(win: boolean) {
    this.finishedWin = win;
    this.finishTime = this.elapsed;
    this.newBest = false;
    if (win && (this.best == null || this.finishTime < this.best)) {
      this.best = this.finishTime;
      this.newBest = true;
      store.set(BEST_KEY, this.finishTime.toFixed(3));
    }
    if (!this.onboarded) {
      this.onboarded = true;
      store.set(ONBOARD_KEY, '1');
    }
    this.sfx.finish(win);
    if (win) this.burstAtLocal(this.v1.set(START.x, TOP + 0.02, START.z), 70, 0.3, [0xffcf33, 0xe8453c, 0x7ff0ff, 0x8fe3a8, 0xffffff], 0.7);
    this.setState('results');
  }

  private updateResults() {
    // the snail cruises a little further after the line, at true snail pace
    this.speed = Math.max(MIN_SPEED, this.speed - this.speed * 2.5 * (1 / 72));
    if (this.stateTime > 1.5 && this.anyStarted()) {
      this.resetRace();
      this.setState('ready');
    }
  }

  /* -------------------------------------------------------------- visuals */

  private burstAtLocal(p: Vector3, n: number, speed: number, colors: number[], up = 0.4) {
    this.particles.burst(p, n, speed, colors, up);
  }

  private lastFlash = '';
  private flashCount = 0;
  private flash(text: string, color: string, dur = 1.2) {
    this.lastFlash = text;
    this.flashCount++;
    this.pop.set([{ text, size: 52, color }], null);
    this.popTime = 0;
    this.popDur = dur;
    this.popPos.copy(this.snail.root.position);
  }
  private popDur = 1.2;

  private placeLabel(label: Label, local: Vector3) {
    this.trackRoot.localToWorld(this.v3.copy(local));
    label.mesh.position.copy(this.v3);
    label.mesh.quaternion.copy(this.headQuat);
  }

  private updateSnailPose(t: number) {
    const r = this.snail.root;
    let s = 0;
    if (this.state === 'aiming') {
      r.position.set(START.x - this.pull, TOP, START.z);
      r.rotation.y = Math.PI / 2;
      const k = this.pull / 0.09;
      this.snail.body.scale.set(1 - 0.15 * k, 1, 0.72);
      this.snail.root.scale.set(1, 1, 1 + 0.35 * k);
      this.snail.eyes.forEach((e) => (e.rotation.x = 0.35 - 0.6 * k));
      return;
    }
    this.snail.root.scale.set(1, 1, 1);
    if (this.state === 'racing' || this.state === 'results') {
      if (this.state === 'results') this.dist += this.speed * (1 / 72);
      s = this.dist;
    }
    trackPoint(s, this.v1);
    trackTangent(s, this.v2);
    r.position.set(this.v1.x, TOP, this.v1.z);
    r.rotation.y = Math.atan2(this.v2.x, this.v2.z);
    const v = this.state === 'racing' ? this.speed : 0;
    const wob = Math.sin(t * (6 + v * 60)) * 0.06;
    this.snail.body.scale.set(1 - v * 0.3, 1, 0.72 * (1 + v * 1.2 + wob));
    this.snail.shell.rotation.z = Math.sin(t * (3 + v * 40)) * (0.05 + v * 0.3);
    this.snail.eyes.forEach((e, i) => {
      e.rotation.x = 0.35 - Math.min(1.1, v * 3.5) + Math.sin(t * 4 + i) * 0.08;
    });
  }

  private updatePads(t: number) {
    const lap = Math.floor(this.dist / LAP);
    const s = this.dist - lap * LAP;
    const racing = this.state === 'racing';
    PAD_S.forEach((ps, i) => {
      const pad = this.track.pads[i];
      const d = lapDelta(s, ps);
      const used = racing && this.padUsedLap[i] === lap;
      const inWin = racing && !used && Math.abs(d) <= PAD_LENGTH / 2 + 0.014;
      const near = racing && !used && d < 0 && d > -0.14;
      if (used) {
        pad.mat.color.setRGB(0.4, 1, 0.55);
        pad.ringMat.opacity = Math.max(0, pad.ringMat.opacity - 0.05);
      } else if (inWin) {
        const pulse = 0.75 + 0.25 * Math.sin(t * 30);
        pad.mat.color.setRGB(1.6 * pulse, 1.6 * pulse, 0.6);
        pad.ringMat.opacity = 0.95;
        pad.ring.scale.setScalar(1 + 0.15 * Math.sin(t * 30));
      } else if (near) {
        const k = 1 + d / 0.14; // 0..1 as it approaches
        pad.mat.color.setRGB(0.14 + k * 0.8, 0.83 + k * 0.4, 1);
        pad.ringMat.opacity = k * 0.4;
        pad.ring.scale.setScalar(1.6 - 0.6 * k);
      } else {
        const idle = 0.55 + 0.15 * Math.sin(t * 2 + i);
        pad.mat.color.setRGB(0.14 * idle, 0.83 * idle, 1 * idle);
        pad.ringMat.opacity = 0;
      }
    });
  }

  private updateHandHint(t: number) {
    const h = this.hint3d;
    let show = false;
    const cycle = 2.4;
    const k = (t % cycle) / cycle;
    let gap = 0.02;
    if (this.state === 'placing') {
      show = true;
      h.root.position.set(0, 0.06, 0);
      gap = k < 0.5 ? 0.022 : 0.004;
      h.trail.visible = false;
    } else if (this.state === 'ready' && (!this.onboarded || this.stateTime > 6)) {
      show = true;
      // approach, pinch, pull back, release
      let x = START.x;
      if (k < 0.2) gap = 0.022;
      else if (k < 0.3) gap = 0.022 - ((k - 0.2) / 0.1) * 0.018;
      else if (k < 0.75) {
        gap = 0.004;
        x = START.x - ((k - 0.3) / 0.45) * 0.08;
      } else {
        gap = 0.022;
        x = START.x - 0.08;
      }
      h.root.position.set(x, 0.035, START.z);
      h.trail.visible = k > 0.3 && k < 0.95;
      h.trail.scale.x = Math.max(0.001, START.x - x);
      h.trail.position.set((START.x - x) / 2, -0.03, 0);
    }
    h.root.visible = show;
    if (!show) return;
    h.thumb.position.set(-gap / 2, 0.012, 0);
    h.thumb.rotation.z = -0.5;
    h.index.position.set(gap / 2, 0.018, 0);
    h.index.rotation.z = 0.35;
    // face the player (track +Z points at the player)
    h.root.rotation.y = 0;
  }

  private updateUI(dt: number) {
    const st = this.state;
    const left = Math.max(0, RUN_SECONDS - this.elapsed);
    const kmh = (this.speed * 3.6).toFixed(2);
    const x = (this.speed * 3.6) / 0.03;

    // HUD above the far side of the track, inside a narrow field of view
    if (st === 'racing' || st === 'results') {
      this.hud.opacity = 1;
      const lap = Math.min(LAPS, Math.floor(this.dist / LAP) + 1);
      this.hud.set(
        [
          { text: `${left.toFixed(1)} s   LAP ${lap}/${LAPS}`, size: 34, color: left < 10 ? '#ff9b8a' : '#ffffff' },
          { text: `${kmh} km/h  (${x.toFixed(0)}x limit)`, size: 26, color: '#7ff0ff', weight: 700 },
        ],
        'rgba(20,22,32,0.78)',
      );
    } else if (st === 'ready' && this.best != null) {
      this.hud.opacity = 1;
      this.hud.set([{ text: `BEST ${this.best.toFixed(2)} s`, size: 36, color: '#ffcf33' }]);
    } else {
      this.hud.opacity = 0;
    }
    this.placeLabel(this.hud, this.v1.set(0, 0.125, -RADIUS - 0.02));

    // contextual hint
    let hint: string | null = null;
    let hintAt = this.v2.set(0, 0.1, 0);
    if (st === 'placing') {
      hint = this.tableFound ? 'Table found! Pinch to place' : 'Pinch to place the track';
      hintAt.set(0, 0.11, 0);
    } else if (st === 'ready') {
      hint = 'Pinch the snail, pull back, let go!';
      hintAt.set(START.x + 0.04, 0.085, START.z);
    } else if (st === 'aiming') {
      hint = this.pull < 0.03 ? 'Pull back…' : 'Let go to launch!';
      hintAt.set(START.x, 0.085, START.z);
    } else if (st === 'racing' && this.firstBoostHint && !this.onboarded) {
      const lap = Math.floor(this.dist / LAP);
      const s = this.dist - lap * LAP;
      let nearPad = -1;
      PAD_S.forEach((ps, i) => {
        const d = lapDelta(s, ps);
        if (d > -0.16 && d < 0.04) nearPad = i;
      });
      if (nearPad >= 0) {
        hint = 'Pinch when the pad glows!';
        const pp = trackPoint(PAD_S[nearPad], this.v3);
        hintAt.set(pp.x, 0.075, pp.z);
      }
    }
    if (hint) {
      this.hint.opacity = 1;
      this.hint.set([{ text: hint, size: 40, color: '#ffffff' }]);
      this.placeLabel(this.hint, hintAt);
    } else this.hint.opacity = 0;

    // floating pop text
    this.popTime += dt;
    if (this.popTime < this.popDur) {
      const k = this.popTime / this.popDur;
      this.pop.opacity = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
      this.placeLabel(this.pop, this.v1.copy(this.popPos).setY(0.06 + k * 0.03));
    } else this.pop.opacity = 0;

    // results card
    if (st === 'results') {
      const a = Math.min(1, this.stateTime * 3);
      this.results.opacity = a;
      const lines = this.finishedWin
        ? [
            { text: 'FINISH!', size: 54, color: '#ffcf33' },
            { text: `${this.finishTime.toFixed(2)} s`, size: 70, color: '#ffffff' },
            { text: this.newBest ? 'NEW BEST!' : `Best ${this.best?.toFixed(2)} s`, size: 34, color: this.newBest ? '#8fe3a8' : '#c8cbe0' },
          ]
        : [
            { text: "TIME'S UP!", size: 54, color: '#ff9b8a' },
            { text: `${Math.min(this.dist, RACE_LENGTH).toFixed(2)} / ${RACE_LENGTH.toFixed(2)} m`, size: 52, color: '#ffffff' },
            { text: this.best != null ? `Best ${this.best.toFixed(2)} s` : 'Boost more to finish!', size: 32, color: '#c8cbe0' },
          ];
      lines.push({
        text: `Boosts ${this.boosts}/${Math.max(this.padsPassed, this.boosts)}  ·  Top ${(this.topSpeed * 3.6).toFixed(2)} km/h (${((this.topSpeed * 3.6) / 0.03).toFixed(0)}x)`,
        size: 24,
        color: '#7ff0ff',
      });
      lines.push({ text: this.stateTime > 1.5 ? 'Pinch to race again' : ' ', size: 28, color: '#ffffff' });
      this.results.set(lines, 'rgba(20,22,32,0.86)', '#ffcf33');
      this.placeLabel(this.results, this.v1.set(0, 0.16 + (1 - a) * 0.02, -0.02));
    } else this.results.opacity = 0;
  }

  /* ---------------------------------------------------------------- loop */

  update(delta: number, time: number): void {
    const dt = Math.min(0.05, delta);
    this.clock = time;
    this.stateTime += dt;
    const head = this.inXR ? this.player.head : this.world.camera;
    head.getWorldPosition(this.headPos);
    head.getWorldQuaternion(this.headQuat);

    this.gatherPointers();
    switch (this.state) {
      case 'placing':
        this.updatePlacement();
        break;
      case 'ready':
        this.updateReady();
        break;
      case 'aiming':
        this.updateAiming();
        break;
      case 'racing':
        this.updateRacing(dt);
        break;
      case 'results':
        this.updateResults();
        if (this.signState === 'smashed') this.animateSmash(dt);
        break;
    }
    this.trackRoot.visible = this.inXR ? true : this.placed;
    this.snail.root.visible = this.state !== 'placing';
    this.updateSnailPose(time);
    this.updatePads(time);
    this.updateHandHint(time);
    this.updateUI(dt);
    this.particles.update(dt, TOP);
    this.slime.update(dt);
    this.snail.root.getWorldPosition(this.v1);
    this.sfx.updateSpatial(this.v1, head);
  }

  /** World positions of the index fingertips (used by the automated demo recorder). */
  tips() {
    const out: Record<string, number[]> = {};
    for (const h of ['left', 'right'] as const) {
      const sp = this.player.indexTipSpaces[h];
      if (sp) out[h] = sp.getWorldPosition(new Vector3()).toArray();
    }
    return out;
  }

  /** Read-only snapshot used by the automated demo recorder and tests. */
  debug() {
    const sw = this.snail.root.getWorldPosition(new Vector3());
    const pads = PAD_S.map((s) => this.trackRoot.localToWorld(trackPoint(s, new Vector3()).setY(TOP)).toArray());
    const lap = Math.floor(this.dist / LAP);
    const s = this.dist - lap * LAP;
    let onPad = -1;
    PAD_S.forEach((ps, i) => {
      const d = lapDelta(s, ps);
      if (Math.abs(d) <= 0.012 && this.padUsedLap[i] !== lap) onPad = i;
    });
    return {
      state: this.state,
      inXR: this.inXR,
      tableFound: this.tableFound,
      snail: sw.toArray(),
      start: this.trackRoot.localToWorld(new Vector3(START.x, TOP, START.z)).toArray(),
      forward: new Vector3(1, 0, 0).applyQuaternion(this.trackRoot.quaternion).toArray(),
      track: this.trackRoot.position.toArray(),
      pads,
      onPad,
      dist: this.dist,
      speed: this.speed,
      elapsed: this.elapsed,
      boosts: this.boosts,
      combo: this.combo,
      flash: this.lastFlash,
      flashCount: this.flashCount,
      newBest: this.newBest,
      win: this.finishedWin,
      sign: this.signState,
      best: this.best,
      straight: STRAIGHT,
    };
  }
}

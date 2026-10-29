/**
 * Procedural geometry for Snail Sprint. No external models or textures:
 * everything is generated from three.js primitives and canvas textures.
 */
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CapsuleGeometry,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  DynamicDrawUsage,
  ExtrudeGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  Quaternion,
  RingGeometry,
  Shape,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
  Vector3,
} from 'three';
import { roundRect } from './label.js';
import {
  LANE_WIDTH,
  LAP,
  PAD_LENGTH,
  PAD_S,
  RADIUS,
  STRAIGHT,
  trackPoint,
  trackTangent,
} from './track.js';

function canvasTex(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  draw(cv.getContext('2d')!);
  const t = new CanvasTexture(cv);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/* ------------------------------------------------------------------ snail */

export type SnailRig = {
  root: Group; // positioned/rotated by the game; forward = +Z
  body: Mesh;
  shell: Group;
  eyes: Group[];
  blob: Mesh;
};

export function buildSnail(): SnailRig {
  const root = new Group();
  root.name = 'snail';

  const bodyMat = new MeshStandardMaterial({ color: 0x8fe3a8, roughness: 0.35, metalness: 0 });
  const body = new Mesh(new CapsuleGeometry(0.009, 0.034, 6, 12), bodyMat);
  body.rotation.x = Math.PI / 2;
  body.scale.set(1, 1, 0.72);
  body.position.set(0, 0.0068, 0.002);
  root.add(body);

  // Spiral shell: sphere with a painted spiral, tilted back like a cartoon snail.
  const spiralTex = canvasTex(256, 256, (c) => {
    c.fillStyle = '#ff7a3d';
    c.fillRect(0, 0, 256, 256);
    c.strokeStyle = '#ffd35a';
    c.lineWidth = 14;
    c.lineCap = 'round';
    c.beginPath();
    for (let i = 0; i <= 220; i++) {
      const a = i * 0.11;
      const r = 4 + i * 0.52;
      const x = 128 + Math.cos(a) * r;
      const y = 128 + Math.sin(a) * r;
      i === 0 ? c.moveTo(x, y) : c.lineTo(x, y);
    }
    c.stroke();
    c.fillStyle = '#ffffff';
    c.font = '900 64px Arial, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
  });
  const shell = new Group();
  const shellMesh = new Mesh(
    new SphereGeometry(0.0145, 24, 16),
    new MeshStandardMaterial({ map: spiralTex, roughness: 0.3, metalness: 0.05 }),
  );
  shellMesh.scale.set(0.7, 1, 1);
  shellMesh.rotation.y = Math.PI / 2; // spiral faces sideways
  shell.add(shellMesh);
  // racing stripe
  const stripe = new Mesh(
    new TorusGeometry(0.0146, 0.0016, 6, 28),
    new MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 }),
  );
  stripe.scale.set(1, 1, 0.72);
  stripe.rotation.y = Math.PI / 2;
  stripe.rotation.x = Math.PI / 2;
  shell.add(stripe);
  shell.position.set(0, 0.0205, -0.006);
  shell.rotation.x = -0.25;
  root.add(shell);

  // Eye stalks
  const stalkMat = bodyMat;
  const eyeMat = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.2 });
  const pupilMat = new MeshBasicMaterial({ color: 0x111111 });
  const eyes: Group[] = [];
  for (const side of [-1, 1]) {
    const g = new Group();
    g.position.set(side * 0.0042, 0.011, 0.019);
    g.rotation.z = -side * 0.28;
    g.rotation.x = 0.35;
    const stalk = new Mesh(new CylinderGeometry(0.0012, 0.0016, 0.013, 6), stalkMat);
    stalk.position.y = 0.0065;
    g.add(stalk);
    const eye = new Mesh(new SphereGeometry(0.0032, 12, 8), eyeMat);
    eye.position.y = 0.0135;
    g.add(eye);
    const pupil = new Mesh(new SphereGeometry(0.0015, 8, 6), pupilMat);
    pupil.position.set(0, 0.0138, 0.0024);
    g.add(pupil);
    root.add(g);
    eyes.push(g);
  }
  // smile
  const smile = new Mesh(
    new TorusGeometry(0.003, 0.0006, 4, 12, Math.PI),
    new MeshBasicMaterial({ color: 0x1b4d2b }),
  );
  smile.position.set(0, 0.0072, 0.0258);
  smile.rotation.z = Math.PI;
  root.add(smile);

  // soft contact shadow
  const blobTex = canvasTex(64, 64, (c) => {
    const g = c.createRadialGradient(32, 32, 2, 32, 32, 31);
    g.addColorStop(0, 'rgba(0,0,0,0.55)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 64, 64);
  });
  const blob = new Mesh(
    new PlaneGeometry(0.04, 0.06),
    new MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false }),
  );
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.0004;
  root.add(blob);

  return { root, body, shell, eyes, blob };
}

/* ------------------------------------------------------------------ track */

function ribbon(sFrom: number, sTo: number, inner: number, outer: number, y: number, steps: number, colorFn?: (i: number) => Color) {
  const pos: number[] = [];
  const col: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const p = new Vector3();
  const t = new Vector3();
  for (let i = 0; i <= steps; i++) {
    const s = sFrom + ((sTo - sFrom) * i) / steps;
    trackPoint(s, p);
    trackTangent(s, t);
    // right-hand normal of travel direction (points outward for this CCW-from-player loop)
    const nx = -t.z;
    const nz = t.x;
    pos.push(p.x + nx * inner, y, p.z + nz * inner, p.x + nx * outer, y, p.z + nz * outer);
    uv.push(0, (s - sFrom) / (sTo - sFrom), 1, (s - sFrom) / (sTo - sFrom));
    const c = colorFn ? colorFn(i) : new Color(1, 1, 1);
    col.push(c.r, c.g, c.b, c.r, c.g, c.b);
    if (i < steps) {
      const a = i * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('color', new BufferAttribute(new Float32Array(col), 3));
  g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export type TrackRig = {
  root: Group;
  pads: { mesh: Mesh; ring: Mesh; mat: MeshBasicMaterial; ringMat: MeshBasicMaterial }[];
  ghostMats: { mat: MeshStandardMaterial | MeshBasicMaterial; base: number }[];
};

export function buildTrack(): TrackRig {
  const root = new Group();
  root.name = 'track';
  const ghostMats: TrackRig['ghostMats'] = [];
  const reg = <T extends MeshStandardMaterial | MeshBasicMaterial>(m: T): T => {
    m.transparent = true;
    ghostMats.push({ mat: m, base: m.opacity });
    return m;
  };

  // Base plate: rounded "grass" board so the track reads on any table.
  const W = STRAIGHT + 2 * RADIUS + 0.1;
  const D = 2 * RADIUS + 0.1;
  const shape = new Shape();
  const r = 0.05;
  shape.moveTo(-W / 2 + r, -D / 2);
  shape.lineTo(W / 2 - r, -D / 2);
  shape.quadraticCurveTo(W / 2, -D / 2, W / 2, -D / 2 + r);
  shape.lineTo(W / 2, D / 2 - r);
  shape.quadraticCurveTo(W / 2, D / 2, W / 2 - r, D / 2);
  shape.lineTo(-W / 2 + r, D / 2);
  shape.quadraticCurveTo(-W / 2, D / 2, -W / 2, D / 2 - r);
  shape.lineTo(-W / 2, -D / 2 + r);
  shape.quadraticCurveTo(-W / 2, -D / 2, -W / 2 + r, -D / 2);
  const plateGeo = new ExtrudeGeometry(shape, { depth: 0.006, bevelEnabled: false, curveSegments: 6 });
  plateGeo.rotateX(-Math.PI / 2);
  const plate = new Mesh(plateGeo, reg(new MeshStandardMaterial({ color: 0x5cc46b, roughness: 0.9 })));
  root.add(plate);

  const top = 0.006;
  const steps = 160;
  // asphalt
  const road = new Mesh(
    ribbon(0, LAP, -LANE_WIDTH / 2, LANE_WIDTH / 2, top + 0.0004, steps),
    reg(new MeshStandardMaterial({ color: 0x3a3f4b, roughness: 0.85 })),
  );
  root.add(road);
  // curbs, red/white
  const red = new Color(0xe8453c);
  const white = new Color(0xf5f5f5);
  const curbFn = (i: number) => (Math.floor(i / 3) % 2 ? red : white);
  const curbMat = reg(new MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }));
  root.add(new Mesh(ribbon(0, LAP, LANE_WIDTH / 2, LANE_WIDTH / 2 + 0.007, top + 0.0007, steps * 2, curbFn), curbMat));
  root.add(new Mesh(ribbon(0, LAP, -LANE_WIDTH / 2 - 0.007, -LANE_WIDTH / 2, top + 0.0007, steps * 2, curbFn), curbMat));
  // dashed centre line
  const dashMat = reg(new MeshBasicMaterial({ color: 0xfff3b0, opacity: 0.9 }));
  for (let s = 0.06; s < LAP - 0.03; s += 0.05) {
    root.add(new Mesh(ribbon(s, s + 0.022, -0.0012, 0.0012, top + 0.0008, 4), dashMat));
  }

  // start / finish chequer
  const chequer = canvasTex(64, 16, (c) => {
    for (let x = 0; x < 16; x++)
      for (let y = 0; y < 4; y++) {
        c.fillStyle = (x + y) % 2 ? '#111' : '#fff';
        c.fillRect(x * 4, y * 4, 4, 4);
      }
  });
  chequer.magFilter = 1003; // NearestFilter
  const start = new Mesh(new PlaneGeometry(LANE_WIDTH, 0.012), reg(new MeshBasicMaterial({ map: chequer })));
  start.rotation.x = -Math.PI / 2;
  start.rotation.z = Math.PI / 2;
  const sp = trackPoint(0.0);
  start.position.set(sp.x, top + 0.001, sp.z);
  root.add(start);
  // little start/finish arch
  const archMat = reg(new MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 }));
  for (const side of [-1, 1]) {
    const post = new Mesh(new CylinderGeometry(0.0018, 0.0018, 0.07, 6), archMat);
    post.position.set(sp.x, top + 0.035, sp.z + side * (LANE_WIDTH / 2 + 0.012));
    root.add(post);
  }
  const bannerTex = canvasTex(256, 48, (c) => {
    c.fillStyle = '#ffcf33';
    roundRect(c, 0, 0, 256, 48, 10);
    c.fill();
    c.fillStyle = '#1d1d2b';
    c.font = '900 30px Arial, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('START · FINISH', 128, 26);
  });
  const banner = new Mesh(new PlaneGeometry(LANE_WIDTH + 0.028, 0.014), reg(new MeshBasicMaterial({ map: bannerTex, side: DoubleSide })));
  banner.position.set(sp.x, top + 0.07, sp.z);
  banner.rotation.y = Math.PI / 2;
  root.add(banner);

  // boost pads
  const chevron = canvasTex(64, 128, (c) => {
    c.clearRect(0, 0, 64, 128);
    c.strokeStyle = '#ffffff';
    c.lineWidth = 12;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    for (let k = 0; k < 3; k++) {
      const y = 100 - k * 34;
      c.beginPath();
      c.moveTo(10, y);
      c.lineTo(32, y - 22);
      c.lineTo(54, y);
      c.stroke();
    }
  });
  const pads: TrackRig['pads'] = [];
  for (const s of PAD_S) {
    const mat = new MeshBasicMaterial({ map: chevron, color: 0x23d5ff, transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false });
    const mesh = new Mesh(new PlaneGeometry(LANE_WIDTH * 0.8, PAD_LENGTH), mat);
    const p = trackPoint(s);
    const t = trackTangent(s);
    mesh.position.set(p.x, top + 0.0012, p.z);
    mesh.rotation.order = 'YXZ';
    mesh.rotation.y = Math.atan2(t.x, t.z) + Math.PI;
    mesh.rotation.x = -Math.PI / 2;
    root.add(mesh);
    const ringMat = new MeshBasicMaterial({ color: 0x7ff0ff, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, side: DoubleSide });
    const ring = new Mesh(new RingGeometry(0.028, 0.034, 32), ringMat);
    ring.position.set(p.x, top + 0.002, p.z);
    ring.rotation.x = -Math.PI / 2;
    root.add(ring);
    pads.push({ mesh, ring, mat, ringMat });
  }
  return { root, pads, ghostMats };
}

/* ------------------------------------------------------------------- sign */

export type SignRig = { root: Group; board: Mesh; post: Mesh };

export function buildSign(): SignRig {
  const root = new Group();
  const tex = canvasTex(240, 300, (c) => {
    c.fillStyle = '#222';
    roundRect(c, 0, 0, 240, 300, 22);
    c.fill();
    c.fillStyle = '#fff';
    roundRect(c, 8, 8, 224, 284, 16);
    c.fill();
    c.fillStyle = '#111';
    c.textAlign = 'center';
    c.font = '900 44px Arial, sans-serif';
    c.fillText('SPEED', 120, 62);
    c.fillText('LIMIT', 120, 110);
    c.font = '900 92px Arial, sans-serif';
    c.fillText('0.03', 120, 210);
    c.font = '800 40px Arial, sans-serif';
    c.fillText('km/h', 120, 264);
  });
  const post = new Mesh(
    new CylinderGeometry(0.0015, 0.0015, 0.06, 6),
    new MeshStandardMaterial({ color: 0x9aa3ad, metalness: 0.6, roughness: 0.4 }),
  );
  post.position.y = 0.03;
  root.add(post);
  const board = new Mesh(
    new BoxGeometry(0.04, 0.05, 0.002),
    [
      new MeshStandardMaterial({ color: 0x222222 }),
      new MeshStandardMaterial({ color: 0x222222 }),
      new MeshStandardMaterial({ color: 0x222222 }),
      new MeshStandardMaterial({ color: 0x222222 }),
      new MeshStandardMaterial({ map: tex, roughness: 0.6 }),
      new MeshStandardMaterial({ color: 0xb0b6bd, metalness: 0.5, roughness: 0.5 }),
    ],
  );
  board.position.y = 0.072;
  root.add(board);
  return { root, board, post };
}

/* -------------------------------------------------------------- hand hint */

/** Ghost "pinching fingers" that demonstrate the gesture during onboarding. */
export type HandHint = { root: Group; thumb: Mesh; index: Mesh; mat: MeshBasicMaterial; trail: Mesh };

export function buildHandHint(): HandHint {
  const root = new Group();
  const mat = new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false });
  const fingerGeo = new CapsuleGeometry(0.0055, 0.03, 4, 8);
  const thumb = new Mesh(fingerGeo, mat);
  const index = new Mesh(fingerGeo, mat);
  root.add(thumb, index);
  const trail = new Mesh(
    new PlaneGeometry(1, 0.006),
    new MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.8, depthWrite: false, toneMapped: false }),
  );
  trail.rotation.x = -Math.PI / 2;
  root.add(trail);
  return { root, thumb, index, mat, trail };
}

/* -------------------------------------------------------------- particles */

const _m = new Matrix4();
const _q = new Quaternion();
const _s = new Vector3();
const _p = new Vector3();

/** Pooled instanced confetti / sparks. */
export class Particles {
  readonly mesh: InstancedMesh;
  private pos: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;
  private spin: Float32Array;
  private next = 0;
  private readonly color = new Color();

  constructor(private readonly count = 96) {
    this.mesh = new InstancedMesh(
      new BoxGeometry(0.004, 0.004, 0.0012),
      new MeshBasicMaterial({ toneMapped: false }),
      count,
    );
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.pos = new Float32Array(count * 3);
    this.vel = new Float32Array(count * 3);
    this.life = new Float32Array(count);
    this.spin = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      _m.makeScale(0, 0, 0);
      this.mesh.setMatrixAt(i, _m);
      this.mesh.setColorAt(i, this.color.set(0xffffff));
    }
  }

  burst(at: Vector3, n: number, speed: number, colors: number[], up = 0.4) {
    for (let k = 0; k < n; k++) {
      const i = this.next;
      this.next = (this.next + 1) % this.count;
      this.pos[i * 3] = at.x;
      this.pos[i * 3 + 1] = at.y;
      this.pos[i * 3 + 2] = at.z;
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.6);
      this.vel[i * 3] = Math.cos(a) * v;
      this.vel[i * 3 + 1] = up * (0.5 + Math.random());
      this.vel[i * 3 + 2] = Math.sin(a) * v;
      this.life[i] = 0.8 + Math.random() * 0.6;
      this.spin[i] = Math.random() * 20;
      this.mesh.setColorAt(i, this.color.set(colors[k % colors.length]));
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  update(dt: number, floorY: number) {
    let any = false;
    for (let i = 0; i < this.count; i++) {
      if (this.life[i] <= 0) continue;
      any = true;
      this.life[i] -= dt;
      this.vel[i * 3 + 1] -= 1.6 * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] = Math.max(floorY, this.pos[i * 3 + 1] + this.vel[i * 3 + 1] * dt);
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.spin[i] += dt * 12;
      const sc = this.life[i] > 0 ? Math.min(1, this.life[i] * 3) : 0;
      _q.setFromAxisAngle(_p.set(0.3, 1, 0.5).normalize(), this.spin[i]);
      _m.compose(_s.set(this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2]), _q, _p.set(sc, sc, sc));
      this.mesh.setMatrixAt(i, _m);
    }
    if (any) this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/** Glossy slime trail: pooled flat discs that fade by shrinking. */
export class SlimeTrail {
  readonly mesh: InstancedMesh;
  private age: Float32Array;
  private pos: Float32Array;
  private next = 0;
  constructor(private readonly count = 120) {
    this.mesh = new InstancedMesh(
      new CircleGeometry(0.006, 10).rotateX(-Math.PI / 2),
      new MeshStandardMaterial({ color: 0xb8ffd0, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.55, depthWrite: false }),
      count,
    );
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.age = new Float32Array(count).fill(99);
    this.pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      _m.makeScale(0, 0, 0);
      this.mesh.setMatrixAt(i, _m);
    }
  }
  drop(p: Vector3) {
    const i = this.next;
    this.next = (this.next + 1) % this.count;
    this.age[i] = 0;
    this.pos[i * 3] = p.x;
    this.pos[i * 3 + 1] = p.y;
    this.pos[i * 3 + 2] = p.z;
  }
  clear() {
    this.age.fill(99);
  }
  update(dt: number) {
    for (let i = 0; i < this.count; i++) {
      this.age[i] += dt;
      const sc = Math.max(0, 1 - this.age[i] / 6);
      _m.compose(_s.set(this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2]), _q.identity(), _p.set(sc, 1, sc * 1.3));
      this.mesh.setMatrixAt(i, _m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

export function setGhost(track: TrackRig, ghost: boolean) {
  for (const g of track.ghostMats) {
    g.mat.opacity = ghost ? 0.45 : g.base;
    g.mat.depthWrite = !ghost;
  }
}

export { Object3D };

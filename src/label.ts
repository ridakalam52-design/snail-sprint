/**
 * Tiny canvas-texture labels used for every piece of in-world UI.
 * One draw call each; textures are only re-uploaded when the text changes.
 */
import {
  CanvasTexture,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
} from 'three';

export type LabelLine = {
  text: string;
  size: number; // px on the canvas
  color?: string;
  weight?: number;
};

export class Label {
  readonly mesh: Mesh;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly tex: CanvasTexture;
  private readonly mat: MeshBasicMaterial;
  private key = '';

  constructor(
    widthM: number,
    heightM: number,
    private readonly pxPerM = 1800,
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = Math.round(widthM * pxPerM);
    this.canvas.height = Math.round(heightM * pxPerM);
    this.ctx = this.canvas.getContext('2d')!;
    this.tex = new CanvasTexture(this.canvas);
    this.tex.colorSpace = SRGBColorSpace;
    this.tex.anisotropy = 4;
    this.mat = new MeshBasicMaterial({
      map: this.tex,
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      toneMapped: false,
    });
    this.mesh = new Mesh(new PlaneGeometry(widthM, heightM), this.mat);
    this.mesh.renderOrder = 10;
  }

  set opacity(v: number) {
    this.mat.opacity = v;
    this.mesh.visible = v > 0.01;
  }

  /**
   * Draws a rounded "pill" card with centred lines of text.
   * `bg` null draws text only (with a soft outline for legibility).
   */
  set(lines: LabelLine[], bg: string | null = 'rgba(20,22,32,0.82)', accent?: string) {
    const key = JSON.stringify([lines, bg, accent]);
    if (key === this.key) return;
    this.key = key;
    const { ctx, canvas } = this;
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    if (bg) {
      const r = Math.min(H * 0.28, 60);
      ctx.fillStyle = bg;
      roundRect(ctx, 4, 4, W - 8, H - 8, r);
      ctx.fill();
      if (accent) {
        ctx.lineWidth = 6;
        ctx.strokeStyle = accent;
        roundRect(ctx, 5, 5, W - 10, H - 10, r);
        ctx.stroke();
      }
    }
    const total = lines.reduce((a, l) => a + l.size * 1.18, 0);
    let y = (H - total) / 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const maxW = W * 0.9;
    for (const l of lines) {
      // shrink any line that would overflow the card so text never gets clipped
      let size = l.size;
      const font = (px: number) =>
        `${l.weight ?? 800} ${px}px "Nunito", "Arial Rounded MT Bold", "DejaVu Sans", Arial, sans-serif`;
      ctx.font = font(size);
      const w = ctx.measureText(l.text).width;
      if (w > maxW) {
        size = Math.floor((size * maxW) / w);
        ctx.font = font(size);
      }
      const ty = y + (l.size - size) / 2 + size * 0.09;
      if (!bg) {
        ctx.lineWidth = size * 0.16;
        ctx.strokeStyle = 'rgba(10,12,20,0.85)';
        ctx.lineJoin = 'round';
        ctx.strokeText(l.text, W / 2, ty);
      }
      ctx.fillStyle = l.color ?? '#ffffff';
      ctx.fillText(l.text, W / 2, ty);
      y += l.size * 1.18;
    }
    this.tex.needsUpdate = true;
  }
}

export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

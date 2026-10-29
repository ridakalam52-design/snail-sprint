/**
 * Track geometry for Snail Sprint.
 *
 * Track space: origin at the centre of the track on the table surface,
 * +X to the player's right, +Z towards the player, +Y up. The racing line is
 * an oval ("stadium") of two straights joined by two semicircles. Distance
 * along the line is `s` in metres, starting at the left end of the near
 * straight and running to the right (counter-clockwise seen from above).
 */
import { Vector3 } from 'three';

export const STRAIGHT = 0.32; // length of each straight (m)
export const RADIUS = 0.09; // radius of the bends (m)
export const LANE_WIDTH = 0.06; // racing surface width (m)
export const BEND = Math.PI * RADIUS;
export const LAP = 2 * STRAIGHT + 2 * BEND; // ≈1.205 m
export const LAPS = 2;
export const RACE_LENGTH = LAP * LAPS;

/** Boost pad centres along the lap (m). */
export const PAD_S = [0.24, 0.66, 0.86, 1.1];
export const PAD_LENGTH = 0.05;
/** The speed-limit sign stands here, popping up for the final lap. */
export const SIGN_S = 0.17;

const half = STRAIGHT / 2;

/** Position on the racing line at distance s (wraps every lap). */
export function trackPoint(s: number, out = new Vector3()): Vector3 {
  let d = ((s % LAP) + LAP) % LAP;
  if (d < STRAIGHT) return out.set(-half + d, 0, RADIUS);
  d -= STRAIGHT;
  if (d < BEND) {
    const a = d / RADIUS;
    return out.set(half + RADIUS * Math.sin(a), 0, RADIUS * Math.cos(a));
  }
  d -= BEND;
  if (d < STRAIGHT) return out.set(half - d, 0, -RADIUS);
  d -= STRAIGHT;
  const a = d / RADIUS;
  return out.set(-half - RADIUS * Math.sin(a), 0, -RADIUS * Math.cos(a));
}

const _a = new Vector3();
const _b = new Vector3();
/** Unit tangent (direction of travel) at distance s. */
export function trackTangent(s: number, out = new Vector3()): Vector3 {
  trackPoint(s - 0.002, _a);
  trackPoint(s + 0.002, _b);
  return out.subVectors(_b, _a).normalize();
}

/** Signed distance from s to a pad centre within the same lap, wrapped. */
export function lapDelta(s: number, centre: number): number {
  let d = (((s - centre) % LAP) + LAP) % LAP;
  if (d > LAP / 2) d -= LAP;
  return d;
}

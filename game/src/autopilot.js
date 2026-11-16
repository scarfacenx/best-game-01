// The screenshot pilot: it plays the real rules forward from a fresh world, so a staged
// frame is what a short game really looks like. The strong pilot chases the nearest lumen
// orb, keeps clear of close shards, leads its shots at the nearest drone and dashes out
// when one gets too close; the weak pilot only chases orbs, so it is caught out once the
// shards speed up, as a hurried player is. It returns the same control shape the human
// input builds: a move vector, an aim point, whether the trigger is held, and a dash press.

import { BOLT } from './config.js';

const FLEE_RADIUS = 175;
const FIRE_RADIUS = 480;
const DASH_RADIUS = 85;

function nearest(list, x, y) {
  let best = null;
  let bestD2 = Infinity;
  for (let i = 0; i < list.length; i += 1) {
    const item = list[i];
    if (!item.active) continue;
    const dx = item.x - x;
    const dy = item.y - y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD2) {
      bestD2 = d2;
      best = item;
    }
  }
  return best === null ? null : { item: best, d2: bestD2 };
}

export function autopilot(state, skill) {
  const p = state.player;
  const strong = skill !== 'weak';

  // Chase the nearest orb; drift to the middle of the field when there is none.
  let mx = 0;
  let my = 0;
  const orb = nearest(state.orbs, p.x, p.y);
  if (orb !== null) {
    mx = orb.item.x - p.x;
    my = orb.item.y - p.y;
  } else {
    mx = 640 - p.x;
    my = 360 - p.y;
  }
  const seekLen = Math.hypot(mx, my) || 1;
  mx /= seekLen;
  my /= seekLen;
  // The weak pilot is clumsy: it drifts at little more than half speed.
  if (!strong) {
    mx *= 0.6;
    my *= 0.6;
  }

  // Keep clear of close shards: the nearer one, the harder the push away.
  if (strong) {
    let fx = 0;
    let fy = 0;
    for (let i = 0; i < state.drones.length; i += 1) {
      const drone = state.drones[i];
      if (!drone.active) continue;
      const dx = p.x - drone.x;
      const dy = p.y - drone.y;
      const d = Math.hypot(dx, dy);
      if (d > 0 && d < FLEE_RADIUS) {
        const w = ((FLEE_RADIUS - d) / FLEE_RADIUS) * 2.4;
        fx += (dx / d) * w;
        fy += (dy / d) * w;
      }
    }
    mx += fx;
    my += fy;
    const len = Math.hypot(mx, my);
    if (len > 1) {
      mx /= len;
      my /= len;
    }
  }

  // Aim at the nearest shard, leading it by the bolt's flight time; otherwise at the orb.
  let aimX = p.x;
  let aimY = p.y - 100;
  let firing = false;
  const drone = nearest(state.drones, p.x, p.y);
  if (strong && drone !== null && drone.d2 < FIRE_RADIUS * FIRE_RADIUS) {
    const d = drone.item;
    const flight = Math.sqrt(drone.d2) / BOLT.speed;
    aimX = d.x + d.vx * flight;
    aimY = d.y + d.vy * flight;
    firing = true;
  } else if (orb !== null) {
    aimX = orb.item.x;
    aimY = orb.item.y;
  }

  // Dash clear when a shard is right on top of the ship.
  const dash = strong && drone !== null && drone.d2 < DASH_RADIUS * DASH_RADIUS && p.dashCd <= 0;

  return { mx, my, aimX, aimY, firing, dash };
}

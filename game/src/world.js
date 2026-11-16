// AETHER DRIFT's rules and state, with no drawing and no browser in it: the ship, the
// lumen orbs, the shard drones, the plasma bolts, the particles and the floating scores.
// step() advances one fixed step and returns what happened as bit flags, so the caller
// can react (sound, announcements) without the world knowing about screens. The pools are
// allocated once, at boot; nothing here allocates after createWorld returns, and every
// random choice comes from the seeded generator, never Math.random.

import {
  BOLT, COMBO_MAX, COMBO_WINDOW, DASH, DRONE, FIELD, HULL_MAX, ORB, ORB_CHARGE,
  POOLS, SHIP, SURGE_STEPS, WIN_BONUS, WIN_PER_HULL,
} from './config.js';

export const EVENT_ORB = 1;
export const EVENT_HIT = 2;
export const EVENT_DRONE_DOWN = 4;
export const EVENT_WIN = 8;
export const EVENT_OVER = 16;
export const EVENT_SURGE = 32;
export const EVENT_DASH = 64;
export const EVENT_SHOOT = 128;

const STAR_COUNT = 96;

function dist2(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

export function createWorld(random) {
  const player = {
    x: FIELD.width / 2, y: FIELD.height / 2, vx: 0, vy: 0, angle: -Math.PI / 2,
    hull: HULL_MAX, invuln: 0, dashT: 0, dashCd: 0, dashDirX: 0, dashDirY: -1, fireT: 0,
  };
  const orbs = [];
  const drones = [];
  const bolts = [];
  const particles = [];
  const popups = [];
  const stars = [];
  for (let i = 0; i < POOLS.orbs; i += 1) orbs.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, phase: 0 });
  for (let i = 0; i < POOLS.drones; i += 1) drones.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, hp: 0, hitT: 0 });
  for (let i = 0; i < POOLS.bolts; i += 1) bolts.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0 });
  for (let i = 0; i < POOLS.particles; i += 1) particles.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, size: 2, color: '#fff' });
  for (let i = 0; i < POOLS.popups; i += 1) popups.push({ active: false, x: 0, y: 0, life: 0, text: '', color: '#fff' });
  for (let i = 0; i < STAR_COUNT; i += 1) {
    stars.push({ x: random() * FIELD.width, y: random() * FIELD.height, layer: i % 3, size: 0.6 + random() * 1.6, tw: random() * Math.PI * 2 });
  }

  const state = {
    player, orbs, drones, bolts, particles, popups, stars,
    score: 0, combo: 1, comboT: 0, charge: 0, surge: 0, elapsed: 0,
    orbTimer: 0, droneTimer: 0, shake: 0, won: false, over: false,
  };

  function free(list) {
    for (let i = 0; i < list.length; i += 1) if (!list[i].active) return list[i];
    return null;
  }

  function burst(x, y, color, count, speed, life) {
    for (let i = 0; i < count; i += 1) {
      const p = free(particles);
      if (p === null) return;
      const angle = random() * Math.PI * 2;
      const v = speed * (0.3 + random() * 0.7);
      p.active = true;
      p.x = x;
      p.y = y;
      p.vx = Math.cos(angle) * v;
      p.vy = Math.sin(angle) * v;
      p.life = life * (0.6 + random() * 0.4);
      p.maxLife = p.life;
      p.size = 1.5 + random() * 2.5;
      p.color = color;
    }
  }

  function popup(x, y, text, color) {
    const p = free(popups);
    if (p === null) return;
    p.active = true;
    p.x = x;
    p.y = y;
    p.life = 0.9;
    p.text = text;
    p.color = color;
  }

  function countActive(list) {
    let n = 0;
    for (let i = 0; i < list.length; i += 1) if (list[i].active) n += 1;
    return n;
  }

  function surgeMaxDrones() {
    return DRONE.max + DRONE.maxPerSurge * state.surge;
  }

  function surgeDroneInterval() {
    return Math.max(DRONE.minInterval, DRONE.interval - DRONE.intervalPerSurge * state.surge);
  }

  function spawnOrb() {
    const orb = free(orbs);
    if (orb === null) return;
    // Away from the ship, so a fresh orb never lands on the player.
    let x = 0;
    let y = 0;
    for (let tries = 0; tries < 8; tries += 1) {
      x = 40 + random() * (FIELD.width - 80);
      y = 40 + random() * (FIELD.height - 80);
      if (dist2(x, y, player.x, player.y) > 140 * 140) break;
    }
    const angle = random() * Math.PI * 2;
    orb.active = true;
    orb.x = x;
    orb.y = y;
    orb.vx = Math.cos(angle) * ORB.drift;
    orb.vy = Math.sin(angle) * ORB.drift;
    orb.life = ORB.life;
    orb.phase = random() * Math.PI * 2;
  }

  function spawnDrone() {
    const drone = free(drones);
    if (drone === null) return;
    // Just outside a random edge, so it flies in instead of appearing on top of the ship.
    const edge = Math.floor(random() * 4);
    let x = 0;
    let y = 0;
    if (edge === 0) { x = random() * FIELD.width; y = -24; } else if (edge === 1) { x = FIELD.width + 24; y = random() * FIELD.height; } else if (edge === 2) { x = random() * FIELD.width; y = FIELD.height + 24; } else { x = -24; y = random() * FIELD.height; }
    drone.active = true;
    drone.x = x;
    drone.y = y;
    drone.vx = 0;
    drone.vy = 0;
    drone.hp = DRONE.hp;
    drone.hitT = 0;
  }

  function spawnBolt(aimX, aimY) {
    const bolt = free(bolts);
    if (bolt === null) return false;
    const dx = aimX - player.x;
    const dy = aimY - player.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = player.x + (dx / len) * (SHIP.radius + 6);
    const ny = player.y + (dy / len) * (SHIP.radius + 6);
    bolt.active = true;
    bolt.x = nx;
    bolt.y = ny;
    bolt.vx = (dx / len) * BOLT.speed + player.vx * 0.35;
    bolt.vy = (dy / len) * BOLT.speed + player.vy * 0.35;
    bolt.life = BOLT.life;
    return true;
  }

  function reset() {
    player.x = FIELD.width / 2;
    player.y = FIELD.height / 2;
    player.vx = 0;
    player.vy = 0;
    player.angle = -Math.PI / 2;
    player.hull = HULL_MAX;
    player.invuln = 0;
    player.dashT = 0;
    player.dashCd = 0;
    player.fireT = 0;
    for (const orb of orbs) orb.active = false;
    for (const drone of drones) drone.active = false;
    for (const bolt of bolts) bolt.active = false;
    for (const p of particles) p.active = false;
    for (const p of popups) p.active = false;
    state.score = 0;
    state.combo = 1;
    state.comboT = 0;
    state.charge = 0;
    state.surge = 0;
    state.elapsed = 0;
    state.orbTimer = 0.4;
    state.droneTimer = 1.6;
    state.shake = 0;
    state.won = false;
    state.over = false;
  }

  /**
   * One fixed step. `control` is { mx, my, aimX, aimY, firing, dash }: a move vector
   * in [-1, 1], the aim point in field coordinates, whether the trigger is held, and
   * whether dash was pressed this frame. With `harmless` set (the title screen's
   * backdrop) things drift but nothing scores, nothing spawns to hunt, and nothing
   * can hurt the ship.
   */
  function step(dt, control, harmless) {
    let events = 0;
    if (state.won || state.over) return events;
    state.elapsed += dt;

    // Combo: a pickup inside the window raises it; silence drops it back to x1.
    if (state.comboT > 0) {
      state.comboT -= dt;
      if (state.comboT <= 0) state.combo = 1;
    }

    // Dash: a short burst along the move direction (or the facing) with a cooldown.
    if (control.dash && player.dashCd <= 0 && player.dashT <= 0) {
      let dx = control.mx;
      let dy = control.my;
      if (dx === 0 && dy === 0) {
        dx = Math.cos(player.angle);
        dy = Math.sin(player.angle);
      }
      const len = Math.hypot(dx, dy) || 1;
      player.dashDirX = dx / len;
      player.dashDirY = dy / len;
      player.dashT = DASH.time;
      player.dashCd = DASH.cooldown;
      player.invuln = Math.max(player.invuln, DASH.invulnerable);
      burst(player.x, player.y, '#22d3ee', 10, 220, 0.35);
      events |= EVENT_DASH;
    }
    if (player.dashCd > 0) player.dashCd -= dt;

    if (player.dashT > 0) {
      player.dashT -= dt;
      player.vx = player.dashDirX * DASH.speed;
      player.vy = player.dashDirY * DASH.speed;
    } else {
      player.vx += control.mx * SHIP.accel * dt;
      player.vy += control.my * SHIP.accel * dt;
      const damp = Math.exp(-SHIP.damping * dt);
      player.vx *= damp;
      player.vy *= damp;
      const speed = Math.hypot(player.vx, player.vy);
      if (speed > SHIP.maxSpeed) {
        player.vx = (player.vx / speed) * SHIP.maxSpeed;
        player.vy = (player.vy / speed) * SHIP.maxSpeed;
      }
    }
    player.x = Math.min(FIELD.width - SHIP.radius, Math.max(SHIP.radius, player.x + player.vx * dt));
    player.y = Math.min(FIELD.height - SHIP.radius, Math.max(SHIP.radius, player.y + player.vy * dt));
    if (player.x === SHIP.radius || player.x === FIELD.width - SHIP.radius) player.vx = 0;
    if (player.y === SHIP.radius || player.y === FIELD.height - SHIP.radius) player.vy = 0;
    player.angle = Math.atan2(control.aimY - player.y, control.aimX - player.x);
    if (player.invuln > 0) player.invuln -= dt;

    // Fire toward the aim point, at the ship's cadence.
    if (player.fireT > 0) player.fireT -= dt;
    if (control.firing && player.fireT <= 0 && !harmless) {
      if (spawnBolt(control.aimX, control.aimY)) {
        player.fireT = SHIP.fireInterval;
        events |= EVENT_SHOOT;
      }
    }

    // Thruster sparkle while the ship is under power.
    if ((control.mx !== 0 || control.my !== 0) && player.dashT <= 0 && random() < 0.5) {
      const back = Math.atan2(player.vy, player.vx) + Math.PI;
      const p = free(particles);
      if (p !== null) {
        p.active = true;
        p.x = player.x + Math.cos(back) * SHIP.radius;
        p.y = player.y + Math.sin(back) * SHIP.radius;
        p.vx = Math.cos(back + (random() - 0.5) * 0.8) * 120;
        p.vy = Math.sin(back + (random() - 0.5) * 0.8) * 120;
        p.life = 0.3;
        p.maxLife = 0.3;
        p.size = 2;
        p.color = '#22d3ee';
      }
    }

    // Spawning.
    state.orbTimer -= dt;
    if (state.orbTimer <= 0) {
      if (countActive(orbs) < ORB.max) spawnOrb();
      state.orbTimer = ORB.interval * (0.8 + random() * 0.4);
    }
    if (!harmless) {
      state.droneTimer -= dt;
      if (state.droneTimer <= 0) {
        if (countActive(drones) < surgeMaxDrones()) spawnDrone();
        state.droneTimer = surgeDroneInterval() * (0.85 + random() * 0.3);
      }
    }

    // Orbs drift, age, and pay out on collection.
    const collectR = SHIP.radius + ORB.radius;
    for (let i = 0; i < orbs.length; i += 1) {
      const orb = orbs[i];
      if (!orb.active) continue;
      orb.x += orb.vx * dt;
      orb.y += orb.vy * dt;
      orb.phase += dt * 3;
      orb.life -= dt;
      if (orb.x < ORB.radius || orb.x > FIELD.width - ORB.radius) orb.vx *= -1;
      if (orb.y < ORB.radius || orb.y > FIELD.height - ORB.radius) orb.vy *= -1;
      if (orb.life <= 0) {
        orb.active = false;
        continue;
      }
      if (harmless) continue;
      if (dist2(orb.x, orb.y, player.x, player.y) < collectR * collectR) {
        orb.active = false;
        const points = ORB.points * state.combo;
        state.score += points;
        state.charge = Math.min(100, state.charge + ORB_CHARGE);
        popup(orb.x, orb.y - 14, `+${points}`, '#fbbf24');
        burst(orb.x, orb.y, '#fbbf24', 12, 200, 0.45);
        if (state.combo < COMBO_MAX) state.combo += 1;
        state.comboT = COMBO_WINDOW;
        events |= EVENT_ORB;
        if (state.charge >= 100) {
          state.won = true;
          state.score += WIN_BONUS + WIN_PER_HULL * player.hull;
          burst(player.x, player.y, '#22d3ee', 40, 320, 0.9);
          events |= EVENT_WIN;
          break;
        }
      }
    }
    if (state.won) return events;

    // Surge: the beacon's charge sets how hard the field pushes back.
    const surge = SURGE_STEPS.filter((at) => state.charge >= at).length;
    if (surge > state.surge) {
      state.surge = surge;
      events |= EVENT_SURGE;
    }

    // Drones steer at the ship; a touch costs hull, a bolt costs them.
    const droneSpeed = DRONE.maxSpeed + DRONE.speedPerSurge * state.surge;
    const droneAccel = DRONE.accel + DRONE.accelPerSurge * state.surge;
    const hitR = SHIP.radius + DRONE.radius;
    for (let i = 0; i < drones.length; i += 1) {
      const drone = drones[i];
      if (!drone.active) continue;
      if (drone.hitT > 0) drone.hitT -= dt;
      const dx = player.x - drone.x;
      const dy = player.y - drone.y;
      const len = Math.hypot(dx, dy) || 1;
      drone.vx += (dx / len) * droneAccel * dt;
      drone.vy += (dy / len) * droneAccel * dt;
      const speed = Math.hypot(drone.vx, drone.vy);
      if (speed > droneSpeed) {
        drone.vx = (drone.vx / speed) * droneSpeed;
        drone.vy = (drone.vy / speed) * droneSpeed;
      }
      drone.x += drone.vx * dt;
      drone.y += drone.vy * dt;
      if (drone.x < DRONE.radius || drone.x > FIELD.width - DRONE.radius) drone.vx *= -1;
      if (drone.y < DRONE.radius || drone.y > FIELD.height - DRONE.radius) drone.vy *= -1;
      if (harmless || player.invuln > 0) continue;
      if (dist2(drone.x, drone.y, player.x, player.y) < hitR * hitR) {
        drone.active = false;
        player.hull -= 1;
        player.invuln = SHIP.invulnerable;
        state.combo = 1;
        state.comboT = 0;
        state.shake = 1;
        // Knock the ship away from the impact.
        player.vx = (player.x - drone.x) / len * 420;
        player.vy = (player.y - drone.y) / len * 420;
        burst(player.x, player.y, '#fb7185', 18, 260, 0.6);
        popup(player.x, player.y - 24, 'HULL -1', '#fb7185');
        events |= EVENT_HIT;
        if (player.hull <= 0) {
          state.over = true;
          burst(player.x, player.y, '#eef2f7', 46, 380, 1);
          events |= EVENT_OVER;
          break;
        }
      }
    }
    if (state.over) return events;

    // Bolts fly, fade, and pop drones.
    for (let i = 0; i < bolts.length; i += 1) {
      const bolt = bolts[i];
      if (!bolt.active) continue;
      bolt.x += bolt.vx * dt;
      bolt.y += bolt.vy * dt;
      bolt.life -= dt;
      if (bolt.life <= 0 || bolt.x < -20 || bolt.x > FIELD.width + 20 || bolt.y < -20 || bolt.y > FIELD.height + 20) {
        bolt.active = false;
        continue;
      }
      for (let j = 0; j < drones.length; j += 1) {
        const drone = drones[j];
        if (!drone.active) continue;
        const r = BOLT.radius + DRONE.radius;
        if (dist2(bolt.x, bolt.y, drone.x, drone.y) < r * r) {
          bolt.active = false;
          drone.hp -= 1;
          drone.hitT = 0.09;
          burst(bolt.x, bolt.y, '#67e8f9', 6, 160, 0.3);
          if (drone.hp <= 0) {
            drone.active = false;
            state.score += DRONE.points;
            popup(drone.x, drone.y - 14, `+${DRONE.points}`, '#fb7185');
            burst(drone.x, drone.y, '#fb7185', 22, 300, 0.7);
            events |= EVENT_DRONE_DOWN;
          }
          break;
        }
      }
    }

    // Particles and popups age out.
    for (let i = 0; i < particles.length; i += 1) {
      const p = particles[i];
      if (!p.active) continue;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.exp(-2 * dt);
      p.vy *= Math.exp(-2 * dt);
      p.life -= dt;
      if (p.life <= 0) p.active = false;
    }
    for (let i = 0; i < popups.length; i += 1) {
      const p = popups[i];
      if (!p.active) continue;
      p.y -= 34 * dt;
      p.life -= dt;
      if (p.life <= 0) p.active = false;
    }
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 2.4);

    return events;
  }

  /**
   * Restore a snapshot taken with structuredClone(state): every pool item and scalar
   * is copied back into the live state, so the world continues exactly from the
   * snapshotted frame. The shot stager uses it to keep the best frame it simulated.
   */
  function restore(snap) {
    for (const key of Object.keys(snap)) {
      const src = snap[key];
      const dst = state[key];
      if (Array.isArray(src)) {
        for (let i = 0; i < src.length; i += 1) Object.assign(dst[i], src[i]);
      } else if (src !== null && typeof src === 'object') {
        Object.assign(dst, src);
      } else {
        state[key] = src;
      }
    }
  }

  reset();
  return { state, reset, step, restore };
}

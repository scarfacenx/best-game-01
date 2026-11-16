// Drawing only: the world's state and the current screen in, pixels out. The 1280x720
// playfield is scaled to fit the window and centred, the margin filled with the backdrop
// colour. A camera follows the ship: it shows a zoomed window of the field, so the
// field flows past as the ship moves and the ship stays near the centre. The nebula is
// painted once into an offscreen canvas at boot; stars twinkle and parallax against
// the ship; the HUD is a top bar (score, beacon, hull) and the panels are thin-bordered
// cards. Text that holds a number is rebuilt only when the number changes, so a frame
// allocates nothing. Shake follows a sine of the clock, never Math.random, so a staged
// frame is the same frame every time.

import { BOLT, DRONE, FIELD, FONT, FONT_MONO, HULL_MAX, ORB, PALETTE, SHIP } from './config.js';
import { SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './screens.js';

const PANEL = { width: 640, top: 118, line: 32, bottom: 64 };
const HULL_SIZE = 18;
const HULL_GAP = 10;

function cachedLabel(prefix) {
  let value = null;
  let text = '';
  return function label(next) {
    if (next !== value) {
      value = next;
      text = prefix + next;
    }
    return text;
  };
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0, w: 0, h: 0 };
  // The camera: a zoomed window into the field that follows the ship. It is a render
  // transform only — the sim never sees it, so the rules and the balance do not
  // change. The window is smaller than the field, so it pans within it; clamped, it
  // never shows outside the field.
  const CAM_ZOOM = 1.2;
  const CAM_W = FIELD.width / CAM_ZOOM;
  const CAM_H = FIELD.height / CAM_ZOOM;
  const cam = { x: 0, y: 0 };
  let camSet = false;
  let lastDraw = 0;
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const scoreLabel = cachedLabel('');
  const bestLabel = cachedLabel('BEST ');
  const finalLabel = cachedLabel('');
  const chargeLabel = cachedLabel('');
  const comboLabel = cachedLabel('×');
  const surgeLabel = cachedLabel('SURGE ');

  // The nebula: three soft radial glows and a dark vignette, painted once.
  const nebula = document.createElement('canvas');
  nebula.width = FIELD.width;
  nebula.height = FIELD.height;
  {
    const g = nebula.getContext('2d');
    g.fillStyle = PALETTE.field;
    g.fillRect(0, 0, FIELD.width, FIELD.height);
    const glow = (x, y, r, color) => {
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, color);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    };
    glow(240, 170, 420, 'rgba(22,34,77,0.85)');
    glow(1060, 560, 460, 'rgba(59,29,78,0.7)');
    glow(1020, 120, 300, 'rgba(34,211,238,0.10)');
    glow(180, 620, 380, 'rgba(251,191,36,0.07)');
    glow(640, 80, 340, 'rgba(52,211,153,0.08)');
    const vig = g.createRadialGradient(640, 360, 240, 640, 360, 780);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(2,4,10,0.55)');
    g.fillStyle = vig;
    g.fillRect(0, 0, FIELD.width, FIELD.height);
  }

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.w = width;
    view.h = height;
    view.scale = Math.min(width / FIELD.width, height / FIELD.height);
    view.x = (width - FIELD.width * view.scale) / 2;
    view.y = (height - FIELD.height * view.scale) / 2;
  }

  const fonts = new Map();
  function font(size, mono) {
    const key = `${size}${mono ? 'm' : ''}`;
    if (!fonts.has(key)) fonts.set(key, `${size}px ${mono ? FONT_MONO : FONT}`);
    return fonts.get(key);
  }

  function text(value, x, y, size, color, align, mono, weight) {
    context.font = `${weight ?? 400} ${font(size, mono)}`;
    context.fillStyle = color;
    context.textAlign = align ?? 'left';
    context.fillText(value, x, y);
  }

  function toField(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const px = ((clientX - rect.left) / rect.width) * view.w;
    const py = ((clientY - rect.top) / rect.height) * view.h;
    // Invert the camera transform: the point under the cursor in world coordinates.
    const scale = view.scale * CAM_ZOOM;
    return { x: cam.x + (px - view.x) / scale, y: cam.y + (py - view.y) / scale };
  }

  function cameraTarget(state) {
    return {
      x: Math.min(Math.max(state.player.x - CAM_W / 2, 0), FIELD.width - CAM_W),
      y: Math.min(Math.max(state.player.y - CAM_H / 2, 0), FIELD.height - CAM_H),
    };
  }

  /** Put the camera exactly on the ship: a staged frame must paint identically every time. */
  function snapCamera(state) {
    const target = cameraTarget(state);
    cam.x = target.x;
    cam.y = target.y;
    camSet = true;
  }

  function drawStars(state) {
    const px = state.player.x;
    const py = state.player.y;
    for (let i = 0; i < state.stars.length; i += 1) {
      const s = state.stars[i];
      const par = 0.03 * (s.layer + 1);
      let x = (s.x - px * par) % FIELD.width;
      let y = (s.y - py * par) % FIELD.height;
      if (x < 0) x += FIELD.width;
      if (y < 0) y += FIELD.height;
      const tw = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(state.elapsed * 1.6 + s.tw));
      context.globalAlpha = tw * (0.35 + s.layer * 0.25);
      context.fillStyle = s.layer === 2 ? '#cfe9ff' : '#8b9bb8';
      context.fillRect(x, y, s.size, s.size);
    }
    context.globalAlpha = 1;
  }

  function drawOrbs(state) {
    for (let i = 0; i < state.orbs.length; i += 1) {
      const orb = state.orbs[i];
      if (!orb.active) continue;
      const pulse = 1 + 0.16 * Math.sin(orb.phase);
      const r = ORB.radius * pulse;
      // Fade out in its last seconds so nothing vanishes without warning.
      context.globalAlpha = orb.life < 3 ? 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(orb.life * 8)) : 1;
      context.fillStyle = 'rgba(251,191,36,0.18)';
      context.beginPath();
      context.arc(orb.x, orb.y, r * 2.6, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = PALETTE.orb;
      context.beginPath();
      context.arc(orb.x, orb.y, r, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = PALETTE.orbCore;
      context.beginPath();
      context.arc(orb.x, orb.y, r * 0.42, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
  }

  function drawDrones(state) {
    for (let i = 0; i < state.drones.length; i += 1) {
      const drone = state.drones[i];
      if (!drone.active) continue;
      const angle = Math.atan2(state.player.y - drone.y, state.player.x - drone.x);
      context.save();
      context.translate(drone.x, drone.y);
      context.rotate(angle);
      context.fillStyle = drone.hitT > 0 ? '#ffffff' : PALETTE.drone;
      context.beginPath();
      context.moveTo(DRONE.radius + 4, 0);
      context.lineTo(-DRONE.radius, DRONE.radius * 0.85);
      context.lineTo(-DRONE.radius * 0.45, 0);
      context.lineTo(-DRONE.radius, -DRONE.radius * 0.85);
      context.closePath();
      context.fill();
      // A drone on its last hit shows a pale crack across the hull.
      if (drone.hp === 1) {
        context.strokeStyle = 'rgba(255,228,230,0.9)';
        context.lineWidth = 2;
        context.beginPath();
        context.moveTo(-4, -8);
        context.lineTo(5, 8);
        context.stroke();
      }
      context.fillStyle = PALETTE.droneCore;
      context.beginPath();
      context.arc(2, 0, 3, 0, Math.PI * 2);
      context.fill();
      context.restore();
    }
  }

  function drawBolts(state) {
    context.strokeStyle = PALETTE.bolt;
    context.lineCap = 'round';
    for (let i = 0; i < state.bolts.length; i += 1) {
      const bolt = state.bolts[i];
      if (!bolt.active) continue;
      const len = Math.hypot(bolt.vx, bolt.vy) || 1;
      const tx = (bolt.vx / len) * 16;
      const ty = (bolt.vy / len) * 16;
      context.lineWidth = 3;
      context.globalAlpha = 0.9;
      context.beginPath();
      context.moveTo(bolt.x - tx, bolt.y - ty);
      context.lineTo(bolt.x, bolt.y);
      context.stroke();
      context.globalAlpha = 1;
      context.fillStyle = '#ecfeff';
      context.beginPath();
      context.arc(bolt.x, bolt.y, BOLT.radius * 0.7, 0, Math.PI * 2);
      context.fill();
    }
  }

  function drawShip(state) {
    const p = state.player;
    // Blink while invulnerable after a hit: hidden on every other tenth of a second.
    if (p.invuln > 0 && Math.floor(p.invuln * 10) % 2 === 0) return;
    context.save();
    context.translate(p.x, p.y);
    context.rotate(p.angle);
    const thrusting = Math.hypot(p.vx, p.vy) > 60;
    if (thrusting || p.dashT > 0) {
      const flame = p.dashT > 0 ? 38 : 18 + 8 * Math.sin(state.elapsed * 30);
      context.fillStyle = 'rgba(251,191,36,0.9)';
      context.beginPath();
      context.moveTo(-SHIP.radius + 2, 5);
      context.lineTo(-SHIP.radius - flame, 0);
      context.lineTo(-SHIP.radius + 2, -5);
      context.closePath();
      context.fill();
    }
    context.fillStyle = PALETTE.ship;
    context.beginPath();
    context.moveTo(SHIP.radius + 6, 0);
    context.lineTo(-SHIP.radius + 2, SHIP.radius * 0.72);
    context.lineTo(-SHIP.radius * 0.42, 0);
    context.lineTo(-SHIP.radius + 2, -SHIP.radius * 0.72);
    context.closePath();
    context.fill();
    context.fillStyle = PALETTE.shipCore;
    context.beginPath();
    context.arc(3, 0, 5.5, 0, Math.PI * 2);
    context.fill();
    context.restore();
    // Dash leaves a fading cyan wake.
    if (p.dashT > 0) {
      context.globalAlpha = 0.35;
      context.fillStyle = PALETTE.ship;
      context.beginPath();
      context.arc(p.x - Math.cos(p.angle) * 26, p.y - Math.sin(p.angle) * 26, 9, 0, Math.PI * 2);
      context.fill();
      context.globalAlpha = 1;
    }
  }

  function drawParticles(state) {
    context.globalCompositeOperation = 'lighter';
    for (let i = 0; i < state.particles.length; i += 1) {
      const p = state.particles[i];
      if (!p.active) continue;
      context.globalAlpha = Math.max(0, p.life / p.maxLife);
      context.fillStyle = p.color;
      context.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    context.globalAlpha = 1;
    context.globalCompositeOperation = 'source-over';
  }

  function drawPopups(state) {
    context.textBaseline = 'alphabetic';
    for (let i = 0; i < state.popups.length; i += 1) {
      const p = state.popups[i];
      if (!p.active) continue;
      context.globalAlpha = Math.min(1, p.life / 0.45);
      text(p.text, p.x, p.y, 20, p.color, 'center', true, 700);
    }
    context.globalAlpha = 1;
  }

  function drawField(state) {
    context.drawImage(nebula, 0, 0);
    drawStars(state);
    drawOrbs(state);
    drawDrones(state);
    drawBolts(state);
    drawShip(state);
    drawParticles(state);
    drawPopups(state);
  }

  function drawHullPips(x, y, hull) {
    for (let i = 0; i < HULL_MAX; i += 1) {
      const cx = x + i * (HULL_SIZE + HULL_GAP);
      context.fillStyle = i < hull ? PALETTE.ship : 'rgba(100,116,139,0.4)';
      context.beginPath();
      context.moveTo(cx + HULL_SIZE, y + HULL_SIZE / 2);
      context.lineTo(cx, y + HULL_SIZE);
      context.lineTo(cx + HULL_SIZE * 0.5, y);
      context.lineTo(cx, y);
      context.closePath();
      context.fill();
    }
  }

  function drawHud(state, muted) {
    context.textBaseline = 'top';
    // Score, top left, mono so the digits never wobble.
    text('SCORE', 24, 18, 13, PALETTE.muted, 'left', true, 600);
    text(scoreLabel(state.score), 24, 36, 30, PALETTE.text, 'left', true, 700);
    if (state.combo > 1) {
      context.fillStyle = 'rgba(251,191,36,0.14)';
      const label = `${comboLabel(state.combo)} COMBO`;
      const w = 12 + context.measureText(label).width + 12;
      context.beginPath();
      context.roundRect(24, 74, w, 26, 13);
      context.fill();
      text(label, 36, 80, 14, PALETTE.orb, 'left', true, 700);
    }
    // Beacon charge, top centre: the goal, always in view.
    const barW = 320;
    const barX = (FIELD.width - barW) / 2;
    text('BEACON', barX, 18, 13, PALETTE.muted, 'left', true, 600);
    text(chargeLabel(`${Math.floor(state.charge)}%`), barX + barW, 18, 13, PALETTE.text, 'right', true, 600);
    context.fillStyle = 'rgba(148,163,184,0.25)';
    context.beginPath();
    context.roundRect(barX, 38, barW, 12, 6);
    context.fill();
    if (state.charge > 0) {
      context.fillStyle = PALETTE.ship;
      context.beginPath();
      context.roundRect(barX, 38, (barW * state.charge) / 100, 12, 6);
      context.fill();
    }
    for (const at of [25, 50, 75]) {
      context.fillStyle = 'rgba(7,11,22,0.8)';
      context.fillRect(barX + (barW * at) / 100 - 1, 38, 2, 12);
    }
    if (state.surge > 0) text(surgeLabel(state.surge), barX + barW / 2, 58, 13, PALETTE.danger, 'center', true, 700);
    // Hull and dash, top right.
    text('HULL', FIELD.width - 24 - HULL_MAX * (HULL_SIZE + HULL_GAP) + HULL_GAP - 52, 20, 13, PALETTE.muted, 'right', true, 600);
    drawHullPips(FIELD.width - 24 - HULL_MAX * (HULL_SIZE + HULL_GAP) + HULL_GAP, 18, state.player.hull);
    const dashReady = state.player.dashCd <= 0;
    text('DASH', FIELD.width - 24, 52, 13, dashReady ? PALETTE.ship : PALETTE.faint, 'right', true, 600);
    context.fillStyle = dashReady ? PALETTE.ship : 'rgba(100,116,139,0.4)';
    context.beginPath();
    context.arc(FIELD.width - 24 - 52, 58, 5, 0, Math.PI * 2);
    context.fill();
    // Early hint, then it gets out of the way.
    if (state.elapsed < 8) {
      text('Collect amber orbs · Shoot rose shards · Space to dash', FIELD.width / 2, FIELD.height - 34, 16, PALETTE.muted, 'center', false, 400);
    }
    if (muted) text('MUTED — M for sound', FIELD.width - 24, FIELD.height - 34, 13, PALETTE.faint, 'right', true, 400);
  }

  function drawPanel(title, lines, prompt, accent) {
    const height = PANEL.top + lines.length * PANEL.line + PANEL.bottom;
    const x = (FIELD.width - PANEL.width) / 2;
    const y = (FIELD.height - height) / 2;
    context.fillStyle = 'rgba(16,24,39,0.94)';
    context.beginPath();
    context.roundRect(x, y, PANEL.width, height, 12);
    context.fill();
    context.strokeStyle = PALETTE.panelEdge;
    context.lineWidth = 1;
    context.stroke();
    context.textBaseline = 'alphabetic';
    text(title, FIELD.width / 2, y + 82, 52, accent ?? PALETTE.text, 'center', false, 800);
    for (let i = 0; i < lines.length; i += 1) {
      text(lines[i], FIELD.width / 2, y + PANEL.top + i * PANEL.line, 20, PALETTE.muted, 'center', false, 400);
    }
    text(prompt, FIELD.width / 2, y + height - 38, 22, PALETTE.orb, 'center', false, 600);
  }

  const TITLE_LINES = [
    'Light the beacon: collect 25 lumen orbs.',
    'Rose shards hunt your ship — shoot them, or dash clear.',
    'WASD / arrows fly · Mouse aims · Hold click to fire',
    'Space dashes · P pauses · M toggles sound',
    '',
  ];
  const PAUSED_LINES = ['The drift waits for you.'];
  const WIN_LINES = ['', '', ''];
  const OVER_LINES = ['', '', ''];

  /** Paint one frame: the field through the camera, then the HUD or a panel for the screen the game is on. */
  function draw(state, screen, best, muted) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, view.w, view.h);
    // Follow the ship: snap the first time so the game never opens mid-slide, then
    // ease toward it. The target is a pure function of the state, so a snapped
    // camera paints the same frame every time.
    const now = performance.now();
    if (!camSet) snapCamera(state);
    else {
      const dt = Math.min(Math.max((now - lastDraw) / 1000, 0), 0.1);
      const target = cameraTarget(state);
      const k = 1 - Math.exp(-dt * 8);
      cam.x += (target.x - cam.x) * k;
      cam.y += (target.y - cam.y) * k;
    }
    lastDraw = now;
    let sx = 0;
    let sy = 0;
    if (state.shake > 0 && !reducedMotion) {
      const mag = state.shake * 7;
      sx = Math.sin(state.elapsed * 61) * mag;
      sy = Math.cos(state.elapsed * 53) * mag;
    }
    const zoom = view.scale * CAM_ZOOM;
    context.setTransform(zoom, 0, 0, zoom, view.x - (cam.x - sx) * zoom, view.y - (cam.y - sy) * zoom);
    drawField(state);
    // The HUD and panels are fixed to the screen, not the world.
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    if (screen === SCREEN_TITLE) {
      TITLE_LINES[4] = bestLabel(best);
      drawPanel('AETHER DRIFT', TITLE_LINES, 'Press Space or click to launch', PALETTE.ship);
      return;
    }
    drawHud(state, muted);
    if (screen === SCREEN_PAUSED) drawPanel('Paused', PAUSED_LINES, 'Press P to resume');
    else if (screen === SCREEN_WIN) {
      WIN_LINES[0] = 'The drift is yours. The beacon burns cyan.';
      WIN_LINES[1] = `Score ${finalLabel(state.score)}`;
      WIN_LINES[2] = bestLabel(best);
      drawPanel('BEACON LIT', WIN_LINES, 'Press Space or click to fly again', PALETTE.good);
    } else if (screen === SCREEN_OVER) {
      OVER_LINES[0] = 'The shards got the ship.';
      OVER_LINES[1] = `Score ${finalLabel(state.score)}`;
      OVER_LINES[2] = bestLabel(best);
      drawPanel('HULL LOST', OVER_LINES, 'Press Space or click to try again', PALETTE.danger);
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return {
    draw,
    toField,
    snapCamera,
    /** Read-only camera state for automated checks: top-left of the camera window and zoom. */
    get cam() { return { x: cam.x, y: cam.y, zoom: CAM_ZOOM }; },
  };
}

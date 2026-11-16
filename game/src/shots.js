// The screenshot scenes behind ?shot=start|play|win|end. Each one plays the real rules
// forward from a fresh world for a fixed time, steered by the autopilot, so the frame is
// what a short game really looks like and the same seed always gives the same frame.

import { FIELD, STEP } from './config.js';
import { EVENT_OVER, EVENT_WIN } from './world.js';
import { autopilot } from './autopilot.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './screens.js';

/** The camera window (same 1.2x zoom as the renderer): what the screenshot shows. */
const CAM_W = FIELD.width / 1.2;
const CAM_H = FIELD.height / 1.2;

const START_SECONDS = 5;
const PLAY_SECONDS = 14;
/** Extra seconds past the play mark the stager scans for the best frame. */
const PLAY_WINDOW_SECONDS = 12;
const WIN_LIMIT_SECONDS = 300;
const END_LIMIT_SECONDS = 600;

/**
 * How good a frame looks as a still: what is actually visible in the camera window
 * counts most — drones double, since they are the action — and a centred ship
 * counts next. The pilot shoots drones at range, so a near-ship radius would almost
 * never see one; the window is what the screenshot shows.
 */
function frameScore(state) {
  const p = state.player;
  const dc = Math.hypot(p.x - 640, p.y - 360);
  const cx = Math.min(Math.max(p.x - CAM_W / 2, 0), FIELD.width - CAM_W);
  const cy = Math.min(Math.max(p.y - CAM_H / 2, 0), FIELD.height - CAM_H);
  const inWin = (x, y) => x >= cx && x <= cx + CAM_W && y >= cy && y <= cy + CAM_H;
  let near = 0;
  for (const d of state.drones) if (d.active && inWin(d.x, d.y)) near += 2;
  for (const o of state.orbs) if (o.active && inWin(o.x, o.y)) near += 1;
  for (const b of state.bolts) if (b.active && inWin(b.x, b.y)) near += 0.5;
  for (const pp of state.popups) if (pp.active) near += 0.5;
  return near * 100 - dc;
}

/**
 * Set `world` to the named scene (start, play, win or end; any other name is start) and
 * return the screen to draw over it and the best score to show.
 */
export function stageShot(name, world) {
  world.reset();
  if (name !== 'play' && name !== 'win' && name !== 'end') {
    for (let i = 0; i < START_SECONDS / STEP; i += 1) world.step(STEP, autopilot(world.state, 'strong'), true);
    return { screen: SCREEN_TITLE, best: 0 };
  }
  if (name === 'play') {
    // Play to the mark, then keep going a little and keep the best-looking frame:
    // the state is snapshotted and restored, so the frame is exactly one the real
    // game produced, only chosen, never arranged.
    let bestScore = -Infinity;
    let bestSnap = null;
    const total = (PLAY_SECONDS + PLAY_WINDOW_SECONDS) / STEP;
    for (let i = 0; i < total; i += 1) {
      if (world.step(STEP, autopilot(world.state, 'strong'), false) & (EVENT_OVER | EVENT_WIN)) break;
      if (i >= PLAY_SECONDS / STEP) {
        const score = frameScore(world.state);
        if (score > bestScore) {
          bestScore = score;
          bestSnap = structuredClone(world.state);
        }
      }
    }
    if (bestSnap !== null) world.restore(bestSnap);
    return { screen: world.state.over ? SCREEN_OVER : SCREEN_PLAY, best: world.state.score };
  }
  if (name === 'win') {
    for (let i = 0; i < WIN_LIMIT_SECONDS / STEP; i += 1) {
      if (world.step(STEP, autopilot(world.state, 'strong'), false) & EVENT_WIN) break;
    }
    return { screen: world.state.won ? SCREEN_WIN : SCREEN_PLAY, best: world.state.score };
  }
  for (let i = 0; i < END_LIMIT_SECONDS / STEP; i += 1) {
    if (world.step(STEP, autopilot(world.state, 'weak'), false) & EVENT_OVER) break;
  }
  return { screen: world.state.over ? SCREEN_OVER : SCREEN_PLAY, best: world.state.score };
}

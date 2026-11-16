// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s
// steps (several in a slow frame, none in a fast one), and the renderer paints what is
// there. The game moves between five screens: title, play, paused, win and game over.
//
// ?seed=N fixes the pattern. ?shot=start|play|win|end (with &seed=N) stages that scene
// instead of running the loop, paints it twice and sets window.__shotReady for a
// screenshot.

import { BEST_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createAudio } from './audio.js';
import {
  createWorld, EVENT_DASH, EVENT_DRONE_DOWN, EVENT_HIT, EVENT_ORB, EVENT_OVER,
  EVENT_SHOOT, EVENT_SURGE, EVENT_WIN,
} from './world.js';
import { ACTION_CONFIRM, ACTION_DASH, ACTION_MUTE, ACTION_PAUSE, createInput } from './input.js';
import {
  createRenderer,
} from './render.js';
import { SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './screens.js';
import { stageShot } from './shots.js';
import { autopilot } from './autopilot.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  // A read-only handle for automated checks: the world and the staged screen.
  window.__aether = { world, screen: scene.screen };
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best, false);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas, (x, y) => renderer.toField(x, y));
  let screen = SCREEN_TITLE;
  let best = readBest();
  let muted = false;
  let accumulator = 0;
  let last = performance.now();
  // A read-only handle for automated checks: the world and the live screen.
  window.__aether = { world, get screen() { return screen; } };

  // Screen readers (and anyone watching the page's text) hear the screen changes and each hit.
  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    audio.unlock();
    world.reset();
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce('Playing. Light the beacon: collect 25 lumen orbs.');
  }

  function endGame(won) {
    screen = won ? SCREEN_WIN : SCREEN_OVER;
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    if (won) {
      audio.win();
      announce(`Beacon lit. Score ${world.state.score}. Best ${best}.`);
    } else {
      audio.lose();
      announce(`Hull lost. Score ${world.state.score}. Best ${best}.`);
    }
  }

  function playEvents(events) {
    if (events & EVENT_ORB) audio.orb(world.state.combo);
    if (events & EVENT_SHOOT) audio.shoot();
    if (events & EVENT_DASH) audio.dash();
    if (events & EVENT_DRONE_DOWN) audio.droneDown();
    if (events & EVENT_SURGE) {
      audio.surge();
      announce(`Surge ${world.state.surge}. The shards are faster now.`);
    }
    if (events & EVENT_HIT) {
      audio.hit();
      announce(world.state.player.hull === 1 ? 'Hit. 1 hull point left.' : `Hit. ${world.state.player.hull} hull points left.`);
    }
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      muted = audio.toggleMute();
      announce(muted ? 'Sound off.' : 'Sound on.');
    }
    if (actions & ACTION_CONFIRM && (screen === SCREEN_TITLE || screen === SCREEN_OVER || screen === SCREEN_WIN)) {
      startGame();
      return null;
    }
    if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
      return null;
    }
    if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Playing.');
      return null;
    }
    // During play, a dash press is an edge: it reaches the first step only.
    return actions & ACTION_DASH ? true : false;
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      // The title screen is alive: the ship flies the field on autopilot.
      world.step(STEP, autopilot(world.state, 'strong'), true);
      return;
    }
    const move = input.move();
    const aim = input.aim();
    const control = { mx: move.x, my: move.y, aimX: aim.x, aimY: aim.y, firing: input.isFiring(), dash: false };
    const events = world.step(STEP, control, false);
    playEvents(events);
    if (events & EVENT_WIN) endGame(true);
    else if (events & EVENT_OVER) endGame(false);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    const dash = handleActions();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      let first = true;
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        if (screen === SCREEN_PLAY && first && dash) {
          const move = input.move();
          const aim = input.aim();
          const events = world.step(STEP, { mx: move.x, my: move.y, aimX: aim.x, aimY: aim.y, firing: input.isFiring(), dash: true }, false);
          playEvents(events);
          if (events & EVENT_WIN) endGame(true);
          else if (events & EVENT_OVER) endGame(false);
        } else {
          step();
        }
        first = false;
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, best, muted);
  }

  // Leaving the tab pauses a running game rather than letting shards hunt unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Aether Drift. Press Space or click to launch.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();

// AETHER DRIFT — every tuning number and colour in one place.
// The playfield is a fixed 1280x720 logical area; the renderer scales it to the window,
// so no rule below depends on the screen size.

export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** Hull points the ship starts with; one hit removes one. */
export const HULL_MAX = 3;

/** Beacon charge each lumen orb adds, in percent; 25 orbs light the beacon. */
export const ORB_CHARGE = 4;

/** Seconds a combo survives without another pickup; a hit resets it at once. */
export const COMBO_WINDOW = 3;
export const COMBO_MAX = 5;

export const SHIP = {
  radius: 14,
  accel: 1500,
  maxSpeed: 340,
  /** Velocity kept each second without thrust (exponential damping). */
  damping: 2.4,
  fireInterval: 0.18,
  invulnerable: 1.5,
};

export const DASH = {
  speed: 950,
  time: 0.18,
  invulnerable: 0.4,
  cooldown: 2.5,
};

export const BOLT = { radius: 4, speed: 920, life: 0.8 };

export const ORB = {
  radius: 10,
  interval: 1.3,
  max: 5,
  drift: 34,
  /** Seconds an orb floats before it fades out uncollected. */
  life: 12,
  points: 10,
};

export const DRONE = {
  radius: 13,
  hp: 2,
  points: 25,
  /** Steering accel toward the ship, and top speed, at surge 0; both grow per surge. */
  accel: 480,
  accelPerSurge: 100,
  maxSpeed: 150,
  speedPerSurge: 26,
  interval: 2.0,
  intervalPerSurge: 0.35,
  minInterval: 0.8,
  max: 4,
  maxPerSurge: 2,
};

/** Surge steps as the beacon charges: 0 below 25%, then 1, 2, 3 past 75%. */
export const SURGE_STEPS = [25, 50, 75];

/** Win bonus: a flat prize plus a prize per hull point left. */
export const WIN_BONUS = 250;
export const WIN_PER_HULL = 100;

/** How many of each thing can exist at once; the pools are allocated once, at boot. */
export const POOLS = { orbs: 16, drones: 24, bolts: 48, particles: 256, popups: 16 };

/**
 * Palette. One accent (cyan) carries the ship, the beacon and the primary text;
 * amber marks what to collect, rose marks what to avoid, and everything else is
 * slate and ink. Numbers always ride with their labels, never colour alone.
 */
export const PALETTE = {
  backdrop: '#070b16',
  field: '#0b1226',
  nebulaA: '#16224d',
  nebulaB: '#3b1d4e',
  panel: '#101827',
  panelEdge: '#2b3a55',
  ship: '#22d3ee',
  shipCore: '#e0faff',
  bolt: '#67e8f9',
  orb: '#fbbf24',
  orbCore: '#fef3c7',
  drone: '#fb7185',
  droneCore: '#ffe4e6',
  text: '#eef2f7',
  muted: '#94a3b8',
  faint: '#64748b',
  good: '#34d399',
  danger: '#f87171',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
export const FONT_MONO = 'ui-monospace, "SF Mono", "Cascadia Mono", Menlo, monospace';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'aether-drift.best';

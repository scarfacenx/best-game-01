# AETHER DRIFT

A neon arena game for the make.fun best-game-01 bounty. Fly a lone ship through a
nebula, collect lumen orbs to light the beacon, and shoot the shard drones hunting
you — before they take your hull.

## How to play

- **Goal:** light the beacon to 100% by collecting 25 lumen orbs. Reach 100% and you
  win; lose all 3 hull points and the ship is gone.
- **Fly:** WASD or arrow keys (with drift — the ship has inertia).
- **Aim:** mouse. **Fire:** hold the left mouse button.
- **Dash:** Space — a burst of speed with a short moment of invulnerability, on a
  2.5 s cooldown.
- **Pause:** P or Esc. **Sound:** M. **Start / restart:** Space, Enter, or click.
- **Scoring:** an orb is worth 10 points times your combo (up to ×5 for quick
  pickups in a row); a destroyed drone is worth 25. Winning adds a bonus of 250
  plus 100 per hull point left.
- **Difficulty:** every 25% of beacon charge raises a surge — drones spawn faster,
  fly faster, and come in greater numbers.

## Run it

No build step, no network. Any static server works:

```sh
node serve.ts
# game/ is on http://localhost:8080
```

Open `game/index.html` directly or through the server and play. `?seed=N` fixes the
spawn pattern; `?shot=start|play|win|end&seed=N` stages a screenshot scene instead
of running the loop.

## Structure

```
game/
  index.html        the page: one canvas, one module script
  src/
    config.js       tuning numbers, palette, fonts
    random.js       seeded RNG (mulberry32)
    world.js        rules and state — no drawing, no browser
    input.js        keyboard + mouse
    render.js       canvas drawing, HUD, panels
    audio.js        WebAudio synth sound effects, no audio files
    autopilot.js    the pilot that stages the screenshot scenes
    shots.js        start / play / win / end scene staging
    main.js         boot, the fixed-step loop, screens
main.ts             the entry program: copies game/ + screenshots/ to /output
                    and writes /output/dossier.json
serve.ts            a tiny static server for local play
shots.json          the four screenshot scenes
vendor/
  makefun-game.ts   make.fun's dossier library, unchanged
```

All sound is synthesized with WebAudio; all art is drawn on canvas. The game loads
nothing over the network.

## License

MIT — see LICENSE.

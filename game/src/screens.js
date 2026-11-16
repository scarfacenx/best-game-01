// The game's five screens, shared by the renderer, the loop and the shot stager.
// Kept in its own module so the shot staging stays free of the DOM and testable in Node.

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_WIN = 'win';
export const SCREEN_OVER = 'over';

// Constants recovered from the original Curve Fever 1 (v1.02, Flash, 2010).
// Distances are in field pixels, times in seconds.

export const FIELD_W = 760;
export const FIELD_H = 760;

// The original simulated at 25 ticks/s (one step per Flash frame). We run the
// same physics at 100 ticks/s so movement looks smooth on modern displays.
export const TPS = 100;
export const ORIGINAL_TPS = 25;

export const CURVE = {
  speed: 90, // px per second
  turnRadius: 35, // px
  width: 6, // line thickness
  holeMinGap: 100, // px of line before a hole may appear
  holeMaxGap: 200, // a hole is guaranteed (on average) before this
  holeLength: 15, // px
  leadIn: 12, // px drawn before the round starts, to show the direction
};

export const POINTS_PER_OPPONENT = 10; // goal = (players - 1) * 10
export const ROUND_DELAY = 1.5; // s, auto-continue delay in vs-computer mode

export const PLAYERS = [
  { id: 1, name: 'Fred', color: '#ff0000', left: 'ArrowLeft', right: 'ArrowRight' },
  { id: 2, name: 'Greenlee', color: '#00ff00', left: 'KeyZ', right: 'KeyX' },
  { id: 3, name: 'Pinkney', color: '#ff00ff', left: 'KeyN', right: 'KeyM' },
  { id: 4, name: 'Bluebell', color: '#00ffff', left: 'Digit1', right: 'KeyQ' },
  { id: 5, name: 'Willem', color: '#ff8000', left: 'KeyV', right: 'KeyB' },
  { id: 6, name: 'Greydon', color: '#cccccc', left: 'Numpad4', right: 'Numpad6' },
];

// target: who it affects. 'self' = green, 'others' = red, 'all' = blue.
// chance: on average one of each kind spawns every `chance` seconds.
export const POWERUPS = [
  { type: 'fast', target: 'self', chance: 70, duration: 3, label: 'Speed up' },
  { type: 'slow', target: 'self', chance: 70, duration: 10, label: 'Slow down' },
  { type: 'thin', target: 'self', chance: 70, duration: 15, label: 'Thin line' },
  { type: 'fly', target: 'self', chance: 70, duration: 5, label: 'Fly (no line, invincible)' },
  { type: 'tunnel', target: 'self', chance: 70, duration: 15, label: 'Go through walls' },
  { type: 'square', target: 'self', chance: 70, duration: 15, label: 'Square turns' },
  { type: 'slow', target: 'others', chance: 70, duration: 5, label: 'Slow down others' },
  { type: 'fast', target: 'others', chance: 70, duration: 3, label: 'Speed up others' },
  { type: 'thick', target: 'others', chance: 50, duration: 7.5, label: 'Thick lines for others' },
  { type: 'square', target: 'others', chance: 70, duration: 7.5, label: 'Square turns for others' },
  { type: 'reverse', target: 'others', chance: 80, duration: 5, label: 'Reversed keys for others' },
  { type: 'borders', target: 'all', chance: 70, duration: 10, label: 'Open borders for everyone' },
  { type: 'clear', target: 'all', chance: 80, duration: 0, label: 'Clear the field' },
  { type: 'more', target: 'all', chance: 80, duration: 5, label: 'More powerups' },
  { type: 'random', target: 'random', chance: 80, duration: 0, label: 'Random powerup' },
];

export const POWERUP_RADIUS = 20;

export const HINTS = [
  'Hint: Instead of clicking on the names, you can also press the numbers in front of the names on your keyboard',
  'Hint: Want to change a key after you assigned it? Just click on the key name',
  'Hint: During gameplay, you can pause by pressing SPACE, and escape the game by pressing ESCAPE',
  'Hint: Want to play old school Achtung? Click Classic instead of Arcade',
  'Hint: Click CPU next to a player to let the computer play that curve',
  'Hint: Press F to toggle fullscreen',
];

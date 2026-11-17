// NEON BAY — every tuning number, colour and story beat in one place.
// A fictional sun-soaked coastal city. Nothing here is from any commercial game:
// the city, people, cars, names and story are all our own.

export const CITY = {
  blocks: 5, // blocks per side
  block: 56, // block edge, in world units
  road: 14, // road width
  // road centre lines sit at -175, -105, -35, 35, 105, 175 on both axes
  span: 364,
  coastZ: 182, // south of this the beach starts
  beachZ: 210, // south of this the water starts
};

export const STEP = 1 / 60; // fixed simulation step, seconds

export const PLAYER = {
  walkSpeed: 7,
  runSpeed: 11,
  radius: 0.9,
  health: 100,
  jumpSpeed: 8,
  gravity: 22,
};

export const CAR = {
  accel: 16,
  brake: 30,
  reverseAccel: 10,
  maxSpeed: 34,
  maxReverse: 10,
  steer: 0.55, // radians per second at full lock, scaled by speed
  grip: 6, // how fast lateral velocity dies out (arcade drift)
  radius: 2.2,
};

export const TRAFFIC_COUNT = 10;
export const PED_COUNT = 14;

export const WANTED = {
  max: 5,
  decaySeconds: 14, // one star falls off after this long with no crime and no cop near
  stealStars: 1,
  shootStars: 1,
  hitPedStars: 1,
  maxPolice: 3,
};

export const POLICE = {
  speed: 30,
  ramDamage: 6, // health per second while touching the player
  bustSeconds: 2.5, // touching the player on foot this long at 3+ stars busts them
};

export const RIVAL = {
  health: 3, // hits to drop one
  shootRange: 26,
  damage: 4, // health per hit on the player
  shotInterval: 1.1,
};

export const PALETTE = {
  skyTop: '#2e4a7a',
  skyMid: '#ff9e6b',
  skyLow: '#ffd9a0',
  fog: '#f7b98a',
  sun: '#ffb36b',
  water: '#1d6f8f',
  sand: '#e8c98f',
  asphalt: '#33373f',
  sidewalk: '#9aa0a8',
  building: ['#e8dcc8', '#c9d6dd', '#f2b8a0', '#a8c8b8', '#d9c2e8', '#f7e6b0', '#b8c8e8'],
  glass: '#7fd4e8',
  neonPink: '#ff4fd8',
  neonCyan: '#2ee8ff',
  neonYellow: '#ffd94d',
  hudText: '#ffffff',
  hudPanel: 'rgba(12, 16, 28, 0.72)',
  star: '#ffd94d',
  health: '#58e07a',
  cash: '#7dff9e',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the save lives between visits (this browser only). */
export const SAVE_KEY = 'neon-bay.save.v1';

/** The crew. Mara Voss runs with Dario Kess (driver), Pip (lookout) and Lena Marlowe (fixer). */
export const CREW = {
  player: 'Mara Voss',
  driver: 'Dario Kess',
  lookout: 'Pip',
  fixer: 'Lena Marlowe',
  rival: 'Vic Strand',
};

export const CARS = {
  comet: { name: 'Comet GT', color: 0xffd94d, top: 36 },
  cruiser: { name: 'Harbor Cruiser', color: 0x2ee8ff, top: 30 },
  sedan: { name: 'Bay Sedan', color: 0xe8e8e8, top: 28 },
  taxi: { name: 'Neon Cab', color: 0xffc21c, top: 28 },
  police: { name: 'NBPD Interceptor', color: 0x223344, top: 33 },
};

/**
 * Six linked story missions. Each step is one objective; the game walks the
 * player through them in order and pays the reward when the last step lands.
 * step.type: goto (walk/drive to a marker) | steal (enter the named car) |
 * deliver (reach the marker before the timer ends) | evade (stay alive with
 * the wanted level for the timer) | eliminate (drop every rival in the area).
 */
export const MISSIONS = [
  {
    id: 'first-light',
    title: '1 — First Light',
    intro: [
      'Lena: Mara, you made it. The crew is waiting at the old hideout.',
      'Lena: Take my cruiser and drive me there. Easy money, easy night.',
    ],
    reward: 500,
    steps: [
      { type: 'goto', pos: [-35, 0, 105], radius: 6, text: 'Meet Lena at the pier road' },
      { type: 'drive', pos: [105, 0, -105], radius: 8, text: 'Drive Lena to the hideout' },
    ],
  },
  {
    id: 'hot-wheels',
    title: '2 — Hot Wheels',
    intro: [
      'Dario: That gold Comet GT by the marina? Vic Strand owns it. Not anymore.',
      'Dario: Steal it and bring it to my garage. Quietly. Or loudly. Your call.',
    ],
    reward: 900,
    steps: [
      { type: 'steal', car: 'comet', pos: [-105, 0, 175], radius: 5, text: 'Steal the gold Comet GT' },
      { type: 'drive', pos: [35, 0, -35], radius: 8, text: 'Deliver it to Dario\'s garage' },
    ],
  },
  {
    id: 'the-drop',
    title: '3 — The Drop',
    intro: [
      'Pip: Package for the docks. Ninety seconds. The cops are already twitchy.',
      'Pip: Do not stop. Do not scratch the paint. Okay, scratch it a little.',
    ],
    reward: 1200,
    steps: [
      { type: 'deliver', pos: [-175, 0, -175], radius: 8, time: 90, text: 'Deliver the package to the docks — 90s' },
    ],
  },
  {
    id: 'heat-wave',
    title: '4 — Heat Wave',
    intro: [
      'Lena: Three stars, Mara. The whole NBPD is awake.',
      'Lena: Stay out of their hands for sixty seconds and the heat dies down.',
    ],
    reward: 1000,
    startWanted: 3,
    steps: [
      { type: 'evade', time: 60, text: 'Lose the cops — survive 60 seconds' },
    ],
  },
  {
    id: 'harbor-lights',
    title: '5 — Harbor Lights',
    intro: [
      'Dario: Vic\'s crew is waiting at the harbor. Six of them.',
      'Dario: You wanted a war, Mara. Here it is. Drop them all.',
    ],
    reward: 2000,
    steps: [
      { type: 'goto', pos: [-105, 0, -175], radius: 8, text: 'Reach the harbor with Dario' },
      { type: 'eliminate', count: 6, pos: [-105, 0, -175], radius: 26, text: 'Drop all 6 of Vic\'s crew' },
    ],
  },
  {
    id: 'neon-reign',
    title: '6 — Neon Reign',
    intro: [
      'Lena: Meridian Tower. Vic is on the roof, and the city is watching.',
      'Lena: End it tonight, Mara. Neon Bay is ours.',
    ],
    reward: 5000,
    startWanted: 2,
    steps: [
      { type: 'goto', pos: [0, 0, 0], radius: 10, text: 'Reach Meridian Tower' },
      { type: 'eliminate', count: 4, pos: [0, 0, 0], radius: 22, text: 'Clear the rooftop guards' },
      { type: 'goto', pos: [0, 0, 0], radius: 20, text: 'Take the tower plaza — Neon Bay is yours' },
    ],
  },
];

// NEON BAY — configuration and shared state.
// All values are authored here; the game reads them from NB.config.

var NB = window.NB || {};
NB.config = {
  // World layout (units are metres; the city is a road grid).
  cityHalf: 210,            // city spans -210 .. 210 on X and Z
  roadSpacing: 60,          // distance between parallel roads
  roadHalfWidth: 7,         // half the width of a road surface
  blockInset: 11,           // buildings stay this far inside a block
  beachX: -228,             // sand strip starts here (west edge)
  oceanX: -252,             // open water starts here
  harborZ: 150,             // harbour district is south of this line
  downtownR: 95,            // tall towers live within this radius of centre
  casinoPos: { x: 150, z: -150 },

  // Player.
  playerWalkSpeed: 7,
  playerRunSpeed: 12,
  playerHealth: 100,
  playerStartMoney: 500,
  playerRadius: 0.7,

  // Cars.
  carAccel: 16,
  carBrake: 30,
  carMaxSpeed: 34,
  carMaxReverse: 10,
  carTurnRate: 1.9,
  carHandbrake: 0.86,
  trafficCount: 14,
  trafficSpeed: 9,

  // Police / wanted.
  maxWanted: 5,
  wantedDecayDist: 130,     // stars start decaying when no police this close
  wantedDecayTime: 9,       // seconds at safe distance to lose one star
  policeByStars: [0, 2, 3, 4, 5, 6],
  bustDist: 4.5,            // a police car this close on foot starts a bust
  bustTime: 3.0,            // seconds to get busted once the timer starts

  // Combat.
  punchDamage: 25,
  punchRange: 2.2,
  punchCooldown: 0.45,
  pistolDamage: 34,
  pistolRange: 55,
  pistolCooldown: 0.28,
  pistolStartAmmo: 48,
  thugHealth: 60,
  vicHealth: 260,

  // Missions.
  missionReward: [200, 500, 800, 1000, 1200, 2000],
  chaseSurviveTime: 60,

  // Look.
  duskSky: 0x232a4d,
  fogNear: 90,
  fogFar: 460,
  sunColor: 0xff9a4d,
  sunIntensity: 1.15,
  hemiSky: 0x8a7fd6,
  hemiGround: 0x2a1e2e,
  hemiIntensity: 0.75,
};

NB.state = {
  mode: "menu",          // menu | playing | paused | complete | failed | over | finale
  money: 500,
  wanted: 0,
  health: 100,
  ammo: 0,
  hasPistol: false,
  missionIndex: 0,
  paused: false,
  muted: false,
  time: 0,
  playTime: 0,
  kills: 0,
  carsStolen: 0,
};

NB.flags = {
  shot: null,            // ?shot=cover|play|mission|complete
  selftest: false,       // ?selftest=1
};

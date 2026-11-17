// Staged scenes for the screenshots. Each one puts the real game into a
// fixed state, steps the sim forward a fixed number of frames from the
// seeded RNG, and lets main.js paint it twice. No fake scenery: the cover
// is the real chase, the title is the real title screen over the real city.

import { SCREEN_TITLE } from './render.js';

function setCam(renderer, yaw, pitch, dist, target) {
  renderer.cam.yaw = yaw;
  renderer.cam.pitch = pitch;
  renderer.cam.dist = dist;
  renderer.cam.tx = target.x;
  renderer.cam.ty = target.y + 2;
  renderer.cam.tz = target.z;
  renderer.updateCamera(1, { x: target.x, y: target.y + 2, z: target.z }, yaw, false);
}

function stepSim(G, world, vehicles, missions, n, chaseX, chaseZ) {
  for (let i = 0; i < n; i += 1) {
    G.time += 1 / 60;
    vehicles.updateTraffic(1 / 60);
    world.update(1 / 60, G.time);
    vehicles.updatePolice(1 / 60, chaseX || 0, chaseZ || 0, false, () => {});
  }
}

export function stageShot(name, ctx) {
  const { world, vehicles, player, missions, renderer, G } = ctx;
  const p = player.state;
  G.mode = 'play';
  G.feed = [];
  G.wanted = 0;
  G.time = 120; // late afternoon, long shadows

  if (name === 'start') {
    // the title screen over the sunset city
    setCam(renderer, 0.9, 0.42, 110, { x: 0, y: 8, z: 60 });
    stepSim(G, world, vehicles, missions, 90);
    return SCREEN_TITLE;
  }

  if (name === 'play') {
    // Mara on foot on the pier road, traffic and pedestrians around her
    p.x = -35; p.z = 150; p.y = 0; p.vy = 0; p.yaw = Math.PI;
    p.mesh.position.set(p.x, 0, p.z);
    p.mesh.rotation.y = p.yaw;
    G.cash = 250;
    missions.startMission(0);
    G.feed = [
      'Lena: "Comet GT. Gold. Worth a fortune."',
      'Mara: "Then we take it before Strand does."',
    ];
    stepSim(G, world, vehicles, missions, 120);
    setCam(renderer, Math.PI + 0.25, 0.3, 10, { x: p.x, y: 1.6, z: p.z });
    return 'play';
  }

  if (name === 'cover') {
    // the chase: Mara in the gold Comet GT, 3 stars, two interceptors behind
    const comet = vehicles.cars.find((c) => c.tag === 'comet');
    comet.kind = 'player';
    comet.x = 35; comet.z = 140; comet.yaw = Math.PI; comet.speed = 16;
    comet.group.position.set(comet.x, 0, comet.z);
    comet.group.rotation.y = comet.yaw;
    p.car = comet;
    p.mesh.visible = false;
    p.x = comet.x; p.z = comet.z;
    G.wanted = 3;
    G.cash = 1250;
    missions.startMission(3);
    G.feed = [
      'Lena: "Three stars! Lose them before the docks."',
      'Vic Strand: "You cannot outrun the city, Voss."',
    ];
    vehicles.spawnPoliceNear(comet.x - 5, comet.z + 8);
    vehicles.spawnPoliceNear(comet.x + 5, comet.z + 12);
    stepSim(G, world, vehicles, missions, 90, comet.x, comet.z);
    // frame the chase: the interceptors pull up on either side of the Comet,
    // light bars on, right where the camera can see them
    const cops = vehicles.police;
    const flanks = [[-6, 3], [5, 5]];
    for (let i = 0; i < cops.length && i < flanks.length; i += 1) {
      cops[i].x = comet.x + flanks[i][0];
      cops[i].z = comet.z + flanks[i][1];
      cops[i].yaw = Math.PI;
      cops[i].speed = 0;
      cops[i].group.position.set(cops[i].x, 0, cops[i].z);
      cops[i].group.rotation.y = Math.PI;
    }
    setCam(renderer, Math.PI + 0.15, 0.28, 13, { x: comet.x, y: 1.5, z: comet.z });
    return 'play';
  }

  if (name === 'end') {
    // the tower plaza at dusk, the crew's job done, the city hers — Mara in
    // the south-east corner of the plaza, the tower rising behind her
    p.x = 18; p.z = 32; p.y = 0; p.vy = 0; p.yaw = Math.PI * 0.25;
    p.mesh.position.set(p.x, 0, p.z);
    p.mesh.rotation.y = p.yaw;
    G.cash = 6750;
    G.wanted = 0;
    missions.state.index = 6;
    missions.state.done = true;
    G.feed = [
      'Dario: "Six jobs. Zero arrests. The Bay is ours."',
      'Mara: "Neon Bay never stood a chance."',
    ];
    stepSim(G, world, vehicles, missions, 90);
    setCam(renderer, Math.PI * 1.25, 0.28, 15, { x: 18, y: 1.5, z: 32 });
    renderer.banner('NEON REIGN', 'All six missions done — Neon Bay is yours.');
    return 'play';
  }

  return SCREEN_TITLE;
}

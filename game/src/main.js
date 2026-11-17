// NEON BAY — boot and the one loop. Input is read every frame, the world
// advances in fixed 1/60 s steps, and the renderer paints what is there.
// Modes: title, play, paused, busted, complete. ?shot=cover|start|play|end
// (with &seed=N) stages that scene instead of running the loop, paints it
// twice and sets window.__shotReady for a screenshot.

import { CAR, MISSIONS, PLAYER, POLICE, SAVE_KEY, STEP, WANTED } from './config.js';
import { createRandom } from './random.js';
import { createWorld } from './world.js';
import { createVehicles } from './vehicles.js';
import { createPlayer } from './player.js';
import { createMissions } from './missions.js';
import { createAudio } from './audio.js';
import { ACTION_CONFIRM, ACTION_ENTER, ACTION_MUTE, ACTION_PAUSE, createInput } from './input.js';
import { SCREEN_BUSTED, SCREEN_COMPLETE, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, createRenderer } from './render.js';
import { stageShot } from './shots.js';

const THREE = window.THREE;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : 1;

const canvas = document.getElementById('game');
const status = document.getElementById('status');

function el(id) {
  return document.getElementById(id);
}

const hud = {
  hud: el('hud'),
  cash: el('cash'),
  healthFill: el('health-fill'),
  stars: el('stars'),
  objective: el('objective'),
  speed: el('speed'),
  prompt: el('prompt'),
  feed: el('feed'),
  minimap: el('minimap'),
  arrow: el('arrow'),
  arrowLabel: el('arrow-label'),
  banner: el('banner'),
  bannerText: el('banner-text'),
  bannerSub: el('banner-sub'),
  crosshair: el('crosshair'),
  screens: {
    title: el('title-screen'),
    paused: el('pause-screen'),
    busted: el('busted-screen'),
    complete: el('complete-screen'),
  },
};

if (!THREE) {
  status.textContent = 'NEON BAY needs three.js, which did not load.';
  throw new Error('THREE missing');
}

const rng = createRandom(seed);
const renderer = createRenderer(canvas, hud);
const world = createWorld(renderer.scene, rng);
const vehicles = createVehicles(renderer.scene, rng, world.collide);
const player = createPlayer(renderer.scene, -35, 175);
player.state.yaw = Math.PI; // face north, up the pier road toward the first job
player.state.mesh.rotation.y = Math.PI;
const missions = createMissions(renderer.scene, rng);
const audio = createAudio();
const input = createInput(canvas);

function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

const save = loadSave() || { cash: 250, missionIndex: 0, earned: 0 };

const G = {
  mode: SCREEN_TITLE,
  time: 0,
  cash: save.cash,
  earned: save.earned || 0,
  wanted: 0,
  wantedTimer: 0,
  policeTimer: 0,
  bustTimer: 0,
  fireTimer: 0,
  shotCrimeTimer: 0,
  pedCrimeTimer: 0,
  saveTimer: 0,
  nextMissionTimer: 0,
  feed: [],
  prompt: '',
  raycaster: new THREE.Raycaster(),
};

function say(line) {
  G.feed.push(line);
  if (G.feed.length > 6) G.feed.shift();
}

function saveGame(flash) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({
      cash: G.cash, missionIndex: missions.state.index, earned: G.earned,
    }));
  } catch {
    // storage off: the save lasts this visit only
  }
  if (flash) {
    const s = el('saved');
    s.classList.add('show');
    window.setTimeout(() => s.classList.remove('show'), 1400);
  }
}

function addWanted(n) {
  G.wanted = Math.min(WANTED.max, G.wanted + n);
  G.wantedTimer = 0;
}

function clearPolice() {
  for (const car of [...vehicles.police]) vehicles.removePolice(car);
}

function startMission(index) {
  const m = missions.startMission(index);
  if (!m) return;
  if (m.startWanted) addWanted(m.startWanted);
  for (const line of m.intro) say(line);
}

function completeMission(m) {
  G.cash += m.reward;
  G.earned += m.reward;
  renderer.banner('MISSION COMPLETE', `${m.title} — +$${m.reward.toLocaleString('en-US')}`);
  audio.sting();
  audio.cash();
  saveGame(true);
  G.nextMissionTimer = 2.5;
}

function failMission() {
  renderer.banner('MISSION FAILED', 'Back to the start of this job.');
  audio.fail();
  missions.failMission();
  const m = missions.current();
  if (m && m.startWanted) addWanted(m.startWanted);
}

function goBusted(reason) {
  G.mode = SCREEN_BUSTED;
  const fine = Math.min(G.cash, 200);
  G.cash -= fine;
  clearPolice();
  G.wanted = 0;
  G.bustTimer = 0;
  player.state.health = PLAYER.health;
  renderer.showScreen(SCREEN_BUSTED);
  el('busted-text').textContent = reason === 'health'
    ? `Mara is down. The NBPD takes $${fine} and drops her at the pier.`
    : `Busted. The NBPD takes $${fine} and drops Mara at the pier.`;
  audio.fail();
  saveGame(false);
}

function respawn() {
  const p = player.state;
  if (p.car) {
    p.car.kind = 'parked';
    p.car = null;
    p.mesh.visible = true;
  }
  p.x = -35;
  p.z = 175;
  p.y = 0;
  p.vy = 0;
  p.health = PLAYER.health;
  p.mesh.position.set(p.x, 0, p.z);
  missions.failMission();
  G.mode = SCREEN_PLAY;
  renderer.showScreen(SCREEN_PLAY);
}

function startGame() {
  audio.unlock();
  G.mode = SCREEN_PLAY;
  // pull the camera in from the wide title backdrop to a chase view, snapped
  // onto Mara so the first play frame is already framed on her
  renderer.cam.dist = 9;
  renderer.cam.pitch = 0.34;
  renderer.cam.yaw = player.state.yaw;
  renderer.cam.tx = player.state.x;
  renderer.cam.ty = player.state.y + 2;
  renderer.cam.tz = player.state.z;
  renderer.showScreen(SCREEN_PLAY);
  if (!missions.state.started) {
    if (save.missionIndex >= MISSIONS.length) {
      // story already done in a past visit: free roam, no mission
      missions.state.started = true;
      missions.state.done = true;
      missions.state.index = MISSIONS.length;
      say('Neon Bay is yours. Free roam — the city remembers you.');
    } else {
      startMission(Math.min(save.missionIndex, MISSIONS.length - 1));
    }
  }
  say('Mara Voss — Neon Bay. The city is yours to take.');
}

function shoot() {
  const p = player.state;
  const from = new THREE.Vector3(p.x, p.y + 1.5, p.z);
  if (p.car) from.set(p.car.x, 1.6, p.car.z);
  G.raycaster.setFromCamera({ x: 0, y: 0 }, renderer.camera);
  G.raycaster.far = 70;
  const targets = [];
  for (const r of missions.rivals) targets.push(r.mesh);
  for (const c of vehicles.police) targets.push(c.group);
  for (const c of vehicles.cars) {
    if (c.kind === 'traffic' && !c.disabled) targets.push(c.group);
  }
  const hits = G.raycaster.intersectObjects(targets, true);
  let end = null;
  if (hits.length) {
    const hit = hits[0];
    end = hit.point.clone();
    // walk up to the group we own (rival or car) — the scene owns the rest
    let owner = hit.object;
    while (owner && owner.parent && owner.parent !== renderer.scene) owner = owner.parent;
    const rival = missions.rivals.find((r) => r.mesh === owner);
    if (rival) {
      const dropped = missions.hitRival(rival);
      if (dropped) {
        G.cash += 50;
        say('Rival down. +$50.');
        audio.cash();
      }
    } else {
      const car = vehicles.cars.find((c) => c.group === owner);
      if (car) {
        car.health -= 1;
        if (car.health <= 0 && !car.disabled) {
          car.disabled = true;
          car.speed = 0;
          if (car.kind === 'police') {
            addWanted(1);
            say('Interceptor disabled.');
          }
        }
      }
    }
  } else {
    end = G.raycaster.ray.at(60, new THREE.Vector3());
  }
  renderer.fireTracer(from, end);
  audio.shot();
  if (G.shotCrimeTimer <= 0) {
    addWanted(WANTED.shootStars);
    G.shotCrimeTimer = 10;
  }
}

function enterOrExitCar() {
  const p = player.state;
  if (p.car) {
    const car = p.car;
    car.kind = 'parked';
    car.speed = 0;
    p.car = null;
    p.x = car.x + Math.cos(car.yaw + Math.PI / 2) * 3;
    p.z = car.z + Math.sin(car.yaw + Math.PI / 2) * 3;
    p.mesh.visible = true;
    p.mesh.position.set(p.x, 0, p.z);
    return;
  }
  const car = vehicles.nearestStealable(p.x, p.z, 4.5);
  if (!car) return;
  const wasTraffic = car.kind === 'traffic';
  car.kind = 'player';
  p.car = car;
  p.mesh.visible = false;
  p.x = car.x;
  p.z = car.z;
  if (wasTraffic) {
    addWanted(WANTED.stealStars);
    say('You stole a car! The NBPD noticed.');
  } else {
    say(`You took the ${car.name}.`);
  }
  audio.pickup();
}

function step(dt) {
  G.time += dt;
  const p = player.state;

  // --- input ---
  const actions = input.takeActions();
  if (actions & ACTION_MUTE) {
    const muted = audio.toggleMute();
    say(muted ? 'Sound off. (M to turn it back on)' : 'Sound on.');
  }
  if (G.mode === SCREEN_TITLE) {
    if (actions & ACTION_CONFIRM) startGame();
    return;
  }
  if (G.mode === SCREEN_PAUSED) {
    if (actions & ACTION_PAUSE || actions & ACTION_CONFIRM) {
      G.mode = SCREEN_PLAY;
      renderer.showScreen(SCREEN_PLAY);
    }
    return;
  }
  if (G.mode === SCREEN_BUSTED) {
    if (actions & ACTION_CONFIRM) respawn();
    return;
  }
  if (G.mode === SCREEN_COMPLETE) {
    if (actions & ACTION_CONFIRM) {
      G.mode = SCREEN_PLAY;
      renderer.showScreen(SCREEN_PLAY);
    }
    return;
  }
  if (actions & ACTION_PAUSE) {
    G.mode = SCREEN_PAUSED;
    renderer.showScreen(SCREEN_PAUSED);
    return;
  }
  if (actions & ACTION_ENTER) enterOrExitCar();

  // --- camera orbit + zoom ---
  const mouse = input.takeMouse();
  renderer.cam.yaw -= mouse.dx * 0.005;
  renderer.cam.pitch = Math.max(0.08, Math.min(1.1, renderer.cam.pitch + mouse.dy * 0.004));
  renderer.cam.dist = Math.max(5, Math.min(16, renderer.cam.dist * (1 + mouse.wheel * 0.001)));

  // --- movement ---
  if (p.car) {
    const d = input.drive();
    vehicles.drive(p.car, d, dt, (spd) => {
      if (spd > 14) audio.crash();
    });
    p.x = p.car.x;
    p.z = p.car.z;
    // run over pedestrians
    const hit = world.knockPedAt(p.car.x, p.car.z, 2.6);
    if (hit && Math.abs(p.car.speed) > 5 && G.pedCrimeTimer <= 0) {
      addWanted(WANTED.hitPedStars);
      G.pedCrimeTimer = 5;
      say('You hit a pedestrian! The city saw that.');
      audio.crash();
    }
    // bump traffic cars
    for (const c of vehicles.cars) {
      if (c.kind !== 'traffic' || c === p.car) continue;
      const dx = c.x - p.car.x;
      const dz = c.z - p.car.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 4.2 && dist > 0.01) {
        c.x += (dx / dist) * (4.2 - dist);
        c.z += (dz / dist) * (4.2 - dist);
        c.group.position.set(c.x, 0, c.z);
        if (Math.abs(p.car.speed) > 10) p.car.speed *= 0.8;
      }
    }
    audio.engine(Math.abs(p.car.speed) / p.car.top, d.fwd ? 1 : 0, true);
  } else {
    player.update(dt, input.move(), renderer.cam.yaw, world.collide);
    audio.engine(0, 0, false);
    if (p.health < PLAYER.health) p.health = Math.min(PLAYER.health, p.health + dt * 1.5);
  }

  // --- shooting (on foot or from the car window) ---
  G.fireTimer -= dt;
  if (input.firing && G.fireTimer <= 0 && !p.car) {
    G.fireTimer = 0.28;
    shoot();
  }

  // --- wanted level ---
  if (G.wanted > 0) {
    G.wantedTimer += dt;
    G.policeTimer -= dt;
    if (G.policeTimer <= 0) {
      const want = Math.min(G.wanted, WANTED.maxPolice);
      if (vehicles.police.length < want) {
        vehicles.spawnPoliceNear(p.x, p.z);
        G.policeTimer = 2;
      }
    }
    let nearCop = false;
    for (const c of vehicles.police) {
      if (Math.hypot(c.x - p.x, c.z - p.z) < 45) nearCop = true;
    }
    if (!nearCop && G.wantedTimer > WANTED.decaySeconds) {
      G.wanted -= 1;
      G.wantedTimer = 0;
      if (G.wanted === 0) say('The heat dies down. You are clear.');
    }
  }
  const sirens = vehicles.police.some((c) => !c.disabled);
  audio.siren(sirens && G.wanted > 0);
  let busting = false;
  vehicles.updatePolice(dt, p.x, p.z, !!p.car, (car, dist) => {
    if (p.car) {
      // rammed: the player's car takes the hit, Mara takes some of it
      if (player.hurt(POLICE.ramDamage * dt * 0.4)) {
        if (p.health <= 0) goBusted('health');
      }
    } else if (G.wanted >= 3) {
      busting = true;
      G.bustTimer += dt;
      if (G.bustTimer > POLICE.bustSeconds) goBusted('busted');
    }
  });
  if (!busting) G.bustTimer = 0;
  if (p.health <= 0 && G.mode === SCREEN_PLAY) goBusted('health');

  // --- traffic, pedestrians, missions ---
  vehicles.updateTraffic(dt);
  world.update(dt, G.time);
  const missionResult = missions.update(dt, {
    x: p.x,
    z: p.z,
    inCar: !!p.car,
    inComet: p.car && p.car.tag === 'comet',
    wanted: G.wanted,
    hurtPlayer: (n) => {
      if (player.hurt(n) && p.health <= 0) goBusted('health');
    },
    onShot: (rival, tx, tz) => {
      renderer.fireTracer(
        new THREE.Vector3(rival.x, 1.5, rival.z),
        new THREE.Vector3(tx, 1.4, tz),
      );
      audio.shot();
    },
  });
  if (missionResult === 'mission-complete') {
    completeMission(missions.state.completedMission || missions.current());
  } else if (missionResult === 'story-complete') {
    const m = MISSIONS[MISSIONS.length - 1];
    G.cash += m.reward;
    G.earned += m.reward;
    saveGame(true);
    G.mode = SCREEN_COMPLETE;
    el('final-stats').textContent = `All six missions done. $${G.earned.toLocaleString('en-US')} earned in Neon Bay.`;
    renderer.showScreen(SCREEN_COMPLETE);
    audio.sting();
  } else if (missionResult === 'failed') {
    failMission();
  }
  if (G.nextMissionTimer > 0) {
    G.nextMissionTimer -= dt;
    if (G.nextMissionTimer <= 0 && missions.state.index < MISSIONS.length && !missions.state.active) {
      startMission(missions.state.index);
    }
  }

  // --- timers, autosave ---
  G.shotCrimeTimer -= dt;
  G.pedCrimeTimer -= dt;
  G.saveTimer += dt;
  if (G.saveTimer > 12) {
    G.saveTimer = 0;
    saveGame(false);
  }

  // --- HUD ---
  const marker = missions.markerPos();
  const m = missions.current();
  renderer.setBeacon(marker ? marker.x : 0, marker ? marker.z : 0, !!marker && G.mode === SCREEN_PLAY, G.time);
  renderer.drawHud({
    cash: G.cash,
    health: p.health,
    wanted: G.wanted,
    objective: m ? missions.objectiveText() : missions.objectiveText(),
    driving: !!p.car,
    speedKmh: p.car ? Math.abs(p.car.speed) * 3.6 : 0,
    carName: p.car ? p.car.name : '',
    prompt: p.car ? 'E — get out · W/S — drive · mouse — look' : (vehicles.nearestStealable(p.x, p.z, 4.5) ? 'E — take this car' : 'WASD — move · Shift — run · click — shoot'),
    feed: G.feed,
    time: G.time,
    px: p.x,
    pz: p.z,
    pyaw: p.car ? p.car.yaw : p.yaw,
    marker,
    markerWorld: marker ? new THREE.Vector3(marker.x, 12, marker.z) : null,
    trafficDots: vehicles.cars.filter((c) => c.kind === 'traffic'),
    policeDots: vehicles.police,
    rivalDots: missions.rivals,
  });
  renderer.updateFx(dt);
  renderer.updateCamera(dt, p.car ? { x: p.car.x, y: 1.5, z: p.car.z } : { x: p.x, y: p.y + 1.6, z: p.z }, p.car ? p.car.yaw : renderer.cam.yaw, !!p.car);
}

function runShot(name) {
  const scene = stageShot(name, {
    rng, world, vehicles, player, missions, renderer, audio, G, save,
  });
  let painted = 0;
  function paint() {
    renderer.drawHud({
      cash: G.cash,
      health: player.state.health,
      wanted: G.wanted,
      objective: missions.objectiveText(),
      driving: !!player.state.car,
      speedKmh: player.state.car ? Math.abs(player.state.car.speed) * 3.6 : 0,
      carName: player.state.car ? player.state.car.name : '',
      prompt: '',
      feed: G.feed,
      time: G.time,
      px: player.state.x,
      pz: player.state.z,
      pyaw: player.state.car ? player.state.car.yaw : player.state.yaw,
      marker: missions.markerPos(),
      markerWorld: missions.markerPos() ? new THREE.Vector3(missions.markerPos().x, 12, missions.markerPos().z) : null,
      trafficDots: vehicles.cars.filter((c) => c.kind === 'traffic'),
      policeDots: vehicles.police,
      rivalDots: missions.rivals,
    });
    renderer.render();
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  if (scene === SCREEN_TITLE) {
    renderer.showScreen(SCREEN_TITLE);
  } else {
    renderer.showScreen(SCREEN_PLAY);
  }
  requestAnimationFrame(paint);
}

let acc = 0;
let lastNow = 0;
function frame(now) {
  requestAnimationFrame(frame);
  if (G.mode === SCREEN_PAUSED) {
    renderer.render();
    return;
  }
  // fixed-step accumulator: the game keeps real time even where the renderer
  // is slow (software WebGL), up to four steps a frame, then it drops the
  // backlog rather than spiralling.
  const dt = Math.min(0.1, (now - lastNow) / 1000 || 0);
  lastNow = now;
  acc += dt;
  let n = 0;
  while (acc >= STEP && n < 4) {
    step(STEP);
    acc -= STEP;
    n += 1;
  }
  if (n === 4) acc = 0;
  renderer.render();
}

// The title screen's backdrop: the camera drifts over the bay while the city waits.
renderer.cam.yaw = 0.6;
renderer.cam.pitch = 0.5;
renderer.cam.dist = 90;
renderer.cam.tx = 0;
renderer.cam.ty = 10;
renderer.cam.tz = 40;
renderer.showScreen(SCREEN_TITLE);
status.textContent = 'NEON BAY. Click or press Space to play.';

if (shot) {
  runShot(shot);
} else {
  requestAnimationFrame(frame);
}

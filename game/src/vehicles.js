// Re-authored in the r3 rebuild session (2026-11-18).
// Every car in Neon Bay: the player's ride, traffic that loops the road grid,
// parked cars to steal, and the NBPD interceptors that chase a wanted player.
// Arcade physics — no real engine here, just speed, steering and grip that
// feel right from a chase camera.

import { CAR, CARS, POLICE, WANTED } from './config.js';
import { ROADS } from './world.js';

const THREE = window.THREE;

export function makeCarMesh(color, isPolice) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x18222e });
  const body = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.85, 2), bodyMat);
  body.position.y = 0.65;
  group.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.7, 1.8), glassMat);
  cabin.position.set(-0.2, 1.35, 0);
  group.add(cabin);
  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.3, 10);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x14161a });
  const wheels = [];
  for (const [wx, wz] of [[1.5, 0.95], [1.5, -0.95], [-1.5, 0.95], [-1.5, -0.95]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.x = Math.PI / 2;
    w.position.set(wx, 0.42, wz);
    group.add(w);
    wheels.push(w);
  }
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  for (const wz of [0.6, -0.6]) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.25, 0.4), lightMat);
    l.position.set(2.22, 0.7, wz);
    group.add(l);
  }
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2a2a });
  for (const wz of [0.6, -0.6]) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.25, 0.4), tailMat);
    l.position.set(-2.22, 0.7, wz);
    group.add(l);
  }
  if (isPolice) {
    const barMat = new THREE.MeshBasicMaterial({ color: 0xff2a2a });
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.18, 0.5), barMat);
    bar.position.set(-0.2, 1.85, 0);
    group.add(bar);
    group.userData.lightBar = bar;
    const doorMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 0.05), doorMat);
    door.position.set(0, 0.7, 1.02);
    group.add(door);
  }
  return { group, wheels };
}

function roadPoint(rng) {
  return { x: rng.pick(ROADS), z: rng.pick(ROADS) };
}

export function createVehicles(scene, rng, collide) {
  const cars = []; // every car, traffic + parked + police + player
  const police = [];
  let lightTick = 0;

  function addCar(kind, x, z, yaw, color, name, top) {
    const { group, wheels } = makeCarMesh(color, kind === 'police');
    group.position.set(x, 0, z);
    group.rotation.y = yaw;
    scene.add(group);
    const car = {
      kind, group, wheels, x, z, yaw, speed: 0, color, name,
      top: top || 28, health: kind === 'police' ? 3 : 2,
      disabled: false, target: null, steer: 0, removed: false,
    };
    cars.push(car);
    return car;
  }

  // --- traffic: each loops the road grid via intersection waypoints ---
  const trafficColors = [0xe8e8e8, 0x4a6fa5, 0xc96a4a, 0x7ab87a, 0xd8d8d8, 0x8a6fa5];
  for (let i = 0; i < 10; i += 1) {
    const p = roadPoint(rng);
    const car = addCar('traffic', p.x, p.z, rng.pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]),
      trafficColors[i % trafficColors.length], 'Bay Sedan', 26);
    car.speed = rng.range(8, 12);
    car.target = roadPoint(rng);
    car.lane = 2.2;
  }

  // --- parked cars, including the gold Comet GT for mission 2 ---
  const parkedSpots = [
    { x: -105, z: 175, yaw: 0, def: CARS.comet, tag: 'comet' },
    { x: 35, z: -105, yaw: Math.PI / 2, def: CARS.sedan, tag: 'sedan' },
    { x: -35, z: 35, yaw: -Math.PI / 2, def: CARS.cruiser, tag: 'cruiser' },
    { x: 175, z: -35, yaw: Math.PI, def: CARS.taxi, tag: 'taxi' },
    { x: 105, z: 105, yaw: 0, def: CARS.sedan, tag: 'sedan2' },
  ];
  for (const s of parkedSpots) {
    const car = addCar('parked', s.x, s.z, s.yaw, s.def.color, s.def.name, s.def.top);
    car.tag = s.tag;
  }

  function nearestStealable(x, z, maxDist) {
    let best = null;
    let bestD = maxDist;
    for (const car of cars) {
      if (car.kind === 'police' || car.kind === 'player' || car.removed) continue;
      const dx = car.x - x;
      const dz = car.z - z;
      const d = Math.hypot(dx, dz);
      if (d < bestD) {
        bestD = d;
        best = car;
      }
    }
    return best;
  }

  function spawnPoliceNear(x, z) {
    if (police.length >= WANTED.maxPolice) return null;
    const angle = rng.range(0, Math.PI * 2);
    const px = Math.max(-175, Math.min(175, x + Math.cos(angle) * rng.range(55, 80)));
    const pz = Math.max(-175, Math.min(175, z + Math.sin(angle) * rng.range(55, 80)));
    const car = addCar('police', px, pz, 0, CARS.police.color, CARS.police.name, CARS.police.top);
    car.speed = 10;
    police.push(car);
    return car;
  }

  function removePolice(car) {
    scene.remove(car.group);
    car.removed = true;
    const i = police.indexOf(car);
    if (i !== -1) police.splice(i, 1);
    const j = cars.indexOf(car);
    if (j !== -1) cars.splice(j, 1);
  }

  /** Arcade driving for the car the player is in. input: {fwd, back, steer}. */
  function drive(car, input, dt, onCrash) {
    if (car.disabled) return;
    const fwd = input.fwd ? 1 : 0;
    const back = input.back ? 1 : 0;
    if (fwd) car.speed += CAR.accel * dt;
    if (back) car.speed -= (car.speed > 0.5 ? CAR.brake : CAR.reverseAccel) * dt;
    // drag + rolling resistance
    car.speed -= car.speed * 0.35 * dt;
    if (!fwd && !back) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 6 * dt);
    car.speed = Math.max(-CAR.maxReverse, Math.min(car.top, car.speed));
    const spd = Math.abs(car.speed);
    const steerAmount = input.steer * CAR.steer * Math.min(1, spd / 10 + 0.25) * (car.speed >= 0 ? 1 : -1);
    car.yaw += steerAmount * dt * (spd > 0.1 ? 1 : 0);
    const nx = car.x + Math.sin(car.yaw) * car.speed * dt;
    const nz = car.z + Math.cos(car.yaw) * car.speed * dt;
    const before = { x: car.x, z: car.z };
    car.x = nx;
    car.z = nz;
    collide(car, CAR.radius);
    const hit = Math.hypot(car.x - before.x, car.z - before.z) < Math.hypot(nx - before.x, nz - before.z) - 0.01;
    if (hit && spd > 12 && onCrash) onCrash(spd);
    if (hit) car.speed *= 0.55;
    car.group.position.set(car.x, 0, car.z);
    car.group.rotation.y = car.yaw;
    for (const w of car.wheels) w.rotation.y += 0; // wheels spin around their own axle below
    for (const w of car.wheels) w.rotation.z -= (car.speed * dt) / 0.42;
  }

  function updateTraffic(dt) {
    for (const car of cars) {
      if (car.kind !== 'traffic' || car.disabled) continue;
      if (!car.target) car.target = roadPoint(rng);
      const dx = car.target.x - car.x;
      const dz = car.target.z - car.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 4) {
        // pick a neighbouring intersection (not straight back)
        const options = [];
        for (const nx of [car.target.x - 70, car.target.x, car.target.x + 70]) {
          for (const nz of [car.target.z - 70, car.target.z, car.target.z + 70]) {
            if ((nx !== car.target.x) === (nz !== car.target.z)) continue; // one axis at a time
            if (nx < -175 || nx > 175 || nz < -175 || nz > 175) continue;
            if (Math.hypot(nx - car.x, nz - car.z) < 10) continue; // not back the way we came
            options.push({ x: nx, z: nz });
          }
        }
        car.target = options.length ? options[Math.floor(rng.next() * options.length)] : roadPoint(rng);
        continue;
      }
      const want = Math.atan2(dx, dz);
      let dy = want - car.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      car.yaw += Math.max(-2.2 * dt, Math.min(2.2 * dt, dy));
      car.x += Math.sin(car.yaw) * car.speed * dt;
      car.z += Math.cos(car.yaw) * car.speed * dt;
      car.group.position.set(car.x, 0, car.z);
      car.group.rotation.y = car.yaw;
      for (const w of car.wheels) w.rotation.z -= (car.speed * dt) / 0.42;
    }
  }

  function updatePolice(dt, playerX, playerZ, playerInCar, onRam) {
    lightTick += dt;
    for (const car of [...police]) {
      if (car.disabled) continue;
      const dx = playerX - car.x;
      const dz = playerZ - car.z;
      const dist = Math.hypot(dx, dz);
      const want = Math.atan2(dx, dz);
      let dy = want - car.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      car.yaw += Math.max(-3.2 * dt, Math.min(3.2 * dt, dy));
      car.speed = Math.min(POLICE.speed, car.speed + 14 * dt);
      car.x += Math.sin(car.yaw) * car.speed * dt;
      car.z += Math.cos(car.yaw) * car.speed * dt;
      collide(car, CAR.radius);
      car.group.position.set(car.x, 0, car.z);
      car.group.rotation.y = car.yaw;
      for (const w of car.wheels) w.rotation.z -= (car.speed * dt) / 0.42;
      // flashing light bar
      if (car.group.userData.lightBar) {
        car.group.userData.lightBar.material.color.setHex(Math.floor(lightTick * 2) % 2 ? 0xff2a2a : 0x2a6aff);
      }
      if (dist < 4.5 && onRam) onRam(car, dist);
    }
  }

  return {
    cars, police, addCar, nearestStealable, spawnPoliceNear, removePolice,
    drive, updateTraffic, updatePolice,
  };
}

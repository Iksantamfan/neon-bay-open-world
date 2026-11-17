// Re-authored in the r3 rebuild session (2026-11-18).
// The city itself: Neon Bay's streets, buildings, beach, palms, props and the
// pedestrians who walk its sidewalks. Built once from a seed, so the same seed
// always builds the same city. No drawing of the HUD here — render.js does that.

import { CITY, PALETTE } from './config.js';

const THREE = window.THREE;

/** Road centre lines on both axes. */
export const ROADS = [-175, -105, -35, 35, 105, 175];
/** Block centres on both axes. */
export const BLOCKS = [-140, -70, 0, 70, 140];

/** A canvas texture of lit windows, shared by every building. */
function windowTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#20242e';
  g.fillRect(0, 0, 128, 256);
  for (let y = 8; y < 248; y += 16) {
    for (let x = 8; x < 120; x += 16) {
      const lit = Math.random() < 0.55;
      g.fillStyle = lit ? (Math.random() < 0.7 ? '#ffd98a' : '#9fd8ff') : '#2c3340';
      g.fillRect(x, y, 10, 10);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.encoding = THREE.sRGBEncoding;
  return tex;
}

/** The ground: one big canvas texture — roads, sidewalks, blocks, beach. */
function groundTexture() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 1024;
  const g = c.getContext('2d');
  // world x in [-230, 230] -> px 0..1024 ; world z in [-230, 270] -> py 0..1024
  const px = (x) => ((x + 230) / 460) * 1024;
  const py = (z) => ((z + 230) / 500) * 1024;
  g.fillStyle = '#878d95'; // block concrete
  g.fillRect(0, 0, 1024, 1024);
  // beach: everything south of the coast
  g.fillStyle = PALETTE.sand;
  g.fillRect(0, py(CITY.coastZ), 1024, 1024 - py(CITY.coastZ));
  // roads (vertical ones run to the coast; horizontal ones span the city)
  g.fillStyle = PALETTE.asphalt;
  for (const r of ROADS) {
    g.fillRect(px(r - CITY.road / 2), 0, px(CITY.road) - px(0), py(CITY.coastZ) - py(-230));
    g.fillRect(0, py(r - CITY.road / 2), 1024, py(CITY.road) - py(0));
  }
  // centre dashes, skipped where a crossing road meets this one
  const nearRoad = (d) => ROADS.some((r) => Math.abs(d - r) < 10);
  g.fillStyle = '#e8d44d';
  for (const r of ROADS) {
    for (let d = -220; d < 220; d += 16) {
      if (nearRoad(d)) continue;
      g.fillRect(px(d) - 2, py(r) - 1, 5, 2);
      g.fillRect(px(r) - 1, py(d) - 2, 2, 5);
    }
  }
  // sidewalks: lighter borders around every block
  g.fillStyle = PALETTE.sidewalk;
  for (const bx of BLOCKS) {
    for (const bz of BLOCKS) {
      g.strokeStyle = '#aab0b8';
      g.lineWidth = 6;
      g.strokeRect(px(bx - 27), py(bz - 27), px(54) - px(0), py(54) - py(0));
    }
  }
  // crosswalks at every intersection
  g.fillStyle = '#e8e8e8';
  for (const rx of ROADS) {
    for (const rz of ROADS) {
      for (let i = -3; i <= 3; i += 1) {
        g.fillRect(px(rx + i * 2) - 1, py(rz - 9), 2, 4);
        g.fillRect(px(rx + i * 2) - 1, py(rz + 5), 2, 4);
        g.fillRect(px(rx - 9), py(rz + i * 2) - 1, 4, 2);
        g.fillRect(px(rx + 5), py(rz + i * 2) - 1, 4, 2);
      }
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.encoding = THREE.sRGBEncoding;
  tex.anisotropy = 4;
  return tex;
}

function makePalm() {
  const group = new THREE.Group();
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6b48 });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x2f8f4f });
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, 5.5, 6), trunkMat);
  trunk.position.y = 2.75;
  trunk.rotation.z = 0.08;
  group.add(trunk);
  for (let i = 0; i < 6; i += 1) {
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.7, 3.2, 4), leafMat);
    const a = (i / 6) * Math.PI * 2;
    leaf.position.set(Math.cos(a) * 1.1, 5.6, Math.sin(a) * 1.1);
    leaf.rotation.z = Math.cos(a) * 1.1;
    leaf.rotation.x = -Math.sin(a) * 1.1;
    group.add(leaf);
  }
  return group;
}

function makePedestrian(shirt) {
  const group = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: 0xd9a986 });
  const shirtMat = new THREE.MeshLambertMaterial({ color: shirt });
  const pantsMat = new THREE.MeshLambertMaterial({ color: 0x2c3242 });
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.8, 0.22), pantsMat);
  legL.position.set(-0.14, 0.4, 0);
  const legR = legL.clone();
  legR.position.x = 0.14;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.7, 0.34), shirtMat);
  torso.position.y = 1.15;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), skin);
  head.position.y = 1.72;
  group.add(legL, legR, torso, head);
  group.userData.legL = legL;
  group.userData.legR = legR;
  return group;
}

export function createWorld(scene, rng) {
  const colliders = [];
  const peds = [];
  const winTex = windowTexture();

  // --- ground, beach and water ---
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(460, 500),
    new THREE.MeshLambertMaterial({ map: groundTexture() }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, 20);
  scene.add(ground);

  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(900, 320),
    new THREE.MeshLambertMaterial({ color: PALETTE.water, transparent: true, opacity: 0.92 }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, -0.4, 370);
  scene.add(water);

  // --- buildings ---
  const downtown = (bx, bz) => Math.max(0, 1 - (Math.abs(bx) + Math.abs(bz)) / 280);
  let towerTop = null;
  for (const bx of BLOCKS) {
    for (const bz of BLOCKS) {
      if (bx === 0 && bz === 0) {
        // Meridian Tower: the city's landmark, glass and neon crown.
        const h = 96;
        const tower = new THREE.Mesh(
          new THREE.BoxGeometry(30, h, 30),
          new THREE.MeshLambertMaterial({
            color: 0x9fd4e8,
            map: winTex,
            emissive: 0x6688aa,
            emissiveMap: winTex,
            emissiveIntensity: 0.5,
          }),
        );
        tower.position.set(0, h / 2, 0);
        scene.add(tower);
        const crown = new THREE.Mesh(
          new THREE.BoxGeometry(32, 2.5, 32),
          new THREE.MeshBasicMaterial({ color: 0xff4fd8 }),
        );
        crown.position.set(0, h + 1.2, 0);
        scene.add(crown);
        const sign = new THREE.Mesh(
          new THREE.BoxGeometry(20, 4, 1),
          new THREE.MeshBasicMaterial({ color: 0x2ee8ff }),
        );
        sign.position.set(0, h - 6, 15.6);
        scene.add(sign);
        colliders.push({ minX: -16, maxX: 16, minZ: -16, maxZ: 16 });
        towerTop = new THREE.Vector3(0, h, 0);
        continue;
      }
      const count = rng.int(1, 3);
      const slots = [
        [-13, -13, 22, 22],
        [13, -13, 22, 22],
        [-13, 13, 22, 22],
        [13, 13, 22, 22],
        [0, 0, 30, 30],
      ];
      for (let i = 0; i < count; i += 1) {
        const [ox, oz, w, d] = slots[i];
        const tall = downtown(bx, bz);
        const h = 10 + rng.range(0, 26) + tall * rng.range(10, 42);
        const color = rng.pick(PALETTE.building);
        const mat = new THREE.MeshLambertMaterial({
          color,
          map: winTex,
          emissive: 0x554422,
          emissiveMap: winTex,
          emissiveIntensity: 0.45,
        });
        const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        b.position.set(bx + ox, h / 2, bz + oz);
        scene.add(b);
        colliders.push({
          minX: bx + ox - w / 2 - 0.4,
          maxX: bx + ox + w / 2 + 0.4,
          minZ: bz + oz - d / 2 - 0.4,
          maxZ: bz + oz + d / 2 + 0.4,
        });
        // a few neon strips on the taller buildings
        if (h > 34 && rng.next() < 0.5) {
          const strip = new THREE.Mesh(
            new THREE.BoxGeometry(w + 0.6, 0.8, 0.4),
            new THREE.MeshBasicMaterial({ color: rng.pick([0xff4fd8, 0x2ee8ff, 0xffd94d]) }),
          );
          strip.position.set(bx + ox, h - 2, bz + oz + d / 2 + 0.3);
          scene.add(strip);
        }
      }
    }
  }

  // --- palms along the beach and the pier road ---
  for (let i = 0; i < 26; i += 1) {
    const palm = makePalm();
    const x = -200 + i * 16 + rng.range(-4, 4);
    palm.position.set(x, 0, 196 + rng.range(-3, 6));
    palm.rotation.y = rng.range(0, Math.PI * 2);
    scene.add(palm);
  }
  // --- crates and barriers as street props ---
  const crateMat = new THREE.MeshLambertMaterial({ color: 0xb08a4f });
  const barrierMat = new THREE.MeshLambertMaterial({ color: 0xe86a2c });
  for (let i = 0; i < 12; i += 1) {
    const crate = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 1.6), crateMat);
    const bx = rng.pick(BLOCKS);
    const bz = rng.pick(BLOCKS);
    crate.position.set(bx + rng.range(-20, 20), 0.8, bz + rng.range(-20, 20));
    crate.rotation.y = rng.range(0, Math.PI);
    scene.add(crate);
    colliders.push({
      minX: crate.position.x - 0.9,
      maxX: crate.position.x + 0.9,
      minZ: crate.position.z - 0.9,
      maxZ: crate.position.z + 0.9,
    });
    if (i % 3 === 0) {
      const barrier = new THREE.Mesh(new THREE.BoxGeometry(3, 1, 0.4), barrierMat);
      barrier.position.set(bx + rng.range(-20, 20), 0.5, bz + rng.range(-20, 20));
      barrier.rotation.y = rng.range(0, Math.PI);
      scene.add(barrier);
    }
  }

  // --- pedestrians: each walks the perimeter of one block, forever ---
  const shirts = [0xe5534b, 0x4fc3f7, 0xf2c94c, 0x8fd14f, 0xe8e8e8, 0xc98af2];
  for (let i = 0; i < 14; i += 1) {
    const mesh = makePedestrian(rng.pick(shirts));
    const bx = rng.pick(BLOCKS);
    const bz = rng.pick(BLOCKS);
    const ped = {
      mesh,
      bx,
      bz,
      edge: rng.int(0, 3), // 0 north, 1 east, 2 south, 3 west
      along: rng.range(-24, 24),
      dir: rng.next() < 0.5 ? 1 : -1,
      speed: rng.range(1.4, 2.6),
      phase: rng.range(0, Math.PI * 2),
      down: 0,
    };
    scene.add(mesh);
    peds.push(ped);
  }

  function pedPos(ped) {
    const o = 29; // sidewalk ring, just outside the block
    if (ped.edge === 0) return { x: ped.bx + ped.along, z: ped.bz - o };
    if (ped.edge === 1) return { x: ped.bx + o, z: ped.bz + ped.along };
    if (ped.edge === 2) return { x: ped.bx + ped.along, z: ped.bz + o };
    return { x: ped.bx - o, z: ped.bz + ped.along };
  }

  function pedYaw(ped) {
    if (ped.edge === 0) return ped.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    if (ped.edge === 1) return ped.dir > 0 ? Math.PI : 0;
    if (ped.edge === 2) return ped.dir > 0 ? -Math.PI / 2 : Math.PI / 2;
    return ped.dir > 0 ? 0 : Math.PI;
  }

  function update(dt, time) {
    for (const ped of peds) {
      if (ped.down > 0) {
        // knocked down by a car: lying on the sidewalk, then gets up and walks on
        ped.down -= dt;
        ped.mesh.rotation.x = -Math.PI / 2;
        if (ped.down <= 0) {
          ped.mesh.rotation.x = 0;
          ped.bx = ped.mesh.position.x > 0 ? 140 : -140;
          ped.bz = ped.mesh.position.z > 0 ? 140 : -140;
          ped.edge = 0;
          ped.along = 0;
        }
        continue;
      }
      ped.along += ped.dir * ped.speed * dt;
      if (ped.along > 24) {
        ped.along = 24;
        ped.edge = (ped.edge + 1) % 4;
        ped.along = -24;
      } else if (ped.along < -24) {
        ped.along = -24;
        ped.edge = (ped.edge + 3) % 4;
        ped.along = 24;
      }
      const p = pedPos(ped);
      ped.mesh.position.set(p.x, 0, p.z);
      ped.mesh.rotation.y = pedYaw(ped);
      const swing = Math.sin(time * 6 + ped.phase) * 0.45;
      ped.mesh.userData.legL.rotation.x = swing;
      ped.mesh.userData.legR.rotation.x = -swing;
    }
  }

  /** Push a circle (x, z, radius) out of every building/prop it overlaps. */
  function collide(pos, radius) {
    for (const c of colliders) {
      const cx = Math.max(c.minX, Math.min(pos.x, c.maxX));
      const cz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
      const dx = pos.x - cx;
      const dz = pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < radius * radius && d2 > 0.0001) {
        const d = Math.sqrt(d2);
        pos.x = cx + (dx / d) * radius;
        pos.z = cz + (dz / d) * radius;
      } else if (d2 <= 0.0001) {
        // centre inside the box: shove out along the smallest penetration
        const pl = pos.x - c.minX;
        const pr = c.maxX - pos.x;
        const pt = pos.z - c.minZ;
        const pb = c.maxZ - pos.z;
        const m = Math.min(pl, pr, pt, pb);
        if (m === pl) pos.x = c.minX - radius;
        else if (m === pr) pos.x = c.maxX + radius;
        else if (m === pt) pos.z = c.minZ - radius;
        else pos.z = c.maxZ + radius;
      }
    }
    // stay inside the playable area
    pos.x = Math.max(-215, Math.min(215, pos.x));
    pos.z = Math.max(-215, Math.min(215, pos.z));
  }

  /** Knock down the first pedestrian within `radius` of (x, z); returns it or null. */
  function knockPedAt(x, z, radius) {
    for (const ped of peds) {
      if (ped.down > 0) continue;
      const p = ped.mesh.position;
      if (Math.hypot(p.x - x, p.z - z) < radius) {
        ped.down = 5;
        return ped;
      }
    }
    return null;
  }

  return { colliders, peds, towerTop, update, collide, pedPos, knockPedAt };
}

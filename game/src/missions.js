// Re-authored in the r3 rebuild session (2026-11-18).
// The story: six linked missions for Mara Voss and her crew, each a chain of
// objectives — meet, drive, steal, deliver, evade, fight. The module owns the
// mission state, the objective marker and the rival crew it spawns.

import { MISSIONS, RIVAL } from './config.js';

const THREE = window.THREE;

function makeRival() {
  const group = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: 0xc98f6a });
  const jacketMat = new THREE.MeshLambertMaterial({ color: 0x1e2430 });
  const pantsMat = new THREE.MeshLambertMaterial({ color: 0x3a3f4a });
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.85, 0.24), pantsMat);
  legL.position.set(-0.15, 0.42, 0);
  const legR = legL.clone();
  legR.position.x = 0.15;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.75, 0.36), jacketMat);
  torso.position.y = 1.22;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), skin);
  head.position.y = 1.85;
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.12, 0.54), new THREE.MeshLambertMaterial({ color: 0xd42a2a }));
  band.position.y = 1.95;
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.5), new THREE.MeshLambertMaterial({ color: 0x111111 }));
  gun.position.set(0.38, 1.25, 0.25);
  group.add(legL, legR, torso, head, band, gun);
  group.userData.legL = legL;
  group.userData.legR = legR;
  return group;
}

export function createMissions(scene, rng) {
  const rivals = [];
  const state = {
    index: 0, // 0..5 while the story runs, 6 when it is done
    step: 0,
    timer: 0,
    active: false, // a mission is running (not between missions)
    done: false,
    started: false,
  };

  function current() {
    return state.index < MISSIONS.length ? MISSIONS[state.index] : null;
  }

  function currentStep() {
    const m = current();
    return m ? m.steps[state.step] : null;
  }

  /** Where the objective marker should point right now, or null. */
  function markerPos() {
    const step = currentStep();
    if (!step) return null;
    if (step.pos) return { x: step.pos[0], z: step.pos[2] };
    return null;
  }

  function clearRivals() {
    for (const r of rivals) scene.remove(r.mesh);
    rivals.length = 0;
  }

  function spawnRivals(x, z, count) {
    clearRivals();
    for (let i = 0; i < count; i += 1) {
      const mesh = makeRival();
      // a ring around the target, clear of any building on it
      const a = rng.range(0, Math.PI * 2);
      const r = rng.range(19, 26);
      const rx = x + Math.cos(a) * r;
      const rz = z + Math.sin(a) * r;
      mesh.position.set(rx, 0, rz);
      scene.add(mesh);
      rivals.push({ mesh, x: rx, z: rz, health: RIVAL.health, shootTimer: rng.range(0.4, 1.2), strafe: rng.range(0, Math.PI * 2) });
    }
  }

  function beginStep() {
    const step = currentStep();
    if (!step) return;
    if (step.type === 'deliver' || step.type === 'evade') state.timer = step.time;
    if (step.type === 'eliminate') spawnRivals(step.pos[0], step.pos[2], step.count);
  }

  function startMission(index) {
    state.index = index;
    state.step = 0;
    state.active = true;
    state.started = true;
    const m = current();
    beginStep();
    return m;
  }

  function failMission() {
    clearRivals();
    state.step = 0;
    state.timer = 0;
    beginStep();
  }

  /**
   * Advance the mission. ctx: {x, z, inCar, inComet, hurtPlayer, onShot}.
   * Returns 'mission-complete' | 'story-complete' | 'failed' | null.
   */
  function update(dt, ctx) {
    // rivals shoot at the player
    for (const r of [...rivals]) {
      const dx = ctx.x - r.x;
      const dz = ctx.z - r.z;
      const dist = Math.hypot(dx, dz);
      r.mesh.rotation.y = Math.atan2(dx, dz);
      r.strafe += dt * 0.5;
      r.x += Math.cos(r.strafe) * 1.2 * dt;
      r.z += Math.sin(r.strafe) * 1.2 * dt;
      r.mesh.position.x = r.x;
      r.mesh.position.z = r.z;
      if (dist < RIVAL.shootRange && dist > 2) {
        r.shootTimer -= dt;
        if (r.shootTimer <= 0) {
          r.shootTimer = RIVAL.shotInterval * (0.8 + rng.next() * 0.4);
          if (ctx.onShot) ctx.onShot(r, ctx.x, ctx.z);
          if (rng.next() < 0.55 && ctx.hurtPlayer) ctx.hurtPlayer(RIVAL.damage);
        }
      }
    }
    if (!state.active) return null;
    const step = currentStep();
    if (!step) return null;
    if (step.type === 'deliver' || step.type === 'evade') {
      state.timer -= dt;
      if (state.timer <= 0) {
        if (step.type === 'deliver') return 'failed';
        return advance(ctx);
      }
      if (step.type === 'evade' && ctx.wanted === 0) {
        // lost them early — the street goes quiet, and so does the heat
        return advance(ctx);
      }
    }
    if (step.type === 'goto' || step.type === 'drive' || step.type === 'deliver') {
      const d = Math.hypot(ctx.x - step.pos[0], ctx.z - step.pos[2]);
      if (d < step.radius) return advance(ctx);
    } else if (step.type === 'steal') {
      if (ctx.inComet) return advance(ctx);
    } else if (step.type === 'eliminate') {
      if (rivals.length === 0) return advance(ctx);
    }
    return null;
  }

  function advance(ctx) {
    const m = current();
    state.step += 1;
    if (state.step >= m.steps.length) {
      clearRivals();
      state.active = false;
      state.completedMission = m;
      state.index += 1;
      if (state.index >= MISSIONS.length) {
        state.done = true;
        return 'story-complete';
      }
      return 'mission-complete';
    }
    beginStep();
    return null;
  }

  /** A rival took a hit; returns true when it drops. */
  function hitRival(rival) {
    rival.health -= 1;
    if (rival.health <= 0) {
      scene.remove(rival.mesh);
      rivals.splice(rivals.indexOf(rival), 1);
      return true;
    }
    return false;
  }

  function objectiveText() {
    const m = current();
    if (!m) return state.done ? 'Neon Bay is yours. Free roam — the city never sleeps.' : '';
    const step = currentStep();
    if (!step) return m.title;
    let text = step.text;
    if ((step.type === 'deliver' || step.type === 'evade') && state.timer > 0) {
      text += ` — ${Math.ceil(state.timer)}s`;
    }
    if (step.type === 'eliminate') text += ` — ${rivals.length} left`;
    return `${m.title} · ${text}`;
  }

  return {
    state, rivals, current, currentStep, markerPos, startMission, failMission,
    update, hitRival, objectiveText, spawnRivals, clearRivals,
  };
}

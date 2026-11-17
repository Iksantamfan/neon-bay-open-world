// Re-authored in the r3 rebuild session (2026-11-18).
// Mara Voss on foot: third-person walking, running and jumping, with a
// pistol for the moments that need one. The mesh is a simple stylised figure
// — jacket, jeans, swinging legs — that reads at a glance in a chase camera.

import { PLAYER } from './config.js';

const THREE = window.THREE;

function makeFigure(jacket, jeans) {
  const group = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: 0xd9a986 });
  const jacketMat = new THREE.MeshLambertMaterial({ color: jacket });
  const jeansMat = new THREE.MeshLambertMaterial({ color: jeans });
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.85, 0.24), jeansMat);
  legL.position.set(-0.15, 0.42, 0);
  const legR = legL.clone();
  legR.position.x = 0.15;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.75, 0.36), jacketMat);
  torso.position.y = 1.22;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), skin);
  head.position.y = 1.85;
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.27, 12, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x2a1a12 }));
  hair.position.y = 1.92;
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.5), new THREE.MeshLambertMaterial({ color: 0x1a1a1a }));
  gun.position.set(0.38, 1.25, 0.25);
  group.add(legL, legR, torso, head, hair, gun);
  group.userData.legL = legL;
  group.userData.legR = legR;
  group.userData.gun = gun;
  return group;
}

export function createPlayer(scene, startX, startZ) {
  const mesh = makeFigure(0xb03040, 0x2c3242); // Mara: red jacket, dark jeans
  mesh.position.set(startX, 0, startZ);
  scene.add(mesh);
  const state = {
    mesh,
    x: startX,
    z: startZ,
    y: 0,
    vy: 0,
    yaw: 0,
    moving: false,
    health: PLAYER.health,
    invulnerable: 0,
    car: null, // the car she is driving, or null when on foot
    walkPhase: 0,
  };

  /**
   * Move on foot. input: {f, b, l, r, run, jump} in camera space; camYaw is
   * the camera's heading so W always walks away from the camera.
   */
  function update(dt, input, camYaw, collide) {
    if (state.car) return; // driving is the vehicles module's job
    let mx = 0;
    let mz = 0;
    if (input.f) mz -= 1;
    if (input.b) mz += 1;
    if (input.l) mx -= 1;
    if (input.r) mx += 1;
    const len = Math.hypot(mx, mz);
    state.moving = len > 0;
    if (len > 0) {
      mx /= len;
      mz /= len;
      // rotate the camera-relative input into world space: forward is the
      // direction the camera looks, (sin camYaw, cos camYaw); right is
      // (-cos camYaw, sin camYaw). W always walks away from the camera.
      const sin = Math.sin(camYaw);
      const cos = Math.cos(camYaw);
      const wx = -mz * sin - mx * cos;
      const wz = -mz * cos + mx * sin;
      const speed = input.run ? PLAYER.runSpeed : PLAYER.walkSpeed;
      state.x += wx * speed * dt;
      state.z += wz * speed * dt;
      const want = Math.atan2(wx, wz);
      let dy = want - state.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      state.yaw += Math.max(-10 * dt, Math.min(10 * dt, dy));
      state.walkPhase += dt * speed * 1.6;
    }
    if (input.jump && state.y === 0) state.vy = PLAYER.jumpSpeed;
    state.vy -= PLAYER.gravity * dt;
    state.y = Math.max(0, state.y + state.vy * dt);
    if (state.y === 0) state.vy = 0;
    collide(state, PLAYER.radius);
    if (state.invulnerable > 0) state.invulnerable -= dt;
    mesh.position.set(state.x, state.y, state.z);
    mesh.rotation.y = state.yaw;
    const swing = state.moving ? Math.sin(state.walkPhase) * 0.55 : 0;
    mesh.userData.legL.rotation.x = swing;
    mesh.userData.legR.rotation.x = -swing;
  }

  function hurt(amount) {
    if (state.invulnerable > 0) return false;
    state.health = Math.max(0, state.health - amount);
    state.invulnerable = 0.5;
    return true;
  }

  function heal(amount) {
    state.health = Math.min(PLAYER.health, state.health + amount);
  }

  return { state, update, hurt, heal };
}

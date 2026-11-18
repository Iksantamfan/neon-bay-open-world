// NEON BAY — the player on foot: Mara Voss. Third-person movement,
// camera orbit, punching and pistol combat, entering cars.

(function () {
  var U = NB.utils;
  var C = NB.config;
  var THREE = window.THREE;

  var player = null;

  function makeFigure(jacket, pants, skin) {
    var g = new THREE.Group();
    var matJ = new THREE.MeshStandardMaterial({ color: jacket, roughness: 0.8 });
    var matP = new THREE.MeshStandardMaterial({ color: pants, roughness: 0.9 });
    var matS = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.7 });
    var torso = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.4, 0.85, 10), matJ);
    torso.position.y = 1.05;
    var head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), matS);
    head.position.y = 1.78;
    var hair = new THREE.Mesh(new THREE.SphereGeometry(0.27, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), new THREE.MeshStandardMaterial({ color: 0x1a1210, roughness: 1 }));
    hair.position.y = 1.84;
    var legL = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.8, 8), matP);
    legL.position.set(-0.18, 0.4, 0);
    var legR = legL.clone();
    legR.position.x = 0.18;
    var armL = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.12, 0.7, 8), matJ);
    armL.position.set(-0.48, 1.05, 0);
    var armR = armL.clone();
    armR.position.x = 0.48;
    g.add(torso); g.add(head); g.add(hair); g.add(legL); g.add(legR); g.add(armL); g.add(armR);
    g.userData = { legL: legL, legR: legR, armL: armL, armR: armR, torso: torso };
    return g;
  }

  function create(scene) {
    var mesh = makeFigure(0x8a2f3c, 0x23283a, 0xd9a986);
    mesh.position.set(6, 0, 6);
    scene.add(mesh);
    player = {
      mesh: mesh,
      pos: mesh.position,
      heading: Math.PI,
      camYaw: Math.PI,
      camPitch: 0.32,
      speed: 0,
      moving: false,
      health: C.playerHealth,
      punchCd: 0,
      shootCd: 0,
      inCar: null,
      stepTimer: 0,
      walkPhase: 0,
      dead: false,
      bustTimer: 0,
    };
    return player;
  }

  function respawn() {
    player.health = C.playerHealth;
    player.dead = false;
    player.bustTimer = 0;
    player.pos.set(6, 0, 6);
    player.heading = Math.PI;
    player.camYaw = Math.PI;
    if (player.inCar) {
      NB.vehicles.exitCar(player);
    }
  }

  function damage(amount) {
    if (player.dead) return;
    player.health -= amount;
    NB.audio.hurt();
    NB.hud.flashDamage();
    if (player.health <= 0) {
      player.health = 0;
      player.dead = true;
      NB.main.gameOver("wasted");
    }
  }

  function heal(amount) {
    player.health = Math.min(C.playerHealth, player.health + amount);
  }

  function nearestCar(maxDist) {
    var best = null, bestD = maxDist;
    var cars = NB.vehicles.list();
    for (var i = 0; i < cars.length; i++) {
      var c = cars[i];
      if (c.wrecked) continue;
      var d = U.dist2(player.pos.x, player.pos.z, c.pos.x, c.pos.z);
      if (d < bestD) { bestD = d; best = c; }
    }
    return best;
  }

  function punch() {
    if (player.punchCd > 0 || player.inCar) return;
    player.punchCd = C.punchCooldown;
    NB.audio.punch();
    var fx = Math.sin(player.heading), fz = Math.cos(player.heading);
    var hx = player.pos.x + fx * 1.4, hz = player.pos.z + fz * 1.4;
    // hit enemies first
    var hit = NB.enemies.hitAt(hx, hz, C.punchRange, C.punchDamage);
    if (!hit) {
      // hit a pedestrian
      var ped = NB.pedestrians.hitAt(hx, hz, C.punchRange);
      if (ped) NB.main.addWanted(1);
    }
    // swing animation
    player.mesh.userData.armR.rotation.x = -1.4;
    setTimeout(function () { player.mesh.userData.armR.rotation.x = 0; }, 160);
  }

  function shoot() {
    if (player.shootCd > 0 || player.inCar || !NB.state.hasPistol) return;
    if (NB.state.ammo <= 0) {
      NB.audio.denied();
      NB.hud.say("Out of ammo — find a gun shop");
      player.shootCd = 0.4;
      return;
    }
    player.shootCd = C.pistolCooldown;
    NB.state.ammo -= 1;
    NB.audio.shot();
    NB.effects.muzzle(player.pos, player.heading);
    var fx = Math.sin(player.heading), fz = Math.cos(player.heading);
    // ray: walk forward, find first enemy/ped within a narrow cone
    var hitEnemy = null, bestD = C.pistolRange;
    var list = NB.enemies.list();
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (e.dead) continue;
      var dx = e.pos.x - player.pos.x, dz = e.pos.z - player.pos.z;
      var d = Math.sqrt(dx * dx + dz * dz);
      if (d > C.pistolRange) continue;
      var dot = (dx * fx + dz * fz) / Math.max(0.001, d);
      if (dot > 0.86 && d < bestD) { bestD = d; hitEnemy = e; }
    }
    if (hitEnemy) {
      NB.enemies.damage(hitEnemy, C.pistolDamage);
      NB.effects.hitSpark(hitEnemy.pos);
    } else {
      var ped = NB.pedestrians.shotAt(player.pos, player.heading, C.pistolRange);
      if (ped) NB.main.addWanted(1);
      NB.effects.tracer(player.pos, player.heading, bestD);
    }
    player.mesh.userData.armR.rotation.x = -1.2;
    setTimeout(function () { player.mesh.userData.armR.rotation.x = 0; }, 120);
  }

  function update(dt, input) {
    if (!player || player.dead) return;
    player.punchCd = Math.max(0, player.punchCd - dt);
    player.shootCd = Math.max(0, player.shootCd - dt);
    if (player.inCar) return; // driving is handled by vehicles

    var mouse = input.consumeMouse();
    player.camYaw -= mouse.dx * 0.0032;
    player.camPitch = U.clamp(player.camPitch + mouse.dy * 0.0022, -0.15, 0.9);

    var fwd = (input.isDown("KeyW") || input.isDown("ArrowUp") ? 1 : 0) - (input.isDown("KeyS") || input.isDown("ArrowDown") ? 1 : 0);
    var strafe = (input.isDown("KeyD") || input.isDown("ArrowRight") ? 1 : 0) - (input.isDown("KeyA") || input.isDown("ArrowLeft") ? 1 : 0);
    var run = input.isDown("ShiftLeft") || input.isDown("ShiftRight");
    var speed = run ? C.playerRunSpeed : C.playerWalkSpeed;
    var mx = 0, mz = 0;
    if (fwd !== 0 || strafe !== 0) {
      var sy = Math.sin(player.camYaw), cy = Math.cos(player.camYaw);
      // camera looks along -Z rotated by camYaw; forward is (-sin, -cos) in xz
      mx = -sy * fwd + cy * strafe;
      mz = -cy * fwd - sy * strafe;
      var len = Math.sqrt(mx * mx + mz * mz);
      mx /= len; mz /= len;
      player.heading = Math.atan2(mx, mz);
      player.moving = true;
    } else {
      player.moving = false;
    }
    player.speed = player.moving ? speed : 0;
    var nx = player.pos.x + mx * speed * dt;
    var nz = player.pos.z + mz * speed * dt;
    var fixed = NB.world.collideCircle(nx, nz, C.playerRadius);
    player.pos.x = fixed.x;
    player.pos.z = fixed.z;
    player.mesh.rotation.y = player.heading;

    // walk cycle
    if (player.moving) {
      player.walkPhase += dt * (run ? 11 : 7);
      var s = Math.sin(player.walkPhase);
      player.mesh.userData.legL.rotation.x = s * 0.7;
      player.mesh.userData.legR.rotation.x = -s * 0.7;
      player.mesh.userData.armL.rotation.x = -s * 0.5;
      player.mesh.userData.armR.rotation.x = s * 0.5;
      player.stepTimer -= dt;
      if (player.stepTimer <= 0) {
        NB.audio.step();
        player.stepTimer = run ? 0.28 : 0.42;
      }
    } else {
      player.mesh.userData.legL.rotation.x = 0;
      player.mesh.userData.legR.rotation.x = 0;
      player.mesh.userData.armL.rotation.x = 0;
      player.mesh.userData.armR.rotation.x = 0;
    }

    // enter car
    if (input.wasPressed("KeyE")) {
      var car = nearestCar(4.2);
      if (car) {
        NB.vehicles.enterCar(player, car);
        NB.audio.uiClick();
      }
    }
    // punch / shoot
    if (input.wasPressed("KeyF") || mouse.down) {
      if (NB.state.hasPistol && (input.isDown("KeyF") || mouse.down)) shoot();
      else punch();
    }

    // slow health regen
    if (player.health < C.playerHealth) player.health = Math.min(C.playerHealth, player.health + dt * 1.2);
  }

  function cameraTarget(out) {
    // third-person camera behind the player
    var back = 7.2, height = 3.4;
    var cx = player.pos.x + Math.sin(player.camYaw) * back;
    var cz = player.pos.z + Math.cos(player.camYaw) * back;
    var cy = height + player.camPitch * 4.5;
    out.position.set(cx, cy, cz);
    out.lookAt(player.pos.x, 1.6, player.pos.z);
  }

  NB.player = {
    create: create,
    update: update,
    damage: damage,
    heal: heal,
    respawn: respawn,
    punch: punch,
    shoot: shoot,
    cameraTarget: cameraTarget,
    makeFigure: makeFigure,
    get: function () { return player; },
  };
})();

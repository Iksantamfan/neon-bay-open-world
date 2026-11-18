// NEON BAY — cars: the player's ride, street traffic and the police.
// Traffic follows the road grid; police chase the player when wanted.

(function () {
  var U = NB.utils;
  var C = NB.config;
  var THREE = window.THREE;

  var cars = [];
  var nextId = 1;
  var sceneRef = null;
  var worldRef = null;
  var wantedTimer = 0;
  var policeFlashT = 0;

  var CAR_COLORS = [0xc23b2e, 0x2e7fc2, 0x3fae5a, 0xd8a13c, 0x7a4fd0, 0xe8e8e8, 0x222226, 0x4fd0c8, 0xd06a2e];

  function makeCarMesh(color, kind) {
    var g = new THREE.Group();
    var bodyMat = new THREE.MeshStandardMaterial({ color: color, roughness: 0.35, metalness: 0.55 });
    var glassMat = new THREE.MeshStandardMaterial({ color: 0x0e1420, roughness: 0.15, metalness: 0.7 });
    var body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.62, 4.3), bodyMat);
    body.position.y = 0.62;
    var cabin = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.55, 2.1), glassMat);
    cabin.position.set(0, 1.15, -0.25);
    g.add(body); g.add(cabin);
    // wheels
    var wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 12);
    var wheelMat = new THREE.MeshStandardMaterial({ color: 0x111114, roughness: 0.9 });
    var wheels = [];
    [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]].forEach(function (p) {
      var w = new THREE.Mesh(wheelGeo, wheelMat);
      w.rotation.z = Math.PI / 2;
      w.position.set(p[0], 0.38, p[1]);
      g.add(w);
      wheels.push(w);
    });
    // headlights + taillights
    var hlMat = new THREE.MeshBasicMaterial({ color: 0xfff2c0 });
    var tlMat = new THREE.MeshBasicMaterial({ color: 0xff2a22 });
    [-0.65, 0.65].forEach(function (x) {
      var hl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.08), hlMat);
      hl.position.set(x, 0.66, 2.16);
      g.add(hl);
      var tl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.08), tlMat);
      tl.position.set(x, 0.66, -2.16);
      g.add(tl);
    });
    if (kind === "police") {
      var barBase = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.14, 0.4), new THREE.MeshStandardMaterial({ color: 0x222226 }));
      barBase.position.set(0, 1.5, -0.25);
      g.add(barBase);
      var red = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.42), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
      red.position.set(-0.28, 1.6, -0.25);
      var blue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.42), new THREE.MeshBasicMaterial({ color: 0x2266ff }));
      blue.position.set(0.28, 1.6, -0.25);
      g.add(red); g.add(blue);
      g.userData.policeLights = { red: red, blue: blue };
    }
    if (kind === "sport") {
      var spoiler = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.08, 0.4), bodyMat);
      spoiler.position.set(0, 1.05, -2.0);
      g.add(spoiler);
    }
    g.userData.wheels = wheels;
    return g;
  }

  function roadCoords() {
    var r = [];
    for (var i = -3; i <= 3; i++) r.push(i * C.roadSpacing);
    return r;
  }

  function randomIntersection() {
    var r = roadCoords();
    return { x: r[U.randInt(0, r.length - 1)], z: r[U.randInt(0, r.length - 1)] };
  }

  function nextIntersection(from) {
    var r = roadCoords();
    var ix = r.indexOf(from.x), iz = r.indexOf(from.z);
    var opts = [];
    if (ix > 0) opts.push({ x: r[ix - 1], z: from.z });
    if (ix < r.length - 1) opts.push({ x: r[ix + 1], z: from.z });
    if (iz > 0) opts.push({ x: from.x, z: r[iz - 1] });
    if (iz < r.length - 1) opts.push({ x: from.x, z: r[iz + 1] });
    return opts.length ? U.choice(opts) : { x: 0, z: 0 };
  }

  function spawnCar(kind, x, z, heading, parked) {
    var color = kind === "police" ? 0xf2f2f2 : kind === "sport" ? 0xd8a13c : U.choice(CAR_COLORS);
    var mesh = makeCarMesh(color, kind);
    mesh.position.set(x, 0, z);
    mesh.rotation.y = heading || 0;
    sceneRef.add(mesh);
    var car = {
      id: nextId++,
      kind: kind,
      mesh: mesh,
      pos: mesh.position,
      heading: heading || 0,
      speed: 0,
      color: color,
      driver: null,       // "player" or null
      wrecked: false,
      parked: !!parked,   // a parked car stays put until someone drives it
      target: null,       // traffic waypoint {x,z}
      from: null,         // traffic: last intersection
      stuckT: 0,
      siren: false,
    };
    if (kind === "civilian") {
      car.from = { x: Math.round(x / 60) * 60, z: Math.round(z / 60) * 60 };
      car.from.x = U.clamp(car.from.x, -180, 180);
      car.from.z = U.clamp(car.from.z, -180, 180);
      car.target = nextIntersection(car.from);
    }
    cars.push(car);
    return car;
  }

  function spawnTraffic(n, playerPos) {
    for (var i = 0; i < n; i++) {
      var p = randomIntersection();
      // keep traffic near the player at spawn
      var x = U.clamp(p.x + U.rand(-40, 40), -180, 180);
      var z = U.clamp(p.z + U.rand(-40, 40), -180, 180);
      if (playerPos && U.dist2(x, z, playerPos.x, playerPos.z) < 25) continue;
      spawnCar("civilian", x, z, U.choice([0, Math.PI / 2, Math.PI, -Math.PI / 2]));
    }
  }

  function spawnParked(spots) {
    spots.forEach(function (s) {
      spawnCar("civilian", s.x, s.z, s.angle, true);
    });
  }

  function spawnPolice(playerPos) {
    var p = randomIntersection();
    // spawn on a road a fair distance away
    var tries = 0;
    while (U.dist2(p.x, p.z, playerPos.x, playerPos.z) < 55 && tries < 12) {
      p = randomIntersection();
      tries++;
    }
    var car = spawnCar("police", p.x, p.z, 0);
    car.siren = true;
    return car;
  }

  function policeCount() {
    var n = 0;
    cars.forEach(function (c) { if (c.kind === "police") n++; });
    return n;
  }

  function removeCar(car) {
    sceneRef.remove(car.mesh);
    var i = cars.indexOf(car);
    if (i >= 0) cars.splice(i, 1);
  }

  function enterCar(player, car) {
    player.inCar = car;
    car.driver = "player";
    player.mesh.visible = false;
    NB.state.carsStolen += 1;
    NB.audio.engineStart();
  }

  function exitCar(player) {
    var car = player.inCar;
    if (!car) return;
    car.driver = null;
    car.parked = true; // a car the player leaves stays where it is
    player.inCar = null;
    player.mesh.visible = true;
    // step out to the side of the car
    var sx = car.pos.x + Math.cos(car.heading) * 2.2;
    var sz = car.pos.z - Math.sin(car.heading) * 2.2;
    var fixed = NB.world.collideCircle(sx, sz, C.playerRadius);
    player.pos.set(fixed.x, 0, fixed.z);
    player.camYaw = car.heading + Math.PI;
    NB.audio.engineSet(0, false);
  }

  function steerToward(car, tx, tz, dt, maxTurn) {
    var desired = Math.atan2(tx - car.pos.x, tz - car.pos.z);
    car.heading = U.angleLerp(car.heading, desired, U.clamp(maxTurn * dt, 0, 1));
  }

  function moveCar(car, dt, speed) {
    var nx = car.pos.x + Math.sin(car.heading) * speed * dt;
    var nz = car.pos.z + Math.cos(car.heading) * speed * dt;
    var fixed = NB.world.collideCircle(nx, nz, 1.7);
    // if blocked by a building, the car stops instead of sliding through
    if (Math.abs(fixed.x - nx) > 0.01 || Math.abs(fixed.z - nz) > 0.01) {
      car.speed *= 0.4;
    }
    car.pos.x = fixed.x;
    car.pos.z = fixed.z;
    car.mesh.rotation.y = car.heading;
    car.mesh.userData.wheels.forEach(function (w) { w.rotation.x += (speed * dt) / 0.38; });
  }

  function updateTraffic(car, dt) {
    if (!car.target) return;
    var d = U.dist2(car.pos.x, car.pos.z, car.target.x, car.target.z);
    if (d < 7) {
      car.from = car.target;
      car.target = nextIntersection(car.from);
      return;
    }
    // slow for a car ahead
    var want = C.trafficSpeed;
    cars.forEach(function (o) {
      if (o === car || o.wrecked) return;
      var dx = o.pos.x - car.pos.x, dz = o.pos.z - car.pos.z;
      var dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < 9) {
        var dot = (dx * Math.sin(car.heading) + dz * Math.cos(car.heading)) / Math.max(0.01, dist);
        if (dot > 0.55) want = Math.min(want, 2.5);
      }
    });
    steerToward(car, car.target.x, car.target.z, dt, 1.6);
    car.speed = U.lerp(car.speed, want, U.clamp(1.6 * dt, 0, 1));
    moveCar(car, dt, car.speed);
  }

  function updatePolice(car, dt, player, playerCar) {
    var tx = playerCar ? playerCar.pos.x : player.pos.x;
    var tz = playerCar ? playerCar.pos.z : player.pos.z;
    var d = U.dist2(car.pos.x, car.pos.z, tx, tz);
    var want = d > 90 ? 30 : 26;
    steerToward(car, tx, tz, dt, 2.4);
    car.speed = U.lerp(car.speed, want, U.clamp(2.2 * dt, 0, 1));
    moveCar(car, dt, car.speed);
    // ram the player's car
    if (playerCar && d < 4.4) {
      var push = 6;
      playerCar.pos.x += Math.sin(car.heading) * push * dt;
      playerCar.pos.z += Math.cos(car.heading) * push * dt;
      playerCar.speed *= 0.92;
      NB.hud.shake(0.35);
      if (Math.random() < dt * 2) NB.audio.punch();
    }
    // bust: on foot, police very close for a while
    if (!playerCar && d < C.bustDist) {
      player.bustTimer += dt;
      if (player.bustTimer >= C.bustTime) {
        NB.main.gameOver("busted");
      }
    }
    // siren light flash
    policeFlashT += dt;
    var lights = car.mesh.userData.policeLights;
    if (lights) {
      var on = Math.sin(policeFlashT * 10) > 0;
      lights.red.material.color.setHex(on ? 0xff2222 : 0x551111);
      lights.blue.material.color.setHex(on ? 0x2266ff : 0x111155);
    }
  }

  function updatePlayerCar(car, dt, input) {
    var fwd = (input.isDown("KeyW") || input.isDown("ArrowUp") ? 1 : 0) - (input.isDown("KeyS") || input.isDown("ArrowDown") ? 1 : 0);
    var steer = (input.isDown("KeyA") || input.isDown("ArrowLeft") ? 1 : 0) - (input.isDown("KeyD") || input.isDown("ArrowRight") ? 1 : 0);
    var handbrake = input.isDown("Space");
    if (fwd > 0) car.speed += C.carAccel * dt;
    else if (fwd < 0) {
      if (car.speed > 0.5) car.speed -= C.carBrake * dt;
      else car.speed -= C.carAccel * 0.6 * dt;
    } else {
      car.speed -= car.speed * 1.4 * dt;
    }
    if (handbrake) car.speed *= Math.pow(C.carHandbrake, dt * 60);
    car.speed = U.clamp(car.speed, -C.carMaxReverse, C.carMaxSpeed);
    if (Math.abs(car.speed) > 0.4) {
      var turn = steer * C.carTurnRate * dt * (car.speed >= 0 ? 1 : -1) * U.clamp(Math.abs(car.speed) / 8, 0.25, 1);
      if (handbrake) turn *= 1.7;
      car.heading += turn;
    }
    moveCar(car, dt, car.speed);
    NB.audio.engineSet(U.clamp(Math.abs(car.speed) / C.carMaxSpeed, 0, 1), true);
    // exit
    if (input.wasPressed("KeyE") && Math.abs(car.speed) < 1.5) {
      exitCar(NB.player.get());
    }
  }

  function separateCars(dt) {
    for (var i = 0; i < cars.length; i++) {
      for (var j = i + 1; j < cars.length; j++) {
        var a = cars[i], b = cars[j];
        if (a.wrecked || b.wrecked) continue;
        var dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
        var d = Math.sqrt(dx * dx + dz * dz);
        if (d < 3.4 && d > 0.01) {
          var push = (3.4 - d) / 2;
          var nx = dx / d, nz = dz / d;
          a.pos.x -= nx * push; a.pos.z -= nz * push;
          b.pos.x += nx * push; b.pos.z += nz * push;
          a.speed *= 0.85; b.speed *= 0.85;
        }
      }
    }
  }

  function update(dt, input, player) {
    var playerCar = player.inCar;
    // police numbers follow the wanted level
    var want = C.policeByStars[NB.state.wanted] || 0;
    var have = policeCount();
    if (NB.state.wanted > 0 && have < want) {
      spawnPolice(player.pos);
    }
    if (NB.state.wanted === 0 && have > 0) {
      // cops leave when the heat dies down
      for (var i = cars.length - 1; i >= 0; i--) {
        if (cars[i].kind === "police") removeCar(cars[i]);
      }
    }
    // wanted decay: no police close by for a while
    var nearestPolice = 1e9;
    cars.forEach(function (c) {
      if (c.kind !== "police") return;
      var d = U.dist2(c.pos.x, c.pos.z, player.pos.x, player.pos.z);
      if (d < nearestPolice) nearestPolice = d;
    });
    if (NB.state.wanted > 0 && nearestPolice > C.wantedDecayDist) {
      wantedTimer += dt;
      if (wantedTimer >= C.wantedDecayTime) {
        NB.state.wanted -= 1;
        wantedTimer = 0;
        NB.hud.say("The heat is cooling off…");
      }
    } else {
      wantedTimer = 0;
    }
    if (!player.inCar) player.bustTimer = Math.max(0, player.bustTimer - dt);

    // siren audio when police are near
    if (policeCount() > 0 && nearestPolice < 90) {
      NB.audio.sirenStart();
      NB.audio.sirenUpdate(NB.state.time, nearestPolice < 55);
    } else {
      NB.audio.sirenStop();
    }

    cars.forEach(function (car) {
      if (car.wrecked) return;
      if (car.driver === "player") updatePlayerCar(car, dt, input);
      else if (car.kind === "police") updatePolice(car, dt, player, playerCar);
      else if (!car.parked) updateTraffic(car, dt);
    });
    separateCars(dt);

    // respawn traffic that wandered too far from the player (parked cars stay)
    cars.forEach(function (car) {
      if (car.kind !== "civilian" || car.driver === "player" || car.parked) return;
      if (U.dist2(car.pos.x, car.pos.z, player.pos.x, player.pos.z) > 260) {
        var p = randomIntersection();
        car.pos.set(p.x, 0, p.z);
        car.from = { x: p.x, z: p.z };
        car.target = nextIntersection(car.from);
        car.speed = 0;
      }
    });
  }

  function init(scene, world) {
    sceneRef = scene;
    worldRef = world;
  }

  function cameraTarget(out, player) {
    var car = player.inCar;
    if (!car) return false;
    var back = 10.5, height = 4.6;
    var cx = car.pos.x - Math.sin(car.heading) * back;
    var cz = car.pos.z - Math.cos(car.heading) * back;
    out.position.set(cx, height, cz);
    out.lookAt(car.pos.x + Math.sin(car.heading) * 6, 1.4, car.pos.z + Math.cos(car.heading) * 6);
    return true;
  }

  NB.vehicles = {
    init: init,
    spawnCar: spawnCar,
    spawnTraffic: spawnTraffic,
    spawnParked: spawnParked,
    spawnPolice: spawnPolice,
    policeCount: policeCount,
    removeCar: removeCar,
    enterCar: enterCar,
    exitCar: exitCar,
    update: update,
    cameraTarget: cameraTarget,
    list: function () { return cars; },
  };
})();

// NEON BAY — pedestrians: people walking the sidewalks, who scatter
// when a shot is fired and fall when hit. They make the city feel alive.

(function () {
  var U = NB.utils;
  var C = NB.config;
  var THREE = window.THREE;

  var peds = [];
  var sceneRef = null;

  var SHIRTS = [0x4a7fc2, 0xc24a6a, 0x4ac27a, 0xc2a24a, 0x8a5fc2, 0xd8d8d8, 0x3a3a44];

  function spawnPed(x, z) {
    var mesh = NB.player.makeFigure(U.choice(SHIRTS), 0x2a2a33, 0xc9976b);
    var scale = U.rand(0.92, 1.06);
    mesh.scale.setScalar(scale);
    mesh.position.set(x, 0, z);
    sceneRef.add(mesh);
    var ped = {
      mesh: mesh,
      pos: mesh.position,
      heading: U.rand(0, Math.PI * 2),
      speed: U.rand(1.2, 2.2),
      target: null,
      down: false,
      downT: 0,
      fleeT: 0,
      phase: U.rand(0, 6),
    };
    ped.target = pickTarget(ped);
    peds.push(ped);
    return ped;
  }

  function pickTarget(ped) {
    // wander to a nearby point on a sidewalk (just off a road)
    var roads = [];
    for (var i = -3; i <= 3; i++) roads.push(i * C.roadSpacing);
    var r = U.choice(roads);
    var along = U.rand(-190, 190);
    if (U.rng() < 0.5) return { x: along, z: r + (U.rng() < 0.5 ? 9 : -9) };
    return { x: r + (U.rng() < 0.5 ? 9 : -9), z: along };
  }

  function spawnInitial(n, playerPos) {
    for (var i = 0; i < n; i++) {
      var x = U.rand(-190, 190), z = U.rand(-190, 190);
      if (playerPos && U.dist2(x, z, playerPos.x, playerPos.z) < 18) continue;
      spawnPed(x, z);
    }
  }

  function knockDown(ped) {
    if (ped.down) return;
    ped.down = true;
    ped.downT = 0;
    ped.mesh.rotation.z = Math.PI / 2;
    ped.mesh.position.y = 0.3;
  }

  function hitAt(x, z, radius) {
    for (var i = 0; i < peds.length; i++) {
      var p = peds[i];
      if (p.down) continue;
      if (U.dist2(x, z, p.pos.x, p.pos.z) < radius + 0.8) {
        knockDown(p);
        return p;
      }
    }
    return null;
  }

  function shotAt(fromPos, heading, range) {
    var fx = Math.sin(heading), fz = Math.cos(heading);
    var best = null, bestD = range;
    for (var i = 0; i < peds.length; i++) {
      var p = peds[i];
      if (p.down) continue;
      var dx = p.pos.x - fromPos.x, dz = p.pos.z - fromPos.z;
      var d = Math.sqrt(dx * dx + dz * dz);
      if (d > range) continue;
      var dot = (dx * fx + dz * fz) / Math.max(0.001, d);
      if (dot > 0.86 && d < bestD) { bestD = d; best = p; }
    }
    if (best) {
      knockDown(best);
      // everyone nearby runs
      peds.forEach(function (p) {
        if (!p.down && U.dist2(p.pos.x, p.pos.z, best.pos.x, best.pos.z) < 25) p.fleeT = 4;
      });
    }
    return best;
  }

  function scare(x, z, radius) {
    peds.forEach(function (p) {
      if (!p.down && U.dist2(p.pos.x, p.pos.z, x, z) < radius) p.fleeT = 4;
    });
  }

  function update(dt, player, playerCar) {
    for (var i = peds.length - 1; i >= 0; i--) {
      var p = peds[i];
      if (p.down) {
        p.downT += dt;
        if (p.downT > 14) {
          sceneRef.remove(p.mesh);
          peds.splice(i, 1);
          // keep the streets populated
          var nx = player.pos.x + U.rand(-70, 70);
          var nz = player.pos.z + U.rand(-70, 70);
          if (Math.abs(nx) < 195 && Math.abs(nz) < 195) spawnPed(nx, nz);
        }
        continue;
      }
      // hit by a moving car?
      var cars = NB.vehicles.list();
      for (var j = 0; j < cars.length; j++) {
        var c = cars[j];
        if (Math.abs(c.speed) < 3) continue;
        if (U.dist2(p.pos.x, p.pos.z, c.pos.x, c.pos.z) < 2.2) {
          knockDown(p);
          if (c.driver === "player") NB.main.addWanted(1);
          break;
        }
      }
      if (p.down) continue;
      var speed = p.fleeT > 0 ? 5.2 : p.speed;
      if (p.fleeT > 0) p.fleeT -= dt;
      var d = U.dist2(p.pos.x, p.pos.z, p.target.x, p.target.z);
      if (d < 2.5) {
        p.target = pickTarget(p);
      } else {
        var want = Math.atan2(p.target.x - p.pos.x, p.target.z - p.pos.z);
        p.heading = U.angleLerp(p.heading, want, U.clamp(3 * dt, 0, 1));
      }
      p.pos.x += Math.sin(p.heading) * speed * dt;
      p.pos.z += Math.cos(p.heading) * speed * dt;
      var fixed = NB.world.collideCircle(p.pos.x, p.pos.z, 0.6);
      p.pos.x = fixed.x; p.pos.z = fixed.z;
      p.mesh.rotation.y = p.heading;
      p.phase += dt * speed * 2.4;
      var s = Math.sin(p.phase);
      p.mesh.userData.legL.rotation.x = s * 0.6;
      p.mesh.userData.legR.rotation.x = -s * 0.6;
    }
  }

  NB.pedestrians = {
    init: function (scene) { sceneRef = scene; },
    spawnInitial: spawnInitial,
    hitAt: hitAt,
    shotAt: shotAt,
    scare: scare,
    update: update,
    list: function () { return peds; },
  };
})();

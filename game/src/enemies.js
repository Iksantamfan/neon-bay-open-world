// NEON BAY — enemies: Vic Strand's thugs and Vic himself. They chase the
// player, punch up close and shoot from a distance. Mission code spawns them.

(function () {
  var U = NB.utils;
  var C = NB.config;
  var THREE = window.THREE;

  var enemies = [];
  var sceneRef = null;

  function spawn(x, z, kind) {
    var jacket = kind === "vic" ? 0x1a1a22 : 0x5a2a6e;
    var mesh = NB.player.makeFigure(jacket, 0x1c1c22, 0xb98a62);
    if (kind === "vic") mesh.scale.setScalar(1.12);
    mesh.position.set(x, 0, z);
    sceneRef.add(mesh);
    var e = {
      mesh: mesh,
      pos: mesh.position,
      kind: kind,
      heading: 0,
      health: kind === "vic" ? C.vicHealth : C.thugHealth,
      maxHealth: kind === "vic" ? C.vicHealth : C.thugHealth,
      speed: kind === "vic" ? 3.4 : U.rand(3.0, 4.2),
      punchCd: 0,
      shootCd: U.rand(0.5, 1.5),
      dead: false,
      deadT: 0,
      phase: U.rand(0, 6),
    };
    enemies.push(e);
    return e;
  }

  function clearAll() {
    enemies.forEach(function (e) { sceneRef.remove(e.mesh); });
    enemies.length = 0;
  }

  function damage(e, amount) {
    if (e.dead) return;
    e.health -= amount;
    if (e.health <= 0) {
      e.health = 0;
      e.dead = true;
      e.deadT = 0;
      e.mesh.rotation.z = Math.PI / 2;
      e.mesh.position.y = 0.3;
      NB.state.kills += 1;
      NB.hud.say((e.kind === "vic" ? "Vic Strand" : "Thug") + " is down.");
    }
  }

  function hitAt(x, z, radius, dmg) {
    var hitAny = false;
    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      if (e.dead) continue;
      if (U.dist2(x, z, e.pos.x, e.pos.z) < radius + 0.9) {
        damage(e, dmg);
        hitAny = true;
      }
    }
    return hitAny;
  }

  function update(dt, player) {
    for (var i = enemies.length - 1; i >= 0; i--) {
      var e = enemies[i];
      if (e.dead) {
        e.deadT += dt;
        if (e.deadT > 12) {
          sceneRef.remove(e.mesh);
          enemies.splice(i, 1);
        }
        continue;
      }
      e.punchCd = Math.max(0, e.punchCd - dt);
      e.shootCd = Math.max(0, e.shootCd - dt);
      var d = U.dist2(e.pos.x, e.pos.z, player.pos.x, player.pos.z);
      if (player.dead) continue;
      // chase the player
      var want = Math.atan2(player.pos.x - e.pos.x, player.pos.z - e.pos.z);
      e.heading = U.angleLerp(e.heading, want, U.clamp(4 * dt, 0, 1));
      if (d > 2.0) {
        var sp = d > 14 ? e.speed * 1.15 : e.speed;
        e.pos.x += Math.sin(e.heading) * sp * dt;
        e.pos.z += Math.cos(e.heading) * sp * dt;
        var fixed = NB.world.collideCircle(e.pos.x, e.pos.z, 0.7);
        e.pos.x = fixed.x; e.pos.z = fixed.z;
        e.phase += dt * sp * 2.2;
        var s = Math.sin(e.phase);
        e.mesh.userData.legL.rotation.x = s * 0.6;
        e.mesh.userData.legR.rotation.x = -s * 0.6;
      }
      e.mesh.rotation.y = e.heading;
      // punch up close
      if (d < 2.3 && e.punchCd <= 0) {
        e.punchCd = 1.0;
        NB.audio.punch();
        NB.player.damage(U.randInt(6, 11));
      }
      // shoot from mid range (Vic shoots more often)
      var shootEvery = e.kind === "vic" ? 1.6 : 2.6;
      if (d > 8 && d < 42 && e.shootCd <= 0) {
        e.shootCd = shootEvery + U.rand(0, 0.8);
        NB.audio.shot();
        NB.effects.tracer(e.pos, e.heading, d);
        // hit chance falls with distance
        var hitP = U.clamp(0.55 - d * 0.008, 0.12, 0.55);
        if (U.rng() < hitP) NB.player.damage(U.randInt(5, 10));
      }
    }
  }

  function countAlive(kind) {
    var n = 0;
    enemies.forEach(function (e) { if (!e.dead && (!kind || e.kind === kind)) n++; });
    return n;
  }

  NB.enemies = {
    init: function (scene) { sceneRef = scene; },
    spawn: spawn,
    clearAll: clearAll,
    damage: damage,
    hitAt: hitAt,
    update: update,
    countAlive: countAlive,
    list: function () { return enemies; },
  };
})();

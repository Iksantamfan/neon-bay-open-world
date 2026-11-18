// NEON BAY — boot, game loop, state machine, screenshot modes and a
// built-in self-test (?selftest=1). This is the entry point the page loads.

(function () {
  var U = NB.utils;
  var C = NB.config;
  var THREE = window.THREE;

  var renderer, scene, camera, world;
  var player;
  var clockLast = 0;
  var cinematic = false;
  var errors = [];
  var testResults = {};

  window.addEventListener("error", function (e) {
    errors.push(String(e.message || e.error || "unknown error"));
  });

  // ---------- public API used by the other modules ----------
  NB.main = {
    addWanted: function (n) {
      NB.state.wanted = U.clamp(NB.state.wanted + n, 0, C.maxWanted);
      NB.hud.setStars(NB.state.wanted);
    },
    gameOver: function (kind) {
      if (NB.state.mode === "over") return;
      NB.state.mode = "over";
      NB.input.unlock();
      NB.audio.engineStop();
      NB.audio.sirenStop();
      var reason = kind === "busted"
        ? "BUSTED — the Neon Bay PD took you in."
        : "WASTED — Mara is down. The city keeps moving.";
      var el = NB.hud.els["over-reason"];
      if (el) el.textContent = reason + " You lose $100 to the hospital / bail.";
      NB.state.money = Math.max(0, NB.state.money - 100);
      NB.hud.setMoney(NB.state.money);
      NB.hud.show("screen-over");
    },
    missionComplete: function (idx, title, reward) {
      if (idx >= NB.missions.list.length - 1) {
        NB.state.mode = "finale";
        NB.input.unlock();
        var stats = "Missions completed: 6/6 &nbsp;•&nbsp; Money: " + U.fmtMoney(NB.state.money) +
          " &nbsp;•&nbsp; Cars stolen: " + NB.state.carsStolen + " &nbsp;•&nbsp; Time: " + U.fmtTime(NB.state.playTime);
        var el = NB.hud.els["finale-stats"];
        if (el) el.innerHTML = stats;
        NB.hud.show("screen-finale");
        return;
      }
      NB.state.mode = "complete";
      NB.input.unlock();
      var t = NB.hud.els["complete-title"];
      if (t) t.textContent = "MISSION COMPLETE — " + title;
      var r = NB.hud.els["complete-reward"];
      if (r) r.textContent = "+" + U.fmtMoney(reward) + "  •  Next: " + NB.missions.list[idx + 1].title;
      NB.hud.show("screen-complete");
    },
    missionFailed: function (idx, reason) {
      NB.state.mode = "failed";
      NB.input.unlock();
      var el = NB.hud.els["failed-reason"];
      if (el) el.textContent = reason || "Mission failed.";
      NB.hud.show("screen-failed");
    },
  };

  // ---------- boot ----------
  function boot() {
    var params = new URLSearchParams(window.location.search);
    NB.flags.shot = params.get("shot");
    NB.flags.selftest = params.get("selftest") === "1";

    var container = document.getElementById("game-container");
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(renderer.domElement);

    scene = new THREE.Scene();
    scene.background = new THREE.Color(C.duskSky);
    scene.fog = new THREE.Fog(C.duskSky, C.fogNear, C.fogFar);
    camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1400);
    camera.position.set(20, 12, 30);

    var hemi = new THREE.HemisphereLight(C.hemiSky, C.hemiGround, C.hemiIntensity);
    scene.add(hemi);
    var sun = new THREE.DirectionalLight(C.sunColor, C.sunIntensity);
    sun.position.set(-180, 90, 80);
    scene.add(sun);
    var fill = new THREE.DirectionalLight(0x6a7fd6, 0.35);
    fill.position.set(120, 60, -100);
    scene.add(fill);

    world = NB.world.build(scene);
    NB.vehicles.init(scene, world);
    NB.pedestrians.init(scene);
    NB.enemies.init(scene);
    NB.missions.init(scene, world);
    NB.hud.init(scene, document.getElementById("minimap"));
    NB.input.init(renderer.domElement);

    player = NB.player.create(scene);

    // starter car by the plaza, parked ON the road (not inside a block)
    // so the player can drive straight away down the road
    NB.vehicles.spawnCar("civilian", 12, 0, Math.PI / 2, true);
    NB.vehicles.spawnParked(world.parkSpots);
    NB.vehicles.spawnTraffic(C.trafficCount, player.pos);
    NB.pedestrians.spawnInitial(18, player.pos);

    NB.hud.setHealth(player.health);
    NB.hud.setMoney(NB.state.money);
    NB.hud.setStars(0);
    NB.hud.setMissionTitle("NEON BAY");
    NB.hud.setObjective("Press Play to start");

    bindButtons();
    window.addEventListener("resize", onResize);
    window.addEventListener("keydown", onKey);

    if (NB.flags.shot) applyShotMode(NB.flags.shot);
    if (NB.flags.selftest) setTimeout(runSelfTest, 600);

    clockLast = performance.now();
    requestAnimationFrame(loop);
  }

  function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  function bindButtons() {
    var b = NB.hud.els;
    if (b["btn-play"]) b["btn-play"].addEventListener("click", function () { NB.audio.resume(); startGame(); });
    if (b["btn-resume"]) b["btn-resume"].addEventListener("click", resumeGame);
    if (b["btn-next"]) b["btn-next"].addEventListener("click", nextMission);
    if (b["btn-retry"]) b["btn-retry"].addEventListener("click", function () { NB.audio.uiClick(); NB.missions.retry(); startGame(true); });
    if (b["btn-respawn"]) b["btn-respawn"].addEventListener("click", function () { NB.audio.uiClick(); NB.player.respawn(); NB.state.wanted = 0; NB.hud.setStars(0); startGame(true); });
    if (b["btn-again"]) b["btn-again"].addEventListener("click", function () { NB.audio.uiClick(); NB.state.mode = "playing"; NB.hud.hideScreens(); NB.hud.setObjective("Free roam — Neon Bay is yours"); });
  }

  function onKey(e) {
    if (e.code === "KeyM") {
      NB.state.muted = !NB.state.muted;
      NB.audio.setMuted(NB.state.muted);
      var b = NB.hud.els["btn-mute"];
      if (b) b.textContent = NB.state.muted ? "Unmute (M)" : "Mute (M)";
      return;
    }
    if (e.code === "Escape" || e.code === "KeyP") {
      if (NB.state.mode === "playing") pauseGame();
      else if (NB.state.mode === "paused") resumeGame();
      return;
    }
    if (e.code === "Enter") {
      if (NB.state.mode === "menu") startGame();
      else if (NB.state.mode === "complete") nextMission();
      else if (NB.state.mode === "failed") { NB.missions.retry(); startGame(true); }
      else if (NB.state.mode === "over") { NB.player.respawn(); NB.state.wanted = 0; NB.hud.setStars(0); startGame(true); }
      else if (NB.state.mode === "playing" && !NB.missions.current) {
        var next = Math.min(NB.state.missionIndex + 1, NB.missions.list.length - 1);
        if (NB.missions.completed >= NB.missions.list.length) {
          NB.hud.say("All missions done — free roam. Neon Bay is yours.");
        } else {
          NB.missions.start(next);
        }
      }
    }
  }

  function startGame(keepMission) {
    NB.audio.resume();
    NB.hud.hideScreens();
    NB.state.mode = "playing";
    NB.state.paused = false;
    if (!keepMission && !NB.missions.current && NB.missions.completed === 0) {
      NB.missions.start(0);
    }
    NB.hud.setObjective(NB.missions.objectiveText());
  }

  function pauseGame() {
    if (NB.state.mode !== "playing") return;
    NB.state.mode = "paused";
    NB.input.unlock();
    NB.audio.engineSet(0, false);
    NB.hud.show("screen-pause");
  }

  function resumeGame() {
    if (NB.state.mode !== "paused") return;
    NB.audio.resume();
    NB.hud.hideScreens();
    NB.state.mode = "playing";
  }

  function nextMission() {
    NB.audio.uiClick();
    var next = NB.state.missionIndex + 1;
    NB.hud.hideScreens();
    NB.state.mode = "playing";
    if (next < NB.missions.list.length) NB.missions.start(next);
  }

  // ---------- screenshot modes (?shot=) ----------
  function applyShotMode(shot) {
    // deterministic staged scenes for screenshots; no interaction needed
    if (shot === "start") return; // default menu
    startGame();
    if (shot === "cover") {
      cinematic = true;
      NB.missions.start(0);
      // a few cars + police visible for life
      NB.state.wanted = 2;
      var p = player.pos;
      NB.vehicles.spawnPolice(p);
      NB.vehicles.spawnPolice(p);
    } else if (shot === "play") {
      // player driving downtown with police on his tail, mission 2 active
      var car = NB.vehicles.spawnCar("civilian", 0, -60, 0);
      player.pos.set(0, 0, -58);
      NB.vehicles.enterCar(player, car);
      car.speed = 18;
      NB.missions.start(1);
      NB.state.wanted = 2;
      NB.vehicles.spawnPolice(player.pos);
      NB.vehicles.spawnPolice(player.pos);
    } else if (shot === "mission") {
      NB.missions.start(0);
      player.pos.set(4, 0, 14);
      player.camYaw = Math.PI;
    } else if (shot === "complete") {
      NB.missions.start(0);
      setTimeout(function () { NB.missions.completeCurrent(); }, 400);
    }
  }

  // ---------- main loop ----------
  function loop(now) {
    requestAnimationFrame(loop);
    var dt = Math.min(0.05, (now - clockLast) / 1000 || 0.016);
    clockLast = now;
    if (NB.state.mode === "paused" || NB.state.mode === "menu") {
      // render a frozen / menu backdrop frame (minimap still draws so the
      // start screen shows the city layout, not a blank box)
      NB.world.update(0, NB.state.time);
      NB.hud.drawMinimap(player, NB.vehicles.list(), NB.pedestrians.list(), NB.enemies.list(), NB.missions.targetPos());
      renderer.render(scene, camera);
      return;
    }
    NB.state.time += dt;
    if (NB.state.mode === "playing") NB.state.playTime += dt;

    if (NB.state.mode === "playing") {
      NB.player.update(dt, NB.input);
      NB.vehicles.update(dt, NB.input, player);
      NB.pedestrians.update(dt, player, player.inCar);
      NB.enemies.update(dt, player);
      NB.missions.update(dt, player);
      updatePrompt();
    }
    NB.world.update(dt, NB.state.time);
    NB.hud.updateEffects(dt);

    // camera
    if (cinematic) {
      var a = NB.state.time * 0.05;
      camera.position.set(Math.sin(a) * 190, 95, Math.cos(a) * 190);
      camera.lookAt(0, 8, 0);
    } else if (player.inCar) {
      NB.vehicles.cameraTarget(camera, player);
    } else {
      NB.player.cameraTarget(camera);
    }
    var sh = NB.hud.consumeShake(dt);
    if (sh > 0.01) {
      camera.position.x += (Math.random() - 0.5) * sh;
      camera.position.y += (Math.random() - 0.5) * sh;
    }

    // HUD refresh
    NB.hud.setHealth(player.health);
    NB.hud.setMoney(NB.state.money);
    NB.hud.setStars(NB.state.wanted);
    if (NB.state.mode === "playing") NB.hud.setObjective(NB.missions.objectiveText());
    NB.hud.drawMinimap(player, NB.vehicles.list(), NB.pedestrians.list(), NB.enemies.list(), NB.missions.targetPos());

    renderer.render(scene, camera);
  }

  function updatePrompt() {
    if (player.inCar) {
      NB.hud.prompt(player.inCar.speed < 1.5 ? "E — exit car" : "");
      return;
    }
    var near = null, best = 4.2;
    NB.vehicles.list().forEach(function (c) {
      if (c.wrecked) return;
      var d = U.dist2(player.pos.x, player.pos.z, c.pos.x, c.pos.z);
      if (d < best) { best = d; near = c; }
    });
    if (near) {
      NB.hud.prompt(near.isTarget ? "E — steal the Comet" : "E — enter car");
    } else if (NB.state.hasPistol) {
      NB.hud.prompt("F — shoot  •  M — mute");
    } else {
      NB.hud.prompt("");
    }
  }

  // ---------- self-test (?selftest=1) ----------
  // Frame-driven (not wall-clock): SwiftShader renders slowly, so every
  // check waits for real game frames instead of milliseconds.
  function nextFrame() { return new Promise(function (r) { requestAnimationFrame(r); }); }
  async function waitFrames(n) { for (var i = 0; i < n; i++) await nextFrame(); }
  function keyDown(code) {
    window.dispatchEvent(new KeyboardEvent("keydown", { code: code, bubbles: true }));
  }
  function keyUp(code) {
    window.dispatchEvent(new KeyboardEvent("keyup", { code: code, bubbles: true }));
  }
  async function pressKey(code, frames) {
    keyDown(code);
    await waitFrames(frames || 3);
    keyUp(code);
    await waitFrames(2);
  }
  async function runSelfTest() {
    var out = { errors: errors };
    var div = document.getElementById("selftest");
    function set(k, v) { out[k] = v; if (div) div.textContent = JSON.stringify(out); }
    try {
      set("cityMeshes", scene.children.length);
      set("cityBuilt", scene.children.length > 20);
      startGame();
      set("modeAfterStart", NB.state.mode);
      set("missionActive", !!NB.missions.current);
      // walk forward
      var x0 = player.pos.x, z0 = player.pos.z;
      keyDown("KeyW");
      await waitFrames(60);
      keyUp("KeyW");
      await waitFrames(3);
      var moved = U.dist2(x0, z0, player.pos.x, player.pos.z);
      set("walkMoved", Math.round(moved * 10) / 10);
      // enter the starter car (parked on the road by the plaza) and drive
      player.pos.set(12, 0, 3);
      await waitFrames(3);
      await pressKey("KeyE", 4);
      set("inCar", !!player.inCar);
      keyDown("KeyW");
      await waitFrames(60);
      keyUp("KeyW");
      await waitFrames(3);
      set("carSpeed", player.inCar ? Math.round(player.inCar.speed * 10) / 10 : 0);
      // exit the car, then mission 1: teleport through its steps
      await pressKey("KeyE", 4);
      NB.missions.start(0);
      await waitFrames(5);
      player.pos.set(0, 0, 0);
      await waitFrames(20);
      set("missionStepAfterMeet", NB.missions.current ? NB.missions.current.stepIndex : -1);
      // bring the nearest car to the player for the enterCar step
      var near = null, bestD = 1e9;
      NB.vehicles.list().forEach(function (c) {
        var d = U.dist2(player.pos.x, player.pos.z, c.pos.x, c.pos.z);
        if (d < bestD) { bestD = d; near = c; }
      });
      if (near) { near.pos.set(12, 0, 0); near.speed = 0; near.heading = Math.PI / 2; }
      player.pos.set(12, 0, 3);
      await waitFrames(3);
      await pressKey("KeyE", 4);
      var car = player.inCar;
      if (car) { car.pos.set(-196, 0, 30); }
      await waitFrames(25);
      set("missionCompleted", NB.missions.completed);
      set("modeAfterMission", NB.state.mode);
      set("consoleErrors", errors.length);
      set("pass", out.cityBuilt && out.walkMoved > 3 && out.inCar && out.carSpeed > 3 && out.missionCompleted >= 1 && errors.length === 0);
    } catch (e) {
      set("exception", String(e && e.message || e));
      set("pass", false);
    }
    set("done", true);
    document.title = out.pass ? "SELFTEST-PASS" : "SELFTEST-FAIL";
  }

  // expose for the shot/self-test hooks and debugging
  NB.main._internals = {
    get renderer() { return renderer; },
    get scene() { return scene; },
    get camera() { return camera; },
    get player() { return player; },
    errors: errors,
    startGame: startGame,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();

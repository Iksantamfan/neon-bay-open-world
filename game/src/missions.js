// NEON BAY — missions and story. Six linked jobs for Mara Voss and her
// crew, each a list of steps the manager checks every frame. Completing a
// mission pays out and unlocks the next one.

(function () {
  var U = NB.utils;
  var C = NB.config;
  var THREE = window.THREE;

  var sceneRef = null;
  var beacon = null;
  var allies = [];
  var current = null;   // { index, mission, stepIndex, step, t, killsAtStart }
  var subtitleQueue = [];
  var subtitleT = 0;
  var completedCount = 0;

  var MISSIONS = [
    {
      id: "first-light",
      title: "First Light",
      briefing: [
        "Dario: Mara! You're back in Neon Bay. The city missed you.",
        "Dario: Take the car by the plaza. Drive down to the boardwalk — get a feel for it.",
      ],
      steps: [
        { type: "goto", x: 0, z: 0, radius: 6, label: "Meet Dario at the plaza" },
        { type: "enterCar", label: "Get in the car by the plaza" },
        { type: "driveTo", x: -196, z: 30, radius: 10, label: "Drive to the boardwalk" },
      ],
    },
    {
      id: "harbor-run",
      title: "Harbor Run",
      briefing: [
        "Lena: A package is waiting at the harbour warehouse. No questions, just drive.",
        "Pip: And Mara — the harbour is watched. Expect company.",
      ],
      steps: [
        { type: "goto", x: -150, z: 150, radius: 8, label: "Pick up the package at the harbour" },
        { type: "driveTo", x: 150, z: 150, radius: 10, label: "Deliver it across town — the cops are on you", wanted: 2 },
        { type: "goto", x: 150, z: 150, radius: 8, label: "Drop the package at the east dock" },
      ],
    },
    {
      id: "neon-heist",
      title: "Neon Heist",
      briefing: [
        "Dario: Vic Strand's gold Comet is parked at the casino. He flashes it every night.",
        "Mara: Then tonight he loses it. Lena, keep the garage door open.",
      ],
      steps: [
        { type: "goto", x: 150, z: -150, radius: 10, label: "Reach the casino" },
        { type: "stealCar", kind: "sport", x: 150, z: -128, label: "Steal Vic's gold Comet", wanted: 3 },
        { type: "driveTo", x: -30, z: -150, radius: 10, label: "Lose the cops and bring it to the garage" },
      ],
    },
    {
      id: "the-rival",
      title: "The Rival",
      briefing: [
        "Vic Strand: You took my car, Voss. My boys are waiting on Rowan Street.",
        "Mara: Good. I was getting bored. Pip — I need a pistol.",
      ],
      steps: [
        { type: "goto", x: 90, z: 90, radius: 10, label: "Go to Vic's turf on Rowan Street" },
        { type: "eliminate", count: 4, kind: "thug", label: "Deal with Vic's thugs (4)", spawnAt: { x: 90, z: 90 } },
        { type: "goto", x: 0, z: 0, radius: 8, label: "Report back to Dario" },
      ],
      grantPistol: true,
    },
    {
      id: "high-tide",
      title: "High Tide",
      briefing: [
        "Lena: The whole department is after you, Mara. Four stars. Don't stop moving.",
        "Mara: Then let's give them a tour. Pier's the only way out.",
      ],
      steps: [
        { type: "survive", seconds: C.chaseSurviveTime, label: "Survive the chase — 60 seconds", wanted: 4 },
        { type: "reachSafe", x: -228, z: 0, radius: 12, label: "Reach the pier and lose the cops" },
      ],
    },
    {
      id: "neon-bay",
      title: "Neon Bay",
      briefing: [
        "Vic Strand: This city is mine, Voss. It always was.",
        "Mara: Not tonight, Vic. Tonight Neon Bay picks a new owner.",
      ],
      steps: [
        { type: "goto", x: 30, z: -30, radius: 10, label: "Storm Vic's tower downtown" },
        { type: "eliminate", count: 1, kind: "vic", label: "Take down Vic Strand", spawnAt: { x: 30, z: -30 }, spawnThugs: 2 },
        { type: "reachSafe", x: -200, z: -60, radius: 12, label: "Escape to the beach — it's over" },
      ],
    },
  ];

  function spawnAlly(x, z, jacket, name) {
    var mesh = NB.player.makeFigure(jacket, 0x23283a, 0xc9976b);
    mesh.position.set(x, 0, z);
    sceneRef.add(mesh);
    var a = { mesh: mesh, pos: mesh.position, name: name, phase: U.rand(0, 6) };
    allies.push(a);
    return a;
  }

  function init(scene, world) {
    sceneRef = scene;
    beacon = world.beacon;
    // the crew waits at the central plaza
    spawnAlly(-3, -3, 0x2e7f8a, "Dario");
    spawnAlly(3, -3, 0x8a6d2e, "Pip");
    spawnAlly(0, 4, 0x6e3a8a, "Lena");
  }

  function say(lines) {
    lines.forEach(function (l) { subtitleQueue.push(l); });
  }

  function setBeacon(x, z) {
    if (!beacon) return;
    if (x === null) { beacon.visible = false; return; }
    beacon.position.set(x, 0, z);
    beacon.visible = true;
  }

  function currentStepTarget() {
    if (!current) return null;
    var s = current.step;
    if (s.type === "goto" || s.type === "driveTo" || s.type === "reachSafe" || s.type === "stealCar") {
      return { x: s.x, z: s.z };
    }
    return null;
  }

  function applyStep(step) {
    // side effects when a step begins
    if (step.wanted) {
      NB.state.wanted = Math.max(NB.state.wanted, step.wanted);
    }
    if (step.type === "stealCar") {
      // the target car appears at the casino
      var car = NB.vehicles.spawnCar("sport", step.x, step.z, Math.PI / 2);
      car.isTarget = true;
      current.targetCar = car;
    }
    if (step.type === "eliminate") {
      var at = step.spawnAt || { x: 90, z: 90 };
      var n = step.count + (step.spawnThugs || 0);
      for (var i = 0; i < n; i++) {
        var kind = i < step.count && step.kind === "vic" ? "vic" : "thug";
        NB.enemies.spawn(at.x + U.rand(-12, 12), at.z + U.rand(-12, 12), kind);
      }
      current.killsAtStart = NB.state.kills;
    }
    if (step.type === "survive") {
      current.t = 0;
      NB.state.wanted = Math.max(NB.state.wanted, step.wanted || 4);
    }
    var tp = currentStepTarget();
    setBeacon(tp ? tp.x : null, tp ? tp.z : null);
    NB.hud.setObjective(step.label);
  }

  function start(index) {
    if (index < 0 || index >= MISSIONS.length) return false;
    var m = MISSIONS[index];
    NB.enemies.clearAll();
    current = { index: index, mission: m, stepIndex: 0, step: m.steps[0], t: 0, killsAtStart: NB.state.kills, targetCar: null };
    NB.state.missionIndex = index;
    if (m.grantPistol && !NB.state.hasPistol) {
      NB.state.hasPistol = true;
      NB.state.ammo = C.pistolStartAmmo;
      NB.hud.say("Pip gave you a pistol. F to fire, " + C.pistolStartAmmo + " rounds.");
    }
    NB.hud.setMissionTitle((index + 1) + ". " + m.title);
    say(m.briefing);
    NB.audio.uiBeep();
    applyStep(current.step);
    return true;
  }

  function advanceStep() {
    var m = current.mission;
    current.stepIndex += 1;
    if (current.stepIndex >= m.steps.length) {
      completeMission();
      return;
    }
    current.step = m.steps[current.stepIndex];
    current.t = 0;
    NB.audio.pickup();
    applyStep(current.step);
  }

  function completeMission() {
    var m = current.mission;
    var reward = C.missionReward[current.index] || 500;
    NB.state.money += reward;
    completedCount += 1;
    NB.audio.jingle();
    setBeacon(null, null);
    NB.hud.say("Mission complete: " + m.title + " — +" + U.fmtMoney(reward));
    var idx = current.index;
    current = null;
    NB.main.missionComplete(idx, m.title, reward);
  }

  function failMission(reason) {
    if (!current) return;
    setBeacon(null, null);
    var idx = current.index;
    current = null;
    NB.main.missionFailed(idx, reason);
  }

  function retry() {
    start(NB.state.missionIndex);
  }

  function update(dt, player) {
    // subtitles
    if (subtitleQueue.length > 0) {
      subtitleT -= dt;
      if (subtitleT <= 0) {
        NB.hud.say(subtitleQueue.shift());
        subtitleT = 4.2;
      }
    }
    // allies idle
    allies.forEach(function (a) {
      a.phase += dt;
      a.mesh.userData.armL.rotation.x = Math.sin(a.phase * 0.8) * 0.08;
      a.mesh.rotation.y = Math.sin(a.phase * 0.3) * 0.6;
    });
    if (!current) return;
    var s = current.step;
    var done = false;
    if (s.type === "goto" || s.type === "reachSafe") {
      var d = U.dist2(player.pos.x, player.pos.z, s.x, s.z);
      if (d < s.radius) done = true;
    } else if (s.type === "driveTo") {
      var car = player.inCar;
      if (car) {
        var d2 = U.dist2(car.pos.x, car.pos.z, s.x, s.z);
        if (d2 < s.radius) done = true;
      }
    } else if (s.type === "enterCar") {
      if (player.inCar) done = true;
    } else if (s.type === "stealCar") {
      if (player.inCar && player.inCar === current.targetCar) {
        done = true;
        NB.state.carsStolen += 1;
      }
    } else if (s.type === "eliminate") {
      var need = s.count;
      var got = NB.state.kills - current.killsAtStart;
      var left = need - got;
      NB.hud.setObjective(s.label.replace(/\(\d+\)/, "(" + Math.max(0, left) + " left)"));
      if (got >= need) done = true;
    } else if (s.type === "survive") {
      current.t += dt;
      var remain = Math.max(0, Math.ceil(s.seconds - current.t));
      NB.hud.setObjective(s.label.replace(/— \d+ seconds/, "— " + remain + "s left"));
      if (current.t >= s.seconds) done = true;
      if (player.dead) return;
    }
    if (done) advanceStep();
  }

  function objectiveText() {
    if (!current) return "Free roam — press Enter for the next mission";
    return current.step.label;
  }

  function targetPos() {
    return currentStepTarget();
  }

  NB.missions = {
    init: init,
    start: start,
    retry: retry,
    update: update,
    failMission: failMission,
    objectiveText: objectiveText,
    targetPos: targetPos,
    list: MISSIONS,
    get current() { return current; },
    get completed() { return completedCount; },
    completeCurrent: function () { if (current) { current.stepIndex = current.mission.steps.length - 1; advanceStep(); } },
  };
})();

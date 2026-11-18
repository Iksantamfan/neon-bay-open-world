// NEON BAY — HUD, minimap, menus and 3D combat effects (muzzle flash,
// tracers, hit sparks). The DOM lives in index.html; this wires it up.

(function () {
  var U = NB.utils;
  var C = NB.config;
  var THREE = window.THREE;

  var sceneRef = null;
  var mapCtx = null;
  var mapCanvas = null;
  var el = {};
  var shakeAmt = 0;
  var subtitleTimer = null;
  var effects = [];

  function $(id) { return document.getElementById(id); }

  function init(scene, minimapCanvas) {
    sceneRef = scene;
    mapCanvas = minimapCanvas;
    mapCtx = minimapCanvas.getContext("2d");
    ["hud", "health-fill", "health-num", "money", "stars", "mission-title",
     "objective-text", "prompt", "subtitle", "message", "crosshair",
     "damage-flash", "screen-start", "screen-pause", "screen-complete",
     "screen-failed", "screen-over", "screen-finale", "complete-title",
     "complete-reward", "failed-reason", "over-reason", "finale-stats",
     "btn-play", "btn-resume", "btn-next", "btn-retry", "btn-respawn",
     "btn-again", "btn-mute"].forEach(function (id) { el[id] = $(id); });
    if (el["btn-mute"]) el["btn-mute"].addEventListener("click", function () {
      NB.state.muted = !NB.state.muted;
      NB.audio.setMuted(NB.state.muted);
      el["btn-mute"].textContent = NB.state.muted ? "Unmute (M)" : "Mute (M)";
    });
  }

  function setHealth(h) {
    var pct = U.clamp(h, 0, 100);
    if (el["health-fill"]) el["health-fill"].style.width = pct + "%";
    if (el["health-num"]) el["health-num"].textContent = Math.ceil(pct);
    if (el["health-fill"]) el["health-fill"].style.background = pct > 50 ? "#3fae5a" : pct > 25 ? "#d8a13c" : "#c23b2e";
  }

  function setMoney(m) { if (el.money) el.money.textContent = U.fmtMoney(m); }

  function setStars(n) {
    if (!el.stars) return;
    var s = "";
    for (var i = 0; i < C.maxWanted; i++) s += i < n ? "★" : "☆";
    el.stars.textContent = s;
    el.stars.style.color = n >= 3 ? "#ff5a4d" : "#ffd23b";
  }

  function setObjective(t) { if (el["objective-text"]) el["objective-text"].textContent = t; }
  function setMissionTitle(t) { if (el["mission-title"]) el["mission-title"].textContent = t; }

  function say(text) {
    if (!el.subtitle) return;
    el.subtitle.textContent = text;
    el.subtitle.style.opacity = "1";
    if (subtitleTimer) clearTimeout(subtitleTimer);
    subtitleTimer = setTimeout(function () { el.subtitle.style.opacity = "0"; }, 4200);
  }

  function prompt(text) {
    if (!el.prompt) return;
    el.prompt.textContent = text || "";
    el.prompt.style.opacity = text ? "1" : "0";
  }

  var msgTimer = null;
  function showMessage(text, dur) {
    if (!el.message) return;
    el.message.textContent = text;
    el.message.style.opacity = "1";
    if (msgTimer) clearTimeout(msgTimer);
    msgTimer = setTimeout(function () { el.message.style.opacity = "0"; }, dur || 2200);
  }

  function flashDamage() {
    if (!el["damage-flash"]) return;
    el["damage-flash"].style.opacity = "0.55";
    setTimeout(function () { el["damage-flash"].style.opacity = "0"; }, 160);
  }

  function shake(a) { shakeAmt = Math.max(shakeAmt, a); }
  function consumeShake(dt) {
    var s = shakeAmt;
    shakeAmt = Math.max(0, shakeAmt - dt * 1.8);
    return s;
  }

  function hideScreens() {
    ["screen-start", "screen-pause", "screen-complete", "screen-failed", "screen-over", "screen-finale"].forEach(function (id) {
      if (el[id]) el[id].style.display = "none";
    });
  }

  function show(id) {
    hideScreens();
    if (el[id]) el[id].style.display = "flex";
  }

  // ---------------- minimap ----------------
  var MAP_MIN = -260, MAP_SPAN = 520;
  function mapXY(x, z) {
    var s = mapCanvas.width / MAP_SPAN;
    return { x: (x - MAP_MIN) * s, y: (z - MAP_MIN) * s };
  }

  function drawMinimap(player, cars, peds, enemies, target) {
    if (!mapCtx) return;
    var W = mapCanvas.width, H = mapCanvas.height;
    mapCtx.fillStyle = "#101018";
    mapCtx.fillRect(0, 0, W, H);
    // ocean strip (west)
    var oc = mapXY(C.oceanX, 0);
    mapCtx.fillStyle = "#0d3355";
    mapCtx.fillRect(0, 0, Math.max(0, oc.x), H);
    // beach
    mapCtx.fillStyle = "#8a6f4d";
    mapCtx.fillRect(Math.max(0, oc.x), 0, mapXY(-210, 0).x - Math.max(0, oc.x), H);
    // blocks
    mapCtx.fillStyle = "#2e2e3e";
    var roads = [];
    for (var i = -3; i <= 3; i++) roads.push(i * C.roadSpacing);
    for (var a = 0; a < 6; a++) {
      for (var b = 0; b < 6; b++) {
        var p0 = mapXY(roads[a] + C.roadHalfWidth, roads[b] + C.roadHalfWidth);
        var s = (C.roadSpacing - C.roadHalfWidth * 2) * (W / MAP_SPAN);
        mapCtx.fillRect(p0.x, p0.y, s, s);
      }
    }
    // roads
    mapCtx.strokeStyle = "#555566";
    mapCtx.lineWidth = 2;
    roads.forEach(function (r) {
      var p1 = mapXY(-240, r), p2 = mapXY(240, r);
      mapCtx.beginPath(); mapCtx.moveTo(p1.x, p1.y); mapCtx.lineTo(p2.x, p2.y); mapCtx.stroke();
      var q1 = mapXY(r, -240), q2 = mapXY(r, 240);
      mapCtx.beginPath(); mapCtx.moveTo(q1.x, q1.y); mapCtx.lineTo(q2.x, q2.y); mapCtx.stroke();
    });
    // casino + harbour marks
    var cp = mapXY(C.casinoPos.x, C.casinoPos.z);
    mapCtx.fillStyle = "#d8a13c";
    mapCtx.fillRect(cp.x - 4, cp.y - 4, 8, 8);
    mapCtx.fillStyle = "#7a5a3a";
    var hp = mapXY(-150, 178);
    mapCtx.fillRect(hp.x - 8, hp.y - 5, 16, 10);
    // mission marker (pulsing diamond)
    if (target) {
      var tp = mapXY(target.x, target.z);
      var pulse = 5 + Math.sin(NB.state.time * 5) * 2;
      mapCtx.fillStyle = "#ffd23b";
      mapCtx.beginPath();
      mapCtx.moveTo(tp.x, tp.y - pulse);
      mapCtx.lineTo(tp.x + pulse, tp.y);
      mapCtx.lineTo(tp.x, tp.y + pulse);
      mapCtx.lineTo(tp.x - pulse, tp.y);
      mapCtx.closePath(); mapCtx.fill();
    }
    // pedestrians
    mapCtx.fillStyle = "rgba(220,220,230,0.7)";
    peds.forEach(function (p) {
      if (p.down) return;
      var pp = mapXY(p.pos.x, p.pos.z);
      mapCtx.fillRect(pp.x - 1, pp.y - 1, 2, 2);
    });
    // enemies
    mapCtx.fillStyle = "#ff4444";
    enemies.forEach(function (e) {
      if (e.dead) return;
      var ep = mapXY(e.pos.x, e.pos.z);
      mapCtx.beginPath(); mapCtx.arc(ep.x, ep.y, 3, 0, Math.PI * 2); mapCtx.fill();
    });
    // cars
    cars.forEach(function (c) {
      var p = mapXY(c.pos.x, c.pos.z);
      if (c.kind === "police") {
        mapCtx.fillStyle = Math.sin(NB.state.time * 10) > 0 ? "#ff4444" : "#4488ff";
      } else if (c.isTarget) {
        mapCtx.fillStyle = "#ffd23b";
      } else {
        mapCtx.fillStyle = "#9a9ab0";
      }
      mapCtx.fillRect(p.x - 2, p.y - 2, 4, 4);
    });
    // player arrow
    if (player) {
      var pp2 = mapXY(player.pos.x, player.pos.z);
      var heading = player.inCar ? player.inCar.heading : player.heading;
      mapCtx.save();
      mapCtx.translate(pp2.x, pp2.y);
      // map: +x is east (right), +z is south (down); heading 0 = +z (down)
      mapCtx.rotate(Math.PI - heading);
      mapCtx.fillStyle = "#ffffff";
      mapCtx.beginPath();
      mapCtx.moveTo(0, -7); mapCtx.lineTo(5, 5); mapCtx.lineTo(-5, 5);
      mapCtx.closePath(); mapCtx.fill();
      mapCtx.restore();
    }
    // border
    mapCtx.strokeStyle = "rgba(255,255,255,0.25)";
    mapCtx.lineWidth = 1;
    mapCtx.strokeRect(0.5, 0.5, W - 1, H - 1);
  }

  // ---------------- 3D effects ----------------
  function addEffect(obj, life) {
    sceneRef.add(obj);
    effects.push({ obj: obj, life: life, max: life });
  }

  function muzzle(pos, heading) {
    var m = new THREE.Mesh(
      new THREE.PlaneGeometry(1.1, 1.1),
      new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    m.position.set(pos.x + Math.sin(heading) * 1.2, 1.35, pos.z + Math.cos(heading) * 1.2);
    m.rotation.y = heading;
    addEffect(m, 0.07);
  }

  function tracer(fromPos, heading, dist) {
    var geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(fromPos.x, 1.4, fromPos.z),
      new THREE.Vector3(fromPos.x + Math.sin(heading) * dist, 1.4, fromPos.z + Math.cos(heading) * dist),
    ]);
    var line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.9 }));
    addEffect(line, 0.12);
  }

  function hitSpark(pos) {
    var geo = new THREE.BufferGeometry();
    var pts = [];
    for (var i = 0; i < 10; i++) {
      pts.push(pos.x + (Math.random() - 0.5) * 0.9, 1.2 + (Math.random() - 0.5) * 0.9, pos.z + (Math.random() - 0.5) * 0.9);
    }
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    var p = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffd23b, size: 0.28 }));
    addEffect(p, 0.25);
  }

  function updateEffects(dt) {
    for (var i = effects.length - 1; i >= 0; i--) {
      var e = effects[i];
      e.life -= dt;
      if (e.obj.material) e.obj.material.opacity = Math.max(0, e.life / e.max);
      if (e.life <= 0) {
        sceneRef.remove(e.obj);
        if (e.obj.geometry) e.obj.geometry.dispose();
        effects.splice(i, 1);
      }
    }
  }

  NB.hud = {
    init: init,
    setHealth: setHealth,
    setMoney: setMoney,
    setStars: setStars,
    setObjective: setObjective,
    setMissionTitle: setMissionTitle,
    say: say,
    prompt: prompt,
    showMessage: showMessage,
    flashDamage: flashDamage,
    shake: shake,
    consumeShake: consumeShake,
    hideScreens: hideScreens,
    show: show,
    drawMinimap: drawMinimap,
    updateEffects: updateEffects,
    els: el,
  };

  NB.effects = {
    muzzle: muzzle,
    tracer: tracer,
    hitSpark: hitSpark,
  };
})();

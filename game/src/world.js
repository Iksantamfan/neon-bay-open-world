// NEON BAY — the city: roads, buildings, harbour, beach, pier, casino,
// neon signs, ocean and sky. Deterministic (seeded) so it looks the same
// on every load. All geometry is built here from primitives.

(function () {
  var U = NB.utils;
  var C = NB.config;
  var THREE = window.THREE;

  var colliders = [];      // { minX, maxX, minZ, maxZ }
  var roadPoints = [];     // points on roads (traffic waypoints)
  var parkSpots = [];      // { x, z, angle } parked-car spots
  var anim = { oceanTex: null, neons: [], beaconMats: [] };
  var beaconGroup = null;

  function canvasTex(w, h, draw) {
    var cv = document.createElement("canvas");
    cv.width = w; cv.height = h;
    draw(cv.getContext("2d"), w, h);
    var tex = new THREE.CanvasTexture(cv);
    tex.anisotropy = 4;
    return tex;
  }

  function addCollider(x, z, hw, hd) {
    colliders.push({ minX: x - hw, maxX: x + hw, minZ: z - hd, maxZ: z + hd });
  }

  // ---------- ground: one big textured plane with the whole road grid ----
  function groundTexture() {
    return canvasTex(1024, 1024, function (g, W, H) {
      var span = 480; // world units covered
      function px(v) { return ((v + span / 2) / span) * W; }
      g.fillStyle = "#262633"; g.fillRect(0, 0, W, H); // asphalt base
      // sidewalks: lighter slabs on every block
      g.fillStyle = "#3b3b4c";
      var roads = [];
      for (var i = -3; i <= 3; i++) roads.push(i * C.roadSpacing);
      for (var a = 0; a < 6; a++) {
        for (var b = 0; b < 6; b++) {
          var x0 = roads[a] + C.roadHalfWidth + 2;
          var z0 = roads[b] + C.roadHalfWidth + 2;
          var s = C.roadSpacing - (C.roadHalfWidth + 2) * 2;
          g.fillRect(px(x0), px(z0), (s / span) * W, (s / span) * H);
        }
      }
      // road centre dashes (yellow) and edge lines (white)
      g.strokeStyle = "#c9a13b"; g.lineWidth = 3; g.setLineDash([14, 18]);
      g.fillStyle = "#c9c9c9";
      roads.forEach(function (r) {
        g.beginPath(); g.moveTo(px(-240), px(r)); g.lineTo(px(240), px(r)); g.stroke();
        g.beginPath(); g.moveTo(px(r), px(-240)); g.lineTo(px(r), px(240)); g.stroke();
      });
      g.setLineDash([]);
      // crosswalks at the centre intersections
      g.fillStyle = "rgba(220,220,230,0.55)";
      [-60, 0, 60].forEach(function (r) {
        [-60, 0, 60].forEach(function (c) {
          for (var k = -2; k <= 2; k++) {
            g.fillRect(px(c + k * 4 - 1.2), px(r - 9), 2.4, 18);
            g.fillRect(px(c - 9), px(r + k * 4 - 1.2), 18, 2.4);
          }
        });
      });
      // beach sand on the west edge
      g.fillStyle = "#8a6f4d";
      g.fillRect(0, 0, px(-210) - px(-240), H);
    });
  }

  // ---------- building facade textures ----------------------------------
  function facadeTexture(base, litRatio, hue) {
    return canvasTex(128, 256, function (g, W, H) {
      g.fillStyle = base; g.fillRect(0, 0, W, H);
      var cols = 6, rows = 14;
      var cw = W / cols, ch = H / rows;
      for (var r = 0; r < rows; r++) {
        for (var c = 0; c < cols; c++) {
          var lit = U.rng() < litRatio;
          if (lit) {
            var pick = U.rng();
            g.fillStyle = pick < 0.55 ? "#ffd27a" : pick < 0.85 ? "#7fe7ff" : "#ff7fd4";
            g.globalAlpha = 0.75 + U.rng() * 0.25;
          } else {
            g.fillStyle = "#101018";
            g.globalAlpha = 1;
          }
          g.fillRect(c * cw + 3, r * ch + 4, cw - 6, ch - 8);
        }
      }
      g.globalAlpha = 1;
      // faint vertical edge shading
      g.fillStyle = "rgba(0,0,0,0.25)";
      g.fillRect(0, 0, 4, H); g.fillRect(W - 4, 0, 4, H);
    });
  }

  function neonSignTexture(text, color, sub) {
    return canvasTex(512, 128, function (g, W, H) {
      g.clearRect(0, 0, W, H);
      g.font = "bold 64px Arial, sans-serif";
      g.textAlign = "center"; g.textBaseline = "middle";
      g.shadowColor = color; g.shadowBlur = 26;
      g.fillStyle = color;
      g.fillText(text, W / 2, sub ? H / 2 - 14 : H / 2);
      g.shadowBlur = 8;
      g.fillText(text, W / 2, sub ? H / 2 - 14 : H / 2);
      if (sub) {
        g.font = "bold 30px Arial, sans-serif";
        g.shadowBlur = 12;
        g.fillStyle = "#ffffff";
        g.fillText(sub, W / 2, H - 26);
      }
    });
  }

  // ---------- buildings --------------------------------------------------
  var facadeMats = [];
  function buildingMaterials() {
    if (facadeMats.length) return facadeMats;
    var defs = [
      ["#2c2f42", 0.34], ["#33364a", 0.42], ["#252838", 0.28],
      ["#3a2f3d", 0.38], ["#2e3a44", 0.3],
    ];
    defs.forEach(function (d) {
      var tex = facadeTexture(d[0], d[1]);
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      facadeMats.push(new THREE.MeshStandardMaterial({
        map: tex, emissiveMap: tex, emissive: 0xffffff,
        emissiveIntensity: 0.85, roughness: 0.9, metalness: 0.08,
      }));
    });
    return facadeMats;
  }

  function addBuilding(group, x, z, w, d, floors, mat) {
    var h = floors * 3.4;
    var tex = mat.map;
    var geo = new THREE.BoxGeometry(w, h, d);
    var mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, h / 2, z);
    group.add(mesh);
    // roof cap (darker slab + a blinking beacon on tall towers)
    var roof = new THREE.Mesh(
      new THREE.BoxGeometry(w + 0.6, 0.5, d + 0.6),
      new THREE.MeshStandardMaterial({ color: 0x1c1e2a, roughness: 1 })
    );
    roof.position.set(x, h + 0.25, z);
    group.add(roof);
    if (floors >= 10) {
      var tip = new THREE.Mesh(
        new THREE.SphereGeometry(0.5, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0xff4444 })
      );
      tip.position.set(x, h + 1.1, z);
      tip.userData.blink = true;
      group.add(tip);
      anim.neons.push(tip);
    }
    addCollider(x, z, w / 2 + 0.4, d / 2 + 0.4);
    return mesh;
  }

  function buildBuildings(scene) {
    var group = new THREE.Group();
    var mats = buildingMaterials();
    var roads = [];
    for (var i = -3; i <= 3; i++) roads.push(i * C.roadSpacing);
    var blockCenters = [];
    for (var a = 0; a < 6; a++) blockCenters.push(roads[a] + C.roadSpacing / 2);

    blockCenters.forEach(function (bx) {
      blockCenters.forEach(function (bz) {
        // special blocks
        if (bx === 150 && bz === -150) return;           // casino
        if (bx <= -90 && bz === 150) return;             // harbour
        if (bx === 0 && bz === 0) return;                // central plaza
        var distC = Math.sqrt(bx * bx + bz * bz);
        var downtown = distC < C.downtownR;
        var n = downtown ? U.randInt(1, 2) : U.randInt(1, 3);
        for (var k = 0; k < n; k++) {
          var w = downtown ? U.rand(16, 26) : U.rand(11, 20);
          var d = downtown ? U.rand(16, 26) : U.rand(11, 20);
          var ox = n === 1 ? 0 : (k === 0 ? -9 : 9) * (U.rng() < 0.5 ? 1 : -1);
          var oz = n === 1 ? 0 : (k === 0 ? 9 : -9) * (U.rng() < 0.5 ? 1 : -1);
          var floors = downtown ? U.randInt(9, 20) : U.randInt(2, 6);
          var mat = mats[U.randInt(0, mats.length - 1)];
          var m = addBuilding(group, bx + ox, bz + oz, w, d, floors, mat);
          // repeat the facade texture so windows stay proportional
          m.material.map.repeat.set(Math.max(1, Math.round(w / 14)), Math.max(1, Math.round(floors / 2)));
          m.material.emissiveMap.repeat.copy(m.material.map.repeat);
        }
        // a tree or two in the suburbs
        if (!downtown && U.rng() < 0.6) {
          var tx = bx + U.rand(-14, 14), tz = bz + U.rand(-14, 14);
          var trunk = new THREE.Mesh(
            new THREE.CylinderGeometry(0.25, 0.35, 2.2, 6),
            new THREE.MeshStandardMaterial({ color: 0x4a3423, roughness: 1 })
          );
          trunk.position.set(tx, 1.1, tz);
          var crown = new THREE.Mesh(
            new THREE.SphereGeometry(U.rand(1.6, 2.4), 8, 6),
            new THREE.MeshStandardMaterial({ color: 0x1f4d2e, roughness: 1 })
          );
          crown.position.set(tx, 3.2, tz);
          group.add(trunk); group.add(crown);
        }
      });
    });
    scene.add(group);
  }

  // ---------- casino -----------------------------------------------------
  function buildCasino(scene) {
    var g = new THREE.Group();
    var x = C.casinoPos.x, z = C.casinoPos.z;
    var base = new THREE.Mesh(
      new THREE.BoxGeometry(34, 16, 26),
      new THREE.MeshStandardMaterial({ color: 0x3d2b52, roughness: 0.7, metalness: 0.3 })
    );
    base.position.set(x, 8, z);
    g.add(base);
    var roof = new THREE.Mesh(
      new THREE.BoxGeometry(36, 1.4, 28),
      new THREE.MeshStandardMaterial({ color: 0xd8a13c, emissive: 0x8a6414, emissiveIntensity: 0.5, roughness: 0.5 })
    );
    roof.position.set(x, 16.7, z);
    g.add(roof);
    var tower = new THREE.Mesh(
      new THREE.BoxGeometry(10, 26, 10),
      new THREE.MeshStandardMaterial({ color: 0x2c2f42, emissiveMap: facadeTexture("#2c2f42", 0.5), emissive: 0xffffff, emissiveIntensity: 0.7, roughness: 0.9 })
    );
    tower.position.set(x + 8, 13, z - 6);
    g.add(tower);
    var signTex = neonSignTexture("CASINO", "#ff2fb3", "NEON BAY");
    var sign = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 7.5),
      new THREE.MeshBasicMaterial({ map: signTex, transparent: true, toneMapped: false })
    );
    sign.position.set(x, 19, z + 13.4);
    g.add(sign);
    addCollider(x, z, 18, 14);
    addCollider(x + 8, z - 6, 6, 6);
    scene.add(g);
    // casino sign glow light
    var pl = new THREE.PointLight(0xff2fb3, 1.4, 55);
    pl.position.set(x, 18, z + 18);
    scene.add(pl);
  }

  // ---------- harbour ----------------------------------------------------
  function buildHarbour(scene) {
    var g = new THREE.Group();
    // docks: concrete fingers into the water at the south-west
    [-150, -90].forEach(function (bx) {
      var dock = new THREE.Mesh(
        new THREE.BoxGeometry(26, 1.2, 46),
        new THREE.MeshStandardMaterial({ color: 0x4a4a55, roughness: 1 })
      );
      dock.position.set(bx, 0.6, 178);
      g.add(dock);
      addCollider(bx, 178, 13, 23);
    });
    // cranes
    [-150, -90].forEach(function (bx) {
      var mast = new THREE.Mesh(
        new THREE.BoxGeometry(3, 26, 3),
        new THREE.MeshStandardMaterial({ color: 0xd8a13c, roughness: 0.6, metalness: 0.4 })
      );
      mast.position.set(bx + 8, 13, 168);
      var jib = new THREE.Mesh(
        new THREE.BoxGeometry(22, 1.6, 1.6),
        new THREE.MeshStandardMaterial({ color: 0xd8a13c, roughness: 0.6, metalness: 0.4 })
      );
      jib.position.set(bx - 2, 24, 168);
      g.add(mast); g.add(jib);
      addCollider(bx + 8, 168, 2, 2);
    });
    // containers
    var cols = [0xc23b2e, 0x2e7fc2, 0x3fae5a, 0xd8a13c, 0x7a4fd0];
    for (var i = 0; i < 10; i++) {
      var cx = -170 + (i % 5) * 9 + U.rand(-1, 1);
      var cz = 138 + Math.floor(i / 5) * 9;
      var stack = U.randInt(1, 2);
      for (var s = 0; s < stack; s++) {
        var cont = new THREE.Mesh(
          new THREE.BoxGeometry(7.5, 2.6, 2.8),
          new THREE.MeshStandardMaterial({ color: cols[U.randInt(0, cols.length - 1)], roughness: 0.8, metalness: 0.3 })
        );
        cont.position.set(cx, 1.3 + s * 2.6, cz);
        g.add(cont);
      }
      addCollider(cx, cz, 4, 1.8);
    }
    scene.add(g);
  }

  // ---------- pier + plaza ----------------------------------------------
  function buildPier(scene) {
    var g = new THREE.Group();
    var deck = new THREE.Mesh(
      new THREE.BoxGeometry(60, 0.8, 8),
      new THREE.MeshStandardMaterial({ color: 0x6b4e2e, roughness: 1 })
    );
    deck.position.set(-252, 1.2, 0);
    g.add(deck);
    for (var i = 0; i < 7; i++) {
      var post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.35, 0.35, 2.6, 6),
        new THREE.MeshStandardMaterial({ color: 0x4a3423, roughness: 1 })
      );
      post.position.set(-228 - i * 8, 0, i % 2 === 0 ? -3.6 : 3.6);
      g.add(post);
    }
    var signTex = neonSignTexture("PIER", "#37e6ff", null);
    var sign = new THREE.Mesh(
      new THREE.PlaneGeometry(12, 3),
      new THREE.MeshBasicMaterial({ map: signTex, transparent: true, toneMapped: false })
    );
    sign.position.set(-228, 7, 0);
    sign.rotation.y = Math.PI / 2;
    g.add(sign);
    addCollider(-252, 0, 30, 3.2);
    scene.add(g);
  }

  function buildPlaza(scene) {
    var g = new THREE.Group();
    var slab = new THREE.Mesh(
      new THREE.CylinderGeometry(9, 10, 0.8, 24),
      new THREE.MeshStandardMaterial({ color: 0x555566, roughness: 0.9 })
    );
    slab.position.set(0, 0.4, 0);
    g.add(slab);
    var pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(1.1, 1.6, 9, 10),
      new THREE.MeshStandardMaterial({ color: 0x8a7fd6, emissive: 0x4a3a8a, emissiveIntensity: 0.5, roughness: 0.6 })
    );
    pillar.position.set(0, 5.2, 0);
    g.add(pillar);
    var orb = new THREE.Mesh(
      new THREE.SphereGeometry(1.8, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0x7fe7ff })
    );
    orb.position.set(0, 11, 0);
    orb.userData.blink = true;
    g.add(orb);
    anim.neons.push(orb);
    addCollider(0, 0, 3, 3);
    scene.add(g);
  }

  // ---------- streetlights, neon signs, sky ------------------------------
  function buildStreetlights(scene) {
    var g = new THREE.Group();
    var poleMat = new THREE.MeshStandardMaterial({ color: 0x30303c, roughness: 0.8, metalness: 0.5 });
    var lampMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
    for (var i = -3; i <= 3; i++) {
      var r = i * C.roadSpacing;
      for (var s = -2; s <= 2; s++) {
        var p = s * 60 + 30;
        [[r + 8.5, p], [p, r + 8.5]].forEach(function (pos) {
          if (Math.abs(pos[0]) > 205 || Math.abs(pos[1]) > 205) return;
          var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 6.4, 6), poleMat);
          pole.position.set(pos[0], 3.2, pos[1]);
          var lamp = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 6), lampMat);
          lamp.position.set(pos[0], 6.5, pos[1]);
          g.add(pole); g.add(lamp);
        });
      }
    }
    scene.add(g);
  }

  function buildNeonSigns(scene) {
    var defs = [
      { t: "NEON BAY", c: "#37e6ff", x: -30, z: -60, ry: 0 },
      { t: "HOTEL", c: "#ff7fd4", x: 60, z: 30, ry: Math.PI },
      { t: "BAR 24H", c: "#ffd27a", x: -90, z: 90, ry: Math.PI / 2 },
      { t: "TACOS", c: "#7dff8a", x: 90, z: -30, ry: -Math.PI / 2 },
      { t: "MOTEL", c: "#ff5a4d", x: 30, z: 120, ry: 0 },
    ];
    defs.forEach(function (d) {
      var tex = neonSignTexture(d.t, d.c, null);
      var sign = new THREE.Mesh(
        new THREE.PlaneGeometry(13, 3.2),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false })
      );
      sign.position.set(d.x, 12, d.z);
      sign.rotation.y = d.ry;
      scene.add(sign);
      anim.neons.push(sign);
    });
  }

  function buildSky(scene) {
    // stars
    var starGeo = new THREE.BufferGeometry();
    var pos = [];
    for (var i = 0; i < 320; i++) {
      var a = U.rng() * Math.PI * 2;
      var e = U.rand(0.25, 1.4);
      var r = 700;
      pos.push(Math.cos(a) * Math.cos(e) * r, Math.sin(e) * r, Math.sin(a) * Math.cos(e) * r);
    }
    starGeo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xcfd8ff, size: 1.6, sizeAttenuation: false })));
    // low moon over the ocean
    var moon = new THREE.Mesh(
      new THREE.CircleGeometry(16, 24),
      new THREE.MeshBasicMaterial({ color: 0xffe9c4, fog: false })
    );
    moon.position.set(-420, 190, -160);
    moon.lookAt(0, 0, 0);
    scene.add(moon);
  }

  // ---------- ocean -------------------------------------------------------
  function buildOcean(scene) {
    var tex = canvasTex(256, 256, function (g, W, H) {
      g.fillStyle = "#0d3355"; g.fillRect(0, 0, W, H);
      g.strokeStyle = "rgba(140,200,255,0.35)"; g.lineWidth = 2;
      for (var i = 0; i < 26; i++) {
        var y = U.rand(0, H);
        g.beginPath();
        for (var x = 0; x <= W; x += 16) g.lineTo(x, y + Math.sin(x * 0.09 + i) * 4);
        g.stroke();
      }
    });
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(10, 10);
    anim.oceanTex = tex;
    var ocean = new THREE.Mesh(
      new THREE.PlaneGeometry(300, 1000),
      new THREE.MeshStandardMaterial({ map: tex, color: 0x9fc8e8, roughness: 0.35, metalness: 0.15 })
    );
    ocean.rotation.x = -Math.PI / 2;
    ocean.position.set(-252 - 150, 0.05, 0);
    scene.add(ocean);
    // sand strip
    var sand = new THREE.Mesh(
      new THREE.PlaneGeometry(24, 480),
      new THREE.MeshStandardMaterial({ color: 0x8a6f4d, roughness: 1 })
    );
    sand.rotation.x = -Math.PI / 2;
    sand.position.set(-240, 0.06, 0);
    scene.add(sand);
  }

  // ---------- mission beacon ----------------------------------------------
  function createBeacon() {
    if (beaconGroup) return beaconGroup;
    var g = new THREE.Group();
    var mat = new THREE.MeshBasicMaterial({ color: 0xffd23b, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false });
    var cyl = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 42, 20, 1, true), mat);
    cyl.position.y = 21;
    g.add(cyl);
    var dia = new THREE.Mesh(
      new THREE.OctahedronGeometry(1.5),
      new THREE.MeshBasicMaterial({ color: 0xffd23b, toneMapped: false })
    );
    dia.position.y = 9;
    g.add(dia);
    var ring = new THREE.Mesh(
      new THREE.RingGeometry(2.6, 3.4, 28),
      new THREE.MeshBasicMaterial({ color: 0xffd23b, transparent: true, opacity: 0.85, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.25;
    g.add(ring);
    g.visible = false;
    anim.beaconMats.push(mat);
    beaconGroup = g;
    return g;
  }

  // ---------- road / parking data -----------------------------------------
  function buildRoadData() {
    var roads = [];
    for (var i = -3; i <= 3; i++) roads.push(i * C.roadSpacing);
    roads.forEach(function (r) {
      for (var v = -195; v <= 195; v += 30) {
        roadPoints.push({ x: v, z: r });
        roadPoints.push({ x: r, z: v });
      }
    });
    // parked cars along curbs
    for (var k = 0; k < 26; k++) {
      var r2 = roads[U.randInt(0, roads.length - 1)];
      var along = U.rand(-180, 180);
      var horizontal = U.rng() < 0.5;
      parkSpots.push({
        x: horizontal ? along : r2 + (U.rng() < 0.5 ? 9.5 : -9.5),
        z: horizontal ? r2 + (U.rng() < 0.5 ? 9.5 : -9.5) : along,
        angle: horizontal ? (U.rng() < 0.5 ? 0 : Math.PI) : (U.rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2),
      });
    }
  }

  function build(scene) {
    colliders = [];
    roadPoints = [];
    parkSpots = [];
    // ground
    var ground = new THREE.Mesh(
      new THREE.PlaneGeometry(480, 480),
      new THREE.MeshStandardMaterial({ map: groundTexture(), roughness: 0.95 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, 0, 0);
    scene.add(ground);
    // outer ground skirt so the horizon is not void
    var skirt = new THREE.Mesh(
      new THREE.PlaneGeometry(1400, 1400),
      new THREE.MeshStandardMaterial({ color: 0x1b1b26, roughness: 1 })
    );
    skirt.rotation.x = -Math.PI / 2;
    skirt.position.set(0, -0.4, 0);
    scene.add(skirt);

    buildBuildings(scene);
    buildCasino(scene);
    buildHarbour(scene);
    buildPier(scene);
    buildPlaza(scene);
    buildStreetlights(scene);
    buildNeonSigns(scene);
    buildSky(scene);
    buildOcean(scene);
    buildRoadData();
    scene.add(createBeacon());

    // deep water is a wall: you cannot swim out
    colliders.push({ minX: -1000, maxX: C.oceanX - 4, minZ: -1000, maxZ: 1000 });
    // city bounds
    colliders.push({ minX: 216, maxX: 1000, minZ: -1000, maxZ: 1000 });
    colliders.push({ minX: -1000, maxX: 1000, minZ: 216, maxZ: 1000 });
    colliders.push({ minX: -1000, maxX: 1000, minZ: -1000, maxZ: -216 });

    return {
      colliders: colliders,
      roadPoints: roadPoints,
      parkSpots: parkSpots,
      beacon: beaconGroup,
    };
  }

  function collideCircle(x, z, radius) {
    // returns corrected {x,z} after pushing a circle out of every AABB
    var nx = x, nz = z;
    for (var i = 0; i < colliders.length; i++) {
      var c = colliders[i];
      var cx = Math.max(c.minX, Math.min(nx, c.maxX));
      var cz = Math.max(c.minZ, Math.min(nz, c.maxZ));
      var dx = nx - cx, dz = nz - cz;
      var d2 = dx * dx + dz * dz;
      if (d2 < radius * radius) {
        if (d2 < 0.0001) {
          // inside the box: push out along the smallest penetration axis
          var pl = nx - c.minX, pr = c.maxX - nx, pt = nz - c.minZ, pb = c.maxZ - nz;
          var m = Math.min(pl, pr, pt, pb);
          if (m === pl) nx = c.minX - radius;
          else if (m === pr) nx = c.maxX + radius;
          else if (m === pt) nz = c.minZ - radius;
          else nz = c.maxZ + radius;
        } else {
          var d = Math.sqrt(d2);
          nx = cx + (dx / d) * radius;
          nz = cz + (dz / d) * radius;
        }
      }
    }
    return { x: nx, z: nz };
  }

  function update(dt, t) {
    if (anim.oceanTex) anim.oceanTex.offset.y = (t * 0.02) % 1;
    var flick = 0.72 + Math.sin(t * 7.3) * 0.08 + Math.sin(t * 13.7) * 0.05;
    anim.neons.forEach(function (n) {
      if (n.material && n.material.color) {
        if (n.userData.blink) {
          n.material.color.setHex(Math.sin(t * 2.4) > 0 ? 0xff4444 : 0x881111);
        }
      }
      if (n.material && n.material.opacity !== undefined) n.material.opacity = flick;
    });
    if (beaconGroup && beaconGroup.visible) {
      beaconGroup.children[1].position.y = 9 + Math.sin(t * 2.2) * 0.7;
      beaconGroup.children[1].rotation.y = t * 1.6;
      beaconGroup.children[2].scale.setScalar(1 + Math.sin(t * 3) * 0.12);
    }
  }

  NB.world = {
    build: build,
    update: update,
    collideCircle: collideCircle,
    createBeacon: createBeacon,
  };
})();

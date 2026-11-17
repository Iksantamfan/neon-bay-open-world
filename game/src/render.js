// Re-authored in the r3 rebuild session (2026-11-18).
// Drawing only: the three.js scene, the chase camera, the HUD and the
// minimap. The game logic never lives here — this module paints what the
// state already decided, so a screenshot is a frame of the real game.

import { FONT, PALETTE } from './config.js';
import { ROADS } from './world.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_BUSTED = 'busted';
export const SCREEN_COMPLETE = 'complete';

const THREE = window.THREE;

function skyTexture() {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, PALETTE.skyTop);
  grad.addColorStop(0.45, PALETTE.skyMid);
  grad.addColorStop(0.75, PALETTE.skyLow);
  grad.addColorStop(1, '#ffe8b8');
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.encoding = THREE.sRGBEncoding;
  return tex;
}

export function createRenderer(canvas, hud) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(PALETTE.fog, 120, 560);

  // sunset sky dome
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(700, 24, 16),
    new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, fog: false }),
  );
  scene.add(sky);

  const hemi = new THREE.HemisphereLight(0xffd9a0, 0x4a3a3a, 0.75);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(PALETTE.sun, 1.25);
  sun.position.set(-180, 130, 220); // low sun over the ocean, south-west
  scene.add(sun);

  const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 1600);
  camera.position.set(0, 30, 60);

  // --- mission beacon: a pulsing column of light on the objective ---
  const beaconMat = new THREE.MeshBasicMaterial({
    color: 0xffd94d, transparent: true, opacity: 0.32,
    side: THREE.DoubleSide, depthWrite: false,
  });
  const beacon = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 34, 12, 1, true), beaconMat);
  beacon.visible = false;
  scene.add(beacon);
  const beaconGem = new THREE.Mesh(
    new THREE.OctahedronGeometry(1.6),
    new THREE.MeshBasicMaterial({ color: 0xffd94d }),
  );
  beaconGem.visible = false;
  scene.add(beaconGem);

  // --- tracers + muzzle flash ---
  const tracers = [];
  for (let i = 0; i < 10; i += 1) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0 }));
    line.frustumCulled = false;
    scene.add(line);
    tracers.push({ line, life: 0 });
  }
  let tracerNext = 0;
  const flash = new THREE.PointLight(0xffd28a, 0, 16);
  scene.add(flash);

  // --- camera state ---
  const cam = { yaw: 0, pitch: 0.34, dist: 9, tx: 0, ty: 2, tz: 0 };

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener('resize', resize);

  function updateCamera(dt, target, wantYaw, driving) {
    // ease the camera behind the target; driving pulls it behind the car
    let dy = wantYaw - cam.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    cam.yaw += dy * Math.min(1, dt * (driving ? 2.2 : 5));
    cam.tx += (target.x - cam.tx) * Math.min(1, dt * 8);
    cam.ty += (target.y + 2 - cam.ty) * Math.min(1, dt * 8);
    cam.tz += (target.z - cam.tz) * Math.min(1, dt * 8);
    const cx = cam.tx - Math.sin(cam.yaw) * Math.cos(cam.pitch) * cam.dist;
    const cz = cam.tz - Math.cos(cam.yaw) * Math.cos(cam.pitch) * cam.dist;
    const cy = cam.ty + Math.sin(cam.pitch) * cam.dist;
    camera.position.set(cx, Math.max(1.2, cy), cz);
    camera.lookAt(cam.tx, cam.ty, cam.tz);
  }

  function fireTracer(from, to) {
    const t = tracers[tracerNext];
    tracerNext = (tracerNext + 1) % tracers.length;
    const p = t.line.geometry.attributes.position.array;
    p[0] = from.x; p[1] = from.y; p[2] = from.z;
    p[3] = to.x; p[4] = to.y; p[5] = to.z;
    t.line.geometry.attributes.position.needsUpdate = true;
    t.line.material.opacity = 0.95;
    t.life = 0.09;
    flash.position.set(from.x, from.y, from.z);
    flash.intensity = 3;
  }

  function updateFx(dt) {
    for (const t of tracers) {
      if (t.life > 0) {
        t.life -= dt;
        t.line.material.opacity = Math.max(0, t.life / 0.09) * 0.95;
      }
    }
    if (flash.intensity > 0) flash.intensity = Math.max(0, flash.intensity - dt * 30);
  }

  // --- minimap ---
  const mapCtx = hud.minimap.getContext('2d');
  function drawMinimap(s) {
    const W = hud.minimap.width;
    const H = hud.minimap.height;
    const mx = (x) => ((x + 230) / 460) * W;
    const my = (z) => ((z + 230) / 500) * H;
    mapCtx.fillStyle = '#20242e';
    mapCtx.fillRect(0, 0, W, H);
    // water + sand at the bottom (south)
    mapCtx.fillStyle = '#1d6f8f';
    mapCtx.fillRect(0, my(210), W, H - my(210));
    mapCtx.fillStyle = '#e8c98f';
    mapCtx.fillRect(0, my(182), W, my(210) - my(182));
    // blocks
    mapCtx.fillStyle = '#5a6068';
    for (let bx = -140; bx <= 140; bx += 70) {
      for (let bz = -140; bz <= 140; bz += 70) {
        mapCtx.fillRect(mx(bx - 28), my(bz - 28), mx(56) - mx(0), my(56) - my(0));
      }
    }
    // roads
    mapCtx.strokeStyle = '#2c2f36';
    mapCtx.lineWidth = 4;
    for (const r of ROADS) {
      mapCtx.beginPath(); mapCtx.moveTo(mx(r), 0); mapCtx.lineTo(mx(r), my(182)); mapCtx.stroke();
      mapCtx.beginPath(); mapCtx.moveTo(0, my(r)); mapCtx.lineTo(W, my(r)); mapCtx.stroke();
    }
    const dot = (x, z, color, r) => {
      mapCtx.fillStyle = color;
      mapCtx.beginPath();
      mapCtx.arc(mx(x), my(z), r, 0, Math.PI * 2);
      mapCtx.fill();
    };
    for (const c of s.trafficDots) dot(c.x, c.z, '#9aa0a8', 2);
    for (const p of s.policeDots) dot(p.x, p.z, '#ff3b30', 3);
    for (const r of s.rivalDots) dot(r.x, r.z, '#ff3b30', 3);
    if (s.marker) {
      const pulse = 4 + Math.sin(s.time * 5) * 1.5;
      mapCtx.fillStyle = '#ffd94d';
      mapCtx.save();
      mapCtx.translate(mx(s.marker.x), my(s.marker.z));
      mapCtx.rotate(Math.PI / 4);
      mapCtx.fillRect(-pulse / 2, -pulse / 2, pulse, pulse);
      mapCtx.restore();
    }
    // player arrow
    mapCtx.save();
    mapCtx.translate(mx(s.px), my(s.pz));
    mapCtx.rotate(Math.atan2(Math.sin(s.pyaw), Math.cos(s.pyaw)) + Math.PI);
    mapCtx.fillStyle = '#ffffff';
    mapCtx.beginPath();
    mapCtx.moveTo(0, -6);
    mapCtx.lineTo(4.5, 5);
    mapCtx.lineTo(-4.5, 5);
    mapCtx.closePath();
    mapCtx.fill();
    mapCtx.restore();
  }

  function stars(n) {
    let out = '';
    for (let i = 0; i < 5; i += 1) out += i < n ? '★' : '☆';
    return out;
  }

  /** Paint the HUD for one frame. s carries the numbers the HUD shows. */
  function drawHud(s) {
    hud.cash.textContent = `$${s.cash.toLocaleString('en-US')}`;
    hud.healthFill.style.width = `${Math.max(0, s.health)}%`;
    hud.healthFill.style.background = s.health > 30 ? PALETTE.health : '#ff5a4e';
    hud.stars.textContent = stars(s.wanted);
    hud.stars.style.visibility = s.wanted > 0 ? 'visible' : 'hidden';
    hud.objective.textContent = s.objective;
    hud.speed.textContent = s.driving ? `${Math.round(s.speedKmh)} km/h · ${s.carName}` : '';
    hud.prompt.textContent = s.prompt || '';
    hud.prompt.style.display = s.prompt ? 'block' : 'none';
    hud.crosshair.style.display = s.driving ? 'none' : 'block';
    // message feed: newest first, at most 3 lines
    hud.feed.innerHTML = '';
    for (const line of s.feed.slice(-3)) {
      const div = document.createElement('div');
      div.textContent = line;
      hud.feed.appendChild(div);
    }
    drawMinimap(s);
    // objective arrow: project the marker; clamp to the screen edge
    if (s.markerWorld) {
      const v = s.markerWorld.clone().project(camera);
      const behind = v.z > 1;
      let nx = behind ? -v.x : v.x;
      let ny = behind ? -v.y : v.y;
      const angle = Math.atan2(ny, nx);
      const edge = 0.86;
      const ex = Math.cos(angle) * edge;
      const ey = Math.sin(angle) * edge;
      const sx = (ex * 0.5 + 0.5) * window.innerWidth;
      const sy = (-ey * 0.5 + 0.5) * window.innerHeight;
      hud.arrow.style.display = 'block';
      hud.arrow.style.left = `${sx}px`;
      hud.arrow.style.top = `${sy}px`;
      hud.arrow.style.transform = `translate(-50%, -50%) rotate(${angle + Math.PI / 2}rad)`;
      const d = Math.hypot(s.markerWorld.x - s.px, s.markerWorld.z - s.pz);
      hud.arrowLabel.textContent = `${Math.round(d)}m`;
      hud.arrowLabel.style.left = `${sx}px`;
      hud.arrowLabel.style.top = `${sy + 22}px`;
    } else {
      hud.arrow.style.display = 'none';
      hud.arrowLabel.textContent = '';
    }
  }

  function showScreen(name) {
    for (const [key, el] of Object.entries(hud.screens)) {
      el.style.display = key === name ? 'flex' : 'none';
    }
    hud.hud.style.display = name === SCREEN_PLAY ? 'block' : 'none';
  }

  function banner(text, sub) {
    hud.bannerText.textContent = text;
    hud.bannerSub.textContent = sub || '';
    hud.banner.classList.add('show');
    window.setTimeout(() => hud.banner.classList.remove('show'), 3200);
  }

  function setBeacon(x, z, visible, time) {
    beacon.visible = visible;
    beaconGem.visible = visible;
    if (!visible) return;
    beacon.position.set(x, 17, z);
    beacon.material.opacity = 0.26 + Math.sin(time * 3) * 0.1;
    beaconGem.position.set(x, 26 + Math.sin(time * 2) * 1.2, z);
    beaconGem.rotation.y = time;
  }

  function render() {
    renderer.render(scene, camera);
  }

  return {
    scene, camera, renderer, cam,
    updateCamera, drawHud, showScreen, banner, setBeacon, fireTracer, updateFx, render,
  };
}

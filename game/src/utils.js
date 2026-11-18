// NEON BAY — small math and random helpers (no dependencies).

(function () {
  // Seeded RNG (mulberry32) so the city is identical on every load.
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  var rng = mulberry32(20261118);

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function rand(lo, hi) { return lo + rng() * (hi - lo); }
  function randInt(lo, hi) { return Math.floor(rand(lo, hi + 1)); }
  function choice(arr) { return arr[Math.floor(rng() * arr.length)]; }
  function dist2(ax, az, bx, bz) {
    var dx = ax - bx, dz = az - bz;
    return Math.sqrt(dx * dx + dz * dz);
  }
  function angleLerp(a, b, t) {
    var d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return a + d * t;
  }
  function fmtMoney(n) {
    return "$" + Math.floor(n).toLocaleString("en-US");
  }
  function pad2(n) { return (n < 10 ? "0" : "") + n; }
  function fmtTime(sec) {
    var m = Math.floor(sec / 60), s = Math.floor(sec % 60);
    return pad2(m) + ":" + pad2(s);
  }

  NB.utils = {
    mulberry32: mulberry32,
    rng: rng,
    clamp: clamp,
    lerp: lerp,
    rand: rand,
    randInt: randInt,
    choice: choice,
    dist2: dist2,
    angleLerp: angleLerp,
    fmtMoney: fmtMoney,
    fmtTime: fmtTime,
  };
})();

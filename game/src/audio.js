// NEON BAY — synthesised sound. WebAudio only, no audio files.
// Every sound is built from oscillators and filtered noise at run time.

(function () {
  var ctx = null;
  var master = null;
  var engineNodes = null;   // { osc1, osc2, gain, filter }
  var sirenNodes = null;    // { osc, gain }
  var muted = false;
  var sirenOn = false;

  function ensure() {
    if (ctx) return true;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    } catch (e) { ctx = null; }
    return !!ctx;
  }

  function resume() {
    if (ensure() && ctx.state === "suspended") ctx.resume();
  }

  function noiseBuffer(seconds) {
    var len = Math.floor(ctx.sampleRate * seconds);
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  function blip(freq, dur, type, vol, slideTo) {
    if (!ensure() || muted) return;
    resume();
    var t = ctx.currentTime;
    var osc = ctx.createOscillator();
    var g = ctx.createGain();
    osc.type = type || "square";
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t + dur);
    g.gain.setValueAtTime(vol || 0.15, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g); g.connect(master);
    osc.start(t); osc.stop(t + dur + 0.02);
  }

  function burst(dur, filterFreq, vol, type) {
    if (!ensure() || muted) return;
    resume();
    var t = ctx.currentTime;
    var src = ctx.createBufferSource();
    src.buffer = noiseBuffer(dur + 0.05);
    var filt = ctx.createBiquadFilter();
    filt.type = type || "bandpass";
    filt.frequency.value = filterFreq;
    filt.Q.value = 0.8;
    var g = ctx.createGain();
    g.gain.setValueAtTime(vol || 0.3, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filt); filt.connect(g); g.connect(master);
    src.start(t); src.stop(t + dur + 0.05);
  }

  function engineStart() {
    if (!ensure() || engineNodes) return;
    resume();
    var osc1 = ctx.createOscillator();
    var osc2 = ctx.createOscillator();
    var filt = ctx.createBiquadFilter();
    var g = ctx.createGain();
    osc1.type = "sawtooth"; osc1.frequency.value = 55;
    osc2.type = "square"; osc2.frequency.value = 28;
    filt.type = "lowpass"; filt.frequency.value = 320; filt.Q.value = 2;
    g.gain.value = 0.0;
    osc1.connect(filt); osc2.connect(filt);
    filt.connect(g); g.connect(master);
    osc1.start(); osc2.start();
    engineNodes = { osc1: osc1, osc2: osc2, gain: g, filter: filt };
  }

  function engineSet(speedNorm, on) {
    if (!engineNodes) return;
    var t = ctx.currentTime;
    var target = on ? 0.05 + speedNorm * 0.075 : 0.0;
    engineNodes.gain.gain.setTargetAtTime(target, t, 0.08);
    var f = 52 + speedNorm * 165;
    engineNodes.osc1.frequency.setTargetAtTime(f, t, 0.06);
    engineNodes.osc2.frequency.setTargetAtTime(f * 0.5, t, 0.06);
    engineNodes.filter.frequency.setTargetAtTime(300 + speedNorm * 900, t, 0.1);
  }

  function engineStop() {
    if (!engineNodes) return;
    try { engineNodes.osc1.stop(); engineNodes.osc2.stop(); } catch (e) {}
    engineNodes = null;
  }

  function sirenStart() {
    if (!ensure() || sirenNodes) return;
    resume();
    var osc = ctx.createOscillator();
    var g = ctx.createGain();
    osc.type = "sine"; osc.frequency.value = 750;
    g.gain.value = 0.0;
    osc.connect(g); g.connect(master);
    osc.start();
    sirenNodes = { osc: osc, gain: g };
    sirenOn = true;
  }

  function sirenUpdate(t, near) {
    if (!sirenNodes) return;
    var f = 720 + Math.sin(t * 5.2) * 260;
    sirenNodes.osc.frequency.setTargetAtTime(f, ctx.currentTime, 0.05);
    sirenNodes.gain.gain.setTargetAtTime(near ? 0.045 : 0.0, ctx.currentTime, 0.2);
  }

  function sirenStop() {
    if (!sirenNodes) return;
    try { sirenNodes.osc.stop(); } catch (e) {}
    sirenNodes = null;
    sirenOn = false;
  }

  function jingle() {
    if (!ensure() || muted) return;
    resume();
    var notes = [523.25, 659.25, 783.99, 1046.5];
    var t0 = ctx.currentTime + 0.02;
    for (var i = 0; i < notes.length; i++) {
      var osc = ctx.createOscillator();
      var g = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.value = notes[i];
      g.gain.setValueAtTime(0.0001, t0 + i * 0.11);
      g.gain.exponentialRampToValueAtTime(0.22, t0 + i * 0.11 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + i * 0.11 + 0.34);
      osc.connect(g); g.connect(master);
      osc.start(t0 + i * 0.11); osc.stop(t0 + i * 0.11 + 0.4);
    }
  }

  function setMuted(m) {
    muted = !!m;
    if (master) master.gain.value = muted ? 0 : 0.5;
  }

  NB.audio = {
    ensure: ensure,
    resume: resume,
    setMuted: setMuted,
    isMuted: function () { return muted; },
    uiClick: function () { blip(880, 0.07, "square", 0.12); },
    uiBeep: function () { blip(660, 0.09, "sine", 0.14); },
    denied: function () { blip(180, 0.16, "sawtooth", 0.12, 110); },
    step: function () { burst(0.05, 300, 0.05, "lowpass"); },
    punch: function () { blip(150, 0.12, "sine", 0.3, 55); burst(0.08, 500, 0.12, "lowpass"); },
    shot: function () { burst(0.14, 1800, 0.4, "bandpass"); blip(220, 0.1, "square", 0.18, 60); },
    hurt: function () { blip(140, 0.2, "sawtooth", 0.2, 70); },
    pickup: function () { blip(990, 0.08, "sine", 0.16); blip(1320, 0.12, "sine", 0.14); },
    engineStart: engineStart,
    engineSet: engineSet,
    engineStop: engineStop,
    sirenStart: sirenStart,
    sirenUpdate: sirenUpdate,
    sirenStop: sirenStop,
    sirenActive: function () { return sirenOn; },
    jingle: jingle,
  };
})();

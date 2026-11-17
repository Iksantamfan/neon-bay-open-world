// Every sound is synthesized with WebAudio — no audio files, no network.
// Engine hum, police sirens, gunshots, cash chimes, mission stings and a
// slow sunset pad. Created on the first user gesture; M mutes everything.

export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineOsc2 = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenTimer = null;
  let padTimer = null;
  let muted = false;
  let started = false;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    } catch {
      return false;
    }
    return true;
  }

  function startEngine() {
    if (!ctx || engineOsc) return;
    engineOsc = ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 55;
    engineOsc2 = ctx.createOscillator();
    engineOsc2.type = 'square';
    engineOsc2.frequency.value = 28;
    engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    engineOsc.connect(filter);
    engineOsc2.connect(filter);
    filter.connect(engineGain);
    engineGain.connect(master);
    engineOsc.start();
    engineOsc2.start();
  }

  function startPad() {
    if (!ctx || padTimer) return;
    const chords = [
      [220.0, 261.63, 329.63],
      [174.61, 220.0, 261.63],
      [196.0, 246.94, 293.66],
      [146.83, 220.0, 293.66],
    ];
    let chord = 0;
    const playChord = () => {
      if (muted) return;
      const notes = chords[chord % chords.length];
      chord += 1;
      for (const freq of notes) {
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = freq;
        osc.detune.value = 4;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, ctx.currentTime);
        g.gain.linearRampToValueAtTime(0.05, ctx.currentTime + 1.2);
        g.gain.linearRampToValueAtTime(0, ctx.currentTime + 7.5);
        osc.connect(g);
        g.connect(master);
        osc.start();
        osc.stop(ctx.currentTime + 8);
      }
    };
    playChord();
    padTimer = window.setInterval(playChord, 6000);
  }

  function blip(freq, dur, type, vol, when = 0) {
    if (!ctx || muted) return;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  return {
    /** Call from the first click/keypress; safe to call more than once. */
    unlock() {
      if (started) return;
      if (!ensure()) return;
      started = true;
      if (ctx.state === 'suspended') ctx.resume();
      startEngine();
      startPad();
    },
    get muted() {
      return muted;
    },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    /** speed01: 0..1, throttle01: 0..1 — called every frame while driving. */
    engine(speed01, throttle01, driving) {
      if (!ctx || !engineGain) return;
      const target = driving ? 0.05 + throttle01 * 0.06 + speed01 * 0.03 : 0.015;
      engineGain.gain.setTargetAtTime(muted ? 0 : target, ctx.currentTime, 0.1);
      const f = 50 + speed01 * 130 + throttle01 * 25;
      engineOsc.frequency.setTargetAtTime(f, ctx.currentTime, 0.08);
      engineOsc2.frequency.setTargetAtTime(f / 2, ctx.currentTime, 0.08);
    },
    siren(on) {
      if (!ctx) return;
      if (on && !sirenOsc) {
        sirenOsc = ctx.createOscillator();
        sirenOsc.type = 'square';
        sirenOsc.frequency.value = 720;
        sirenGain = ctx.createGain();
        sirenGain.gain.value = 0.035;
        sirenOsc.connect(sirenGain);
        sirenGain.connect(master);
        sirenOsc.start();
        let high = false;
        sirenTimer = window.setInterval(() => {
          if (!sirenOsc) return;
          high = !high;
          sirenOsc.frequency.setTargetAtTime(high ? 960 : 720, ctx.currentTime, 0.05);
        }, 420);
      } else if (!on && sirenOsc) {
        window.clearInterval(sirenTimer);
        sirenTimer = null;
        sirenOsc.stop();
        sirenOsc = null;
        sirenGain = null;
      }
    },
    shot() {
      if (!ctx || muted) return;
      const len = ctx.sampleRate * 0.12;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 1800;
      const g = ctx.createGain();
      g.gain.value = 0.5;
      src.connect(filter);
      filter.connect(g);
      g.connect(master);
      src.start();
      blip(160, 0.09, 'sine', 0.4);
    },
    crash() {
      if (!ctx || muted) return;
      const len = ctx.sampleRate * 0.25;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len) * 0.8;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 500;
      const g = ctx.createGain();
      g.gain.value = 0.6;
      src.connect(filter);
      filter.connect(g);
      g.connect(master);
      src.start();
    },
    cash() {
      blip(880, 0.12, 'sine', 0.25);
      blip(1318, 0.18, 'sine', 0.25, 0.09);
    },
    pickup() {
      blip(660, 0.1, 'triangle', 0.22);
      blip(990, 0.14, 'triangle', 0.22, 0.08);
    },
    sting() {
      blip(523, 0.16, 'triangle', 0.25);
      blip(659, 0.16, 'triangle', 0.25, 0.12);
      blip(784, 0.3, 'triangle', 0.28, 0.24);
    },
    fail() {
      blip(311, 0.25, 'sawtooth', 0.18);
      blip(233, 0.4, 'sawtooth', 0.18, 0.2);
    },
  };
}

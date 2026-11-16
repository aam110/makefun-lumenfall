// Every sound in LUMENFALL is synthesized with WebAudio oscillators — no
// audio files ship with the game, so it stays fully offline. The module is
// lazy and guarded: nothing is created until the first user gesture calls
// unlock(), and every call is a no-op where there is no AudioContext (a
// headless test, a Node import), so the game logic never depends on sound.
//
// Two layers: short effects (slash, hit, dash, pickup, hurt, portal, boss,
// win, lose) and a slow ambient pad that drifts under the whole descent.

let ctx = null;
let master = null;
let musicNodes = [];
let muted = false;

function ensureContext() {
  if (ctx) return ctx;
  if (typeof window === 'undefined') return null;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  ctx = new AudioContextClass();
  master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(ctx.destination);
  return ctx;
}

/** Create (or resume) the audio graph. Call from a user gesture. */
export function unlockAudio() {
  const audio = ensureContext();
  if (audio && audio.state === 'suspended') audio.resume().catch(() => {});
  if (audio && musicNodes.length === 0) startMusic();
}

/** Silence everything, keeping the graph alive. */
export function setMuted(value) {
  muted = value;
  if (master) master.gain.value = value ? 0 : 0.5;
}

export function isMuted() {
  return muted;
}

function tone({ frequency, endFrequency, duration, type = 'sine', volume = 0.2, delay = 0 }) {
  if (muted) return;
  const audio = ensureContext();
  if (!audio || !master) return;
  const start = audio.currentTime + delay;
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, start);
  if (endFrequency !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), start + duration);
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(volume, start + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain);
  gain.connect(master);
  osc.start(start);
  osc.stop(start + duration + 0.05);
}

function noiseBurst({ duration, volume = 0.15, delay = 0, lowpass = 1200 }) {
  if (muted) return;
  const audio = ensureContext();
  if (!audio || !master) return;
  const start = audio.currentTime + delay;
  const length = Math.max(1, Math.floor(audio.sampleRate * duration));
  const buffer = audio.createBuffer(1, length, audio.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
  const source = audio.createBufferSource();
  source.buffer = buffer;
  const filter = audio.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = lowpass;
  const gain = audio.createGain();
  gain.gain.setValueAtTime(volume, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(master);
  source.start(start);
}

/** The named effects. Each is one or two tones; nothing reads a file. */
export const sfx = {
  slash() { tone({ frequency: 720, endFrequency: 240, duration: 0.09, type: 'triangle', volume: 0.16 }); },
  hit() { tone({ frequency: 190, endFrequency: 90, duration: 0.08, type: 'square', volume: 0.12 }); },
  kill() {
    tone({ frequency: 520, endFrequency: 120, duration: 0.16, type: 'sawtooth', volume: 0.1 });
    noiseBurst({ duration: 0.12, volume: 0.1, lowpass: 900 });
  },
  dash() { tone({ frequency: 300, endFrequency: 900, duration: 0.12, type: 'sine', volume: 0.12 }); },
  hurt() {
    tone({ frequency: 140, endFrequency: 60, duration: 0.25, type: 'sawtooth', volume: 0.2 });
    noiseBurst({ duration: 0.15, volume: 0.12, lowpass: 500 });
  },
  pickup() { tone({ frequency: 880, endFrequency: 1320, duration: 0.1, type: 'sine', volume: 0.12 }); },
  heart() {
    tone({ frequency: 660, duration: 0.1, type: 'sine', volume: 0.14 });
    tone({ frequency: 990, duration: 0.16, type: 'sine', volume: 0.14, delay: 0.09 });
  },
  portal() {
    tone({ frequency: 440, endFrequency: 880, duration: 0.35, type: 'sine', volume: 0.14 });
    tone({ frequency: 660, endFrequency: 1320, duration: 0.35, type: 'sine', volume: 0.08, delay: 0.08 });
  },
  blessing() {
    [523, 659, 784].forEach((f, i) => tone({ frequency: f, duration: 0.22, type: 'triangle', volume: 0.12, delay: i * 0.08 }));
  },
  boss() {
    tone({ frequency: 80, endFrequency: 40, duration: 0.6, type: 'sawtooth', volume: 0.22 });
    tone({ frequency: 120, endFrequency: 60, duration: 0.5, type: 'square', volume: 0.1, delay: 0.1 });
  },
  victory() {
    [523, 659, 784, 1047].forEach((f, i) => tone({ frequency: f, duration: 0.3, type: 'triangle', volume: 0.14, delay: i * 0.12 }));
  },
  defeat() {
    [392, 330, 262, 196].forEach((f, i) => tone({ frequency: f, duration: 0.35, type: 'sine', volume: 0.14, delay: i * 0.16 }));
  },
  click() { tone({ frequency: 1200, duration: 0.05, type: 'sine', volume: 0.08 }); },
};

/** A slow two-oscillator pad that drifts under the descent. */
function startMusic() {
  const audio = ensureContext();
  if (!audio || !master) return;
  const notes = [110, 164.81, 220, 261.63];
  notes.forEach((frequency, i) => {
    const osc = audio.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = frequency;
    const gain = audio.createGain();
    gain.gain.value = 0.0;
    const lfo = audio.createOscillator();
    lfo.frequency.value = 0.05 + i * 0.03;
    const lfoGain = audio.createGain();
    lfoGain.gain.value = 0.016;
    lfo.connect(lfoGain);
    lfoGain.connect(gain.gain);
    gain.gain.value = 0.02;
    osc.connect(gain);
    gain.connect(master);
    osc.start();
    lfo.start();
    musicNodes.push(osc, lfo);
  });
}

// Sound with no audio files: every effect is a small WebAudio synth patch — an
// oscillator or a burst of filtered noise, shaped by a gain envelope. The context is
// created on the first user gesture (a browser will not let it start before one),
// and M toggles mute. Nothing here touches the DOM except the AudioContext itself.

const MASTER = 0.16;

export function createAudio() {
  let context = null;
  let master = null;
  let muted = false;

  function ensure() {
    if (context !== null) return true;
    try {
      const Ctor = window.AudioContext ?? window.webkitAudioContext;
      if (!Ctor) return false;
      context = new Ctor();
      master = context.createGain();
      master.gain.value = MASTER;
      master.connect(context.destination);
      return true;
    } catch {
      return false;
    }
  }

  /** Resume a context the browser suspended; call from any user gesture. */
  function unlock() {
    if (ensure() && context.state === 'suspended') context.resume().catch(() => {});
  }

  function tone(freq, dur, type, vol, slideTo) {
    if (!ensure() || muted) return;
    const now = context.currentTime;
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), now + dur);
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(now);
    osc.stop(now + dur + 0.02);
  }

  function noise(dur, vol, cutoff) {
    if (!ensure() || muted) return;
    const now = context.currentTime;
    const length = Math.max(1, Math.floor(context.sampleRate * dur));
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const src = context.createBufferSource();
    src.buffer = buffer;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const gain = context.createGain();
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start(now);
  }

  return {
    unlock,
    toggleMute() {
      muted = !muted;
      return muted;
    },
    isMuted() {
      return muted;
    },
    /** Pickup blip; the pitch climbs with the combo so a streak sounds like one. */
    orb(combo) {
      tone(520 * 2 ** ((combo - 1) / 6), 0.14, 'sine', 0.5, 780 * 2 ** ((combo - 1) / 6));
    },
    shoot() {
      tone(880, 0.07, 'square', 0.12, 320);
    },
    droneDown() {
      noise(0.22, 0.4, 1400);
      tone(180, 0.18, 'sawtooth', 0.25, 60);
    },
    hit() {
      noise(0.3, 0.5, 700);
      tone(140, 0.3, 'sawtooth', 0.4, 45);
    },
    dash() {
      noise(0.16, 0.3, 2400);
    },
    surge() {
      tone(330, 0.12, 'triangle', 0.35);
      setTimeout(() => tone(440, 0.16, 'triangle', 0.35), 110);
    },
    win() {
      [523, 659, 784, 1047].forEach((freq, i) => setTimeout(() => tone(freq, 0.3, 'triangle', 0.4), i * 130));
    },
    lose() {
      [392, 311, 233, 175].forEach((freq, i) => setTimeout(() => tone(freq, 0.34, 'sawtooth', 0.25), i * 160));
    },
  };
}

export interface SoundGenerator {
  outputNode: GainNode;
  stop(): void;
}

type GeneratorFn = (ctx: AudioContext) => SoundGenerator;

// ── Utility: create a looping noise buffer ──

function createNoiseBuffer(ctx: AudioContext, seconds: number, type: 'white' | 'brown' | 'pink'): AudioBuffer {
  const length = ctx.sampleRate * seconds;
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);

  if (type === 'white') {
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
  } else if (type === 'brown') {
    let last = 0;
    for (let i = 0; i < length; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      data[i] = last * 3.5;
    }
  } else {
    // Pink noise via Paul Kellet's algorithm
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < length; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.96900 * b2 + w * 0.1538520;
      b3 = 0.86650 * b3 + w * 0.3104856;
      b4 = 0.55000 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.0168980;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
  }
  return buffer;
}

function startNoiseSource(ctx: AudioContext, buffer: AudioBuffer): AudioBufferSourceNode {
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.loop = true;
  src.start();
  return src;
}

// ── White Noise ──

export const createWhiteNoise: GeneratorFn = (ctx) => {
  const output = ctx.createGain();
  output.gain.value = 0.4;
  const buf = createNoiseBuffer(ctx, 4, 'white');
  const src = startNoiseSource(ctx, buf);
  src.connect(output);
  return { outputNode: output, stop: () => { try { src.stop(); } catch {} } };
};

// ── Brown Noise ──

export const createBrownNoise: GeneratorFn = (ctx) => {
  const output = ctx.createGain();
  output.gain.value = 0.5;
  const buf = createNoiseBuffer(ctx, 4, 'brown');
  const src = startNoiseSource(ctx, buf);
  src.connect(output);
  return { outputNode: output, stop: () => { try { src.stop(); } catch {} } };
};

function playNoiseDrop(
  ctx: AudioContext,
  output: AudioNode,
  seconds: number,
  freq: number,
  q: number,
  volume: number,
): void {
  const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (len * 0.22));
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = freq;
  filter.Q.value = q;
  const gain = ctx.createGain();
  gain.gain.value = volume;
  src.connect(filter);
  filter.connect(gain);
  gain.connect(output);
  src.start();
}

function playTone(
  ctx: AudioContext,
  output: AudioNode,
  startFreq: number,
  endFreq: number,
  seconds: number,
  volume: number,
  type: OscillatorType = 'sine',
): void {
  const osc = ctx.createOscillator();
  osc.type = type;
  const gain = ctx.createGain();
  const now = ctx.currentTime;
  osc.frequency.setValueAtTime(startFreq, now);
  osc.frequency.exponentialRampToValueAtTime(Math.max(40, endFreq), now + seconds);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(volume, now + Math.min(0.03, seconds * 0.25));
  gain.gain.exponentialRampToValueAtTime(0.0001, now + seconds);
  osc.connect(gain);
  gain.connect(output);
  osc.start(now);
  osc.stop(now + seconds + 0.02);
}

// ── Gentle Rain ──

export const createRain: GeneratorFn = (ctx) => {
  const output = ctx.createGain();
  output.gain.value = 0.7;

  const sheet = startNoiseSource(ctx, createNoiseBuffer(ctx, 4, 'white'));
  const highpass = ctx.createBiquadFilter();
  highpass.type = 'highpass';
  highpass.frequency.value = 1800;
  const lowpass = ctx.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = 8000;
  const sheetGain = ctx.createGain();
  sheetGain.gain.value = 0.16;
  sheet.connect(highpass);
  highpass.connect(lowpass);
  lowpass.connect(sheetGain);
  sheetGain.connect(output);

  let stopped = false;
  const timer = setInterval(() => {
    if (stopped) return;
    playNoiseDrop(ctx, output, 0.015 + Math.random() * 0.03, 2800 + Math.random() * 4500, 3 + Math.random() * 5, 0.12 + Math.random() * 0.2);
    if (Math.random() > 0.55) {
      playNoiseDrop(ctx, output, 0.04 + Math.random() * 0.05, 900 + Math.random() * 800, 1.2, 0.08 + Math.random() * 0.08);
    }
  }, 32);

  return {
    outputNode: output,
    stop: () => {
      stopped = true;
      clearInterval(timer);
      try { sheet.stop(); } catch { /* already stopped */ }
    },
  };
};

// ── Ocean Waves ──

export const createOcean: GeneratorFn = (ctx) => {
  const output = ctx.createGain();
  output.gain.value = 0.85;

  const surf = startNoiseSource(ctx, createNoiseBuffer(ctx, 8, 'brown'));
  const surfFilter = ctx.createBiquadFilter();
  surfFilter.type = 'lowpass';
  surfFilter.frequency.value = 500;
  const surfGain = ctx.createGain();
  surfGain.gain.value = 0.05;
  surf.connect(surfFilter);
  surfFilter.connect(surfGain);
  surfGain.connect(output);

  const foam = startNoiseSource(ctx, createNoiseBuffer(ctx, 4, 'white'));
  const foamFilter = ctx.createBiquadFilter();
  foamFilter.type = 'highpass';
  foamFilter.frequency.value = 2500;
  const foamGain = ctx.createGain();
  foamGain.gain.value = 0.01;
  foam.connect(foamFilter);
  foamFilter.connect(foamGain);
  foamGain.connect(output);

  let stopped = false;
  const waveMs = 7000;
  const wash = () => {
    if (stopped || !ctx || ctx.state === 'closed') return;
    const now = ctx.currentTime;
    surfGain.gain.cancelScheduledValues(now);
    foamGain.gain.cancelScheduledValues(now);
    surfGain.gain.setValueAtTime(0.04, now);
    surfGain.gain.linearRampToValueAtTime(0.55, now + 2.4);
    surfGain.gain.linearRampToValueAtTime(0.7, now + 3.1);
    surfGain.gain.linearRampToValueAtTime(0.08, now + 6.4);
    foamGain.gain.setValueAtTime(0.01, now);
    foamGain.gain.linearRampToValueAtTime(0.02, now + 2.2);
    foamGain.gain.linearRampToValueAtTime(0.22, now + 3.2);
    foamGain.gain.linearRampToValueAtTime(0.01, now + 5.2);
  };
  wash();
  const timer = setInterval(wash, waveMs);

  return {
    outputNode: output,
    stop: () => {
      stopped = true;
      clearInterval(timer);
      try { surf.stop(); } catch { /* already stopped */ }
      try { foam.stop(); } catch { /* already stopped */ }
    },
  };
};

// ── Forest Birds ──

export const createForest: GeneratorFn = (ctx) => {
  const output = ctx.createGain();
  output.gain.value = 0.8;

  const leaves = startNoiseSource(ctx, createNoiseBuffer(ctx, 4, 'pink'));
  const leafFilter = ctx.createBiquadFilter();
  leafFilter.type = 'highpass';
  leafFilter.frequency.value = 1500;
  const leafGain = ctx.createGain();
  leafGain.gain.value = 0.04;
  leaves.connect(leafFilter);
  leafFilter.connect(leafGain);
  leafGain.connect(output);

  let stopped = false;

  const song = () => {
    if (stopped) return;
    const roll = Math.random();
    if (roll < 0.34) {
      const base = 2400 + Math.random() * 400;
      [0, 0.18, 0.36].forEach((delay, i) => {
        setTimeout(() => {
          if (!stopped) playTone(ctx, output, base - i * 280, base - i * 340, 0.16, 0.16);
        }, delay * 1000);
      });
    } else if (roll < 0.67) {
      const base = 3800 + Math.random() * 700;
      for (let i = 0; i < 8; i++) {
        setTimeout(() => {
          if (!stopped) playTone(ctx, output, base, base * 1.08, 0.06, 0.1);
        }, i * 70);
      }
    } else {
      playTone(ctx, output, 1400 + Math.random() * 200, 1100, 0.28, 0.14);
      setTimeout(() => {
        if (!stopped) playTone(ctx, output, 1800, 2200, 0.18, 0.12);
      }, 320);
    }
  };

  song();
  const timer = setInterval(song, 1600 + Math.random() * 900);

  return {
    outputNode: output,
    stop: () => {
      stopped = true;
      clearInterval(timer);
      try { leaves.stop(); } catch { /* already stopped */ }
    },
  };
};

// ── Thunderstorm ──

export const createThunderstorm: GeneratorFn = (ctx) => {
  const output = ctx.createGain();
  output.gain.value = 0.75;

  const rain = startNoiseSource(ctx, createNoiseBuffer(ctx, 4, 'white'));
  const rainFilter = ctx.createBiquadFilter();
  rainFilter.type = 'highpass';
  rainFilter.frequency.value = 900;
  const rainGain = ctx.createGain();
  rainGain.gain.value = 0.28;
  rain.connect(rainFilter);
  rainFilter.connect(rainGain);
  rainGain.connect(output);

  let stopped = false;
  const drops = setInterval(() => {
    if (stopped) return;
    playNoiseDrop(ctx, output, 0.02 + Math.random() * 0.03, 2000 + Math.random() * 3000, 2, 0.16);
  }, 22);

  const thunder = () => {
    if (stopped) return;
    const src = ctx.createBufferSource();
    src.buffer = createNoiseBuffer(ctx, 2.5, 'brown');
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 90;
    const gain = ctx.createGain();
    src.connect(filter);
    filter.connect(gain);
    gain.connect(output);
    const now = ctx.currentTime;
    const dur = 2 + Math.random() * 1.5;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.9, now + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    src.start(now);
    src.stop(now + dur);
  };
  const thunderTimer = setInterval(() => {
    if (!stopped && Math.random() > 0.35) thunder();
  }, 5000);

  return {
    outputNode: output,
    stop: () => {
      stopped = true;
      clearInterval(drops);
      clearInterval(thunderTimer);
      try { rain.stop(); } catch { /* already stopped */ }
    },
  };
};

// ── Coffee Shop / Cafe ──

export const createCafe: GeneratorFn = (ctx) => {
  const output = ctx.createGain();
  output.gain.value = 0.35;

  // Murmur: bandpass-filtered noise
  const murmurBuf = createNoiseBuffer(ctx, 4, 'pink');
  const murmurSrc = startNoiseSource(ctx, murmurBuf);
  const murmurBp = ctx.createBiquadFilter();
  murmurBp.type = 'bandpass';
  murmurBp.frequency.value = 600;
  murmurBp.Q.value = 0.6;
  const murmurGain = ctx.createGain();
  murmurGain.gain.value = 0.5;
  murmurSrc.connect(murmurBp);
  murmurBp.connect(murmurGain);
  murmurGain.connect(output);

  const voices = startNoiseSource(ctx, createNoiseBuffer(ctx, 4, 'pink'));
  const voiceFilter = ctx.createBiquadFilter();
  voiceFilter.type = 'bandpass';
  voiceFilter.frequency.value = 1400;
  voiceFilter.Q.value = 2.5;
  const voiceGain = ctx.createGain();
  voiceGain.gain.value = 0.12;
  voices.connect(voiceFilter);
  voiceFilter.connect(voiceGain);
  voiceGain.connect(output);
  const voiceLfo = ctx.createOscillator();
  voiceLfo.frequency.value = 3.5;
  const voiceLfoGain = ctx.createGain();
  voiceLfoGain.gain.value = 500;
  voiceLfo.connect(voiceLfoGain);
  voiceLfoGain.connect(voiceFilter.frequency);
  voiceLfo.start();

  // Slow volume modulation for conversational cadence
  const cadenceLfo = ctx.createOscillator();
  cadenceLfo.type = 'sine';
  cadenceLfo.frequency.value = 0.2;
  const cadenceGain = ctx.createGain();
  cadenceGain.gain.value = 0.15;
  cadenceLfo.connect(cadenceGain);
  cadenceGain.connect(murmurGain.gain);
  cadenceLfo.start();

  // Background hum (HVAC / ambient room)
  const humBuf = createNoiseBuffer(ctx, 4, 'brown');
  const humSrc = startNoiseSource(ctx, humBuf);
  const humLp = ctx.createBiquadFilter();
  humLp.type = 'lowpass';
  humLp.frequency.value = 200;
  const humGain = ctx.createGain();
  humGain.gain.value = 0.2;
  humSrc.connect(humLp);
  humLp.connect(humGain);
  humGain.connect(output);

  // Occasional clinks
  let clinkTimer: ReturnType<typeof setInterval> | null = null;
  let stopped = false;
  const clinkOscs: OscillatorNode[] = [];

  const scheduleClink = () => {
    if (stopped) return;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 4000 + Math.random() * 2000;
    const g = ctx.createGain();
    g.gain.value = 0;
    osc.connect(g);
    g.connect(output);
    const now = ctx.currentTime;
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(0.06 + Math.random() * 0.04, now + 0.005);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    osc.start(now);
    osc.stop(now + 0.35);
    clinkOscs.push(osc);
  };

  clinkTimer = setInterval(() => {
    if (!stopped && Math.random() > 0.5) scheduleClink();
  }, 2000 + Math.random() * 3000);

  return {
    outputNode: output,
    stop: () => {
      stopped = true;
      if (clinkTimer) clearInterval(clinkTimer);
      try { murmurSrc.stop(); } catch {}
      try { voices.stop(); } catch {}
      try { voiceLfo.stop(); } catch {}
      try { humSrc.stop(); } catch {}
      try { cadenceLfo.stop(); } catch {}
      clinkOscs.forEach(o => { try { o.stop(); } catch {} });
    },
  };
};

// ── Fireplace ──

export const createFireplace: GeneratorFn = (ctx) => {
  const output = ctx.createGain();
  output.gain.value = 0.45;

  // Low rumble base
  const baseBuf = createNoiseBuffer(ctx, 4, 'brown');
  const baseSrc = startNoiseSource(ctx, baseBuf);
  const baseLp = ctx.createBiquadFilter();
  baseLp.type = 'lowpass';
  baseLp.frequency.value = 300;
  const baseGain = ctx.createGain();
  baseGain.gain.value = 0.22;
  baseSrc.connect(baseLp);
  baseLp.connect(baseGain);
  baseGain.connect(output);

  // Flame flutter
  const flutterLfo = ctx.createOscillator();
  flutterLfo.type = 'sine';
  flutterLfo.frequency.value = 0.4;
  const flutterMod = ctx.createGain();
  flutterMod.gain.value = 0.1;
  flutterLfo.connect(flutterMod);
  flutterMod.connect(baseGain.gain);
  flutterLfo.start();

  // Crackles
  let crackleTimer: ReturnType<typeof setInterval> | null = null;
  let stopped = false;
  const crackleSources: AudioBufferSourceNode[] = [];

  const scheduleCrackle = () => {
    if (stopped) return;
    const len = Math.floor(ctx.sampleRate * (0.01 + Math.random() * 0.03));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2000 + Math.random() * 3000;
    const g = ctx.createGain();
    g.gain.value = 0.35 + Math.random() * 0.4;
    src.connect(hp);
    hp.connect(g);
    g.connect(output);
    src.start();
    crackleSources.push(src);
  };

  crackleTimer = setInterval(() => {
    if (!stopped) {
      const count = 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < count; i++) {
        setTimeout(() => scheduleCrackle(), Math.random() * 200);
      }
    }
  }, 140 + Math.random() * 180);

  return {
    outputNode: output,
    stop: () => {
      stopped = true;
      if (crackleTimer) clearInterval(crackleTimer);
      try { baseSrc.stop(); } catch {}
      try { flutterLfo.stop(); } catch {}
      crackleSources.forEach(s => { try { s.stop(); } catch {} });
    },
  };
};

// ── Library Hum ──

export const createLibrary: GeneratorFn = (ctx) => {
  const output = ctx.createGain();
  output.gain.value = 0.25;

  // Quiet electrical hum
  const hum = ctx.createOscillator();
  hum.type = 'sine';
  hum.frequency.value = 60;
  const humGain = ctx.createGain();
  humGain.gain.value = 0.08;
  hum.connect(humGain);
  humGain.connect(output);
  hum.start();

  // Second harmonic
  const hum2 = ctx.createOscillator();
  hum2.type = 'sine';
  hum2.frequency.value = 120;
  const hum2Gain = ctx.createGain();
  hum2Gain.gain.value = 0.03;
  hum2.connect(hum2Gain);
  hum2Gain.connect(output);
  hum2.start();

  // Very quiet air conditioner noise
  const acBuf = createNoiseBuffer(ctx, 4, 'brown');
  const acSrc = startNoiseSource(ctx, acBuf);
  const acLp = ctx.createBiquadFilter();
  acLp.type = 'lowpass';
  acLp.frequency.value = 400;
  const acGain = ctx.createGain();
  acGain.gain.value = 0.15;
  acSrc.connect(acLp);
  acLp.connect(acGain);
  acGain.connect(output);

  let stopped = false;
  const pages = setInterval(() => {
    if (stopped || Math.random() > 0.45) return;
    playNoiseDrop(ctx, output, 0.08 + Math.random() * 0.12, 1800 + Math.random() * 1500, 0.7, 0.08);
  }, 4000);

  return {
    outputNode: output,
    stop: () => {
      stopped = true;
      clearInterval(pages);
      try { hum.stop(); } catch {}
      try { hum2.stop(); } catch {}
      try { acSrc.stop(); } catch {}
    },
  };
};

// ── Lo-Fi Beats ──

export const createLofi: GeneratorFn = (ctx) => {
  const output = ctx.createGain();
  output.gain.value = 0.35;

  // Warm pad chord via detuned oscillators through lowpass
  const padGain = ctx.createGain();
  padGain.gain.value = 0.12;
  const padLp = ctx.createBiquadFilter();
  padLp.type = 'lowpass';
  padLp.frequency.value = 800;
  padLp.Q.value = 1;
  padGain.connect(padLp);
  padLp.connect(output);

  const chordFreqs = [261.6, 329.6, 392.0, 523.3]; // C major spread
  const padOscs: OscillatorNode[] = [];
  chordFreqs.forEach(f => {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = f;
    osc.detune.value = (Math.random() - 0.5) * 15;
    osc.connect(padGain);
    osc.start();
    padOscs.push(osc);
  });

  // Gentle vinyl crackle
  const crackleBuf = createNoiseBuffer(ctx, 4, 'white');
  const crackleSrc = startNoiseSource(ctx, crackleBuf);
  const crackleHp = ctx.createBiquadFilter();
  crackleHp.type = 'highpass';
  crackleHp.frequency.value = 5000;
  const crackleGain = ctx.createGain();
  crackleGain.gain.value = 0.04;
  crackleSrc.connect(crackleHp);
  crackleHp.connect(crackleGain);
  crackleGain.connect(output);

  // Simple kick-hat rhythm loop
  let beatTimer: ReturnType<typeof setInterval> | null = null;
  let stopped = false;
  let beatCount = 0;

  const scheduleKick = () => {
    if (stopped) return;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    const g = ctx.createGain();
    const now = ctx.currentTime;
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.12);
    g.gain.setValueAtTime(0.18, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    osc.connect(g);
    g.connect(output);
    osc.start(now);
    osc.stop(now + 0.25);
  };

  const scheduleHat = () => {
    if (stopped) return;
    const len = Math.floor(ctx.sampleRate * 0.04);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7000;
    const g = ctx.createGain();
    g.gain.value = 0.07;
    src.connect(hp);
    hp.connect(g);
    g.connect(output);
    src.start();
  };

  // ~85 BPM groove: kick on 1,3 and hat on every eighth
  const eighthMs = (60 / 85 / 2) * 1000;
  beatTimer = setInterval(() => {
    if (stopped) return;
    if (beatCount % 4 === 0 || beatCount % 4 === 2) scheduleKick();
    if (beatCount % 2 === 1) scheduleHat();
    beatCount = (beatCount + 1) % 8;
  }, eighthMs);

  return {
    outputNode: output,
    stop: () => {
      stopped = true;
      if (beatTimer) clearInterval(beatTimer);
      padOscs.forEach(o => { try { o.stop(); } catch {} });
      try { crackleSrc.stop(); } catch {}
    },
  };
};

// ── Binaural Beats (10Hz alpha wave) ──

export const createBinaural: GeneratorFn = (ctx) => {
  const output = ctx.createGain();
  output.gain.value = 0.3;

  const baseFreq = 200;
  const binauralDiff = 10; // 10Hz alpha wave

  // Left ear
  const oscL = ctx.createOscillator();
  oscL.type = 'sine';
  oscL.frequency.value = baseFreq;
  const panL = ctx.createStereoPanner();
  panL.pan.value = -1;
  const gainL = ctx.createGain();
  gainL.gain.value = 0.5;
  oscL.connect(gainL);
  gainL.connect(panL);
  panL.connect(output);
  oscL.start();

  // Right ear
  const oscR = ctx.createOscillator();
  oscR.type = 'sine';
  oscR.frequency.value = baseFreq + binauralDiff;
  const panR = ctx.createStereoPanner();
  panR.pan.value = 1;
  const gainR = ctx.createGain();
  gainR.gain.value = 0.5;
  oscR.connect(gainR);
  gainR.connect(panR);
  panR.connect(output);
  oscR.start();

  // Gentle background pad for warmth
  const padOsc = ctx.createOscillator();
  padOsc.type = 'sine';
  padOsc.frequency.value = baseFreq * 2;
  const padGain = ctx.createGain();
  padGain.gain.value = 0.05;
  padOsc.connect(padGain);
  padGain.connect(output);
  padOsc.start();

  return {
    outputNode: output,
    stop: () => {
      try { oscL.stop(); } catch {}
      try { oscR.stop(); } catch {}
      try { padOsc.stop(); } catch {}
    },
  };
};

// ── Registry ──

export const SOUND_GENERATORS: Record<string, GeneratorFn> = {
  rain: createRain,
  forest: createForest,
  ocean: createOcean,
  cafe: createCafe,
  fireplace: createFireplace,
  library: createLibrary,
  lofi: createLofi,
  white_noise: createWhiteNoise,
  brown_noise: createBrownNoise,
  binaural: createBinaural,
  thunderstorm: createThunderstorm,
};

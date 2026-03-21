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

// ── Gentle Rain ──

export const createRain: GeneratorFn = (ctx) => {
  const output = ctx.createGain();
  output.gain.value = 0.45;

  // Base: bandpass-filtered white noise for steady patter
  const noiseBuf = createNoiseBuffer(ctx, 4, 'white');
  const noiseSrc = startNoiseSource(ctx, noiseBuf);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 3500;
  bp.Q.value = 0.7;
  noiseSrc.connect(bp);

  // Gentle high-shelf for brightness
  const hi = ctx.createBiquadFilter();
  hi.type = 'highshelf';
  hi.frequency.value = 6000;
  hi.gain.value = -4;
  bp.connect(hi);
  hi.connect(output);

  // Droplet layer: another noise through a sharper filter
  const dropBuf = createNoiseBuffer(ctx, 4, 'white');
  const dropSrc = startNoiseSource(ctx, dropBuf);
  const dropBp = ctx.createBiquadFilter();
  dropBp.type = 'bandpass';
  dropBp.frequency.value = 7000;
  dropBp.Q.value = 3;
  const dropGain = ctx.createGain();
  dropGain.gain.value = 0.15;
  dropSrc.connect(dropBp);
  dropBp.connect(dropGain);

  // Modulate droplets with slow LFO for variation
  const dropLfo = ctx.createOscillator();
  dropLfo.type = 'sine';
  dropLfo.frequency.value = 0.3;
  const dropLfoGain = ctx.createGain();
  dropLfoGain.gain.value = 0.08;
  dropLfo.connect(dropLfoGain);
  dropLfoGain.connect(dropGain.gain);
  dropLfo.start();
  dropGain.connect(output);

  return {
    outputNode: output,
    stop: () => {
      try { noiseSrc.stop(); } catch {}
      try { dropSrc.stop(); } catch {}
      try { dropLfo.stop(); } catch {}
    },
  };
};

// ── Ocean Waves ──

export const createOcean: GeneratorFn = (ctx) => {
  const output = ctx.createGain();
  output.gain.value = 0.5;

  const noiseBuf = createNoiseBuffer(ctx, 6, 'brown');
  const noiseSrc = startNoiseSource(ctx, noiseBuf);

  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 600;
  lp.Q.value = 0.5;
  noiseSrc.connect(lp);

  // LFO modulates volume for wave surges
  const waveGain = ctx.createGain();
  waveGain.gain.value = 0.5;
  lp.connect(waveGain);

  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = 0.08;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 0.4;
  lfo.connect(lfoGain);
  lfoGain.connect(waveGain.gain);
  lfo.start();

  // Second wave layer slightly offset
  const noiseBuf2 = createNoiseBuffer(ctx, 6, 'brown');
  const noiseSrc2 = startNoiseSource(ctx, noiseBuf2);
  const lp2 = ctx.createBiquadFilter();
  lp2.type = 'lowpass';
  lp2.frequency.value = 400;
  noiseSrc2.connect(lp2);
  const waveGain2 = ctx.createGain();
  waveGain2.gain.value = 0.3;
  lp2.connect(waveGain2);

  const lfo2 = ctx.createOscillator();
  lfo2.type = 'sine';
  lfo2.frequency.value = 0.05;
  const lfoGain2 = ctx.createGain();
  lfoGain2.gain.value = 0.25;
  lfo2.connect(lfoGain2);
  lfoGain2.connect(waveGain2.gain);
  lfo2.start();

  // Gentle foam hiss
  const foamBuf = createNoiseBuffer(ctx, 4, 'white');
  const foamSrc = startNoiseSource(ctx, foamBuf);
  const foamHp = ctx.createBiquadFilter();
  foamHp.type = 'highpass';
  foamHp.frequency.value = 3000;
  const foamGain = ctx.createGain();
  foamGain.gain.value = 0.06;
  foamSrc.connect(foamHp);
  foamHp.connect(foamGain);

  waveGain.connect(output);
  waveGain2.connect(output);
  foamGain.connect(output);

  return {
    outputNode: output,
    stop: () => {
      try { noiseSrc.stop(); } catch {}
      try { noiseSrc2.stop(); } catch {}
      try { foamSrc.stop(); } catch {}
      try { lfo.stop(); } catch {}
      try { lfo2.stop(); } catch {}
    },
  };
};

// ── Forest Birds ──

export const createForest: GeneratorFn = (ctx) => {
  const output = ctx.createGain();
  output.gain.value = 0.4;

  // Background: quiet pink noise for wind through leaves
  const pinkBuf = createNoiseBuffer(ctx, 4, 'pink');
  const pinkSrc = startNoiseSource(ctx, pinkBuf);
  const windGain = ctx.createGain();
  windGain.gain.value = 0.3;
  const windLp = ctx.createBiquadFilter();
  windLp.type = 'lowpass';
  windLp.frequency.value = 2000;
  pinkSrc.connect(windLp);
  windLp.connect(windGain);
  windGain.connect(output);

  // Wind modulation
  const windLfo = ctx.createOscillator();
  windLfo.type = 'sine';
  windLfo.frequency.value = 0.15;
  const windLfoGain = ctx.createGain();
  windLfoGain.gain.value = 0.12;
  windLfo.connect(windLfoGain);
  windLfoGain.connect(windGain.gain);
  windLfo.start();

  // Bird chirps via scheduled oscillator sweeps
  const chirpOscs: OscillatorNode[] = [];
  let chirpTimer: ReturnType<typeof setInterval> | null = null;
  let stopped = false;

  const scheduleChirp = () => {
    if (stopped) return;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    const baseFreq = 2000 + Math.random() * 3000;
    osc.frequency.value = baseFreq;

    const chirpGain = ctx.createGain();
    chirpGain.gain.value = 0;
    osc.connect(chirpGain);
    chirpGain.connect(output);

    const now = ctx.currentTime;
    const dur = 0.08 + Math.random() * 0.12;
    chirpGain.gain.setValueAtTime(0, now);
    chirpGain.gain.linearRampToValueAtTime(0.15 + Math.random() * 0.1, now + dur * 0.3);
    chirpGain.gain.linearRampToValueAtTime(0, now + dur);

    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.linearRampToValueAtTime(baseFreq * (1.1 + Math.random() * 0.4), now + dur * 0.5);
    osc.frequency.linearRampToValueAtTime(baseFreq * 0.9, now + dur);

    osc.start(now);
    osc.stop(now + dur + 0.05);
    chirpOscs.push(osc);

    // Sometimes do a double chirp
    if (Math.random() > 0.5) {
      const osc2 = ctx.createOscillator();
      osc2.type = 'sine';
      const f2 = baseFreq * (0.9 + Math.random() * 0.3);
      osc2.frequency.value = f2;
      const g2 = ctx.createGain();
      g2.gain.value = 0;
      osc2.connect(g2);
      g2.connect(output);
      const t2 = now + dur + 0.05;
      g2.gain.setValueAtTime(0, t2);
      g2.gain.linearRampToValueAtTime(0.12, t2 + dur * 0.3);
      g2.gain.linearRampToValueAtTime(0, t2 + dur);
      osc2.start(t2);
      osc2.stop(t2 + dur + 0.05);
      chirpOscs.push(osc2);
    }
  };

  chirpTimer = setInterval(() => {
    if (!stopped && Math.random() > 0.3) scheduleChirp();
  }, 800 + Math.random() * 1500);

  return {
    outputNode: output,
    stop: () => {
      stopped = true;
      if (chirpTimer) clearInterval(chirpTimer);
      try { pinkSrc.stop(); } catch {}
      try { windLfo.stop(); } catch {}
      chirpOscs.forEach(o => { try { o.stop(); } catch {} });
    },
  };
};

// ── Thunderstorm ──

export const createThunderstorm: GeneratorFn = (ctx) => {
  const output = ctx.createGain();
  output.gain.value = 0.5;

  // Heavy rain base
  const rainBuf = createNoiseBuffer(ctx, 4, 'white');
  const rainSrc = startNoiseSource(ctx, rainBuf);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 2800;
  bp.Q.value = 0.5;
  const rainGain = ctx.createGain();
  rainGain.gain.value = 0.5;
  rainSrc.connect(bp);
  bp.connect(rainGain);
  rainGain.connect(output);

  // Thunder rumbles at random intervals
  let thunderTimer: ReturnType<typeof setInterval> | null = null;
  let stopped = false;
  const thunderSources: AudioBufferSourceNode[] = [];

  const scheduleThunder = () => {
    if (stopped) return;
    const thunderBuf = createNoiseBuffer(ctx, 3, 'brown');
    const src = ctx.createBufferSource();
    src.buffer = thunderBuf;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 60 + Math.random() * 40;
    lp.Q.value = 0.7;
    const tGain = ctx.createGain();
    tGain.gain.value = 0;
    src.connect(lp);
    lp.connect(tGain);
    tGain.connect(output);

    const now = ctx.currentTime;
    const dur = 1.5 + Math.random() * 2;
    tGain.gain.setValueAtTime(0, now);
    tGain.gain.linearRampToValueAtTime(0.6 + Math.random() * 0.3, now + 0.1);
    tGain.gain.linearRampToValueAtTime(0.3, now + dur * 0.4);
    tGain.gain.linearRampToValueAtTime(0, now + dur);
    src.start(now);
    src.stop(now + dur + 0.1);
    thunderSources.push(src);
  };

  thunderTimer = setInterval(() => {
    if (!stopped && Math.random() > 0.6) scheduleThunder();
  }, 4000 + Math.random() * 6000);

  return {
    outputNode: output,
    stop: () => {
      stopped = true;
      if (thunderTimer) clearInterval(thunderTimer);
      try { rainSrc.stop(); } catch {}
      thunderSources.forEach(s => { try { s.stop(); } catch {} });
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
  baseGain.gain.value = 0.4;
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
    g.gain.value = 0.15 + Math.random() * 0.15;
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
  }, 300 + Math.random() * 500);

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

  return {
    outputNode: output,
    stop: () => {
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

/**
 * Ultra-low-latency Web Audio drum sampler.
 *
 * Pre-decodes authentic, punchy drum samples for both physical 16-pad layouts
 * and individual drum elements (Kick, Snare, Closed Hi-Hat, Open Hi-Hat, Crash, Ride, Toms, etc.).
 *
 * Triggers instant (<2 ms) polyphonic playback on hardware MIDI pad hits or screen taps,
 * dynamically respecting custom pad mappings so changing a pad to 'Closed Hi-Hat' or 'Crash'
 * actually triggers that exact drum instrument with zero delay.
 */
import type { DrumElement } from '../midi/padMapping';

export const PUNK_KIT_FILES_BY_PAD = [
  'Pad_01_Fast_Click_Kick.wav',        // 1: Kick
  'Pad_02_Main_Power_Snare.wav',       // 2: Snare
  'Pad_03_Heavy_Punch_Kick.wav',       // 3: Sub Kick
  'Pad_04_Street_PopPunk_Snare.wav',   // 4: Rim Snare
  'Pad_05_High_Rack_Tom.wav',          // 5: High Tom
  'Pad_06_Low_Floor_Tom.wav',          // 6: Floor Tom
  'Pad_07_Hand_Clap.wav',              // 7: Clap
  'Pad_08_LeftHand_Closed_HiHat.wav',  // 8: LH Closed Hat
  'Pad_09_RightHand_Closed_HiHat.wav', // 9: RH Closed Hat (Authentic Fast Closed Hi-Hat)
  'Pad_10_Pedal_HiHat.wav',            // 10: Pedal Hat (Authentic Pedal Chick)
  'Pad_11_Sizzling_Open_HiHat.wav',    // 11: Sizzling Open Hi-Hat
  'Pad_12_Punk_Crash_Cymbal.wav',      // 12: Crash Cymbal 1 (Explosive downbeat)
  'Pad_13_Crash_Cymbal_2.wav',         // 13: Crash Cymbal 2
  'Pad_14_Ride_Cymbal.wav',            // 14: Ride Cymbal (Bow)
  'Pad_15_Ride_Bell.wav',              // 15: Ride Bell
  'Pad_16_RightHand_Roll_Snare.wav',   // 16: RH Roll Snare
];

export const DRUM_ELEMENT_FILES: Record<DrumElement, string> = {
  kick: 'kick.wav',
  snare: 'snare.wav',
  hihat: 'hihat.wav',
  hihatPedal: 'hihatPedal.wav',
  hihatOpen: 'hihatOpen.wav',
  crash: 'crash.wav',
  crash2: 'crash2.wav',
  ride: 'ride.wav',
  rideBell: 'rideBell.wav',
  tomHigh: 'tomHigh.wav',
  tomLow: 'tomLow.wav',
  percussion: 'percussion.wav',
};

class DrumSampler {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private padBuffers: (AudioBuffer | null)[] = new Array(16).fill(null);
  private elementBuffers: Partial<Record<DrumElement, AudioBuffer>> = {};
  private loading = false;
  private loaded = false;
  private volume = 0.85;
  private muted = false;

  private initContext() {
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.muted ? 0 : this.volume;
      this.masterGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  /**
   * Pre-fetches and decodes all pad and element WAV files into RAM.
   */
  public async preloadKit(): Promise<void> {
    if (this.loaded || this.loading) return;
    this.loading = true;
    this.initContext();

    // 1. Load by pad index
    const padPromises = PUNK_KIT_FILES_BY_PAD.map(async (filename, idx) => {
      try {
        const primaryUrl = `/kits/reloop-punk/${filename}`;
        const fallbackUrl = `/api/kits/samples/${idx + 1}`;

        let res = await fetch(primaryUrl);
        if (!res.ok) {
          res = await fetch(fallbackUrl);
        }
        if (!res.ok) return;

        const arrayBuf = await res.arrayBuffer();
        if (this.ctx) {
          const audioBuf = await this.ctx.decodeAudioData(arrayBuf);
          this.padBuffers[idx] = audioBuf;
        }
      } catch (err) {
        console.warn(`Sampler could not preload pad ${idx + 1}:`, err);
      }
    });

    // 2. Load by element name (guarantees custom-mapped pads play their exact drum sound!)
    const elementEntries = Object.entries(DRUM_ELEMENT_FILES) as [DrumElement, string][];
    const elementPromises = elementEntries.map(async ([element, filename]) => {
      try {
        const primaryUrl = `/kits/reloop-punk/${filename}`;
        const fallbackUrl = `/api/kits/elements/${element}`;

        let res = await fetch(primaryUrl);
        if (!res.ok) {
          res = await fetch(fallbackUrl);
        }
        if (!res.ok) return;

        const arrayBuf = await res.arrayBuffer();
        if (this.ctx) {
          const audioBuf = await this.ctx.decodeAudioData(arrayBuf);
          this.elementBuffers[element] = audioBuf;
        }
      } catch (err) {
        console.warn(`Sampler could not preload element '${element}':`, err);
      }
    });

    await Promise.allSettled([...padPromises, ...elementPromises]);
    this.loading = false;
    this.loaded = true;
  }

  public setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime);
    }
  }

  public getVolume(): number {
    return this.volume;
  }

  public setMuted(mute: boolean) {
    this.muted = mute;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime);
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  /**
   * Triggers the audio sample for padIndex (0..15).
   * If a drumElement is passed (from the active pad mapping), it prioritizes
   * playing that exact instrument's audio sample!
   */
  public playPad(padIndex: number, velocity: number = 100, element?: DrumElement): void {
    if (this.muted) return;
    this.initContext();
    if (!this.ctx || !this.masterGain) return;

    const clampedPad = Math.max(0, Math.min(15, padIndex));
    // Prioritize element buffer (for custom mapping), fallback to pad buffer
    const buf = (element ? this.elementBuffers[element] : null) ?? this.padBuffers[clampedPad];

    // Velocity scaling (0..127) -> gain curve
    const velNormalized = Math.max(0.15, Math.min(1.0, velocity / 127));
    const hitGainVal = Math.pow(velNormalized, 1.2);

    if (buf) {
      const src = this.ctx.createBufferSource();
      src.buffer = buf;

      const hitGain = this.ctx.createGain();
      hitGain.gain.value = hitGainVal;

      src.connect(hitGain);
      hitGain.connect(this.masterGain);
      src.start(0);
    } else {
      this.synthesizeDrum(element ?? clampedPad, hitGainVal);
    }
  }

  /**
   * Directly triggers a drum instrument by its element name.
   */
  public playElement(element: DrumElement, velocity: number = 100): void {
    if (this.muted) return;
    this.initContext();
    if (!this.ctx || !this.masterGain) return;

    const buf = this.elementBuffers[element];
    const velNormalized = Math.max(0.15, Math.min(1.0, velocity / 127));
    const hitGainVal = Math.pow(velNormalized, 1.2);

    if (buf) {
      const src = this.ctx.createBufferSource();
      src.buffer = buf;

      const hitGain = this.ctx.createGain();
      hitGain.gain.value = hitGainVal;

      src.connect(hitGain);
      hitGain.connect(this.masterGain);
      src.start(0);
    } else {
      this.synthesizeDrum(element, hitGainVal);
    }
  }

  /**
   * Procedural Web Audio synth fallback if WAV sample is still loading.
   */
  private synthesizeDrum(target: DrumElement | number, gainVal: number) {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;

    const elem =
      typeof target === 'string'
        ? target
        : target === 0 || target === 2
          ? 'kick'
          : target === 1 || target === 3 || target === 15
            ? 'snare'
            : target === 4
              ? 'tomHigh'
              : target === 5
                ? 'tomLow'
                : target === 6
                  ? 'percussion'
                  : target === 8 || target === 7
                    ? 'hihat'
                    : target === 9
                      ? 'hihatPedal'
                      : target === 10
                        ? 'hihatOpen'
                        : target === 11 || target === 12
                          ? 'crash'
                          : 'ride';

    if (elem === 'kick') {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.frequency.setValueAtTime(145, now);
      osc.frequency.exponentialRampToValueAtTime(40, now + 0.08);
      gain.gain.setValueAtTime(gainVal * 1.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.22);
    } else if (elem === 'snare') {
      const osc = this.ctx.createOscillator();
      const oscGain = this.ctx.createGain();
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.exponentialRampToValueAtTime(120, now + 0.1);
      oscGain.gain.setValueAtTime(gainVal * 0.7, now);
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      osc.connect(oscGain);
      oscGain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.16);

      const noiseLen = Math.floor(this.ctx.sampleRate * 0.15);
      const noiseBuffer = this.ctx.createBuffer(1, noiseLen, this.ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < noiseLen; i++) output[i] = Math.random() * 2 - 1;
      const noise = this.ctx.createBufferSource();
      noise.buffer = noiseBuffer;
      const noiseGain = this.ctx.createGain();
      noiseGain.gain.setValueAtTime(gainVal * 0.8, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      noise.connect(noiseGain);
      noiseGain.connect(this.masterGain);
      noise.start(now);
      noise.stop(now + 0.16);
    } else if (elem === 'hihat' || elem === 'hihatPedal') {
      const noiseLen = Math.floor(this.ctx.sampleRate * 0.06);
      const noiseBuffer = this.ctx.createBuffer(1, noiseLen, this.ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < noiseLen; i++) output[i] = Math.random() * 2 - 1;
      const noise = this.ctx.createBufferSource();
      noise.buffer = noiseBuffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = 7500;
      const noiseGain = this.ctx.createGain();
      noiseGain.gain.setValueAtTime(gainVal * 0.5, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(this.masterGain);
      noise.start(now);
      noise.stop(now + 0.06);
    } else if (elem === 'hihatOpen') {
      const noiseLen = Math.floor(this.ctx.sampleRate * 0.35);
      const noiseBuffer = this.ctx.createBuffer(1, noiseLen, this.ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < noiseLen; i++) output[i] = Math.random() * 2 - 1;
      const noise = this.ctx.createBufferSource();
      noise.buffer = noiseBuffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = 6000;
      const noiseGain = this.ctx.createGain();
      noiseGain.gain.setValueAtTime(gainVal * 0.6, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(this.masterGain);
      noise.start(now);
      noise.stop(now + 0.35);
    } else if (elem === 'crash' || elem === 'crash2') {
      const noiseLen = Math.floor(this.ctx.sampleRate * 0.9);
      const noiseBuffer = this.ctx.createBuffer(1, noiseLen, this.ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < noiseLen; i++) output[i] = Math.random() * 2 - 1;
      const noise = this.ctx.createBufferSource();
      noise.buffer = noiseBuffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = 4500;
      const noiseGain = this.ctx.createGain();
      noiseGain.gain.setValueAtTime(gainVal * 0.75, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.85);
      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(this.masterGain);
      noise.start(now);
      noise.stop(now + 0.9);
    } else if (elem === 'ride' || elem === 'rideBell') {
      const osc = this.ctx.createOscillator();
      const oscGain = this.ctx.createGain();
      osc.frequency.setValueAtTime(elem === 'rideBell' ? 1200 : 780, now);
      oscGain.gain.setValueAtTime(gainVal * 0.5, now);
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
      osc.connect(oscGain);
      oscGain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.42);
    } else if (elem === 'tomHigh' || elem === 'tomLow') {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const startFreq = elem === 'tomHigh' ? 180 : 110;
      const endFreq = elem === 'tomHigh' ? 120 : 70;
      osc.frequency.setValueAtTime(startFreq, now);
      osc.frequency.exponentialRampToValueAtTime(endFreq, now + 0.12);
      gain.gain.setValueAtTime(gainVal * 0.9, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.3);
    } else {
      // Percussion (Clap)
      const noiseLen = Math.floor(this.ctx.sampleRate * 0.1);
      const noiseBuffer = this.ctx.createBuffer(1, noiseLen, this.ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < noiseLen; i++) output[i] = Math.random() * 2 - 1;
      const noise = this.ctx.createBufferSource();
      noise.buffer = noiseBuffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 1400;
      const noiseGain = this.ctx.createGain();
      noiseGain.gain.setValueAtTime(gainVal * 0.8, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(this.masterGain);
      noise.start(now);
      noise.stop(now + 0.1);
    }
  }
}

export const drumSampler = new DrumSampler();

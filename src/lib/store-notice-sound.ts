// The two-note sound approved in the listening preview, generated locally so
// the first notification does not depend on downloading/decoding an audio file.
const SAMPLE_RATE = 44100;
const DURATION = 1.5;
const PEAK = 0.94;
const buffers = new WeakMap<AudioContext, AudioBuffer>();

export function createStoreNoticeSoundSamples(): Float32Array {
  const samples = new Float32Array(Math.round(SAMPLE_RATE * DURATION));
  let peak = 0;
  for (let n = 0; n < samples.length; n++) {
    const time = n / SAMPLE_RATE;
    let value = 0;
    for (const [start, frequency] of [[0.08, 1046.5], [0.58, 1318.5]]) {
      const elapsed = time - start;
      const duration = 0.62;
      if (elapsed < 0 || elapsed >= duration) continue;
      const envelope = Math.min(1, elapsed / 0.012)
        * Math.exp(-2.8 * elapsed / duration)
        * Math.min(1, (duration - elapsed) / 0.045);
      value += 0.48 * envelope * (Math.sin(2 * Math.PI * frequency * elapsed)
        + 0.25 * Math.sin(2 * Math.PI * frequency * 2 * elapsed)) / 1.25;
    }
    // Match the approved 16-bit WAV, including its final volume adjustment.
    samples[n] = Math.round(value * 32767);
    peak = Math.max(peak, Math.abs(samples[n]));
  }
  for (let n = 0; n < samples.length; n++) {
    samples[n] = Math.round(samples[n] * 32767 * PEAK / peak) / 32768;
  }
  return samples;
}

export function playStoreNoticeSound(context: AudioContext): void {
  if (context.state !== "running") return;
  try {
    let buffer = buffers.get(context);
    if (!buffer) {
      const samples = createStoreNoticeSoundSamples();
      buffer = context.createBuffer(1, samples.length, SAMPLE_RATE);
      buffer.getChannelData(0).set(samples);
      buffers.set(context, buffer);
    }
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    source.onended = () => source.disconnect();
    source.start();
  } catch {
    // Audio support/device failures must not interrupt loading store notices.
  }
}

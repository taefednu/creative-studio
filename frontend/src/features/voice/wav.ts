/** Целевая частота для ASR: бэкенд принимает WAV mono 16 бит 16 или 24 кГц. */
export const VOICE_RATE = 16000
/** Как VOICE_MAX_SECONDS на бэкенде (backend/app/config.py): дольше он ответит 413 audio_too_long. */
export const VOICE_MAX_SECONDS = 30

/** WAV mono 16 бит из отсчётов [-1, 1]; всё за пределами обрезается (клиппинг), знак сохраняется. */
export function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const buf = new ArrayBuffer(44 + samples.length * 2)
  const v = new DataView(buf)
  const str = (at: number, s: string) => [...s].forEach((c, i) => v.setUint8(at + i, c.charCodeAt(0)))
  str(0, 'RIFF')
  v.setUint32(4, 36 + samples.length * 2, true)
  str(8, 'WAVE')
  str(12, 'fmt ')
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true) // PCM
  v.setUint16(22, 1, true) // mono
  v.setUint32(24, sampleRate, true)
  v.setUint32(28, sampleRate * 2, true)
  v.setUint16(32, 2, true)
  v.setUint16(34, 16, true)
  str(36, 'data')
  v.setUint32(40, samples.length * 2, true)
  samples.forEach((x, i) => {
    const c = Math.max(-1, Math.min(1, x))
    v.setInt16(44 + i * 2, c < 0 ? Math.round(c * 0x8000) : Math.round(c * 0x7fff), true)
  })
  return buf
}

/** Любая запись браузера (webm/ogg/mp4) -> WAV 16 кГц mono: декод и пересчёт частоты через OfflineAudioContext. */
export async function recordingToWav(blob: Blob): Promise<Blob> {
  const ctx = new AudioContext()
  try {
    const src = await ctx.decodeAudioData(await blob.arrayBuffer())
    const off = new OfflineAudioContext(1, Math.max(1, Math.ceil(src.duration * VOICE_RATE)), VOICE_RATE)
    const node = off.createBufferSource()
    node.buffer = src
    node.connect(off.destination) // многоканальный вход сводится в моно сам
    node.start()
    const out = await off.startRendering()
    // таймер мог дотянуть чуть дольше 30 с: бэкенд не примет и на полсекунды больше
    const pcm = out.getChannelData(0).slice(0, VOICE_MAX_SECONDS * VOICE_RATE)
    return new Blob([encodeWav(pcm, VOICE_RATE)], { type: 'audio/wav' })
  } finally {
    void ctx.close()
  }
}

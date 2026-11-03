/** Когда запись пора закончить сама: ребёнок 5 лет не жмёт «стоп», он просто замолкает. Только числа, без звука. */
export const LEVEL_MIN = 0.012 // ниже этого не голос, даже в тишине без шума
export const SPEECH_MS = 150 // столько подряд громко: это голос, а не стук по столу
export const SILENCE_STOP_MS = 1500 // столько тишины после голоса: фраза закончилась
export const NO_SPEECH_MS = 8000 // столько без голоса с начала: ничего не сказали

export type GateStep = 'wait' | 'stop' | 'silent'

/** rms — громкость текущего отрезка, dtMs — его длина. stop: фраза сказана; silent: так и не заговорили. */
export function createGate() {
  let floor = Infinity
  let elapsed = 0
  let loud = 0
  let quiet = 0
  let heard = false
  return function step(rms: number, dtMs: number): GateStep {
    elapsed += dtMs
    floor = Math.min(floor, rms)
    // Порог от шума комнаты: в шумном классе тишина не считается голосом и запись всё равно заканчивается
    const speaking = rms > Math.max(LEVEL_MIN, floor * 3)
    loud = speaking ? loud + dtMs : 0
    quiet = speaking ? 0 : quiet + dtMs
    if (loud >= SPEECH_MS) heard = true
    if (heard) return quiet >= SILENCE_STOP_MS ? 'stop' : 'wait'
    return elapsed >= NO_SPEECH_MS ? 'silent' : 'wait'
  }
}

export function rmsOf(samples: Float32Array): number {
  let sum = 0
  for (const x of samples) sum += x * x
  return Math.sqrt(sum / (samples.length || 1))
}

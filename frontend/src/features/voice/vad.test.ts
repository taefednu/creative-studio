import { describe, expect, it } from 'vitest'
import { createGate, NO_SPEECH_MS, SILENCE_STOP_MS } from './vad'

const run = (gate: ReturnType<typeof createGate>, rms: number, ms: number) => {
  let last = 'wait'
  for (let t = 0; t < ms; t += 50) last = gate(rms, 50)
  return last
}

describe('createGate', () => {
  it('сказал и замолчал: запись заканчивается сама', () => {
    const g = createGate()
    run(g, 0.001, 500)
    expect(run(g, 0.2, 1000)).toBe('wait')
    expect(run(g, 0.001, SILENCE_STOP_MS - 100)).toBe('wait') // пауза внутри фразы не обрывает
    expect(run(g, 0.001, 200)).toBe('stop')
  })
  it('так и не заговорил: говорим об этом, а не ждём 30 секунд', () => {
    const g = createGate()
    expect(run(g, 0.001, NO_SPEECH_MS - 100)).toBe('wait')
    expect(run(g, 0.001, 200)).toBe('silent')
  })
  it('стук по столу не считается голосом', () => {
    const g = createGate()
    run(g, 0.001, 300)
    g(0.5, 50)
    expect(run(g, 0.001, NO_SPEECH_MS)).toBe('silent')
  })
  it('шумный класс: шум — не голос, тишиной считается всё на уровне шума', () => {
    const g = createGate()
    run(g, 0.03, 500)
    run(g, 0.2, 800)
    expect(run(g, 0.03, SILENCE_STOP_MS + 100)).toBe('stop')
  })
})

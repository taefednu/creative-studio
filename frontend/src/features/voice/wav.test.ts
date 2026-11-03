import { describe, expect, it } from 'vitest'
import { encodeWav, speechOnly } from './wav'

const text = (v: DataView, at: number, n: number) => String.fromCharCode(...Array.from({ length: n }, (_, i) => v.getUint8(at + i)))

describe('encodeWav', () => {
  const samples = new Float32Array([0, 0.5, -0.5, 1, -1])
  const buf = encodeWav(samples, 16000)
  const v = new DataView(buf)

  it('заголовок: RIFF, 16000 Гц, 1 канал, 16 бит', () => {
    expect(text(v, 0, 4)).toBe('RIFF')
    expect(text(v, 8, 4)).toBe('WAVE')
    expect(text(v, 12, 4)).toBe('fmt ')
    expect(v.getUint16(20, true)).toBe(1)
    expect(v.getUint16(22, true)).toBe(1)
    expect(v.getUint32(24, true)).toBe(16000)
    expect(v.getUint16(34, true)).toBe(16)
    expect(text(v, 36, 4)).toBe('data')
  })

  it('точное число отсчётов', () => {
    expect(buf.byteLength).toBe(44 + samples.length * 2)
    expect(v.getUint32(40, true)).toBe(samples.length * 2)
    expect(v.getUint32(4, true)).toBe(buf.byteLength - 8)
  })

  it('клиппинг не переворачивает знак', () => {
    const loud = new DataView(encodeWav(new Float32Array([3, -3, 0.5]), 16000))
    expect(loud.getInt16(44, true)).toBe(32767)
    expect(loud.getInt16(46, true)).toBe(-32768)
    expect(loud.getInt16(48, true)).toBeGreaterThan(0)
  })
})

describe('speechOnly', () => {
  const rate = 16000
  const sound = (s: number, amp: number) => Float32Array.from({ length: s * rate }, (_, i) => Math.sin(i / 8) * amp)
  const join = (...p: Float32Array[]) => Float32Array.from(p.flatMap((x) => [...x]))

  it('тишина и еле слышный шум: речи нет', () => {
    expect(speechOnly(new Float32Array(rate), rate)).toBeNull()
    expect(speechOnly(sound(1, 0.01), rate)).toBeNull()
  })
  it('срезает тишину по краям, но оставляет запас перед первым словом', () => {
    const out = speechOnly(join(new Float32Array(2 * rate), sound(1, 0.5), new Float32Array(3 * rate)), rate)!
    expect(out.length / rate).toBeGreaterThan(1.4)
    expect(out.length / rate).toBeLessThan(1.6)
  })
  it('тихий голос поднимает, но не больше чем в 4 раза', () => {
    const peak = (a: Float32Array) => a.reduce((m, x) => Math.max(m, Math.abs(x)), 0)
    expect(peak(speechOnly(sound(1, 0.3), rate)!)).toBeCloseTo(0.9, 1)
    expect(peak(speechOnly(sound(1, 0.05), rate)!)).toBeCloseTo(0.2, 1)
  })
})

import { describe, expect, it } from 'vitest'
import { parseLrc, parseLyricSegments } from './lrc.js'

describe('parseLyricSegments', () => {
  it('keeps plain lyrics unchanged', () => {
    expect(parseLyricSegments('hello')).toEqual({
      segments: [{ text: 'hello', ruby: '', falsetto: false }],
      plainText: 'hello',
      hasRuby: false,
    })
  })

  it('parses ruby annotations', () => {
    expect(parseLyricSegments('君<きみ>')).toEqual({
      segments: [{ text: '君', ruby: 'きみ', falsetto: false }],
      plainText: '君',
      hasRuby: true,
    })
  })

  it('parses falsetto ranges and keeps plain text clean', () => {
    expect(parseLyricSegments('a{f}bc{/f}d')).toEqual({
      segments: [
        { text: 'a', ruby: '', falsetto: false },
        { text: 'bc', ruby: '', falsetto: true },
        { text: 'd', ruby: '', falsetto: false },
      ],
      plainText: 'abcd',
      hasRuby: false,
    })
  })

  it('supports ruby inside falsetto ranges', () => {
    expect(parseLyricSegments('{f}君<きみ>{/f}')).toEqual({
      segments: [{ text: '君', ruby: 'きみ', falsetto: true }],
      plainText: '君',
      hasRuby: true,
    })
  })

  it('supports legacy compact ruby annotations', () => {
    expect(parseLyricSegments('{f}想そう通どおり{/f}')).toEqual({
      segments: [
        { text: '想', ruby: 'そう', falsetto: true },
        { text: '通', ruby: 'どお', falsetto: true },
        { text: 'り', ruby: '', falsetto: true },
      ],
      plainText: '想通り',
      hasRuby: true,
    })
  })

  it('keeps falsetto enabled until end of line when tag is not closed', () => {
    expect(parseLyricSegments('a{f}bc')).toEqual({
      segments: [
        { text: 'a', ruby: '', falsetto: false },
        { text: 'bc', ruby: '', falsetto: true },
      ],
      plainText: 'abc',
      hasRuby: false,
    })
  })

  it('drops redundant closing falsetto tags from output', () => {
    expect(parseLyricSegments('a{/f}b')).toEqual({
      segments: [{ text: 'ab', ruby: '', falsetto: false }],
      plainText: 'ab',
      hasRuby: false,
    })
  })
})

describe('parseLrc', () => {
  it('adds structured segments to plain timestamped lines', () => {
    const [entry] = parseLrc('[00:01.00]hello')
    expect(entry).toMatchObject({
      time: 1,
      text: 'hello',
      plainText: 'hello',
      hasRuby: false,
    })
    expect(entry.segments).toEqual([{ text: 'hello', ruby: '', falsetto: false }])
  })

  it('parses falsetto markers on plain lines', () => {
    const [entry] = parseLrc('[00:01.00]a{f}bc{/f}d')
    expect(entry.plainText).toBe('abcd')
    expect(entry.segments).toEqual([
      { text: 'a', ruby: '', falsetto: false },
      { text: 'bc', ruby: '', falsetto: true },
      { text: 'd', ruby: '', falsetto: false },
    ])
  })

  it('preserves timed-token progress weights when falsetto markers occupy their own token slots', () => {
    const [entry] = parseLrc('[00:01.00]{f}[00:02.00]He[00:03.00]llo{/f}[00:04.00] world')

    expect(entry.text).toBe('{f}Hello{/f} world')
    expect(entry.plainText).toBe('Hello world')
    expect(entry.segments).toEqual([
      { text: 'Hello', ruby: '', falsetto: true },
      { text: ' world', ruby: '', falsetto: false },
    ])
    expect(entry.tokens).toEqual([
      { time: 1, text: '', weight: 0, weightStart: 0 },
      { time: 2, text: 'He', weight: 1, weightStart: 0 },
      { time: 3, text: 'llo', weight: 1, weightStart: 1 },
      { time: 4, text: ' world', weight: 1, weightStart: 2 },
    ])
    expect(entry.tokenTotalWeight).toBe(3)
  })

  it('keeps ruby annotations visible in word-timed falsetto ranges', () => {
    const [entry] = parseLrc('[01:28.779]そ[01:29.090]う[01:29.401]{f}願<ねが>[01:30.079]っ[01:30.399]て[01:30.806]も{/f}[01:31.104]無<む>')

    expect(entry.plainText).toBe('そう願っても無')
    expect(entry.segments).toEqual([
      { text: 'そう', ruby: '', falsetto: false },
      { text: '願', ruby: 'ねが', falsetto: true },
      { text: 'っても', ruby: '', falsetto: true },
      { text: '無', ruby: 'む', falsetto: false },
    ])
  })

  it('keeps legacy compact ruby visible in word-timed falsetto ranges', () => {
    const [entry] = parseLrc('[00:35.561]そ[00:35.768]れ[00:35.985]は[00:36.185]予よ[00:36.402]{f}想そう[00:37.020]通どお[00:37.690]り{/f}[00:38.197]')

    expect(entry.plainText).toBe('それは予想通り')
    expect(entry.segments).toEqual([
      { text: 'それは', ruby: '', falsetto: false },
      { text: '予', ruby: 'よ', falsetto: false },
      { text: '想', ruby: 'そう', falsetto: true },
      { text: '通', ruby: 'どお', falsetto: true },
      { text: 'り', ruby: '', falsetto: true },
    ])
  })
})

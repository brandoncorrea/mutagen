import { describe, it, expect } from 'vitest'
import { createProgressReporter, formatProgressSummary, createOrderedBuffer } from '../../src/cli/progress.js'

describe('createProgressReporter', () => {
  function capture() {
    let output = ''
    const write = text => { output += text }
    return { write, output: () => output }
  }

  it('writes filename padded to max width then space', () => {
    const { write, output } = capture()
    const reporter = createProgressReporter(['short.js', 'very-long-name.js'], { write })

    reporter.startFile('short.js')

    expect(output()).toBe('short.js          ') // padEnd(17) + space = 18
  })

  it('writes dot for killed mutation', () => {
    const { write, output } = capture()
    const reporter = createProgressReporter(['a.js'], { write })

    reporter.startFile('a.js')
    reporter.dot('killed')

    expect(output()).toContain('.')
  })

  it('writes ! for survived mutation', () => {
    const { write, output } = capture()
    const reporter = createProgressReporter(['a.js'], { write })

    reporter.startFile('a.js')
    reporter.dot('SURVIVED')

    expect(output()).toContain('!')
  })

  it('writes T for timeout mutation', () => {
    const { write, output } = capture()
    const reporter = createProgressReporter(['a.js'], { write })

    reporter.startFile('a.js')
    reporter.dot('TIMEOUT (killed)')

    expect(output()).toContain('T')
  })

  it('writes . for killed (error) mutation', () => {
    const { write, output } = capture()
    const reporter = createProgressReporter(['a.js'], { write })

    reporter.startFile('a.js')
    reporter.dot('killed (error)')

    expect(output()).toBe('a.js .')
  })

  it('writes newline on endFile', () => {
    const { write, output } = capture()
    const reporter = createProgressReporter(['a.js'], { write })

    reporter.startFile('a.js')
    reporter.dot('killed')
    reporter.endFile()

    expect(output()).toBe('a.js .\n')
  })

  it('streams dots for a full file run', () => {
    const { write, output } = capture()
    const reporter = createProgressReporter(['src/pool.js'], { write })

    reporter.startFile('src/pool.js')
    reporter.dot('killed')
    reporter.dot('killed')
    reporter.dot('SURVIVED')
    reporter.dot('killed')
    reporter.dot('TIMEOUT (killed)')
    reporter.endFile()

    expect(output()).toBe('src/pool.js ..!.T\n')
  })

  it('aligns dots across multiple files', () => {
    const { write, output } = capture()
    const files = ['src/a.js', 'src/long-name.js']
    const reporter = createProgressReporter(files, { write })

    reporter.startFile('src/a.js')
    reporter.dot('killed')
    reporter.endFile()

    reporter.startFile('src/long-name.js')
    reporter.dot('SURVIVED')
    reporter.endFile()

    const lines = output().split('\n')
    expect(lines[0]).toBe('src/a.js         .')
    expect(lines[1]).toBe('src/long-name.js !')
  })
})

describe('formatProgressSummary', () => {
  it('formats compact summary line', () => {
    const result = formatProgressSummary({
      killed: 1744, survived: 22, timedOut: 0, fileCount: 26
    })
    expect(result).toBe('\n  26 files | 1766 mutations | 1744 killed | 22 survived | 98.8%')
  })

  it('counts timed-out mutations as killed', () => {
    const result = formatProgressSummary({
      killed: 8, survived: 2, timedOut: 2, fileCount: 1
    })
    expect(result).toBe('\n  1 files | 12 mutations | 10 killed | 2 survived | 83.3%')
  })

  it('shows 100.0% when all killed', () => {
    const result = formatProgressSummary({
      killed: 50, survived: 0, timedOut: 0, fileCount: 3
    })
    expect(result).toBe('\n  3 files | 50 mutations | 50 killed | 0 survived | 100.0%')
  })

  it('shows 100.0% when no mutations exist', () => {
    const result = formatProgressSummary({
      killed: 0, survived: 0, timedOut: 0, fileCount: 1
    })
    expect(result).toBe('\n  1 files | 0 mutations | 0 killed | 0 survived | 100.0%')
  })
})

describe('createOrderedBuffer', () => {
  it('emits dots in order when results arrive in order', () => {
    const dots = []
    const buffer = createOrderedBuffer(status => dots.push(status))

    buffer(0, 'killed')
    buffer(1, 'SURVIVED')
    buffer(2, 'killed')

    expect(dots).toEqual(['killed', 'SURVIVED', 'killed'])
  })

  it('buffers out-of-order results and emits when gap fills', () => {
    const dots = []
    const buffer = createOrderedBuffer(status => dots.push(status))

    buffer(2, 'killed')    // buffered (waiting for 0)
    expect(dots).toEqual([])

    buffer(0, 'killed')    // emits 0
    expect(dots).toEqual(['killed'])

    buffer(1, 'SURVIVED')  // emits 1 and buffered 2
    expect(dots).toEqual(['killed', 'SURVIVED', 'killed'])
  })

  it('handles single mutation', () => {
    const dots = []
    const buffer = createOrderedBuffer(status => dots.push(status))

    buffer(0, 'TIMEOUT (killed)')

    expect(dots).toEqual(['TIMEOUT (killed)'])
  })

  it('handles all results arriving in reverse order', () => {
    const dots = []
    const buffer = createOrderedBuffer(status => dots.push(status))

    buffer(3, 'd')
    buffer(2, 'c')
    buffer(1, 'b')
    expect(dots).toEqual([])

    buffer(0, 'a')
    expect(dots).toEqual(['a', 'b', 'c', 'd'])
  })
})

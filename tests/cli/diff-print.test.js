import { describe, it, expect } from 'vitest'
import { printDiffReport } from '../../src/cli/diff-print.js'
import { makeMutant, capture } from './helpers.js'

describe('printDiffReport', () => {
  it('printCategory shows correct count in label', () => {
    const { out, lines } = capture()
    const changes = {
      newlyKilled: [
        { after: { file: 'a.js', line: 1, mutatorName: '=== → !==' } },
        { after: { file: 'b.js', line: 5, mutatorName: '+ → -' } }
      ],
      regressions: [],
      newMutants: [],
      removedMutants: []
    }
    const before = { files: { 'a.js': { mutants: [makeMutant('m1', 'x', 'Survived')] } } }
    const after = { files: { 'a.js': { mutants: [makeMutant('m1', 'x', 'Killed')] } } }

    printDiffReport(
      { beforeFile: 'before.json', afterFile: 'after.json', before, after },
      changes, [], out
    )

    const categoryLine = lines.find(line => line.includes('NEWLY KILLED'))
    expect(categoryLine).toContain('(2)')
  })
})

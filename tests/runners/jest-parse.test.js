import { describe, it, expect } from 'vitest'
import { parseJestOutput } from '../../src/runners/jest-parse.js'

describe('parseJestOutput', () => {
  it('returns passed with coveredBy for all-passing tests',
    () => {
      const json = {
        success: true,
        testResults: [
          {
            testFilePath: '/app/test/a.test.js',
            status: 'passed'
          },
          {
            testFilePath: '/app/test/b.test.js',
            status: 'passed'
          }
        ]
      }

      const result = parseJestOutput(JSON.stringify(json))

      expect(result).toEqual({
        passed: true,
        killedBy: [],
        coveredBy: [
          '/app/test/a.test.js',
          '/app/test/b.test.js'
        ]
      })
    })

  it('returns failed with killedBy for failed tests', () => {
    const json = {
      success: false,
      testResults: [
        {
          testFilePath: '/app/test/a.test.js',
          status: 'failed'
        },
        {
          testFilePath: '/app/test/b.test.js',
          status: 'passed'
        }
      ]
    }

    const result = parseJestOutput(JSON.stringify(json))

    expect(result).toEqual({
      passed: false,
      killedBy: ['/app/test/a.test.js'],
      coveredBy: [
        '/app/test/a.test.js',
        '/app/test/b.test.js'
      ]
    })
  })

  it('returns multiple killedBy when multiple suites fail',
    () => {
      const json = {
        success: false,
        testResults: [
          {
            testFilePath: '/app/test/a.test.js',
            status: 'failed'
          },
          {
            testFilePath: '/app/test/b.test.js',
            status: 'failed'
          }
        ]
      }

      const result = parseJestOutput(JSON.stringify(json))

      expect(result).toEqual({
        passed: false,
        killedBy: [
          '/app/test/a.test.js',
          '/app/test/b.test.js'
        ],
        coveredBy: [
          '/app/test/a.test.js',
          '/app/test/b.test.js'
        ]
      })
    })

  describe('edge cases', () => {
    it('returns passed with empty arrays when no tests found',
      () => {
        const json = {
          success: true,
          numTotalTestSuites: 0,
          testResults: []
        }

        const result = parseJestOutput(JSON.stringify(json))

        expect(result).toEqual({
          passed: true,
          killedBy: [],
          coveredBy: []
        })
      })

    it('throws on invalid JSON (Jest process crash)', () => {
      expect(() => parseJestOutput('not json'))
        .toThrow()
    })

    it('throws on empty string (Jest process crash)', () => {
      expect(() => parseJestOutput(''))
        .toThrow()
    })

    it('handles non-zero exit without test failures',
      () => {
        const json = {
          success: false,
          testResults: [
            {
              testFilePath: '/app/test/a.test.js',
              status: 'passed'
            }
          ]
        }

        const result = parseJestOutput(
          JSON.stringify(json), 1
        )

        expect(result).toEqual({
          passed: true,
          killedBy: [],
          coveredBy: ['/app/test/a.test.js']
        })
      })

    it('handles missing testResults field', () => {
      const json = { success: false }

      const result = parseJestOutput(JSON.stringify(json))

      expect(result).toEqual({
        passed: true,
        killedBy: [],
        coveredBy: []
      })
    })

    it('treats pending (skipped) tests as non-failing',
      () => {
        const json = {
          success: false,
          testResults: [
            {
              testFilePath: '/app/test/a.test.js',
              status: 'passed'
            },
            {
              testFilePath: '/app/test/b.test.js',
              status: 'pending'
            }
          ]
        }

        const result = parseJestOutput(
          JSON.stringify(json)
        )

        expect(result).toEqual({
          passed: true,
          killedBy: [],
          coveredBy: [
            '/app/test/a.test.js',
            '/app/test/b.test.js'
          ]
        })
      })
  })
})

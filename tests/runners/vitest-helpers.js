import { vi } from 'vitest'

export function createMockModuleGraph() {
  return { invalidateAll: vi.fn(), getModuleById: vi.fn().mockReturnValue(null) }
}

export function createMockVitest() {
  return {
    waitForTestRunEnd: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    invalidateFile: vi.fn(),
    globTestSpecifications: vi.fn().mockResolvedValue([]),
    runTestSpecifications: vi.fn().mockResolvedValue(undefined),
    state: { getFiles: vi.fn().mockReturnValue([]) },
    projects: [{
      _vite: {
        moduleGraph: createMockModuleGraph(),
        environments: { ssr: { moduleGraph: createMockModuleGraph() } }
      }
    }],
    _fsCache: { clearCache: vi.fn() }
  }
}

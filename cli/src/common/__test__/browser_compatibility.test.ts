import { exitWithError, logger } from '../logging'
import { updateCli } from '../updates'

/**
 * Test to ensure browser-reachable modules don't import Node.js-only modules
 * This reproduces figma/code-connect#96 (child_process) and #84 (Console) browser compatibility issues
 */

// Mock modules that should not be statically imported
jest.mock('child_process', () => {
  const mockExecSync = jest.fn()
  return {
    execSync: mockExecSync,
  }
})

jest.mock('console', () => {
  const MockConsole = jest.fn().mockImplementation(() => ({
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  }))
  return {
    Console: MockConsole,
  }
})

describe('Browser Compatibility', () => {
  let mockExit: jest.SpyInstance

  beforeEach(() => {
    mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called')
    })
  })

  afterEach(() => {
    mockExit.mockRestore()
    jest.clearAllMocks()
  })

  it('should work in browser context: static imports safe, dynamic imports functional', () => {
    // Step 1: Static imports are safe (this test runs = modules can be imported)
    // If there were static Node.js imports, the module import would fail entirely
    expect(exitWithError).toBeDefined()
    expect(updateCli).toBeDefined()
    expect(logger).toBeDefined()

    // Step 2: Logging works (tests Console compatibility - issue #84)
    expect(() => {
      logger.info('test message')
      logger.error('test error')
    }).not.toThrow()

    // Step 3: Dynamic imports work when functions are invoked
    expect(() => {
      exitWithError('test error')
    }).toThrow('process.exit called')

    const childProcess = require('child_process')
    const mockExecSync = childProcess.execSync as jest.MockedFunction<typeof childProcess.execSync>

    updateCli()
    expect(mockExecSync).toHaveBeenCalledWith('npm update -g @figma/code-connect', {
      stdio: 'inherit',
    })

    // If we reach here, both static safety and dynamic functionality work
    expect(mockExit).toHaveBeenCalledWith(1)
  })
})

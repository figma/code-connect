import { getFileIfExists } from '../get_file_if_exists'
import { readdirSync } from 'fs'
import { execSync } from 'child_process'
import path from 'path'
import os from 'os'
import fs from 'fs'

jest.mock('fs')
jest.mock('child_process')

const mockReaddirSync = readdirSync as jest.MockedFunction<typeof readdirSync>
const mockExecSync = execSync as jest.MockedFunction<typeof execSync>

describe('getFileIfExists', () => {
  const originalPlatform = process.platform

  beforeEach(() => {
    jest.clearAllMocks()
  })

  afterEach(() => {
    // Restore original platform
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
    })
  })

  describe('Windows (win32)', () => {
    beforeEach(() => {
      Object.defineProperty(process, 'platform', {
        value: 'win32',
      })
    })

    it('should return the first matching file with exact name', () => {
      const mockFiles = ['package.json', 'tsconfig.json', 'README.md']
      mockReaddirSync.mockReturnValue(mockFiles as any)

      const result = getFileIfExists('/some/path', 'package.json')

      expect(result).toBe('./package.json')
      expect(mockReaddirSync).toHaveBeenCalledWith('/some/path')
    })

    it('should return the first matching file with wildcard pattern', () => {
      const mockFiles = ['file1.txt', 'file2.txt', 'document.pdf']
      mockReaddirSync.mockReturnValue(mockFiles as any)

      const result = getFileIfExists('/some/path', 'file*.txt')

      expect(result).toBe('./file1.txt')
      expect(mockReaddirSync).toHaveBeenCalledWith('/some/path')
    })

    it('should return empty string when no files match', () => {
      const mockFiles = ['package.json', 'tsconfig.json']
      mockReaddirSync.mockReturnValue(mockFiles as any)

      const result = getFileIfExists('/some/path', 'nonexistent.txt')

      expect(result).toBe('')
      expect(mockReaddirSync).toHaveBeenCalledWith('/some/path')
    })

    it('should handle patterns with dots correctly', () => {
      const mockFiles = ['file.test.js', 'file.spec.js', 'file.js']
      mockReaddirSync.mockReturnValue(mockFiles as any)

      const result = getFileIfExists('/some/path', 'file.test.js')

      expect(result).toBe('./file.test.js')
      expect(mockReaddirSync).toHaveBeenCalledWith('/some/path')
    })

    it('should handle multiple wildcards in pattern', () => {
      const mockFiles = ['component.test.ts', 'component.spec.ts', 'helper.test.js']
      mockReaddirSync.mockReturnValue(mockFiles as any)

      const result = getFileIfExists('/some/path', '*.test.*')

      expect(result).toBe('./component.test.ts')
      expect(mockReaddirSync).toHaveBeenCalledWith('/some/path')
    })

    it('should return empty string when directory is empty', () => {
      mockReaddirSync.mockReturnValue([] as any)

      const result = getFileIfExists('/empty/path', '*.txt')

      expect(result).toBe('')
      expect(mockReaddirSync).toHaveBeenCalledWith('/empty/path')
    })

    it('should match files case-sensitively', () => {
      const mockFiles = ['Package.json', 'README.md']
      mockReaddirSync.mockReturnValue(mockFiles as any)

      const result = getFileIfExists('/some/path', 'package.json')

      expect(result).toBe('')
    })

    it('should handle patterns with only wildcards', () => {
      const mockFiles = ['file1.txt', 'file2.txt']
      mockReaddirSync.mockReturnValue(mockFiles as any)

      const result = getFileIfExists('/some/path', '*')

      expect(result).toBe('./file1.txt')
    })
  })

  describe('Unix-like systems (darwin, linux)', () => {
    beforeEach(() => {
      Object.defineProperty(process, 'platform', {
        value: 'darwin',
      })
    })

    it('should return the first matching file using find command', () => {
      mockExecSync.mockReturnValue(Buffer.from('./package.json\n'))

      const result = getFileIfExists('/some/path', 'package.json')

      expect(result).toBe('./package.json')
      expect(mockExecSync).toHaveBeenCalledWith('find . -maxdepth 1 -name package.json', {
        cwd: '/some/path',
      })
    })

    it('should return empty string when no files match', () => {
      mockExecSync.mockReturnValue(Buffer.from(''))

      const result = getFileIfExists('/some/path', 'nonexistent.txt')

      expect(result).toBe('')
      expect(mockExecSync).toHaveBeenCalledWith('find . -maxdepth 1 -name nonexistent.txt', {
        cwd: '/some/path',
      })
    })

    it('should handle wildcard patterns', () => {
      mockExecSync.mockReturnValue(Buffer.from('./file1.txt\n'))

      const result = getFileIfExists('/some/path', '*.txt')

      expect(result).toBe('./file1.txt')
      expect(mockExecSync).toHaveBeenCalledWith('find . -maxdepth 1 -name *.txt', {
        cwd: '/some/path',
      })
    })

    it('should return only the first match when multiple files are found', () => {
      mockExecSync.mockReturnValue(Buffer.from('./file1.txt\n./file2.txt\n./file3.txt\n'))

      const result = getFileIfExists('/some/path', '*.txt')

      expect(result).toBe('./file1.txt')
    })

    it('should trim whitespace from result', () => {
      mockExecSync.mockReturnValue(Buffer.from('  ./package.json  \n'))

      const result = getFileIfExists('/some/path', 'package.json')

      expect(result).toBe('./package.json')
    })

    it('should handle empty output correctly', () => {
      mockExecSync.mockReturnValue(Buffer.from('\n'))

      const result = getFileIfExists('/some/path', 'nonexistent.txt')

      expect(result).toBe('')
    })

    it('should work on linux platform', () => {
      Object.defineProperty(process, 'platform', {
        value: 'linux',
      })

      mockExecSync.mockReturnValue(Buffer.from('./README.md\n'))

      const result = getFileIfExists('/some/path', 'README.md')

      expect(result).toBe('./README.md')
      expect(mockExecSync).toHaveBeenCalledWith('find . -maxdepth 1 -name README.md', {
        cwd: '/some/path',
      })
    })
  })

  describe('cross-platform behavior', () => {
    it('should handle the same search pattern consistently across platforms', () => {
      const mockFiles = ['package.json', 'tsconfig.json']

      // Test Windows
      Object.defineProperty(process, 'platform', { value: 'win32' })
      mockReaddirSync.mockReturnValue(mockFiles as any)
      const windowsResult = getFileIfExists('/test', 'package.json')

      // Test Unix
      Object.defineProperty(process, 'platform', { value: 'darwin' })
      mockExecSync.mockReturnValue(Buffer.from('./package.json\n'))
      const unixResult = getFileIfExists('/test', 'package.json')

      expect(windowsResult).toBe(unixResult)
    })
  })
})

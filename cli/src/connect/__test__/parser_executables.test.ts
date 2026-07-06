import { callParser } from '../parser_executables'
import { spawn } from 'cross-spawn'
import fs from 'fs'
import {
  getGradleWrapperPath,
  getGradleWrapperExecutablePath,
} from '../../parser_scripts/get_gradlew_path'
import { CodeConnectCustomExecutableParserConfig } from '../project'
import { getSwiftParserDir } from '../../parser_scripts/get_swift_parser_dir'
import type { ChildProcess } from 'child_process'
import { EventEmitter } from 'events'

jest.mock('cross-spawn')
jest.mock('fs')
jest.mock('../../parser_scripts/get_gradlew_path', () => ({
  getGradleWrapperPath: jest.fn(),
  getGradleWrapperExecutablePath: jest.fn((dir: string) =>
    dir === '.' ? './gradlew' : `${dir}/gradlew`,
  ),
}))
jest.mock('../../parser_scripts/get_swift_parser_dir')

describe('callParser', () => {
  const mockSpawn = spawn as jest.MockedFunction<typeof spawn>
  const mockFs = fs as jest.Mocked<typeof fs>
  const mockGetGradleWrapperPath = getGradleWrapperPath as jest.MockedFunction<
    typeof getGradleWrapperPath
  >
  const mockGetSwiftParserDir = getSwiftParserDir as jest.MockedFunction<typeof getSwiftParserDir>

  // Helper to create a mock child process that completes successfully
  const createMockChildProcess = () => {
    const mockChildProcess = new EventEmitter() as ChildProcess
    mockChildProcess.stdout = new EventEmitter() as any
    mockChildProcess.stderr = new EventEmitter() as any
    mockChildProcess.stdin = {
      write: jest.fn(),
      end: jest.fn(),
    } as any
    return mockChildProcess
  }

  beforeEach(() => {
    jest.clearAllMocks()

    // Mock file system operations
    mockFs.mkdirSync = jest.fn()
    mockFs.writeFileSync = jest.fn()
    mockFs.existsSync = jest.fn().mockReturnValue(true)
    mockFs.readdirSync = jest.fn().mockReturnValue(['module1.json', 'module2.json'])
    mockFs.readFileSync = jest.fn()
    mockFs.unlinkSync = jest.fn()
    mockFs.rmdirSync = jest.fn()

    // Mock gradle wrapper path
    mockGetGradleWrapperPath.mockResolvedValue('/path/to/gradle')
  })

  describe('preserves arguments containing spaces', () => {
    it('compose: passes gradle path with a space as a single argv entry', async () => {
      const gradleDirWithSpace = '/Users/me/My Projects/app'
      mockGetGradleWrapperPath.mockResolvedValue(gradleDirWithSpace)

      mockFs.readFileSync = jest.fn().mockReturnValue(JSON.stringify({ docs: [], messages: [] }))

      const mockChildProcess = createMockChildProcess()
      mockSpawn.mockReturnValue(mockChildProcess)

      const resultPromise = callParser(
        { parser: 'compose' as const },
        { mode: 'PARSE' as const, paths: [], config: {} },
        '/test/cwd',
      )
      setImmediate(() => mockChildProcess.emit('close', 0))
      await resultPromise

      expect(mockSpawn).toHaveBeenCalledTimes(1)
      const [cmd, args] = mockSpawn.mock.calls[0] as [string, string[], object]

      expect(cmd).toBe(`${gradleDirWithSpace}/gradlew`)

      const dashPIdx = args.indexOf('-p')
      expect(dashPIdx).toBeGreaterThanOrEqual(0)
      expect(args[dashPIdx + 1]).toBe(gradleDirWithSpace)

      expect(args).not.toContain('My')
      expect(args).not.toContain('Projects/app')
    })

    it('swift: passes package path with a space as a single argv entry', async () => {
      const swiftDirWithSpace = '/Users/me/My App/code-connect'
      mockGetSwiftParserDir.mockResolvedValue(swiftDirWithSpace)

      const mockChildProcess = createMockChildProcess()
      mockSpawn.mockReturnValue(mockChildProcess)

      const resultPromise = callParser(
        { parser: 'swift' as const },
        { mode: 'PARSE' as const, paths: [], config: {} },
        '/test/cwd',
      )
      setImmediate(() => {
        mockChildProcess.stdout!.emit('data', JSON.stringify({ docs: [], messages: [] }))
        mockChildProcess.emit('close', 0)
      })
      await resultPromise

      expect(mockSpawn).toHaveBeenCalledTimes(1)
      const [cmd, args] = mockSpawn.mock.calls[0] as [string, string[], object]

      expect(cmd).toBe('swift')

      const packagePathIdx = args.indexOf('--package-path')
      expect(packagePathIdx).toBeGreaterThanOrEqual(0)
      expect(args[packagePathIdx + 1]).toBe(swiftDirWithSpace)
      expect(args[packagePathIdx + 1]).not.toContain('\\')

      expect(args).not.toContain('My')
      expect(args).not.toContain('App/code-connect')
    })

    it('custom: passes parserCommand string with shell: true', async () => {
      const mockChildProcess = createMockChildProcess()
      mockSpawn.mockReturnValue(mockChildProcess)

      const customConfig: CodeConnectCustomExecutableParserConfig = {
        parser: 'custom',
        parserCommand: 'node "/tmp/My Test Dir/parser.js"',
      }
      const resultPromise = callParser(
        customConfig,
        { mode: 'PARSE' as const, paths: [], config: {} },
        '/test/cwd',
      )

      setImmediate(() => {
        mockChildProcess.stdout!.emit('data', JSON.stringify({ docs: [], messages: [] }))
        mockChildProcess.emit('close', 0)
      })
      await resultPromise

      expect(mockSpawn).toHaveBeenCalledWith(
        'node "/tmp/My Test Dir/parser.js"',
        [],
        expect.objectContaining({ shell: true, cwd: '/test/cwd' }),
      )
    })
  })

  it('successfully calls parser in PARSE mode and returns combined, deduplicated results', async () => {
    const payload = {
      mode: 'PARSE' as const,
      paths: ['/path/to/Component.kt'],
      config: {},
    }

    // Mock JSON output with docs from multiple modules, including a duplicate
    const module1Output = {
      docs: [
        {
          figmaNode: 'https://figma.com/file/abc/node1',
          template: 'template1',
          templateData: { props: {}, imports: [] },
          language: 'kotlin',
          label: 'Button',
        },
      ],
      messages: [{ level: 'INFO', message: 'Parsed module 1' }],
    }

    const module2Output = {
      docs: [
        {
          figmaNode: 'https://figma.com/file/abc/node2',
          template: 'template2',
          templateData: { props: {}, imports: [] },
          language: 'kotlin',
          label: 'TextField',
        },
        // Duplicate doc that should be deduplicated
        {
          figmaNode: 'https://figma.com/file/abc/node1',
          template: 'template1',
          templateData: { props: {}, imports: [] },
          language: 'kotlin',
          label: 'Button',
        },
      ],
      messages: [{ level: 'INFO', message: 'Parsed module 2' }],
    }

    mockFs.readFileSync = jest.fn().mockImplementation((filePath: string) => {
      if (filePath.includes('module1.json')) return JSON.stringify(module1Output)
      if (filePath.includes('module2.json')) return JSON.stringify(module2Output)
      return ''
    })

    const mockChildProcess = createMockChildProcess()
    mockSpawn.mockReturnValue(mockChildProcess)

    const resultPromise = callParser({ parser: 'compose' as const }, payload, '/test/cwd')

    setImmediate(() => mockChildProcess.emit('close', 0))

    const result = await resultPromise

    // Verify results are combined and deduplicated
    expect(result).toEqual({
      docs: [
        {
          figmaNode: 'https://figma.com/file/abc/node1',
          template: 'template1',
          templateData: { props: {}, imports: [] },
          language: 'kotlin',
          label: 'Button',
        },
        {
          figmaNode: 'https://figma.com/file/abc/node2',
          template: 'template2',
          templateData: { props: {}, imports: [] },
          language: 'kotlin',
          label: 'TextField',
        },
      ],
      messages: [
        { level: 'INFO', message: 'Parsed module 1' },
        { level: 'INFO', message: 'Parsed module 2' },
      ],
    })

    // Verify temp file cleanup
    expect(mockFs.unlinkSync).toHaveBeenCalledWith(
      expect.stringContaining('tmp/figma-code-connect-parser-io.json.tmp'),
    )
  })

  it('successfully calls parser in CREATE mode and returns combined results', async () => {
    const payload = {
      mode: 'CREATE' as const,
      destinationDir: '/path/to/output',
      component: {
        figmaNodeUrl: 'https://figma.com/file/abc/node1',
        id: '1:2',
        name: 'Button',
        normalizedName: 'Button',
        type: 'COMPONENT' as const,
        componentPropertyDefinitions: {},
      },
      config: {},
    }

    // Mock JSON output with createdFiles from multiple modules
    const module1Output = {
      createdFiles: [{ filePath: '/path/to/Button.figma.kt' }],
      messages: [{ level: 'INFO', message: 'Created file in module 1' }],
    }

    const module2Output = {
      createdFiles: [{ filePath: '/path/to/TextField.figma.kt' }],
      messages: [{ level: 'INFO', message: 'Created file in module 2' }],
    }

    mockFs.readFileSync = jest.fn().mockImplementation((filePath: string) => {
      if (filePath.includes('module1.json')) return JSON.stringify(module1Output)
      if (filePath.includes('module2.json')) return JSON.stringify(module2Output)
      return ''
    })

    const mockChildProcess = createMockChildProcess()
    mockSpawn.mockReturnValue(mockChildProcess)

    const resultPromise = callParser({ parser: 'compose' as const }, payload, '/test/cwd')

    setImmediate(() => mockChildProcess.emit('close', 0))

    const result = await resultPromise

    // Verify results are combined
    expect(result).toEqual({
      createdFiles: [
        { filePath: '/path/to/Button.figma.kt' },
        { filePath: '/path/to/TextField.figma.kt' },
      ],
      messages: [
        { level: 'INFO', message: 'Created file in module 1' },
        { level: 'INFO', message: 'Created file in module 2' },
      ],
    })

    // Verify temp file cleanup
    expect(mockFs.unlinkSync).toHaveBeenCalledWith(
      expect.stringContaining('tmp/figma-code-connect-parser-io.json.tmp'),
    )
  })
})

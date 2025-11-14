import { callParser } from '../parser_executables'
import { spawn } from 'cross-spawn'
import fs from 'fs'
import { getGradleWrapperPath } from '../../parser_scripts/get_gradlew_path'
import type { ChildProcess } from 'child_process'
import { EventEmitter } from 'events'

jest.mock('cross-spawn')
jest.mock('fs')
jest.mock('../../parser_scripts/get_gradlew_path')

describe('callParser', () => {
  const mockSpawn = spawn as jest.MockedFunction<typeof spawn>
  const mockFs = fs as jest.Mocked<typeof fs>
  const mockGetGradleWrapperPath = getGradleWrapperPath as jest.MockedFunction<
    typeof getGradleWrapperPath
  >

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

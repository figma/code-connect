// Mock connect module first to avoid TypeScript import issues
jest.mock('../connect', () => ({
  getCodeConnectObjects: jest.fn(),
  getAccessTokenOrExit: jest.fn(),
  setupHandler: jest.fn(),
}))

// Mock project module to avoid TypeScript imports
jest.mock('../../connect/project', () => ({
  getProjectInfo: jest.fn(),
}))

// Mock fs
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  statSync: jest.fn(),
}))

// Mock validation module
jest.mock('../../connect/validation', () => ({
  parseFigmaNode: jest.fn(),
}))

// Mock logging
jest.mock('../../common/logging', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
  },
  exitWithError: jest.fn(),
}))

// Mock fetch
jest.mock('../../common/fetch', () => ({
  request: {
    post: jest.fn(),
    get: jest.fn(),
  },
  isFetchError: jest.fn(),
}))

// Mock figma_rest_api
jest.mock('../../connect/figma_rest_api', () => ({
  getApiUrl: jest.fn(),
  getHeaders: jest.fn(),
  FigmaRestApi: {
    ComponentPropertyType: {
      Boolean: 'BOOLEAN',
      InstanceSwap: 'INSTANCE_SWAP',
      Text: 'TEXT',
      Variant: 'VARIANT',
    },
  },
}))

import {
  chunkOutcomeToResults,
  collectNodesToPreview,
  filterTemplatesForNodes,
  formatSnippet,
  isPrettierParseable,
  displayResults,
  handlePreview,
  fetchComponentPropertyDefinitions,
  fetchComponentPropertyDefinitionsBatch,
  parsePropsArg,
  validatePreviewOptions,
} from '../preview_utils'
import chalk from 'chalk'
import type { CodeConnectJSON } from '../../connect/figma_connect'
import type { BaseCommand } from '../connect'

// Import mocked modules
const { parseFigmaNode } = jest.requireMock('../../connect/validation')
const { logger } = jest.requireMock('../../common/logging')
const mockFs = jest.requireMock('fs')
const { getCodeConnectObjects, getAccessTokenOrExit, setupHandler } = jest.requireMock('../connect')
const { getProjectInfo } = jest.requireMock('../../connect/project')
const { request, isFetchError } = jest.requireMock('../../common/fetch')
const { getApiUrl, getHeaders } = jest.requireMock('../../connect/figma_rest_api')

describe('preview_utils', () => {
  let mockParseFigmaNode: jest.Mock
  let mockLogger: any

  beforeEach(() => {
    jest.clearAllMocks()
    mockParseFigmaNode = parseFigmaNode as jest.Mock
    mockLogger = logger
  })

  describe('collectNodesToPreview', () => {
    const mockCmd: BaseCommand = { verbose: false } as any
    const mockDir = '/test/dir'

    it('should handle exact file path match', async () => {
      const mockDoc: CodeConnectJSON = {
        figmaNode: 'https://figma.com/file/ABC123/test?node-id=1-2',
        _codeConnectFilePath: '/test/dir/Button.figma.tsx',
      } as CodeConnectJSON

      mockFs.existsSync.mockReturnValue(true)
      mockFs.statSync.mockReturnValue({ isFile: () => true })
      mockParseFigmaNode.mockReturnValue({ fileKey: 'ABC123', nodeId: '1:2' })

      const result = await collectNodesToPreview(
        ['/test/dir/Button.figma.tsx'],
        [mockDoc],
        mockDir,
        mockCmd,
      )

      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({
        fileKey: 'ABC123',
        nodeId: '1:2',
        url: 'https://figma.com/file/ABC123/test?node-id=1-2',
        filePath: 'Button.figma.tsx',
      })
      expect(mockLogger.info).toHaveBeenCalledWith('Found: /test/dir/Button.figma.tsx')
    })

    it('should handle basename matching for single file', async () => {
      const mockDoc: CodeConnectJSON = {
        figmaNode: 'https://figma.com/file/ABC123/test?node-id=1-2',
        _codeConnectFilePath: '/test/dir/components/Button.figma.tsx',
      } as CodeConnectJSON

      mockFs.existsSync.mockReturnValue(false)
      mockParseFigmaNode.mockReturnValue({ fileKey: 'ABC123', nodeId: '1:2' })

      const result = await collectNodesToPreview(['Button.figma.tsx'], [mockDoc], mockDir, mockCmd)

      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({
        fileKey: 'ABC123',
        nodeId: '1:2',
      })
      expect(mockLogger.info).toHaveBeenCalledWith('Found: /test/dir/components/Button.figma.tsx')
    })

    it('should handle multiple definitions in same file', async () => {
      const mockDocs: CodeConnectJSON[] = [
        {
          figmaNode: 'https://figma.com/file/ABC123/test?node-id=1-2',
          _codeConnectFilePath: '/test/dir/Button.figma.tsx',
        } as CodeConnectJSON,
        {
          figmaNode: 'https://figma.com/file/ABC123/test?node-id=1-3',
          _codeConnectFilePath: '/test/dir/Button.figma.tsx',
        } as CodeConnectJSON,
      ]

      mockFs.existsSync.mockReturnValue(false)
      mockParseFigmaNode
        .mockReturnValueOnce({ fileKey: 'ABC123', nodeId: '1:2' })
        .mockReturnValueOnce({ fileKey: 'ABC123', nodeId: '1:3' })

      const result = await collectNodesToPreview(['Button.figma.tsx'], mockDocs, mockDir, mockCmd)

      expect(result).toHaveLength(2)
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Found 2 component definition(s) in Button.figma.tsx',
      )
    })

    it('should handle multiple definitions across different files', async () => {
      const mockDocs: CodeConnectJSON[] = [
        {
          figmaNode: 'https://figma.com/file/ABC123/test?node-id=1-2',
          _codeConnectFilePath: '/test/dir/path1/Button.figma.tsx',
        } as CodeConnectJSON,
        {
          figmaNode: 'https://figma.com/file/ABC123/test?node-id=1-3',
          _codeConnectFilePath: '/test/dir/path2/Button.figma.tsx',
        } as CodeConnectJSON,
      ]

      mockFs.existsSync.mockReturnValue(false)
      mockParseFigmaNode
        .mockReturnValueOnce({ fileKey: 'ABC123', nodeId: '1:2' })
        .mockReturnValueOnce({ fileKey: 'ABC123', nodeId: '1:3' })

      const result = await collectNodesToPreview(['Button.figma.tsx'], mockDocs, mockDir, mockCmd)

      expect(result).toHaveLength(2)
      expect(mockLogger.info).toHaveBeenCalledWith('Found 2 component definition(s) in 2 files:')
    })

    it('should match a batch component by the template file it was generated from', async () => {
      const mockDoc: CodeConnectJSON = {
        figmaNode: 'https://figma.com/file/ABC123/test?node-id=1-1',
        _codeConnectFilePath: '/test/dir/components.figma.batch.json',
        _batchTemplateFilePath: '/test/dir/dist/Notification.figma.batch.js',
      } as CodeConnectJSON

      mockFs.existsSync.mockReturnValue(true)
      mockFs.statSync.mockReturnValue({ isFile: () => true })
      mockParseFigmaNode.mockReturnValue({ fileKey: 'ABC123', nodeId: '1:1' })

      const result = await collectNodesToPreview(
        ['dist/Notification.figma.batch.js'],
        [mockDoc],
        mockDir,
        mockCmd,
      )

      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({
        fileKey: 'ABC123',
        nodeId: '1:1',
        filePath: 'components.figma.batch.json',
      })
      expect(mockLogger.error).not.toHaveBeenCalled()
    })

    it('should select only the batch group whose template file was requested', async () => {
      const mockDocs: CodeConnectJSON[] = [
        {
          figmaNode: 'https://figma.com/file/ABC123/test?node-id=1-1',
          _codeConnectFilePath: '/test/dir/components.figma.batch.json',
          _batchTemplateFilePath: '/test/dir/dist/Notification.figma.batch.js',
        } as CodeConnectJSON,
        {
          figmaNode: 'https://figma.com/file/ABC123/test?node-id=2-2',
          _codeConnectFilePath: '/test/dir/components.figma.batch.json',
          _batchTemplateFilePath: '/test/dir/dist/Button.figma.batch.js',
        } as CodeConnectJSON,
      ]

      mockFs.existsSync.mockReturnValue(true)
      mockFs.statSync.mockReturnValue({ isFile: () => true })
      mockParseFigmaNode.mockReturnValue({ fileKey: 'ABC123', nodeId: '1:1' })

      const result = await collectNodesToPreview(
        ['dist/Notification.figma.batch.js'],
        mockDocs,
        mockDir,
        mockCmd,
      )

      expect(result).toHaveLength(1)
      expect(result[0].nodeId).toBe('1:1')
    })

    it('should match a batch component by the template file basename', async () => {
      const mockDoc: CodeConnectJSON = {
        figmaNode: 'https://figma.com/file/ABC123/test?node-id=1-1',
        _codeConnectFilePath: '/test/dir/components.figma.batch.json',
        _batchTemplateFilePath: '/test/dir/dist/Notification.figma.batch.js',
      } as CodeConnectJSON

      mockFs.existsSync.mockReturnValue(false)
      mockParseFigmaNode.mockReturnValue({ fileKey: 'ABC123', nodeId: '1:1' })

      const result = await collectNodesToPreview(
        ['Notification.figma.batch.js'],
        [mockDoc],
        mockDir,
        mockCmd,
      )

      expect(result).toHaveLength(1)
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Found: /test/dir/dist/Notification.figma.batch.js',
      )
    })

    it('should still match a batch component by the batch file itself', async () => {
      const mockDocs: CodeConnectJSON[] = [
        {
          figmaNode: 'https://figma.com/file/ABC123/test?node-id=1-1',
          _codeConnectFilePath: '/test/dir/components.figma.batch.json',
          _batchTemplateFilePath: '/test/dir/dist/Notification.figma.batch.js',
        } as CodeConnectJSON,
        {
          figmaNode: 'https://figma.com/file/ABC123/test?node-id=2-2',
          _codeConnectFilePath: '/test/dir/components.figma.batch.json',
          _batchTemplateFilePath: '/test/dir/dist/Button.figma.batch.js',
        } as CodeConnectJSON,
      ]

      mockFs.existsSync.mockReturnValue(true)
      mockFs.statSync.mockReturnValue({ isFile: () => true })
      mockParseFigmaNode
        .mockReturnValueOnce({ fileKey: 'ABC123', nodeId: '1:1' })
        .mockReturnValueOnce({ fileKey: 'ABC123', nodeId: '2:2' })

      const result = await collectNodesToPreview(
        ['components.figma.batch.json'],
        mockDocs,
        mockDir,
        mockCmd,
      )

      expect(result).toHaveLength(2)
    })

    it('should handle no matching files', async () => {
      mockFs.existsSync.mockReturnValue(false)

      const result = await collectNodesToPreview(['NonExistent.figma.tsx'], [], mockDir, mockCmd)

      expect(result).toHaveLength(0)
      expect(mockLogger.error).toHaveBeenCalledWith(
        'No files found matching: NonExistent.figma.tsx',
      )
    })

    it('should handle invalid Code Connect file', async () => {
      const mockDoc: CodeConnectJSON = {
        figmaNode: '',
        _codeConnectFilePath: '/test/dir/Invalid.tsx',
      } as CodeConnectJSON

      mockFs.existsSync.mockReturnValue(true)
      mockFs.statSync.mockReturnValue({ isFile: () => true })
      mockParseFigmaNode.mockReturnValue(null)

      const result = await collectNodesToPreview(
        ['/test/dir/Invalid.tsx'],
        [mockDoc],
        mockDir,
        mockCmd,
      )

      expect(result).toHaveLength(0)
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to parse figmaNode from file: /test/dir/Invalid.tsx',
      )
    })

    it('should handle verbose mode with debug logging', async () => {
      const mockDoc: CodeConnectJSON = {
        figmaNode: 'https://figma.com/file/ABC123/test?node-id=1-2',
        _codeConnectFilePath: '/test/dir/Button.figma.tsx',
      } as CodeConnectJSON

      mockFs.existsSync.mockReturnValue(false)
      mockParseFigmaNode.mockReturnValue({ fileKey: 'ABC123', nodeId: '1:2' })

      const verboseCmd: BaseCommand = { verbose: true } as any
      await collectNodesToPreview(['Button.figma.tsx'], [mockDoc], mockDir, verboseCmd)

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Searching for files matching: Button.figma.tsx',
      )
    })
  })

  it.each([
    { response: null, error: new Error('network failure') },
    { response: { response: { status: 500 }, data: {} }, error: null },
  ])('preserves batch template identity on transport failures (%j)', (outcome) => {
    const node = {
      fileKey: 'ABC123',
      nodeId: '1:2',
      url: 'https://figma.com/file/ABC123?node-id=1-2',
      filePath: 'components.figma.batch.json',
      batchTemplateFilePath: '/test/dist/Button.js',
    }
    const results = chunkOutcomeToResults(
      { chunkNodeIds: ['1:2'], ...outcome } as any,
      [node],
      'ABC123',
    )
    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({
      batchTemplateFilePath: node.batchTemplateFilePath,
      success: false,
      errorDetails: { kind: 'transport' },
    })
  })

  describe('formatSnippet', () => {
    it('should format TypeScript snippet', async () => {
      const snippet = '<Button  variant="primary"   disabled   />'
      const result = await formatSnippet(snippet, 'typescript')

      expect(result).toContain('<Button')
      expect(result).not.toContain('  ') // No double spaces
    })

    it('should format JavaScript snippet', async () => {
      const snippet = 'const  foo  =  "bar";'
      const result = await formatSnippet(snippet, 'javascript')

      expect(result).toContain('foo')
      expect(result).not.toContain('  ') // No double spaces
    })

    it('should format React snippet', async () => {
      const snippet = '<div><Button /></div>'
      const result = await formatSnippet(snippet, 'react')

      expect(result).toContain('<Button')
    })

    it('should format Code snippet (raw template language)', async () => {
      const snippet = '<Button  variant="primary"   />'
      const result = await formatSnippet(snippet, 'Code')

      expect(result).toEqual('<Button variant="primary" />\n')
    })

    it('should return snippet as-is for non-formattable language', async () => {
      const snippet = '<Button />'
      const result = await formatSnippet(snippet, 'swift')

      expect(result).toBe(snippet)
    })

    it('should default to TypeScript when no language specified', async () => {
      const snippet = '<Button />'
      const result = await formatSnippet(snippet)

      expect(result).toContain('<Button')
    })

    it('should remove leading semicolon from JSX fragments', async () => {
      const snippet = '<><Button /></>'
      const result = await formatSnippet(snippet, 'typescript')

      expect(result).not.toMatch(/^;/)
    })

    it('should return original snippet if Prettier fails', async () => {
      const invalidSnippet = '<Button unclosed'
      const result = await formatSnippet(invalidSnippet, 'typescript')

      expect(result).toBe(invalidSnippet)
    })

    it('should log info when Prettier formatting fails', async () => {
      const invalidSnippet = '<Button unclosed'
      await formatSnippet(invalidSnippet, 'typescript')

      expect(logger.info).toHaveBeenCalledWith(
        "Autoformatting couldn't be applied: language not supported or code is malformed",
      )
    })
  })

  describe('isPrettierParseable', () => {
    it('returns false for malformed TypeScript', async () => {
      expect(await isPrettierParseable('<Button unclosed', 'typescript')).toBe(false)
    })

    it('returns true for valid TypeScript', async () => {
      expect(await isPrettierParseable('<Button />', 'typescript')).toBe(true)
    })

    it('returns true for valid React/JSX', async () => {
      expect(await isPrettierParseable('<div><span /></div>', 'react')).toBe(true)
    })

    it('returns true for languages without a Prettier parser', async () => {
      expect(await isPrettierParseable('Button("Hi") {', 'swift')).toBe(true)
      expect(await isPrettierParseable('Column { Text("Hi")', 'kotlin')).toBe(true)
    })
  })

  describe('displayResults', () => {
    let consoleSpy: any
    let originalChalkLevel: chalk.Level

    beforeEach(() => {
      consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {})
      originalChalkLevel = chalk.level
      chalk.level = 2
    })

    afterEach(() => {
      chalk.level = originalChalkLevel
    })

    it('should display successful result with snippet', () => {
      const results = [
        {
          url: 'https://figma.com/file/ABC123/test?node-id=1-2',
          nodeId: '1:2',
          filePath: 'Button.figma.tsx',
          success: true,
          snippet: '<Button variant="primary" />',
          language: 'typescript',
          component: 'Button',
        },
      ]

      displayResults(results)

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Button.figma.tsx'))
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Button'))
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('<Button variant="primary" />'),
      )
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('1 succeeded'))
    })

    it('should display error result', () => {
      const results = [
        {
          url: 'https://figma.com/file/ABC123/test?node-id=1-2',
          nodeId: '1:2',
          filePath: 'Button.figma.tsx',
          success: false,
          component: 'Button',
          error: 'Template execution failed',
        },
      ]

      displayResults(results)

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Button.figma.tsx'))
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Error:'))
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Template execution failed'))
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('1 failed'))
    })

    it('should display mixed results', () => {
      const results = [
        {
          url: 'https://figma.com/file/ABC123/test?node-id=1-2',
          nodeId: '1:2',
          filePath: 'Button.figma.tsx',
          success: true,
          snippet: '<Button />',
          component: 'Button',
        },
        {
          url: 'https://figma.com/file/ABC123/test?node-id=1-3',
          nodeId: '1:3',
          filePath: 'Icon.figma.tsx',
          success: false,
          component: 'Icon',
          error: 'No template found',
        },
      ]

      displayResults(results)

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('1 succeeded'))
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('1 failed'))
    })

    it('should indent snippet with 2 spaces', () => {
      const results = [
        {
          url: 'https://figma.com/file/ABC123/test?node-id=1-2',
          nodeId: '1:2',
          filePath: 'Button.figma.tsx',
          success: true,
          snippet: '<Button\n  variant="primary"\n  disabled\n/>',
          component: 'Button',
        },
      ]

      displayResults(results)

      const snippetCalls = consoleSpy.mock.calls.filter((call: any[]) =>
        call[0].includes('variant'),
      )
      expect(snippetCalls[0][0]).toMatch(/^  /) // First line starts with 2 spaces
    })

    it('should display result without component info', () => {
      const results = [
        {
          url: 'https://figma.com/file/ABC123/test?node-id=1-2',
          nodeId: '1:2',
          filePath: 'Button.figma.tsx',
          success: true,
          snippet: '<Button />',
        },
      ]

      displayResults(results)

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Button.figma.tsx'))
    })

    it('colorizes output when color is enabled', () => {
      const results = [
        {
          url: 'https://figma.com/file/ABC123/test?node-id=1-2',
          nodeId: '1:2',
          filePath: 'Button.figma.tsx',
          success: true,
          snippet: '<Button />',
        },
      ]

      displayResults(results)

      const output = consoleSpy.mock.calls.map((call: unknown[]) => String(call[0])).join('\n')
      // eslint-disable-next-line no-control-regex
      expect(output).toMatch(/\x1b\[[0-9;]+m/)
      // The bullet line (component header) is one of the colorized lines.
      const bulletLine = consoleSpy.mock.calls
        .map((call: unknown[]) => String(call[0]))
        .find((line: string) => line.includes('Button.figma.tsx'))
      // eslint-disable-next-line no-control-regex
      expect(bulletLine).toMatch(/\x1b\[/)
    })
  })

  describe('handlePreview', () => {
    let consoleSpy: jest.SpyInstance
    let exitSpy: jest.SpyInstance

    beforeEach(() => {
      consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {})
      exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => {}) as any)
      getAccessTokenOrExit.mockReturnValue('test-token')
      setupHandler.mockReturnValue(undefined)
      getProjectInfo.mockResolvedValue({ config: {} })
      getApiUrl.mockReturnValue('https://api.figma.com/v1')
      getHeaders.mockReturnValue({ Authorization: 'Bearer test-token' })
    })

    it('should use _codeConnectFilePath (not source) for no-args file matching', async () => {
      const mockDoc: CodeConnectJSON = {
        figmaNode: 'https://figma.com/file/ABC123/test?node-id=1-2',
        source: 'https://github.com/org/repo/blob/main/Button.figma.tsx',
        _codeConnectFilePath: '/test/dir/src/Button.figma.tsx',
        component: 'Button',
        template: '<Button />',
        templateData: {},
        language: 'typescript',
        label: 'typescript',
        metadata: { cliVersion: '1.0.0' },
      } as CodeConnectJSON
      getCodeConnectObjects.mockResolvedValue([mockDoc])
      parseFigmaNode.mockReturnValue({ fileKey: 'ABC123', nodeId: '1:2' })

      // Mock a successful API response
      request.post.mockResolvedValue({
        response: { status: 200 },
        data: {
          status: 200,
          error: false,
          meta: {
            results: [
              {
                nodeId: '1:2',
                nodeUrl: 'https://figma.com/file/ABC123?node-id=1-2',
                snippet: '<Button />',
                language: 'typescript',
                component: 'Button',
              },
            ],
          },
        },
      })

      const cmd = { dir: '/test/dir', output: 'json' } as any
      await handlePreview([], cmd)

      // The key assertion: figmaDocs.all should contain the template.
      // If the bug were present (using doc.source), requestedFilePaths would contain
      // a GitHub URL that can't match _codeConnectFilePath, making figmaDocs.all empty.
      const postCall = request.post.mock.calls[0]
      const body = postCall[1]
      expect(body.figmaDocs.all).toHaveLength(1)
      expect(body.figmaDocs.all[0].component).toBe('Button')
    })


    it('should send only the requested batch group when groups in one batch file share a node ID', async () => {
      const mockDocs: CodeConnectJSON[] = [
        {
          figmaNode: 'https://figma.com/file/ABC123/test?node-id=1-2',
          _codeConnectFilePath: '/test/dir/components.figma.batch.json',
          _batchTemplateFilePath: '/test/dir/dist/Notification.figma.batch.js',
          component: 'Notification',
          template: '<Notification />',
          templateData: {},
          language: 'typescript',
          label: 'typescript',
          metadata: { cliVersion: '1.0.0' },
        } as CodeConnectJSON,
        {
          figmaNode: 'https://figma.com/file/ABC123/test?node-id=1-2',
          _codeConnectFilePath: '/test/dir/components.figma.batch.json',
          _batchTemplateFilePath: '/test/dir/dist/Button.figma.batch.js',
          component: 'Button',
          template: '<Button />',
          templateData: {},
          language: 'typescript',
          label: 'typescript',
          metadata: { cliVersion: '1.0.0' },
        } as CodeConnectJSON,
      ]

      mockFs.existsSync.mockReturnValue(true)
      mockFs.statSync.mockReturnValue({ isFile: () => true })
      getCodeConnectObjects.mockResolvedValue(mockDocs)
      parseFigmaNode.mockReturnValue({ fileKey: 'ABC123', nodeId: '1:2' })

      request.post.mockResolvedValue({
        response: { status: 200 },
        data: {
          status: 200,
          error: false,
          meta: {
            results: [
              {
                nodeId: '1:2',
                nodeUrl: 'https://figma.com/file/ABC123?node-id=1-2',
                snippet: '<Notification />',
                language: 'typescript',
                component: 'Notification',
              },
            ],
          },
        },
      })

      const cmd = { dir: '/test/dir', output: 'json' } as any
      await handlePreview(['dist/Notification.figma.batch.js'], cmd)

      const body = request.post.mock.calls[0][1]
      expect(body.figmaDocs.all).toHaveLength(1)
      expect(body.figmaDocs.all[0].component).toBe('Notification')
    })

    it('should attribute results to correct files when multiple files share same node ID', async () => {
      // Two files targeting the same Figma node
      const mockDocs: CodeConnectJSON[] = [
        {
          figmaNode: 'https://figma.com/file/ABC123/test?node-id=1-2',
          _codeConnectFilePath: '/test/dir/Button.figma.tsx',
          source: 'src/Button.tsx',
          component: 'Button',
          template: '<Button />',
          templateData: {},
          language: 'typescript',
          label: 'typescript',
          metadata: { cliVersion: '1.0.0' },
        } as CodeConnectJSON,
        {
          figmaNode: 'https://figma.com/file/ABC123/test?node-id=1-2',
          _codeConnectFilePath: '/test/dir/Badge.figma.template.js',
          source: 'ios/Badge.swift',
          component: 'Badge',
          template: '<Badge />',
          templateData: {},
          language: 'typescript',
          label: 'typescript',
          metadata: { cliVersion: '1.0.0' },
        } as CodeConnectJSON,
      ]

      mockFs.existsSync.mockReturnValue(true)
      mockFs.statSync.mockReturnValue({ isFile: () => true })
      getCodeConnectObjects.mockResolvedValue(mockDocs)
      parseFigmaNode.mockReturnValue({ fileKey: 'ABC123', nodeId: '1:2' })

      // Server returns two results for the same nodeId, in template order
      request.post.mockResolvedValue({
        response: { status: 200 },
        data: {
          status: 200,
          error: false,
          meta: {
            results: [
              {
                nodeId: '1:2',
                nodeUrl: 'https://figma.com/file/ABC123?node-id=1-2',
                snippet: '<Button variant="primary" />',
                language: 'typescript',
                component: 'Button',
              },
              {
                nodeId: '1:2',
                nodeUrl: 'https://figma.com/file/ABC123?node-id=1-2',
                snippet: '<Badge />',
                language: 'typescript',
                component: 'Badge',
              },
            ],
          },
        },
      })

      const cmd = {
        dir: '/test/dir',
        output: 'json',
        verbose: false,
      } as any
      await handlePreview(['/test/dir/Button.figma.tsx', '/test/dir/Badge.figma.template.js'], cmd)

      // Capture the JSON output
      const jsonCall = consoleSpy.mock.calls.find((call: any[]) => {
        try {
          JSON.parse(call[0])
          return true
        } catch {
          return false
        }
      })
      expect(jsonCall).toBeDefined()
      const results = JSON.parse(jsonCall[0])

      // First result should be attributed to Button.figma.tsx, second to Badge
      expect(results).toHaveLength(2)
      expect(results[0].filePath).toBe('Button.figma.tsx')
      expect(results[0].source).toBe('src/Button.tsx')
      expect(results[1].filePath).toBe('Badge.figma.template.js')
      expect(results[1].source).toBe('ios/Badge.swift')
    })

    it.each([
      { unique: false, batch: false, sameNode: false },
      { unique: true, batch: false, sameNode: false },
      { unique: false, batch: true, sameNode: false },
      { unique: true, batch: false, sameNode: true },
      { unique: true, batch: true, sameNode: true },
      { unique: false, batch: false, sameNode: false, differentFile: true },
    ])(
      'selects shared axes across components before rendering (%j)',
      async ({ unique, batch, sameNode, differentFile }) => {
        const docs = ['Button', 'Card'].map((component, i) => ({
          figmaNode: `https://figma.com/file/${differentFile && i ? 'OTHER' : 'ABC123'}/test?node-id=${i && !sameNode ? '3-4' : '1-2'}`,
          _codeConnectFilePath: batch
            ? '/test/dir/components.figma.batch.json'
            : `/test/dir/${component}.figma.ts`,
          ...(batch ? { _batchTemplateFilePath: `/test/dir/${component}.figma.batch.js` } : {}),
          component,
          template: '<X />',
          templateData: {},
          language: 'typescript',
          label: 'typescript',
          metadata: { cliVersion: '1.0.0' },
        })) as CodeConnectJSON[]
        mockFs.existsSync.mockReturnValue(true)
        mockFs.statSync.mockReturnValue({ isFile: () => true })
        getCodeConnectObjects.mockResolvedValue(docs)
        parseFigmaNode.mockImplementation((_verbose: boolean, doc: CodeConnectJSON) => ({
          fileKey: doc.figmaNode.includes('OTHER') ? 'OTHER' : 'ABC123',
          nodeId: doc.figmaNode.includes('3-4') ? '3:4' : '1:2',
        }))
        request.get.mockResolvedValue({
          response: { status: 200 },
          data: {
            nodes: {
              '1:2': {
                document: {
                  componentPropertyDefinitions: {
                    Size: { type: 'VARIANT', defaultValue: 'M', variantOptions: ['S', 'M', 'L'] },
                    'Has Icon#1:2': { type: 'BOOLEAN', defaultValue: true },
                  },
                },
              },
              '3:4': {
                document: {
                  componentPropertyDefinitions: {
                    Layout: {
                      type: 'VARIANT',
                      defaultValue: 'Grid',
                      variantOptions: ['Grid', 'List'],
                    },
                    'Has Icon#1:3': { type: 'BOOLEAN', defaultValue: false },
                  },
                },
              },
            },
          },
        })
        request.post.mockImplementation(async (_url: string, body: any) => ({
          response: { status: 200 },
          data: {
            status: 200,
            error: false,
            meta: {
              results: Object.entries(body.renderCombinations).flatMap(
                ([nodeId, combinations]: [string, any]) =>
                  combinations.map((combination: any) => ({
                    nodeId,
                    nodeUrl: docs[nodeId === '1:2' ? 0 : 1].figmaNode,
                    snippet: '<X />',
                    language: 'typescript',
                    propertyCombinationLabel: combination.label,
                  })),
              ),
            },
          },
        }))
        await handlePreview(
          docs.map((doc) => (batch ? doc._batchTemplateFilePath! : doc._codeConnectFilePath!)),
          {
            dir: '/test/dir',
            output: 'json',
            all: unique ? true : sameNode ? ['Size'] : ['Size', 'Layout'],
            unique: unique ? (sameNode ? ['Size'] : ['Size', 'Layout']) : false,
          } as any,
        )
        expect(request.post).toHaveBeenCalledTimes(sameNode || differentFile ? 2 : 1)
        const bodies = request.post.mock.calls.map((call: any[]) => call[1])
        const combinations = bodies[0].renderCombinations
        expect(combinations['1:2']).toHaveLength(3)
        if (sameNode) {
          expect(bodies[1].renderCombinations['1:2']).toHaveLength(3)
          expect(
            bodies.map((body: any) => body.figmaDocs.all.map((doc: any) => doc.component)),
          ).toEqual([['Button'], ['Card']])
        } else
          expect((differentFile ? bodies[1] : bodies[0]).renderCombinations['3:4']).toHaveLength(2)
        for (const [nodeId, icon] of [
          ['1:2', true],
          [sameNode ? '1:2' : '3:4', sameNode],
        ] as const) {
          expect(
            (differentFile && nodeId === '3:4' ? bodies[1].renderCombinations : combinations)[
              nodeId
            ].every((c: any) =>
              c.properties.some((p: any) => p.name === 'Has Icon' && p.value === icon),
            ),
          ).toBe(true)
        }
        const results = JSON.parse(consoleSpy.mock.calls[0][0])
        expect(results.map((result: any) => result.filePath)).toEqual(
          batch
            ? Array(unique ? 2 : 5).fill('components.figma.batch.json')
            : unique
              ? ['Button.figma.ts', 'Card.figma.ts']
              : [...Array(3).fill('Button.figma.ts'), ...Array(2).fill('Card.figma.ts')],
        )
        if (batch) {
          expect([...new Set(results.map((result: any) => result.batchTemplateFilePath))]).toEqual(
            docs.map((doc) => doc._batchTemplateFilePath),
          )
        }
        expect(request.get).toHaveBeenCalledTimes(differentFile ? 2 : 1)
        if (unique)
          expect(results.map((result: any) => result.propertyCombinationCount)).toEqual([
            3,
            sameNode ? 3 : 2,
          ])
        expect(logger.warn).not.toHaveBeenCalled()
      },
    )

    it.each(['unknown', 'ambiguous', 'unsupported', 'unavailable'])(
      'rejects %s named selection before rendering any Figma file',
      async (failure) => {
        const docs = ['ABC123', 'OTHER'].map((fileKey, i) => ({
          figmaNode: `https://figma.com/file/${fileKey}?node-id=1-2`,
          _codeConnectFilePath: `/test/dir/Component${i}.figma.ts`,
          template: '<X />',
        })) as CodeConnectJSON[]
        getCodeConnectObjects.mockResolvedValue(docs)
        mockFs.existsSync.mockReturnValue(true)
        mockFs.statSync.mockReturnValue({ isFile: () => true })
        parseFigmaNode.mockImplementation((_verbose: boolean, doc: CodeConnectJSON) => ({
          fileKey: doc.figmaNode.includes('OTHER') ? 'OTHER' : 'ABC123',
          nodeId: '1:2',
        }))
        const definitions = (defs: any) => ({
          response: { status: 200 },
          data: { nodes: { '1:2': { document: { componentPropertyDefinitions: defs } } } },
        })
        request.get.mockResolvedValueOnce(
          definitions({ Enabled: { type: 'BOOLEAN', defaultValue: false } }),
        )
        if (failure === 'unavailable')
          request.get.mockRejectedValueOnce(new Error('network failure'))
        else
          request.get.mockResolvedValueOnce(
            definitions(
              failure === 'ambiguous'
                ? {
                    'Enabled#1:2': { type: 'BOOLEAN', defaultValue: false },
                    'Enabled#1:3': { type: 'BOOLEAN', defaultValue: true },
                  }
                : failure === 'unsupported'
                  ? { Enabled: { type: 'TEXT', defaultValue: 'text' } }
                  : {},
            ),
          )
        const { exitWithError } = jest.requireMock('../../common/logging')
        exitWithError.mockImplementationOnce((message: string) => {
          throw new Error(message)
        })

        await expect(
          handlePreview(
            docs.map((doc) => doc._codeConnectFilePath!),
            {
              dir: '/test/dir',
              output: 'json',
              all: failure === 'unknown' ? true : ['Enabled'],
              unique: failure === 'unknown' ? ['Enabled', 'Typo'] : undefined,
            } as any,
          ),
        ).rejects.toThrow(
          failure === 'unknown'
            ? 'matched nothing'
            : failure === 'ambiguous'
              ? 'matches multiple'
              : failure === 'unsupported'
                ? 'only BOOLEAN and VARIANT'
                : "couldn't fetch property definitions",
        )
        expect(request.post).not.toHaveBeenCalled()
        expect(consoleSpy).not.toHaveBeenCalled()
      },
    )

    it.each([false, true])(
      'batches unaffected templates and fetches schemas once (shared across templates: %s)',
      async (sharedAcrossTemplates) => {
        // Fifty independent nodes plus one duplicate mapping: only a duplicate in a
        // different source template needs a second render request.
        const docs = Array.from({ length: 50 }, (_, i) => ({
          figmaNode: `https://figma.com/file/ABC123?node-id=${i + 1}-1`,
          _codeConnectFilePath: `/test/dir/Component${i}.figma.ts`,
          template: '<X />',
        })) as CodeConnectJSON[]
        docs.push({
          ...docs[0],
          ...(sharedAcrossTemplates ? { _codeConnectFilePath: '/test/dir/Other.figma.ts' } : {}),
        })
        getCodeConnectObjects.mockResolvedValue(docs)
        mockFs.existsSync.mockReturnValue(true)
        mockFs.statSync.mockReturnValue({ isFile: () => true })
        parseFigmaNode.mockImplementation((_verbose: boolean, doc: CodeConnectJSON) => ({
          fileKey: 'ABC123',
          nodeId: doc.figmaNode.split('node-id=')[1].replace('-', ':'),
        }))
        request.get.mockResolvedValue({
          response: { status: 200 },
          data: {
            nodes: Object.fromEntries(
              docs.map((doc) => [
                doc.figmaNode.split('node-id=')[1].replace('-', ':'),
                {
                  document: {
                    componentPropertyDefinitions: {
                      Enabled: { type: 'BOOLEAN', defaultValue: false },
                    },
                  },
                },
              ]),
            ),
          },
        })
        request.post.mockImplementation(async (_url: string, body: any) => ({
          response: { status: 200 },
          data: {
            meta: {
              results: body.nodeIds.flatMap((nodeId: string) =>
                body.renderCombinations[nodeId].map((combination: any) => ({
                  nodeId,
                  snippet: '<X />',
                  propertyCombinationLabel: combination.label,
                })),
              ),
            },
          },
        }))

        await handlePreview([...new Set(docs.map((doc) => doc._codeConnectFilePath!))], {
          dir: '/test/dir',
          output: 'json',
          all: true,
        } as any)

        expect(request.get).toHaveBeenCalledTimes(1)
        expect(request.post).toHaveBeenCalledTimes(sharedAcrossTemplates ? 2 : 1)
        const bodies = request.post.mock.calls.map((call: any[]) => call[1])
        expect(bodies[0].nodeIds).toHaveLength(50)
        expect(bodies[0].figmaDocs.all).toHaveLength(sharedAcrossTemplates ? 50 : 51)
        if (sharedAcrossTemplates) {
          expect(bodies[1].nodeIds).toEqual(['1:1'])
          expect(
            bodies[1].figmaDocs.all.map((doc: CodeConnectJSON) => doc._codeConnectFilePath),
          ).toEqual(['/test/dir/Other.figma.ts'])
        }
      },
    )

    it('should report result as failure when snippet is missing', async () => {
      const mockDoc: CodeConnectJSON = {
        figmaNode: 'https://figma.com/file/ABC123/test?node-id=1-2',
        _codeConnectFilePath: '/test/dir/Button.figma.tsx',
        component: 'Button',
        template: '<Button />',
        templateData: {},
        language: 'typescript',
        label: 'typescript',
        metadata: { cliVersion: '1.0.0' },
      } as CodeConnectJSON

      mockFs.existsSync.mockReturnValue(true)
      mockFs.statSync.mockReturnValue({ isFile: () => true })
      getCodeConnectObjects.mockResolvedValue([mockDoc])
      parseFigmaNode.mockReturnValue({ fileKey: 'ABC123', nodeId: '1:2' })

      // Server returns result with no error but also no snippet
      request.post.mockResolvedValue({
        response: { status: 200 },
        data: {
          status: 200,
          error: false,
          meta: {
            results: [
              {
                nodeId: '1:2',
                nodeUrl: 'https://figma.com/file/ABC123?node-id=1-2',
                language: 'typescript',
                component: 'Button',
                // no snippet, no error — e.g. truncated or empty render
              },
            ],
          },
        },
      })

      const cmd = { dir: '/test/dir', output: 'json', verbose: false } as any
      await handlePreview(['/test/dir/Button.figma.tsx'], cmd)

      const jsonCall = consoleSpy.mock.calls.find((call: any[]) => {
        try {
          JSON.parse(call[0])
          return true
        } catch {
          return false
        }
      })
      expect(jsonCall).toBeDefined()
      const results = JSON.parse(jsonCall[0])

      expect(results).toHaveLength(1)
      expect(results[0].success).toBe(false)
    })

    it('should report result as failure when snippet has syntax errors', async () => {
      const mockDoc: CodeConnectJSON = {
        figmaNode: 'https://figma.com/file/ABC123/test?node-id=1-2',
        _codeConnectFilePath: '/test/dir/Button.figma.tsx',
        component: 'Button',
        template: '<Button />',
        templateData: {},
        language: 'typescript',
        label: 'typescript',
        metadata: { cliVersion: '1.0.0' },
      } as CodeConnectJSON

      mockFs.existsSync.mockReturnValue(true)
      mockFs.statSync.mockReturnValue({ isFile: () => true })
      getCodeConnectObjects.mockResolvedValue([mockDoc])
      parseFigmaNode.mockReturnValue({ fileKey: 'ABC123', nodeId: '1:2' })

      // Server returns malformed snippet with no error
      request.post.mockResolvedValue({
        response: { status: 200 },
        data: {
          status: 200,
          error: false,
          meta: {
            results: [
              {
                nodeId: '1:2',
                nodeUrl: 'https://figma.com/file/ABC123?node-id=1-2',
                snippet: '<Button onPress={() => {}',
                language: 'React',
                component: 'Button',
              },
            ],
          },
        },
      })

      const cmd = { dir: '/test/dir', output: 'json', verbose: false } as any
      await handlePreview(['/test/dir/Button.figma.tsx'], cmd)

      const jsonCall = consoleSpy.mock.calls.find((call: any[]) => {
        try {
          JSON.parse(call[0])
          return true
        } catch {
          return false
        }
      })
      expect(jsonCall).toBeDefined()
      const results = JSON.parse(jsonCall[0])

      expect(results).toHaveLength(1)
      expect(results[0].success).toBe(false)
      expect(results[0].error).toContain('syntax errors')
    })

    // `--unique` implies `--all`, so this guard must not name a flag the user
    // never typed — including in the example it suggests.
    it.each([
      [
        'names --unique when --unique is what was typed',
        { all: true, unique: true },
        '--unique requires a specific component, e.g. `figma connect preview Button.figma.ts --unique`',
      ],
      [
        'names --all when --all is what was typed',
        { all: true },
        '--all requires a specific component, e.g. `figma connect preview Button.figma.ts --all`',
      ],
    ])('with no component file argument, %s', async (_label, opts, expected) => {
      const { exitWithError } = jest.requireMock('../../common/logging')
      getCodeConnectObjects.mockResolvedValue([])

      const cmd = { dir: '/test/dir', output: 'json', ...opts } as any
      await handlePreview([], cmd)

      expect(exitWithError).toHaveBeenCalledWith(expected)
    })

    it('should print only the server message and exit on 503 (killswitch)', async () => {
      const mockDoc: CodeConnectJSON = {
        figmaNode: 'https://figma.com/file/ABC123/test?node-id=1-2',
        _codeConnectFilePath: '/test/dir/Button.figma.tsx',
        component: 'Button',
        template: '<Button />',
        templateData: {},
        language: 'typescript',
        label: 'typescript',
        metadata: { cliVersion: '1.0.0' },
      } as CodeConnectJSON

      mockFs.existsSync.mockReturnValue(true)
      mockFs.statSync.mockReturnValue({ isFile: () => true })
      getCodeConnectObjects.mockResolvedValue([mockDoc])
      parseFigmaNode.mockReturnValue({ fileKey: 'ABC123', nodeId: '1:2' })

      const killswitchMessage =
        "The preview command isn't available right now, please try again later."
      const fetchErr = {
        response: { status: 503, statusText: 'Service Unavailable' },
        data: { status: 503, error: true, message: killswitchMessage },
      }
      request.post.mockRejectedValue(fetchErr)
      ;(isFetchError as jest.Mock).mockReturnValue(true)
      const { exitWithError } = jest.requireMock('../../common/logging')

      const cmd = { dir: '/test/dir', output: 'json', verbose: false } as any
      await handlePreview(['/test/dir/Button.figma.tsx'], cmd)

      // exitWithError called once with just the server message — no "Failed to preview…" prefix.
      expect(exitWithError).toHaveBeenCalledWith(killswitchMessage)
      expect(mockLogger.error).not.toHaveBeenCalledWith(
        expect.stringContaining('Failed to preview components in file'),
      )
    })
  })

  describe('filterTemplatesForNodes', () => {
    it('should filter to only templates matching requested nodeIds', () => {
      const templates: CodeConnectJSON[] = [
        {
          figmaNode: 'https://figma.com/file/ABC?node-id=1-2',
          component: 'Button',
          template: '<Button />',
          templateData: {},
          language: 'typescript',
          label: 'Button',
          metadata: { cliVersion: '1.0.0' },
        } as CodeConnectJSON,
        {
          figmaNode: 'https://figma.com/file/ABC?node-id=3-4',
          component: 'Icon',
          template: '<Icon />',
          templateData: {},
          language: 'typescript',
          label: 'Icon',
          metadata: { cliVersion: '1.0.0' },
        } as CodeConnectJSON,
      ]

      const result = filterTemplatesForNodes(['1:2'], templates)

      expect(result).toHaveLength(1)
      expect(result[0].component).toBe('Button')
    })

    it('should return empty array when no matches', () => {
      const templates: CodeConnectJSON[] = [
        {
          figmaNode: 'https://figma.com/file/ABC?node-id=1-2',
          component: 'Button',
          template: '<Button />',
          templateData: {},
          language: 'typescript',
          label: 'Button',
          metadata: { cliVersion: '1.0.0' },
        } as CodeConnectJSON,
      ]

      const result = filterTemplatesForNodes(['9:9'], templates)

      expect(result).toHaveLength(0)
    })

    it('should handle multiple nodeIds', () => {
      const templates: CodeConnectJSON[] = [
        {
          figmaNode: 'https://figma.com/file/ABC?node-id=1-2',
          component: 'Button',
          template: '<Button />',
          templateData: {},
          language: 'typescript',
          label: 'Button',
          metadata: { cliVersion: '1.0.0' },
        } as CodeConnectJSON,
        {
          figmaNode: 'https://figma.com/file/ABC?node-id=3-4',
          component: 'Icon',
          template: '<Icon />',
          templateData: {},
          language: 'typescript',
          label: 'Icon',
          metadata: { cliVersion: '1.0.0' },
        } as CodeConnectJSON,
        {
          figmaNode: 'https://figma.com/file/ABC?node-id=5-6',
          component: 'Dialog',
          template: '<Dialog />',
          templateData: {},
          language: 'typescript',
          label: 'Dialog',
          metadata: { cliVersion: '1.0.0' },
        } as CodeConnectJSON,
      ]

      const result = filterTemplatesForNodes(['1:2', '5:6'], templates)

      expect(result).toHaveLength(2)
      const components = result.map((t) => t.component).sort()
      expect(components).toEqual(['Button', 'Dialog'])
    })

    it('should ignore templates without figmaNode', () => {
      const templates: CodeConnectJSON[] = [
        {
          component: 'Button',
          template: '<Button />',
          templateData: {},
          language: 'typescript',
          label: 'Button',
          metadata: { cliVersion: '1.0.0' },
        } as any,
        {
          figmaNode: 'https://figma.com/file/ABC?node-id=1-2',
          component: 'Icon',
          template: '<Icon />',
          templateData: {},
          language: 'typescript',
          label: 'Icon',
          metadata: { cliVersion: '1.0.0' },
        } as CodeConnectJSON,
      ]

      const result = filterTemplatesForNodes(['1:2'], templates)

      expect(result).toHaveLength(1)
      expect(result[0].component).toBe('Icon')
    })
  })

  describe('fetchComponentPropertyDefinitions', () => {
    beforeEach(() => {
      request.get.mockReset()
      isFetchError.mockReturnValue(false)
      getHeaders.mockReturnValue({})
    })

    const nodesData = (
      nodeId: string,
      defs: Record<string, unknown> | undefined,
      opts: { componentSetId?: string } = {},
    ) => ({
      response: { status: 200 },
      data: {
        nodes: {
          [nodeId]: {
            document: defs !== undefined ? { componentPropertyDefinitions: defs } : {},
            ...(opts.componentSetId
              ? { components: { [nodeId]: { componentSetId: opts.componentSetId } } }
              : {}),
          },
        },
      },
    })

    it('returns the definitions from files/nodes (the authoritative schema)', async () => {
      const defs = { Variant: { type: 'VARIANT', variantOptions: ['A', 'B'] } }
      request.get.mockResolvedValueOnce(nodesData('1:2', defs))

      const result = await fetchComponentPropertyDefinitions('https://api', 'file1', '1:2', 'tok')

      expect(result).toEqual({ status: 'ok', defs })
      // Not a variant child → no parent-set resolution, single request.
      expect(request.get).toHaveBeenCalledTimes(1)
    })

    it('returns status "error" when files/nodes is unavailable (e.g. missing scope)', async () => {
      request.get.mockResolvedValue({ response: { status: 403 }, data: {} })

      const result = await fetchComponentPropertyDefinitions('https://api', 'file1', '1:2', 'tok')

      expect(result).toEqual({ status: 'error' })
      expect(request.get).toHaveBeenCalledTimes(1)
    })

    it('returns status "error" when the request throws', async () => {
      request.get.mockRejectedValue(new Error('network down'))

      const result = await fetchComponentPropertyDefinitions('https://api', 'file1', '1:2', 'tok')

      expect(result).toEqual({ status: 'error' })
    })

    it('returns status "empty" when the node is fetched but has no property definitions', async () => {
      request.get.mockResolvedValueOnce(nodesData('1:2', undefined))

      const result = await fetchComponentPropertyDefinitions('https://api', 'file1', '1:2', 'tok')

      // A component with no variants/props is not an error — it's "empty".
      expect(result).toEqual({ status: 'empty' })
    })

    it('treats an empty componentPropertyDefinitions object as "empty", not "ok"', async () => {
      request.get.mockResolvedValueOnce(nodesData('1:2', {}))

      const result = await fetchComponentPropertyDefinitions('https://api', 'file1', '1:2', 'tok')

      expect(result).toEqual({ status: 'empty' })
    })

    it('resolves a variant child to its parent set (which carries the variant axes)', async () => {
      const childDefs = { 'Has Icon': { type: 'BOOLEAN', defaultValue: false } }
      const setDefs = {
        Size: { type: 'VARIANT', variantOptions: ['Small', 'Large'], defaultValue: 'Small' },
        'Has Icon': { type: 'BOOLEAN', defaultValue: false },
      }
      request.get.mockImplementation((url: string) =>
        Promise.resolve(
          url.includes('ids=1:2')
            ? nodesData('1:2', childDefs, { componentSetId: '1:1' })
            : nodesData('1:1', setDefs),
        ),
      )

      const result = await fetchComponentPropertyDefinitions('https://api', 'file1', '1:2', 'tok')

      expect(result).toEqual({ status: 'ok', defs: setDefs })
      expect(request.get).toHaveBeenCalledTimes(2)
    })

    it('resolves to the set even when the variant child exposes no defs of its own', async () => {
      const setDefs = {
        Size: { type: 'VARIANT', variantOptions: ['Small', 'Large'], defaultValue: 'Small' },
      }
      request.get.mockImplementation((url: string) =>
        Promise.resolve(
          url.includes('ids=1:2')
            ? nodesData('1:2', undefined, { componentSetId: '1:1' })
            : nodesData('1:1', setDefs),
        ),
      )

      const result = await fetchComponentPropertyDefinitions('https://api', 'file1', '1:2', 'tok')

      expect(result).toEqual({ status: 'ok', defs: setDefs })
    })

    it('falls back to the variant child’s own defs when the parent set fetch fails', async () => {
      const childDefs = { 'Has Icon': { type: 'BOOLEAN', defaultValue: false } }
      request.get.mockImplementation((url: string) =>
        Promise.resolve(
          url.includes('ids=1:2')
            ? nodesData('1:2', childDefs, { componentSetId: '1:1' })
            : { response: { status: 500 }, data: {} },
        ),
      )

      const result = await fetchComponentPropertyDefinitions('https://api', 'file1', '1:2', 'tok')

      expect(result).toEqual({ status: 'ok', defs: childDefs })
    })

    it('fetches many component schemas and their parent sets in two batched requests', async () => {
      const childDefs = { 'Has Icon': { type: 'BOOLEAN', defaultValue: false } }
      const directDefs = { Label: { type: 'TEXT', defaultValue: 'Hello' } }
      const setDefs = {
        Size: { type: 'VARIANT', variantOptions: ['Small', 'Large'], defaultValue: 'Small' },
      }
      request.get
        .mockResolvedValueOnce({
          response: { status: 200 },
          data: {
            nodes: {
              '1:2': nodesData('1:2', childDefs, { componentSetId: '1:1' }).data.nodes['1:2'],
              '2:3': nodesData('2:3', directDefs).data.nodes['2:3'],
            },
          },
        })
        .mockResolvedValueOnce(nodesData('1:1', setDefs))

      const result = await fetchComponentPropertyDefinitionsBatch(
        'https://api',
        'file1',
        ['1:2', '2:3'],
        'tok',
      )

      expect(result).toEqual({
        '1:2': { status: 'ok', defs: setDefs },
        '2:3': { status: 'ok', defs: directDefs },
      })
      expect(request.get).toHaveBeenCalledTimes(2)
      expect(request.get.mock.calls.map(([url]: [string]) => url)).toEqual([
        'https://api/files/file1/nodes?ids=1:2,2:3',
        'https://api/files/file1/nodes?ids=1:1',
      ])
    })
  })

  describe('parsePropsArg', () => {
    it('parses space-separated variadic pairs', () => {
      expect(parsePropsArg(['Variant=Primary', 'Size=Large'])).toEqual([
        { name: 'Variant', value: 'Primary' },
        { name: 'Size', value: 'Large' },
      ])
    })

    it('keeps spaces inside a quoted pair (single argument)', () => {
      expect(parsePropsArg(['Has Icon Start=true'])).toEqual([
        { name: 'Has Icon Start', value: 'true' },
      ])
    })

    it('splits only on the first = so values may contain =', () => {
      expect(parsePropsArg(['Label=a=b'])).toEqual([{ name: 'Label', value: 'a=b' }])
    })

    it('still tolerates a comma-separated list within one argument', () => {
      expect(parsePropsArg(['Variant=Primary,Size=Large'])).toEqual([
        { name: 'Variant', value: 'Primary' },
        { name: 'Size', value: 'Large' },
      ])
    })

    it('trims whitespace and ignores empty entries', () => {
      expect(parsePropsArg([' Variant = Primary ', '', 'Size=Large'])).toEqual([
        { name: 'Variant', value: 'Primary' },
        { name: 'Size', value: 'Large' },
      ])
    })

    it('parses an optional TYPE: prefix to disambiguate same-named props', () => {
      expect(parsePropsArg(['BOOLEAN:textMsg=false', 'TEXT:textMsg=Hello'])).toEqual([
        { name: 'textMsg', value: 'false', type: 'BOOLEAN' },
        { name: 'textMsg', value: 'Hello', type: 'TEXT' },
      ])
    })

    it('matches the TYPE: prefix case-insensitively and canonicalizes it', () => {
      expect(parsePropsArg(['boolean:textMsg=false'])).toEqual([
        { name: 'textMsg', value: 'false', type: 'BOOLEAN' },
      ])
    })

    it('leaves an unrecognized prefix as part of the property name', () => {
      expect(parsePropsArg(['State:Active=true'])).toEqual([
        { name: 'State:Active', value: 'true' },
      ])
    })

    it('omits type when no prefix is given', () => {
      expect(parsePropsArg(['textMsg=Hello'])).toEqual([{ name: 'textMsg', value: 'Hello' }])
    })

    it('parses the TYPE: prefix within a comma-separated argument', () => {
      expect(parsePropsArg(['BOOLEAN:textMsg=false,TEXT:textMsg=Hello'])).toEqual([
        { name: 'textMsg', value: 'false', type: 'BOOLEAN' },
        { name: 'textMsg', value: 'Hello', type: 'TEXT' },
      ])
    })
  })

  describe('validatePreviewOptions', () => {
    const { exitWithError } = jest.requireMock('../../common/logging')
    const cmd = (over: Record<string, unknown>) => over as unknown as BaseCommand

    beforeEach(() => {
      exitWithError.mockClear()
    })

    // `--unique` on its own can't reach here without `all` also being set —
    // commander's .implies() guarantees it (see shared_options.test.ts).
    it.each(['--all', '--unique'])('rejects %s property selection with inspect', (flag) => {
      validatePreviewOptions(
        cmd({
          all: flag === '--all' ? ['Size'] : true,
          unique: flag === '--unique' ? ['Size'] : undefined,
          inspect: true,
        }),
      )
      expect(exitWithError).toHaveBeenCalledWith(
        `Property selection with ${flag} cannot be combined with --inspect`,
      )
    })

    it('accepts selected properties with unique', () => {
      validatePreviewOptions(cmd({ all: ['Size'], unique: true }))
      expect(exitWithError).not.toHaveBeenCalled()
    })

    it('accepts --unique together with --all', () => {
      validatePreviewOptions(cmd({ unique: true, all: true }))
      expect(exitWithError).not.toHaveBeenCalled()
    })

    it('leaves --all on its own alone', () => {
      validatePreviewOptions(cmd({ all: true }))
      expect(exitWithError).not.toHaveBeenCalled()
    })

    it('accepts --max-combinations with --unique, since --unique implies --all', () => {
      validatePreviewOptions(cmd({ unique: true, all: true, maxCombinations: '10' }))
      expect(exitWithError).not.toHaveBeenCalled()
    })

    it('offers both expansion flags when --max-combinations is used on its own', () => {
      validatePreviewOptions(cmd({ maxCombinations: '10' }))
      expect(exitWithError).toHaveBeenCalledWith(
        '--max-combinations can only be used with --all or --unique',
      )
    })

    it('names --unique, not the implied --all, when it conflicts with --props', () => {
      validatePreviewOptions(cmd({ unique: true, all: true, props: ['Variant=Primary'] }))
      expect(exitWithError).toHaveBeenCalledWith(
        'Cannot combine --props and --unique (which implies --all); use one or the other',
      )
    })

    it('names --all when --all itself conflicts with --props', () => {
      validatePreviewOptions(cmd({ all: true, props: ['Variant=Primary'] }))
      expect(exitWithError).toHaveBeenCalledWith(
        'Cannot combine --props and --all; use one or the other',
      )
    })
  })
})

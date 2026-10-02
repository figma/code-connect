import {
  formatFileError,
  formatNetworkError,
  formatValidationError,
  extractErrorMessage,
} from '../error_formatting'

describe('Error Formatting', () => {
  describe('formatFileError', () => {
    it('should format a file read error', () => {
      const result = formatFileError({
        operation: 'read',
        filePath: '/path/to/file.txt',
        error: new Error('ENOENT: no such file or directory'),
      })

      expect(result).toContain('❌ Failed to read file: /path/to/file.txt')
      expect(result).toContain('Error: ENOENT: no such file or directory')
      expect(result).toContain('💡 Ensure the file exists and is readable.')
    })

    it('should format a file parse error with custom suggestion', () => {
      const result = formatFileError({
        operation: 'parse',
        filePath: 'figma.config.json',
        error: new Error('Unexpected token'),
        suggestion: 'Check JSON syntax',
      })

      expect(result).toContain('❌ Failed to parse file: figma.config.json')
      expect(result).toContain('💡 Check JSON syntax')
    })
  })

  describe('formatNetworkError', () => {
    it('should format a 401 error', () => {
      const result = formatNetworkError({
        operation: 'fetch node data',
        url: 'https://api.figma.com/v1/files/abc123',
        statusCode: 401,
        error: new Error('Unauthorized'),
      })

      expect(result).toContain('❌ Network error: fetch node data failed (HTTP 401)')
      expect(result).toContain('URL: https://api.figma.com/v1/files/abc123')
      expect(result).toContain('💡 Check your Figma access token is valid.')
    })

    it('should format a 404 error', () => {
      const result = formatNetworkError({
        operation: 'upload to Figma',
        statusCode: 404,
        error: new Error('Not found'),
      })

      expect(result).toContain('❌ Network error: upload to Figma failed (HTTP 404)')
      expect(result).toContain('💡 Resource not found. Verify the URL or node ID is correct.')
    })

    it('should format a 5xx error', () => {
      const result = formatNetworkError({
        operation: 'fetch node info',
        statusCode: 503,
        error: new Error('Service unavailable'),
      })

      expect(result).toContain('❌ Network error: fetch node info failed (HTTP 503)')
      expect(result).toContain('💡 Figma server error. Try again later.')
    })

    it('should use custom suggestion when provided', () => {
      const result = formatNetworkError({
        operation: 'upload to Figma',
        statusCode: 413,
        error: new Error('Payload too large'),
        suggestion: 'Payload too large. Use --batch-size to split the upload.',
      })

      expect(result).toContain('💡 Payload too large. Use --batch-size to split the upload.')
    })
  })

  describe('formatValidationError', () => {
    it('should format validation error with available options', () => {
      const result = formatValidationError({
        item: 'Button (https://figma.com/file/abc/123) [Button.tsx]',
        errors: ['Layer "icon" not found', 'Available: label, background, border, ...'],
        suggestion: 'Update layer name to match one in Figma.',
      })

      expect(result).toContain('⚠️  Validation failed for Button')
      expect(result).toContain('- Layer "icon" not found')
      expect(result).toContain('- Available: label, background, border, ...')
      expect(result).toContain('💡 Update layer name to match one in Figma.')
    })

    it('should format validation error with multiple errors', () => {
      const result = formatValidationError({
        item: 'Component (node-123)',
        errors: ['Property "variant" not found', 'Property "size" not found'],
      })

      expect(result).toContain('⚠️  Validation failed for Component (node-123)')
      expect(result).toContain('- Property "variant" not found')
      expect(result).toContain('- Property "size" not found')
    })
  })

  describe('extractErrorMessage', () => {
    it('should extract message from Error object', () => {
      const error = new Error('Something went wrong')
      const result = extractErrorMessage(error)

      expect(result).toBe('Something went wrong')
    })

    it('should handle string errors', () => {
      const result = extractErrorMessage('Plain string error')

      expect(result).toBe('Plain string error')
    })

    it('should handle Zod validation errors and suggest --verbose when not in verbose mode', () => {
      class ZodError extends Error {
        issues: any[]
        constructor() {
          super('Validation failed')
          this.issues = [
            {
              path: ['docs', 0, 'figmaNode'],
              message: 'Required',
            },
          ]
        }
      }

      const zodError = new ZodError()
      const result = extractErrorMessage(zodError, false)

      expect(result).toContain('Validation error')
      expect(result).toContain('Required at "docs[0].figmaNode"')
      expect(result).toContain('Try re-running the command with --verbose')
    })

    it('should handle Zod validation errors without suggesting --verbose when already in verbose mode', () => {
      class ZodError extends Error {
        issues: any[]
        constructor() {
          super('Validation failed')
          this.issues = [
            {
              path: ['docs', 0, 'figmaNode'],
              message: 'Required',
            },
          ]
        }
      }

      const zodError = new ZodError()
      const result = extractErrorMessage(zodError, true)

      expect(result).toContain('Validation error')
      expect(result).toContain('Required at "docs[0].figmaNode"')
      expect(result).not.toContain('Try re-running the command with --verbose')
    })

    it('should extract error message with cause when present', () => {
      const cause = new Error('self signed certificate')
      ;(cause as any).code = 'SELF_SIGNED_CERT_IN_CHAIN'
      const error = new Error('fetch failed')
      ;(error as any).cause = cause
      const result = extractErrorMessage(error)

      expect(result).toBe('fetch failed: self signed certificate (SELF_SIGNED_CERT_IN_CHAIN)')
    })
  })
})

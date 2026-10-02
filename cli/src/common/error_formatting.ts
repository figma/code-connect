/**
 * Formats a file operation error
 */
export function formatFileError(opts: {
  operation: 'read' | 'write' | 'parse' | 'access'
  filePath: string
  error: Error
  suggestion?: string
}): string {
  const { operation, filePath, error: err, suggestion } = opts

  let output = `❌ Failed to ${operation} file: ${filePath}\nError: ${err.message}`

  const defaultSuggestions: Record<string, string> = {
    read: 'Ensure the file exists and is readable.',
    access: 'Ensure the file exists and is readable.',
    write: 'Ensure the directory exists and is writable.',
    parse: 'Check the file syntax.',
  }

  const suggestionText = suggestion || defaultSuggestions[operation]
  if (suggestionText) {
    output += `\n💡 ${suggestionText}`
  }

  return output
}

/**
 * Formats a network/API error
 */
export function formatNetworkError(opts: {
  operation: string
  url?: string
  statusCode?: number
  error: Error
  suggestion?: string
}): string {
  const { operation, url, statusCode, error: err, suggestion } = opts

  let output = `❌ Network error: ${operation} failed`

  if (statusCode) {
    output += ` (HTTP ${statusCode})`
  }
  if (url) {
    output += `\nURL: ${url}`
  }
  output += `\nError: ${err.message}`

  const defaultSuggestions: Record<string, string> = {
    '401': 'Check your Figma access token is valid.',
    '403': 'Check your Figma access token has the necessary permissions.',
    '404': 'Resource not found. Verify the URL or node ID is correct.',
    '5xx': 'Figma server error. Try again later.',
    default: 'Check your internet connection.',
  }

  let suggestionText = suggestion
  if (!suggestionText && statusCode) {
    if (statusCode === 401 || statusCode === 403) {
      suggestionText = defaultSuggestions['401']
    } else if (statusCode === 404) {
      suggestionText = defaultSuggestions['404']
    } else if (statusCode >= 500) {
      suggestionText = defaultSuggestions['5xx']
    } else {
      suggestionText = defaultSuggestions.default
    }
  } else if (!suggestionText) {
    suggestionText = defaultSuggestions.default
  }

  output += `\n💡 ${suggestionText}`

  return output
}

/**
 * Formats a validation error
 */
export function formatValidationError(opts: {
  item: string
  errors: string[]
  suggestion?: string
}): string {
  const { item, errors, suggestion } = opts

  let output = `⚠️  Validation failed for ${item}:`
  errors.forEach((err) => {
    output += `\n  - ${err}`
  })

  if (suggestion) {
    output += `\n💡 ${suggestion}`
  }

  return output
}

/**
 * Extracts the most relevant error message from a stack of errors
 * @param error - The error to extract a message from
 * @param isVerbose - Whether verbose mode is already enabled (to avoid suggesting --verbose when it's already on)
 */
export function extractErrorMessage(error: unknown, isVerbose = false): string {
  if (error instanceof Error) {
    // Check if it's a Zod error by checking for issues property
    if ('issues' in error && Array.isArray((error as any).issues)) {
      const issues = (error as any).issues
      const errorMessages = issues.map((issue: any) => {
        // Format path with bracket notation for array indices
        const path = issue.path
          .map((segment: string | number, index: number) => {
            if (typeof segment === 'number') {
              return `[${segment}]`
            }
            return index === 0 ? segment : `.${segment}`
          })
          .join('')
        return `${issue.message} at "${path}"`
      })
      const baseMessage = `Validation error: ${errorMessages.join('; ')}.`
      // Only suggest --verbose if it's not already enabled
      return isVerbose
        ? baseMessage
        : `${baseMessage} Try re-running the command with --verbose for more information.`
    }
    if ((error as any).cause) {
      const cause = (error as any).cause
      const causeMsg = cause instanceof Error ? cause.message : String(cause)
      const code = (cause as any)?.code || (error as any)?.code
      const codeSuffix = code && !causeMsg.includes(code) ? ` (${code})` : ''
      if (causeMsg && causeMsg !== error.message) {
        return `${error.message}: ${causeMsg}${codeSuffix}`
      }
    }
    return error.message
  }
  if (typeof error === 'string') {
    return error
  }
  return String(error)
}

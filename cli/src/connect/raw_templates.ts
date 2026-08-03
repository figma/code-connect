import fs from 'fs'
import path from 'path'
import ts from 'typescript'
import { CodeConnectJSON } from './figma_connect'
import { CodeConnectConfig } from './project'
import { CodeConnectLabel, getInferredLanguageForRaw } from './label_language_mapping'
import { applyDocumentUrlSubstitutions } from './helpers'
import {
  bundleTemplateWithHelpers,
  allowedHelperExtensions,
  isRelativeImportPath,
  unsupportedImportError,
  relativeRequireError,
  getRequireCallRequest,
} from './raw_template_bundler'

/**
 * Thrown when a raw template file has no `// url=` directive but contains the
 * string `codeProperties`. These files (e.g. Make's code component property
 * definitions) are not Code Connect, so callers skip them with a log instead of
 * failing. Every other file is handled exactly as before — a missing url is
 * still a hard error.
 */
export class CodePropertiesError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CodePropertiesError'
  }
}

/**
 * Returns true if the file content looks like a raw template file, i.e. its
 * leading comment block contains a `// url=`, `// component=`, or `// source=`
 * directive. Used to distinguish raw `.figma.ts` templates from React/HTML
 * Code Connect files that share the same extension.
 */
export function isRawTemplate(content: string): boolean {
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (trimmed === '' || trimmed.startsWith('//')) {
      if (/^\/\/\s*(url|component|source)=/.test(trimmed)) {
        return true
      }
      continue
    }
    // First non-comment, non-blank line reached without finding a known directive — not a raw template
    break
  }
  return false
}

// Convert the supported ESM Figma import to the runtime's require syntax when
// the template does not otherwise need bundling.
const figmaImportRegex =
  /^import[ \t]+figma[ \t]+from[ \t]+['"]figma['"][ \t]*;?[ \t]*(?:\/\/[^\r\n]*)?$/m

// Matches the backend's max template size; we fail here rather than let the
// server reject the publish request.
const MAX_TEMPLATE_SIZE_MB = 1

function assertTemplateWithinSizeLimit(filePath: string, template: string): void {
  const sizeMb = Buffer.byteLength(template, 'utf-8') / (1024 * 1024)
  if (sizeMb > MAX_TEMPLATE_SIZE_MB) {
    throw new Error(
      `Template "${filePath}" is ${sizeMb.toFixed(2)}mb, which exceeds the ` +
        `${MAX_TEMPLATE_SIZE_MB}mb maximum template size. ` +
        `Reduce the template size, for example by removing unneeded helper imports.`,
    )
  }
}

interface TemplateImportValidationResult {
  hasRelativeHelperImports: boolean
}

// Parserless entry templates may be authored in TypeScript or JavaScript.
function isRawTemplateSourceFile(filePath: string): boolean {
  return allowedHelperExtensions.some((ext) => filePath.endsWith(ext))
}

/**
 * Validates a template entry's imports: only the default `figma` import,
 * type-only imports and relative helper imports are allowed. Returns whether
 * the entry imports helpers, so the caller knows whether to bundle it.
 */
function validateTemplateImports(
  filePath: string,
  fileContent: string,
): TemplateImportValidationResult {
  const sourceFile = ts.createSourceFile(filePath, fileContent, ts.ScriptTarget.Latest, true)
  let hasRelativeHelperImports = false

  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement)) {
      if (statement.importClause?.isTypeOnly) {
        continue
      }

      const moduleSpecifierText = ts.isStringLiteral(statement.moduleSpecifier)
        ? statement.moduleSpecifier.text
        : ''
      const importLine = statement.getText(sourceFile).split('\n')[0]?.trim() ?? 'import ...'

      if (moduleSpecifierText === 'figma') {
        const hasDefaultImport = !!statement.importClause?.name
        const hasNamedOrNamespaceImport = !!statement.importClause?.namedBindings
        if (!hasDefaultImport || hasNamedOrNamespaceImport) {
          throw unsupportedImportError(filePath, importLine)
        }
        continue
      }

      if (isRelativeImportPath(moduleSpecifierText)) {
        hasRelativeHelperImports = true
        continue
      }

      throw unsupportedImportError(filePath, importLine)
    }

    // Re-exports aren't supported: the runtime only reads the default export.
    if (ts.isExportDeclaration(statement) && statement.moduleSpecifier && !statement.isTypeOnly) {
      const exportLine = statement.getText(sourceFile).split('\n')[0]?.trim() ?? 'export ...'
      throw new Error(
        `Template files do not support re-exports ('export ... from ...').\n` +
          `Found in ${filePath}:\n` +
          `  ${exportLine}\n\n` +
          `Import the helper instead (for example: import { helper } from './helpers').`,
      )
    }
  }

  // `require` is for the Figma API only: a pure ESM graph is what lets the
  // bundler emit a flat, tree-shaken template. Walking the AST (not the raw
  // text) keeps a `require(...)` inside an emitted snippet from matching.
  const visitRequire = (node: ts.Node): void => {
    const request = getRequireCallRequest(node)
    if (request && request !== 'figma') {
      throw isRelativeImportPath(request)
        ? relativeRequireError(filePath, request)
        : unsupportedImportError(filePath, `require('${request}')`)
    }
    ts.forEachChild(node, visitRequire)
  }
  visitRequire(sourceFile)

  return { hasRelativeHelperImports }
}

function rewriteFigmaImport(fileContent: string): string {
  return fileContent.replace(figmaImportRegex, "const figma = require('figma')")
}

function transpileTypeScriptTemplate(fileContent: string): string {
  const result = ts.transpileModule(fileContent, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2021,
      removeComments: false,
    },
  })

  return result.outputText
}

/**
 * Extracts metadata fields (url, component, source) from the leading comments
 * of a raw template file. This must be done before transpilation because
 * TypeScript can remove comments that appear before type-only imports.
 */
function extractMetadataFields(fileContent: string): {
  fields: { url?: string; component?: string; source?: string }
  templateStartLine: number
} {
  const lines = fileContent.split('\n')
  const fields: { url?: string; component?: string; source?: string } = {}
  let templateStartLine = 0

  // Parse consecutive comment lines at the start of the file
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    // Match pattern: // fieldName=value
    const match = line.match(/^\/\/\s*(\w+)=(.+)$/)
    if (match) {
      const [, fieldName, fieldValue] = match
      const normalizedFieldName = fieldName.toLowerCase()
      if (
        normalizedFieldName === 'url' ||
        normalizedFieldName === 'component' ||
        normalizedFieldName === 'source'
      ) {
        fields[normalizedFieldName] = fieldValue.trim()
      }
      templateStartLine = i + 1
    } else if (line === '' || line.startsWith('//')) {
      // Allow blank lines or other comments, but don't increment template start
      continue
    } else {
      // First non-comment line found
      break
    }
  }

  return { fields, templateStartLine }
}

export interface BatchOverrides {
  url: string
  source?: string
  component?: string
  batchData: Record<string, any>
  batchFilePath: string
}

export async function parseRawFile(
  filePath: string,
  label: string | undefined,
  config?: CodeConnectConfig,
  dir?: string,
  batchOverrides?: BatchOverrides,
): Promise<CodeConnectJSON> {
  let fileContent = fs.readFileSync(filePath, 'utf-8')
  let shouldBundleTemplate = false

  // Extract metadata fields BEFORE transpilation to avoid losing comments
  // that appear before type-only imports (which TypeScript erases)
  const { fields, templateStartLine } = extractMetadataFields(fileContent)

  const figmaUrl = batchOverrides?.url || fields.url

  // Validate imports first, before the `codeProperties` skip guard below, so an
  // unsupported import is always a hard error rather than silently swallowed.
  if (isRawTemplateSourceFile(filePath)) {
    shouldBundleTemplate = validateTemplateImports(filePath, fileContent).hasRelativeHelperImports
  }

  // A file with no // url= directive that contains the string `codeProperties`
  // is not Code Connect (e.g. Make's code component property definitions). Skip
  // it (callers log and continue) instead of failing. Every other file is
  // handled exactly as before.
  if (!figmaUrl && fileContent.includes('codeProperties')) {
    throw new CodePropertiesError(
      `Skipping ${filePath}: file has no // url= directive and contains "codeProperties", so it is not treated as a Code Connect file.`,
    )
  }

  // Bundle templates with helper imports. Helper-free templates stay on the
  // faster path and rewrite the Figma import directly to require syntax.
  if (shouldBundleTemplate) {
    // Confining resolution to the project dir
    const projectRoot = dir ? path.resolve(dir) : path.dirname(path.resolve(filePath))
    fileContent = await bundleTemplateWithHelpers(filePath, projectRoot)
  } else {
    fileContent = rewriteFigmaImport(fileContent)
    if (filePath.endsWith('.ts')) {
      fileContent = transpileTypeScriptTemplate(fileContent)
    }
  }

  // For batch templates, metadata comes from the batch entry instead of comments
  const component = batchOverrides?.component || fields.component
  const source = batchOverrides?.source || fields.source || ''

  if (!figmaUrl) {
    throw new Error(
      batchOverrides
        ? `Missing required "url" field in ${batchOverrides.batchFilePath}. Please add "url" to each entry in your .figma.batch.json file.`
        : `Missing required url field in ${filePath}. Please add a // url=... comment to the top of the file.`,
    )
  }
  let figmaNodeUrl = figmaUrl

  // Extract template from the transpiled content, starting at the line
  // where the metadata comments ended in the original source
  const transpiledLines = fileContent.split('\n')
  let templateStartIndex = 0

  // Skip lines until we've passed the original metadata comment section
  for (let i = 0; i < transpiledLines.length; i++) {
    const line = transpiledLines[i].trim()
    // Skip blank lines and comments at the start
    if (line === '' || line.startsWith('//')) {
      continue
    }
    // First non-comment line in transpiled output
    templateStartIndex = i
    break
  }

  let template = transpiledLines.slice(templateStartIndex).join('\n')

  // For batch templates, set globalThis['__FIGMA_BATCH'] so the runtime exposes it as
  // figma.batch. Using globalThis rather than a const so it's accessible from
  // __FIGMA_CODE_CONNECT_REQUIRE's closure regardless of where require('figma') is called.
  // (globalThis works in both browser and Node.js, unlike window.)
  if (batchOverrides) {
    template = `globalThis['__FIGMA_BATCH'] = ${JSON.stringify(
      batchOverrides.batchData,
    )}\n${template}`
  }

  // Check the final template (incl. any bundled helpers and batch data) against
  // the backend's size cap so an oversized template fails here, not on upload.
  assertTemplateWithinSizeLimit(filePath, template)

  // Apply documentUrlSubstitutions if provided
  if (config?.documentUrlSubstitutions) {
    figmaNodeUrl = applyDocumentUrlSubstitutions(figmaNodeUrl, config.documentUrlSubstitutions)
  }

  // Determine effective label from parameter, config, or default
  const effectiveLabel = label || config?.label || CodeConnectLabel.Code

  const language = config?.language || getInferredLanguageForRaw(effectiveLabel)

  return {
    figmaNode: figmaNodeUrl,
    component,
    template,
    // nestable by default unless user specifies in template
    // (templateData.nestable AND template.metadata.nestable need to
    // be true for instance to be nested)
    templateData: { nestable: true, isParserless: true },
    language,
    label: effectiveLabel,
    source,
    sourceLocation: { line: -1 },
    metadata: {
      cliVersion: require('../../package.json').version,
    },
  }
}

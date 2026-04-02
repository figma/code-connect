import fs from 'fs'
import path from 'path'
import * as prettier from 'prettier'
import { CodeConnectJSON } from '../connect/figma_connect'

/** Prettier configuration used for all generated template files */
const PRETTIER_OPTIONS = {
  parser: 'typescript' as const,
  semi: false,
  trailingComma: 'all' as const,
  pluginSearchDirs: false as const,
}

/** Formats template code with consistent prettier configuration */
function formatTemplate(code: string): string {
  return prettier.format(code, PRETTIER_OPTIONS)
}

/**
 * Common wrapper that handles path determination and file writing for both
 * simple templates and variant templates.
 */
function writeTemplateFileCommon(
  componentName: string,
  fileContent: string,
  outputDir: string | undefined,
  baseDir: string,
  localSourcePath: string | undefined,
  filePathsCreated: Set<string> | undefined,
  useTypeScript = true,
): { outputPath: string; skipped: boolean } {
  const suffix = useTypeScript ? '.figma.ts' : '.figma.js'
  const baseOutputPath = determineOutputPath(
    componentName,
    suffix,
    outputDir,
    baseDir,
    localSourcePath,
  )
  return writeFileWithDuplicateHandling(baseOutputPath, fileContent, suffix, filePathsCreated)
}

export function getFilenameFromComponentName(componentName: string): string {
  const allowlisted = /[a-zA-Z0-9\-\.]/
  return componentName
    .split('')
    .map((ch) => (allowlisted.test(ch) ? ch : '_'))
    .join('')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
}

/**
 * Determines the base output path for a template file.
 * Shared logic between writeTemplateFile and writeVariantTemplateFile.
 */
function determineOutputPath(
  rawComponentName: string,
  suffix: string,
  outputDir: string | undefined,
  baseDir: string,
  localSourcePath: string | undefined,
): string {
  // Extract basename from localSourcePath when available, falling back to componentName
  const componentFilename = getFilenameFromComponentName(rawComponentName)
  let basename = componentFilename
  if (localSourcePath) {
    let sourceBasename = path.basename(localSourcePath)

    // If this is a Code Connect file, extract the base component name
    // Handles patterns like: Button.figma.tsx, Button.figmadoc.tsx, Button.figma.template.js
    // Should all become: Button.figma.js
    const codeConnectPattern = /\.(figma|figmadoc)(\.[^.]+)+$/
    if (codeConnectPattern.test(sourceBasename)) {
      // Extract everything before the .figma/.figmadoc pattern
      sourceBasename = sourceBasename.replace(codeConnectPattern, '')
    } else {
      // For regular component files, strip extension normally
      sourceBasename = path.basename(localSourcePath, path.extname(localSourcePath))
    }

    basename = sourceBasename
  }

  if (outputDir) {
    // Use specified output directory with basename derived from source path
    return path.join(outputDir, `${basename}${suffix}`)
  } else if (localSourcePath) {
    // Use same directory as local source file
    return path.join(path.dirname(localSourcePath), `${basename}${suffix}`)
  } else {
    // No source info, use current directory
    const filename = `${componentFilename}${suffix}`
    return path.join(baseDir, filename)
  }
}

/**
 * Handles file existence checking, duplicate name resolution, and writing.
 * Shared logic between writeTemplateFile and writeVariantTemplateFile.
 */
function writeFileWithDuplicateHandling(
  baseOutputPath: string,
  fileContent: string,
  suffix: string,
  filePathsCreated: Set<string> | undefined,
): { outputPath: string; skipped: boolean } {
  // Check if file already exists on disk (pre-existing file, not created in this run)
  const existsOnDisk = fs.existsSync(baseOutputPath)
  const createdInThisRun = filePathsCreated && filePathsCreated.has(baseOutputPath)

  if (existsOnDisk && !createdInThisRun) {
    // This file existed before the migration run, skip it
    return { outputPath: baseOutputPath, skipped: true }
  }

  // Handle duplicate names (either created in this run or would conflict with an existing file)
  let outputPath = baseOutputPath
  if (createdInThisRun || existsOnDisk) {
    // Find a unique name by appending _1, _2, etc. before the suffix
    const dir = path.dirname(baseOutputPath)
    const basename = path.basename(baseOutputPath)

    // Remove the suffix to get the base name (works for any suffix like .figma.js or .figma.ts)
    const baseNameWithoutSuffix = basename.endsWith(suffix)
      ? basename.slice(0, -suffix.length)
      : basename

    let counter = 1
    do {
      outputPath = path.join(dir, `${baseNameWithoutSuffix}_${counter}${suffix}`)
      counter++
    } while ((filePathsCreated && filePathsCreated.has(outputPath)) || fs.existsSync(outputPath))
  }

  // Ensure output directory exists
  const outputDirPath = path.dirname(outputPath)
  if (!fs.existsSync(outputDirPath)) {
    fs.mkdirSync(outputDirPath, { recursive: true })
  }

  // Write the file
  fs.writeFileSync(outputPath, fileContent, 'utf-8')

  // Track the created file path
  if (filePathsCreated) {
    filePathsCreated.add(outputPath)
  }

  return { outputPath, skipped: false }
}

/** Migrates a doc's template (Swift helpers, server helpers, V2, id, imports, nestable) and returns the formatted string. */
export function prepareMigratedTemplate(
  doc: CodeConnectJSON,
  includeProps = false,
  useTypeScript?: boolean,
): string {
  let template = doc.template
  template = removeSwiftHelpers(template)
  template = migrateTemplateToUseServerSideHelpers(template)
  if (!includeProps) {
    template = removePropsDefinitionAndMetadata(template)
  }
  template = migrateV1TemplateToV2(template)
  template = addId(template, doc.component || 'TODO')
  template = addImports(template, doc.templateData?.imports)
  template = addNestableToMetadata(template, !!doc.templateData?.nestable)
  if (useTypeScript) {
    template = convertSyntaxToTypeScript(template)
  }
  return formatTemplate(template)
}

function removeSwiftHelpers(template: string): string {
  return template.replace(
    `function __fcc_renderSwiftChildren(children, prefix) {
  if (children === undefined) {
    return children
  }
  return children.flatMap((child, index) => {
    if (child.type === 'CODE') {
      let code = child.code.split('\\n').map((line) => {
        return line.trim() !== '' ? \`\${prefix}\${line}\` : line;
      }).join('\\n')
      if (index !== children.length - 1) {
        code = code + '\\n'
      }
      return {
        ...child,
        code: code,
      }
    } else {
        let elements = []
        const shouldAddNewline = index > 0 && children[index - 1].type === 'CODE' && !children[index - 1].code.endsWith('\\n')
        elements.push({ type: 'CODE', code: \`\${shouldAddNewline ? '\\n' : ''}\${prefix}\` })
        elements.push(child)
        if (index !== children.length - 1) {
            elements.push({ type: 'CODE', code: '\\n' })
        }
        return elements
    }
  })
}
`,
    '',
  )
}

export type WriteTemplateFileOptions = {
  localSourcePath?: string
  filePathsCreated?: Set<string>
  includeProps?: boolean
  useTypeScript?: boolean
}

export function writeTemplateFile(
  doc: CodeConnectJSON,
  outputDir: string | undefined,
  baseDir: string,
  {
    localSourcePath,
    filePathsCreated,
    includeProps = false,
    useTypeScript = true,
  }: WriteTemplateFileOptions = {},
): { outputPath: string; skipped: boolean } {
  const componentName = doc.component || 'template'
  const template = prepareMigratedTemplate(doc, includeProps, useTypeScript)

  // Build comment header lines
  const commentLines: string[] = [`// url=${doc.figmaNode}`]
  if (doc.source) {
    commentLines.push(`// source=${doc.source}`)
  }
  if (doc.component) {
    commentLines.push(`// component=${doc.component}`)
  }
  commentLines.push(``)

  const fileContent = commentLines.join('\n') + '\n' + template

  return writeTemplateFileCommon(
    componentName,
    fileContent,
    outputDir,
    baseDir,
    localSourcePath,
    filePathsCreated,
    useTypeScript,
  )
}

// Renames must match helpers in code_connect_js_api.raw_source.ts
export function migrateTemplateToUseServerSideHelpers(template: string) {
  return (
    template
      // React helpers
      .replace(/_fcc_renderReactProp/g, 'figma.helpers.react.renderProp')
      .replace(/_fcc_renderReactChildren/g, 'figma.helpers.react.renderChildren')
      .replace(/_fcc_jsxElement/g, 'figma.helpers.react.jsxElement')
      .replace(/_fcc_function/g, 'figma.helpers.react.function')
      .replace(/_fcc_identifier/g, 'figma.helpers.react.identifier')
      .replace(/_fcc_object/g, 'figma.helpers.react.object')
      .replace(/_fcc_templateString/g, 'figma.helpers.react.templateString')
      .replace(/_fcc_renderPropValue/g, 'figma.helpers.react.renderPropValue')
      .replace(/_fcc_stringifyObject/g, 'figma.helpers.react.stringifyObject')
      .replace(/_fcc_reactComponent/g, 'figma.helpers.react.reactComponent')
      .replace(/_fcc_array/g, 'figma.helpers.react.array')
      .replace(/isReactComponentArray/g, 'figma.helpers.react.isReactComponentArray')
      // Swift helpers
      .replace(/__fcc_renderSwiftChildren/g, 'figma.helpers.swift.renderChildren')
      // Kotlin/Compose helpers
      .replace(/__fcc_renderComposeChildren/g, 'figma.helpers.kotlin.renderChildren')
  )
}

export function addId(template: string, id: string): string {
  // Don't add id if already present (e.g. when re-migrating a previously-migrated template)
  if (/export default\s*\{\s*id:\s*['"]/.test(template)) {
    return template
  }
  return template.replace(/export default \{/, `export default { id: '${id}',`)
}

export function addImports(template: string, imports: string[] | undefined): string {
  if (!imports || imports.length === 0) {
    return template
  }

  // Escape imports for safe insertion into JS
  const importsJson = JSON.stringify(imports)

  // Add imports after the id field if it exists, otherwise at the start
  // Match: export default { id: '...', (with optional whitespace/newlines)
  const withId = template.replace(
    /(export default\s*\{\s*id:\s*'[^']*',)/,
    `$1 imports: ${importsJson},`,
  )

  // If id replacement worked, return
  if (withId !== template) {
    return withId
  }

  // Otherwise, add at the start (after opening brace)
  return template.replace(/export default\s*\{/, `export default { imports: ${importsJson},`)
}

export function addNestableToMetadata(template: string, nestable: boolean): string {
  // Find "metadata: {" and replace with "metadata: { nestable: <value>,"
  return template.replace(/metadata:\s*\{/, `metadata: { nestable: ${nestable},`)
}

/**
 * Migrates V1 templates to V2 API.
 *
 * This performs safe, incremental transformations. The following patterns
 * are intentionally NOT migrated as they're still supported in V2:
 *
 * - __props metadata building pattern - still valid JavaScript
 * - __renderWithFn__() - complex transformation, still supported
 *
 * These may be addressed in future migrations.
 */
export const migrateV1TemplateToV2 = (template: string): string => {
  let migrated = template

  // 1. Core object rename
  migrated = migrated.replace(/figma\.currentLayer/g, 'figma.selectedInstance')

  // 2. Normalize template types to figma.code
  migrated = migrated.replace(/figma\.html/g, 'figma.code')
  migrated = migrated.replace(/figma\.tsx/g, 'figma.code')
  migrated = migrated.replace(/figma\.swift/g, 'figma.code')
  migrated = migrated.replace(/figma\.kotlin/g, 'figma.code')

  // 3. Property accessor methods
  migrated = migrated.replace(/\.__properties__\.string\(/g, '.getString(')
  migrated = migrated.replace(/\.__properties__\.boolean\(/g, '.getBoolean(')
  migrated = migrated.replace(/\.__properties__\.enum\(/g, '.getEnum(')
  migrated = migrated.replace(/\.__properties__\.__instance__\(/g, '.getInstanceSwap(')
  // .__properties__.instance() auto-renders, so we need to add .executeTemplate().example
  migrated = migrated.replace(
    /\.__properties__\.instance\(([^)]+)\)/g,
    '.getInstanceSwap($1)?.executeTemplate().example',
  )

  // 4. Alias for __properties__ on selectedInstance
  migrated = migrated.replace(/figma\.selectedInstance\.__properties__\./g, 'figma.properties.')

  // 5. Other method renames
  migrated = migrated.replace(/\.__getPropertyValue__\(/g, '.getPropertyValue(')

  // 6. __findChildWithCriteria__ - migrate based on type parameter
  // For TEXT type with __render__(): __findChildWithCriteria__({ name: 'X', type: "TEXT" }).__render__() → findText('X').textContent
  migrated = migrated.replace(
    /\.__findChildWithCriteria__\(\{\s*name:\s*'([^']+)',\s*type:\s*"TEXT"\s*\}\)\.__render__\(\)/g,
    ".findText('$1').textContent",
  )
  migrated = migrated.replace(
    /\.__findChildWithCriteria__\(\{\s*type:\s*"TEXT",\s*name:\s*'([^']+)'\s*\}\)\.__render__\(\)/g,
    ".findText('$1').textContent",
  )
  // For INSTANCE type: __findChildWithCriteria__({ type: 'INSTANCE', name: 'X' }) → findInstance('X')
  migrated = migrated.replace(
    /\.__findChildWithCriteria__\(\{\s*name:\s*'([^']+)',\s*type:\s*['"]INSTANCE['"]\s*\}\)/g,
    ".findInstance('$1')",
  )
  migrated = migrated.replace(
    /\.__findChildWithCriteria__\(\{\s*type:\s*['"]INSTANCE['"],\s*name:\s*'([^']+)'\s*\}\)/g,
    ".findInstance('$1')",
  )
  // For TEXT type without __render__(): __findChildWithCriteria__({ type: 'TEXT', name: 'X' }) → findText('X')
  migrated = migrated.replace(
    /\.__findChildWithCriteria__\(\{\s*name:\s*'([^']+)',\s*type:\s*['"]TEXT['"]\s*\}\)/g,
    ".findText('$1')",
  )
  migrated = migrated.replace(
    /\.__findChildWithCriteria__\(\{\s*type:\s*['"]TEXT['"],\s*name:\s*'([^']+)'\s*\}\)/g,
    ".findText('$1')",
  )

  // 7. __find__() - migrate to findInstance()
  migrated = migrated.replace(
    /\.__find__\(("([^"]+)"|'([^']+)')\)/g,
    (match, quote, doubleQuoted, singleQuoted) => {
      const name = doubleQuoted || singleQuoted
      return `.findInstance("${name}")`
    },
  )

  // 8. __render__() - migrate to executeTemplate().example (but not if part of __findChildWithCriteria__)
  migrated = migrated.replace(/\.__render__\(\)/g, '.executeTemplate().example')

  // 9. __getProps__() - migrate to executeTemplate().metadata.props
  migrated = migrated.replace(/\.__getProps__\(\)/g, '.executeTemplate().metadata.props')

  // 10. Export format - simple case
  // Match export default figma.code` (or tsx, html, etc) and wrap in { example: ... }
  migrated = migrated.replace(
    /export default figma\.(code|tsx|html|swift|kotlin)`/g,
    'export default { example: figma.$1`',
  )
  // Close the template literal for simple exports (look for backtick at end, handling multiline)
  // Use a more robust approach: find the last backtick that's not followed by more content
  migrated = migrated.replace(
    /(export default \{ example: figma\.\w+`[\s\S]*?)`(?=\s*$)/gm,
    '$1` }',
  )

  // 11. Export format - spread operator case
  // { ...figma.code`...`, metadata: ... } → { example: figma.code`...`, metadata: ... }
  migrated = migrated.replace(
    /\{\s*\.\.\.figma\.(code|tsx|html|swift|kotlin)`/g,
    '{ example: figma.$1`',
  )

  return migrated
}

/**
 * Removes the __props definition and props assignments. These are only used by icons
 * helpers and significantly bloat templates.
 */
export function removePropsDefinition(template: string): string {
  // Match from "const __props = {" through everything up until (but not including) "export default {"
  // Uses [\s\S] to match any character including newlines
  return template.replace(/const\s+__props\s*=\s*\{[\s\S]*?(?=export\s+default\s*\{)/g, '\n')
}

/**
 * Removes the __props definition/assignments and removes __props from the default export
 */
export function removePropsDefinitionAndMetadata(template: string): string {
  // First remove the __props definition and assignments
  let result = removePropsDefinition(template)
  const exportMatch = result.match(/(export\s+default\s+\{[\s\S]*$)/)
  if (exportMatch) {
    const exportSection = exportMatch[1]
    const cleanedExport = exportSection
      .replace(/metadata:\s*\{\s*__props\s*\}/g, 'metadata: {}') // metadata: { __props }
      .replace(/metadata:\s*\{\s*__props\s*,/g, 'metadata: {') // metadata: { __props, ...
      .replace(/,\s*__props\s*\}/g, ' }') // metadata: { ..., __props }
      .replace(/,\s*__props\s*,/g, ',') // metadata: { ..., __props, ... }

    result = result.substring(0, result.indexOf(exportSection)) + cleanedExport
  }

  return result
}

type CodeConnectObjectsForFigmaUrl = {
  main: CodeConnectJSON | null
  variants: CodeConnectJSON[]
}

/**
 * For each figmaUrl in the given codeConnectObjects, return the main (non-variant)
 * codeConnectObject plus a list of any variants
 */
export const groupCodeConnectObjectsByFigmaUrl = (codeConnectObjects: CodeConnectJSON[]) => {
  return codeConnectObjects.reduce(
    (acc, obj) => {
      const figmaUrl = obj.figmaNode
      if (!acc[figmaUrl]) {
        acc[figmaUrl] = { main: null, variants: [] }
      }

      if (obj.variant && Object.keys(obj.variant).length > 0) {
        acc[figmaUrl].variants.push(obj)
      } else {
        acc[figmaUrl].main = obj
      }

      return acc
    },
    {} as Record<string, CodeConnectObjectsForFigmaUrl>,
  )
}

/** One parserless file per component: branch per variant, each with its own props and template object; export default template. */
export function writeVariantTemplateFile(
  group: CodeConnectObjectsForFigmaUrl,
  figmaUrl: string,
  outputDir: string | undefined,
  baseDir: string,
  {
    localSourcePath,
    filePathsCreated,
    useTypeScript = true,
    includeProps = false,
  }: WriteTemplateFileOptions = {},
): { outputPath: string; skipped: boolean } {
  const variantDocs = group.variants.map((v) => ({ doc: v, variant: v.variant }))
  const defaultDoc = group.main ? { doc: group.main, variant: null } : null
  const componentName = (group.main ?? group.variants[0])?.component || 'template'

  // Migrate templates and extract their full code (no deduplication)
  const allDocs = [...variantDocs, ...(defaultDoc ? [defaultDoc] : [])]
  const migratedTemplates = allDocs.map(({ doc }) =>
    prepareMigratedTemplate(doc, includeProps, useTypeScript),
  )
  const exportDefaultPrefix = 'export default '

  // For each template, replace 'export default' with 'template =' and remove figma require
  const branches = migratedTemplates.map((t) => {
    if (!t.includes(exportDefaultPrefix)) {
      throw new Error(`Variant merge: no "export default" in template for ${figmaUrl}`)
    }

    // Replace 'export default' with 'template ='
    let branchCode = t.replace(exportDefaultPrefix, 'template = ')

    // Remove only the top-level figma require/import, keep everything else
    const lines = branchCode.split('\n')
    const filteredLines = lines.filter(
      (line) =>
        !line.trim().startsWith('const figma = require') &&
        !line.trim().startsWith('import figma from'),
    )

    return filteredLines.join('\n').trim()
  })

  // Build the variant switch structure using conditions for all variant properties
  const ifParts: string[] = []
  for (let i = 0; i < variantDocs.length; i++) {
    const { variant } = variantDocs[i]
    const branchCode = branches[i]

    if (variant && Object.keys(variant).length > 0) {
      // Build condition from all properties in the variant
      const condition = Object.entries(variant)
        .map(
          ([key, val]) =>
            `figma.selectedInstance.getPropertyValue('${key}') === ${typeof val === 'string' ? `'${val}'` : val}`,
        )
        .join(' && ')

      ifParts.push(`${ifParts.length ? '} else ' : ''}if (${condition}) {\n${branchCode}`)
    }
  }

  // Add default/fallback branch (use the last doc: main if present, otherwise first variant)
  const defaultBranchCode = branches[branches.length - 1]

  ifParts.push(`} else {\n${defaultBranchCode}\n}`)

  const variantComment =
    group.main != null
      ? `// Branch per variant combination.`
      : `// Branch per variant; no default, else first.`

  const templateBody = [
    useTypeScript ? `import figma from "figma"` : `const figma = require('figma')`,
    '',
    variantComment,
    '',
    'let template',
    ifParts.join('\n'),
    '',
    'export default template',
  ].join('\n')

  const formatted = formatTemplate(templateBody)

  // Build comment header with url, source, and component
  // Use the representative doc (main or first variant) for source/component values
  const representativeDoc = group.main ?? group.variants[0]
  const commentLines: string[] = [`// url=${figmaUrl}`]
  if (representativeDoc?.source) {
    commentLines.push(`// source=${representativeDoc.source}`)
  }
  if (representativeDoc?.component) {
    commentLines.push(`// component=${representativeDoc.component}`)
  }
  commentLines.push(``)

  const fileContent = commentLines.join('\n') + '\n' + formatted

  return writeTemplateFileCommon(
    componentName,
    fileContent,
    outputDir,
    baseDir,
    localSourcePath,
    filePathsCreated,
    useTypeScript,
  )
}

function convertSyntaxToTypeScript(template: string): string {
  return template
    .replace(/const figma = require\(['"]figma['"]\)/, `import figma from "figma"`)
    .replace(/const __props = {}/, 'const __props: Record<string, unknown> = {}')
    .replace(
      /if \((\w+) && \1\.type !== "ERROR"\)/g,
      'if ($1 && ($1 as { type?: string }).type !== "ERROR")',
    )
}

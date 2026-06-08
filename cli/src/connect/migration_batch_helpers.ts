import fs from 'fs'
import path from 'path'
import { CodeConnectJSON } from './figma_connect'
import {
  formatTemplate,
  getFilenameFromComponentName,
  prepareMigratedTemplateBody,
} from './migration_helpers'

export const AUTO_BATCH_THRESHOLD = 10

type BatchComponentEntry = {
  url: string
  source?: string
  component?: string
  [key: string]: any
}

type Candidate = {
  doc: CodeConnectJSON
  body: string
  params: BatchComponentEntry
}

type BatchMigrationBuildResult =
  | {
      ok: true
      template: string
      batchJson: {
        templateFile: string
        components: BatchComponentEntry[]
      }
    }
  | { ok: false; reason: string }

export type WriteBatchTemplateFileResult = {
  templatePath?: string
  batchPath?: string
  skipped: boolean
  reason?: string
  componentCount: number
}

type WriteBatchTemplateFileOptions = {
  localSourcePath?: string
  filePathsCreated?: Set<string>
  includeProps?: boolean
  useTypeScript?: boolean
}

type ImportInfo = {
  kind: 'named' | 'default'
  symbol: string
  importPath: string
  raw: string
}

function uniqueValues(values: Array<string | undefined>) {
  return new Set(values)
}

export function getBatchMigrationGroups(
  docs: CodeConnectJSON[],
  {
    batchAll = false,
    disabled = false,
    threshold = AUTO_BATCH_THRESHOLD,
  }: {
    batchAll?: boolean
    disabled?: boolean
    threshold?: number
  } = {},
) {
  if (disabled) {
    return new Map<string, CodeConnectJSON[]>()
  }

  const docsBySourcePath = new Map<string, CodeConnectJSON[]>()
  for (const doc of docs) {
    if (!doc._codeConnectFilePath) {
      continue
    }

    const sourcePath = path.resolve(doc._codeConnectFilePath)
    docsBySourcePath.set(sourcePath, [...(docsBySourcePath.get(sourcePath) || []), doc])
  }

  const batchGroups = new Map<string, CodeConnectJSON[]>()
  for (const [sourcePath, sourceDocs] of docsBySourcePath) {
    if (batchAll || sourceDocs.length >= threshold) {
      batchGroups.set(sourcePath, sourceDocs)
    }
  }

  return batchGroups
}

function allEqual(values: string[]) {
  return values.every((value) => value === values[0])
}

function isIdentifier(value: string | undefined): value is string {
  return !!value && /^[A-Za-z_$][\w$]*$/.test(value)
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function applyReplacements(
  body: string,
  replacements: Array<{ start: number; end: number; value: string }>,
) {
  return replacements
    .sort((a, b) => b.start - a.start)
    .reduce((result, replacement) => {
      return result.slice(0, replacement.start) + replacement.value + result.slice(replacement.end)
    }, body)
}

function removeUnusedSimpleConsts(body: string) {
  let previous: string
  let next = body
  const simpleConstRegex =
    /^const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:"[^"\n]*"|'[^'\n]*'|figma\.helpers\.react\.identifier\(["'][^"'\n]+["']\)|[A-Za-z_$][\w$]*|true|false|-?\d+(?:\.\d+)?)\s*\n/gm

  do {
    previous = next
    next = next.replace(simpleConstRegex, (match, name: string, offset: number) => {
      const rest = next.slice(offset + match.length)
      const isReferenced = new RegExp(`\\b${escapeRegExp(name)}\\b`).test(rest)
      return isReferenced ? match : ''
    })
  } while (next !== previous)

  return next
}

function deriveMetadata(
  docs: CodeConnectJSON[],
):
  | { ok: true; comments: string[]; entries: BatchComponentEntry[] }
  | { ok: false; reason: string } {
  const sources = docs.map((doc) => doc.source || undefined)
  const components = docs.map((doc) => doc.component || undefined)
  const entries: BatchComponentEntry[] = docs.map((doc) => ({ url: doc.figmaNode }))
  const comments: string[] = []

  const metadataFields = [
    { name: 'source' as const, values: sources },
    { name: 'component' as const, values: components },
  ]

  for (const field of metadataFields) {
    const hasAny = field.values.some(Boolean)
    const hasAll = field.values.every(Boolean)
    const unique = uniqueValues(field.values)

    if (hasAny && !hasAll) {
      return {
        ok: false,
        reason: `Cannot batch: some docs have ${field.name} metadata and others do not`,
      }
    }

    if (!hasAny) {
      continue
    }

    if (unique.size === 1) {
      comments.push(`// ${field.name}=${field.values[0]}`)
    } else {
      docs.forEach((doc, index) => {
        const value = doc[field.name]
        if (value) {
          entries[index][field.name] = value
        }
      })
    }
  }

  return { ok: true, comments, entries }
}

function parseImport(importString: string): ImportInfo | null {
  const named = importString.match(
    /^import\s+\{\s*([A-Za-z_$][\w$]*)\s*\}\s+from\s+["']([^"']+)["']\s*;?$/,
  )
  if (named) {
    return { kind: 'named', symbol: named[1], importPath: named[2], raw: importString }
  }

  const defaultImport = importString.match(
    /^import\s+([A-Za-z_$][\w$]*)\s+from\s+["']([^"']+)["']\s*;?$/,
  )
  if (defaultImport) {
    return {
      kind: 'default',
      symbol: defaultImport[1],
      importPath: defaultImport[2],
      raw: importString,
    }
  }

  return null
}

function tryIdSwap(candidates: Candidate[]): Candidate[] {
  const matches = candidates.map((candidate) => candidate.body.match(/\bid:\s*(['"])([^'"\\]+)\1/))
  if (matches.some((match) => !match)) {
    return candidates
  }

  const ids = matches.map((match) => match![2])
  if (uniqueValues(ids).size <= 1) {
    return candidates
  }

  return candidates.map((candidate, index) => ({
    ...candidate,
    body: candidate.body.replace(matches[index]![0], 'id: figma.batch.id'),
    params: { ...candidate.params, id: ids[index] },
  }))
}

function tryImportSwap(candidates: Candidate[]): Candidate[] {
  const importLists = candidates.map((candidate) => candidate.doc.templateData?.imports || [])
  if (importLists.some((imports) => imports.length !== 1)) {
    return candidates
  }

  const importStrings = importLists.map((imports) => imports[0])
  if (uniqueValues(importStrings).size <= 1) {
    return candidates
  }

  const parsed = importStrings.map(parseImport)
  if (parsed.some((info) => !info)) {
    return candidates
  }

  const imports = parsed as ImportInfo[]
  if (!allEqual(imports.map((info) => info.kind))) {
    return candidates
  }

  const symbolVaries = uniqueValues(imports.map((info) => info.symbol)).size > 1
  const pathVaries = uniqueValues(imports.map((info) => info.importPath)).size > 1
  if (!symbolVaries && !pathVaries) {
    return candidates
  }

  return candidates.map((candidate, index) => {
    const info = imports[index]
    const symbol = symbolVaries ? '${figma.batch.componentName}' : info.symbol
    const importPath = pathVaries ? '${figma.batch.importPath}' : info.importPath
    const replacement =
      info.kind === 'named'
        ? `\`import { ${symbol} } from "${importPath}"\``
        : `\`import ${symbol} from "${importPath}"\``
    const encodedImport = JSON.stringify(info.raw)

    if (!candidate.body.includes(encodedImport)) {
      return candidate
    }

    return {
      ...candidate,
      body: candidate.body.replace(encodedImport, replacement),
      params: {
        ...candidate.params,
        ...(symbolVaries ? { componentName: info.symbol } : {}),
        ...(pathVaries ? { importPath: info.importPath } : {}),
      },
    }
  })
}

function templateLiteralTextRanges(content: string, contentStart: number) {
  const ranges: Array<{ start: number; end: number; text: string }> = []
  let textStart = 0
  let i = 0

  while (i < content.length) {
    if (content[i] === '$' && content[i + 1] === '{') {
      if (textStart < i) {
        ranges.push({
          start: contentStart + textStart,
          end: contentStart + i,
          text: content.slice(textStart, i),
        })
      }

      i += 2
      let depth = 1
      while (i < content.length && depth > 0) {
        if (content[i] === '{') depth++
        if (content[i] === '}') depth--
        i++
      }
      textStart = i
      continue
    }

    i++
  }

  if (textStart < content.length) {
    ranges.push({
      start: contentStart + textStart,
      end: contentStart + content.length,
      text: content.slice(textStart),
    })
  }

  return ranges
}

function figmaCodeTextRanges(body: string) {
  const ranges: Array<{ start: number; end: number; text: string }> = []
  const regex = /figma\.code`([\s\S]*?)`/g
  let match: RegExpExecArray | null

  while ((match = regex.exec(body))) {
    const contentStart = match.index + 'figma.code`'.length
    ranges.push(...templateLiteralTextRanges(match[1], contentStart))
  }

  return ranges
}

function replaceIdentifierInFigmaCode(body: string, identifier: string, replacement: string) {
  const ranges = figmaCodeTextRanges(body)
  const identifierRegex = new RegExp(
    `(^|[^A-Za-z0-9_$])${escapeRegExp(identifier)}(?=$|[^A-Za-z0-9_$])`,
    'g',
  )
  const replacements: Array<{ start: number; end: number; value: string }> = []

  for (const range of ranges) {
    let match: RegExpExecArray | null
    while ((match = identifierRegex.exec(range.text))) {
      const prefixLength = match[1].length
      const start = range.start + match.index + prefixLength
      replacements.push({
        start,
        end: start + identifier.length,
        value: replacement,
      })
    }
  }

  return applyReplacements(body, replacements)
}

function tryComponentSymbolSwap(candidates: Candidate[]): Candidate[] {
  let withNames = candidates

  if (withNames.some((candidate) => !candidate.params.componentName)) {
    const ids = withNames.map((candidate) => candidate.params.id)
    if (ids.every(isIdentifier) && uniqueValues(ids).size > 1) {
      withNames = withNames.map((candidate) => ({
        ...candidate,
        params: { ...candidate.params, componentName: candidate.params.id },
      }))
    }
  }

  if (withNames.some((candidate) => !candidate.params.componentName)) {
    return candidates
  }

  const names = withNames.map((candidate) => candidate.params.componentName as string)
  if (uniqueValues(names).size <= 1) {
    return candidates
  }

  return withNames.map((candidate, index) => ({
    ...candidate,
    body: replaceIdentifierInFigmaCode(
      candidate.body,
      names[index],
      '${figma.batch.componentName}',
    ),
  }))
}

type ScalarMatch = {
  key: string
  operator: string
  value: string
  valueStart: number
  valueEnd: number
}

function collectNamedScalars(body: string, kind: 'string' | 'numberBoolean') {
  const ranges = figmaCodeTextRanges(body)
  const regex =
    kind === 'string'
      ? /([A-Za-z_$][\w$]*)\s*(=|:)\s*(['"])([^'"\\\n]+)\3/g
      : /([A-Za-z_$][\w$]*)\s*(=|:)\s*(?:\{\s*)?(true|false|-?\d+(?:\.\d+)?)(?:\s*\})?(?=$|[^A-Za-z0-9_$.])/g
  const matches: ScalarMatch[] = []

  for (const range of ranges) {
    let match: RegExpExecArray | null
    while ((match = regex.exec(range.text))) {
      const value = kind === 'string' ? match[4] : match[3]
      const valueOffset = match[0].lastIndexOf(value)
      matches.push({
        key: match[1],
        operator: match[2],
        value,
        valueStart: range.start + match.index + valueOffset,
        valueEnd: range.start + match.index + valueOffset + value.length,
      })
    }
  }

  return matches
}

function parseScalarValue(value: string, kind: 'string' | 'numberBoolean') {
  if (kind === 'string') {
    return value
  }

  if (value === 'true') {
    return true
  }
  if (value === 'false') {
    return false
  }

  return Number(value)
}

function tryNamedScalarSwap(
  candidates: Candidate[],
  kind: 'string' | 'numberBoolean',
): Candidate[] {
  const matchesByCandidate = candidates.map((candidate) =>
    collectNamedScalars(candidate.body, kind),
  )
  const matchCount = matchesByCandidate[0]?.length || 0
  if (matchCount === 0 || matchesByCandidate.some((matches) => matches.length !== matchCount)) {
    return candidates
  }

  const replacementsByCandidate = candidates.map(
    () => [] as Array<{ start: number; end: number; value: string }>,
  )
  const fieldNames = new Set<string>()
  const nextCandidates = candidates.map((candidate) => ({
    ...candidate,
    params: { ...candidate.params },
  }))

  for (let matchIndex = 0; matchIndex < matchCount; matchIndex++) {
    const matches = matchesByCandidate.map((matches) => matches[matchIndex])
    const first = matches[0]
    if (
      matches.some((match) => match.key !== first.key || match.operator !== first.operator) ||
      uniqueValues(matches.map((match) => match.value)).size <= 1
    ) {
      continue
    }

    if (fieldNames.has(first.key) || first.key in nextCandidates[0].params) {
      return candidates
    }

    fieldNames.add(first.key)
    matches.forEach((match, candidateIndex) => {
      replacementsByCandidate[candidateIndex].push({
        start: match.valueStart,
        end: match.valueEnd,
        value: `\${figma.batch.${first.key}}`,
      })
      nextCandidates[candidateIndex].params[first.key] = parseScalarValue(match.value, kind)
    })
  }

  if (fieldNames.size === 0) {
    return candidates
  }

  return nextCandidates.map((candidate, index) => ({
    ...candidate,
    body: applyReplacements(candidate.body, replacementsByCandidate[index]),
  }))
}

export function buildBatchMigration(
  docs: CodeConnectJSON[],
  {
    includeProps = false,
    useTypeScript = true,
    templateFile = './template.figma.batch.ts',
  }: { includeProps?: boolean; useTypeScript?: boolean; templateFile?: string } = {},
): BatchMigrationBuildResult {
  if (docs.length < 2) {
    return { ok: false, reason: 'Cannot batch: at least two docs are required' }
  }

  if (docs.some((doc) => doc.variant && Object.keys(doc.variant).length > 0)) {
    return { ok: false, reason: 'Cannot batch: variant Code Connect docs are not supported yet' }
  }

  if (docs.some((doc) => !doc.template)) {
    return { ok: false, reason: 'Cannot batch: every doc must have a generated template' }
  }

  const metadata = deriveMetadata(docs)
  if (!metadata.ok) {
    return metadata
  }

  let candidates: Candidate[] = docs.map((doc, index) => ({
    doc,
    body: removeUnusedSimpleConsts(prepareMigratedTemplateBody(doc, includeProps, useTypeScript)),
    params: metadata.entries[index],
  }))

  candidates = tryIdSwap(candidates)
  candidates = tryImportSwap(candidates)
  candidates = tryComponentSymbolSwap(candidates)
  candidates = tryNamedScalarSwap(candidates, 'string')
  candidates = tryNamedScalarSwap(candidates, 'numberBoolean')

  if (!allEqual(candidates.map((candidate) => candidate.body))) {
    return {
      ok: false,
      reason: 'Cannot batch: templates did not reduce to one compatible shape',
    }
  }

  const templateBody = formatTemplate(candidates[0].body)
  const comments = metadata.comments.length > 0 ? `${metadata.comments.join('\n')}\n\n` : ''

  return {
    ok: true,
    template: `${comments}${templateBody}`,
    batchJson: {
      templateFile,
      components: candidates.map((candidate) => candidate.params),
    },
  }
}

function getSourceBasename(localSourcePath: string | undefined, docs: CodeConnectJSON[]) {
  if (!localSourcePath) {
    return getFilenameFromComponentName(docs[0]?.component || 'batch')
  }

  const sourceBasename = path.basename(localSourcePath)
  const codeConnectPattern = /\.(figma|figmadoc)(\.[^.]+)+$/
  return codeConnectPattern.test(sourceBasename)
    ? sourceBasename.replace(codeConnectPattern, '')
    : path.basename(localSourcePath, path.extname(localSourcePath))
}

function determineBatchOutputPaths(
  basename: string,
  outputDir: string | undefined,
  baseDir: string,
  localSourcePath: string | undefined,
  useTypeScript: boolean,
  filePathsCreated: Set<string> | undefined,
): { skipped: true; reason: string } | { skipped: false; templatePath: string; batchPath: string } {
  const dir = outputDir || (localSourcePath ? path.dirname(localSourcePath) : baseDir)
  const templateSuffix = useTypeScript ? '.figma.batch.ts' : '.figma.batch.js'
  const getPaths = (name: string) => ({
    templatePath: path.join(dir, `${name}${templateSuffix}`),
    batchPath: path.join(dir, `${name}.figma.batch.json`),
  })
  const basePaths = getPaths(basename)

  if (
    (fs.existsSync(basePaths.templatePath) && !filePathsCreated?.has(basePaths.templatePath)) ||
    (fs.existsSync(basePaths.batchPath) && !filePathsCreated?.has(basePaths.batchPath))
  ) {
    return { skipped: true, reason: 'batch output file already exists' }
  }

  let paths = basePaths
  let counter = 1
  while (
    fs.existsSync(paths.templatePath) ||
    fs.existsSync(paths.batchPath) ||
    filePathsCreated?.has(paths.templatePath) ||
    filePathsCreated?.has(paths.batchPath)
  ) {
    paths = getPaths(`${basename}_${counter}`)
    counter++
  }

  return { skipped: false, ...paths }
}

export function writeBatchTemplateFiles(
  docs: CodeConnectJSON[],
  outputDir: string | undefined,
  baseDir: string,
  {
    localSourcePath,
    filePathsCreated,
    includeProps = false,
    useTypeScript = true,
  }: WriteBatchTemplateFileOptions = {},
): WriteBatchTemplateFileResult {
  const basename = getSourceBasename(localSourcePath, docs)
  const paths = determineBatchOutputPaths(
    basename,
    outputDir,
    baseDir,
    localSourcePath,
    useTypeScript,
    filePathsCreated,
  )

  if (paths.skipped) {
    return { skipped: true, reason: paths.reason, componentCount: docs.length }
  }

  const built = buildBatchMigration(docs, {
    includeProps,
    useTypeScript,
    templateFile: `./${path.basename(paths.templatePath)}`,
  })

  if (!built.ok) {
    return { skipped: true, reason: built.reason, componentCount: docs.length }
  }

  fs.mkdirSync(path.dirname(paths.templatePath), { recursive: true })
  fs.writeFileSync(paths.templatePath, built.template, 'utf-8')
  fs.writeFileSync(paths.batchPath, `${JSON.stringify(built.batchJson, null, 2)}\n`, 'utf-8')
  filePathsCreated?.add(paths.templatePath)
  filePathsCreated?.add(paths.batchPath)

  return {
    skipped: false,
    templatePath: paths.templatePath,
    batchPath: paths.batchPath,
    componentCount: docs.length,
  }
}

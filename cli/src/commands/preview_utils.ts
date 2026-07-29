import fs from 'fs'
import path from 'path'
import chalk from 'chalk'
import * as prettier from 'prettier'
import { BaseCommand, getCodeConnectObjects, getAccessTokenOrExit, setupHandler } from './connect'
import { exitWithError, logger } from '../common/logging'
import { CodeConnectJSON } from '../connect/figma_connect'
import { parseFigmaNode } from '../connect/validation'
import { getProjectInfo } from '../connect/project'
import { getApiUrl, getHeaders, FigmaRestApi } from '../connect/figma_rest_api'
import { request, isFetchError } from '../common/fetch'
import { displayPropertyList, type PropertyListItem } from './property_list_table'
import {
  enumeratePropertyCombinations,
  buildPropertyCombinationFromProps,
  toAvailableProperties,
  type PropertyCombination,
  type AvailableProperty,
} from '../connect/property_combinations'

type PreviewCommand = BaseCommand & { output?: string }

export interface NodeToPreview {
  fileKey: string
  nodeId: string
  url: string
  filePath: string
}

export interface PreviewResult {
  url: string
  nodeId: string
  filePath: string
  success: boolean
  snippet?: string
  language?: string
  component?: string
  error?: string
  /** Present when this result is one property combination of an expanded (--all) render. */
  propertyCombinationLabel?: string
  /** `kind: "transport"` marks a server/network failure, in which case no property vocabulary is attached. */
  errorDetails?: {
    kind?: string
    missingProperty?: string
    availableProperties?: AvailableProperty[]
  }
  /** Nested instances/slots that rendered as placeholders. Not an error — the snippet still rendered. */
  unresolvedInstances?: Array<{ guid: string; name?: string; kind: 'instance' | 'slot' }>
}

type NodesByFileKey = Record<string, NodeToPreview[]>

/**
 * Collect nodes to preview from file arguments.
 * Matches by exact path first, then by basename.
 */
export async function collectNodesToPreview(
  files: string[],
  allCodeConnectObjects: CodeConnectJSON[],
  dir: string,
  cmd: BaseCommand,
): Promise<NodeToPreview[]> {
  const nodesToPreview: NodeToPreview[] = []

  for (const filePath of files) {
    const resolvedPath = path.isAbsolute(filePath) ? filePath : path.resolve(dir, filePath)

    // Try exact path first
    if (fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isFile()) {
      const docs = allCodeConnectObjects.filter(
        (d) => path.resolve(d._codeConnectFilePath || '') === resolvedPath,
      )
      if (docs.length > 0) {
        if (docs.length === 1) {
          logger.info(`Found: ${filePath}`)
        } else {
          logger.info(`Found ${docs.length} component definition(s) in ${filePath}`)
        }
        for (const doc of docs) {
          const parsed = parseFigmaNode(cmd.verbose, doc, true)
          if (parsed) {
            nodesToPreview.push({
              fileKey: parsed.fileKey,
              nodeId: parsed.nodeId,
              url: doc.figmaNode,
              filePath: path.relative(dir, doc._codeConnectFilePath || ''),
            })
          } else {
            logger.error(`Failed to parse figmaNode from file: ${filePath}`)
          }
        }
      } else {
        logger.error(`Not a valid Code Connect file: ${filePath}`)
      }
      continue
    }

    // Fall back to basename matching
    const fileName = path.basename(filePath)
    if (cmd.verbose) {
      logger.debug(`Searching for files matching: ${fileName}`)
      logger.debug(`Total Code Connect objects: ${allCodeConnectObjects.length}`)
    }

    const matches = allCodeConnectObjects.filter(
      (d) => path.basename(d._codeConnectFilePath || '') === fileName,
    )

    if (matches.length === 0) {
      logger.error(`No files found matching: ${filePath}`)
      continue
    }

    if (matches.length === 1) {
      logger.info(`Found: ${matches[0]._codeConnectFilePath}`)
    } else {
      const uniqueFiles = new Set(matches.map((d) => d._codeConnectFilePath))
      if (uniqueFiles.size === 1) {
        logger.info(
          `Found ${matches.length} component definition(s) in ${path.relative(dir, Array.from(uniqueFiles)[0] || '')}`,
        )
      } else {
        logger.info(`Found ${matches.length} component definition(s) in ${uniqueFiles.size} files:`)
        for (const fp of uniqueFiles) {
          const count = matches.filter((d) => d._codeConnectFilePath === fp).length
          logger.info(
            `  - ${path.relative(dir, fp || '')} (${count} definition${count > 1 ? 's' : ''})`,
          )
        }
      }
    }

    for (const doc of matches) {
      const parsed = parseFigmaNode(cmd.verbose, doc, true)
      if (parsed) {
        nodesToPreview.push({
          fileKey: parsed.fileKey,
          nodeId: parsed.nodeId,
          url: doc.figmaNode,
          filePath: path.relative(dir, doc._codeConnectFilePath || ''),
        })
      }
    }
  }

  return nodesToPreview
}

/**
 * Outcome of fetching a component's property definitions.
 * - `ok`: definitions were found (includes VARIANT axes).
 * - `empty`: the node was fetched successfully but exposes no properties/variants
 *   (e.g. a component with no variant axes or component properties, or a plain
 *   frame). This is not an error — there is simply nothing to vary.
 * - `error`: the fetch failed (network / non-200), e.g. the token is missing a
 *   required scope (Code Connect: Write and File content: Read).
 */
export type ComponentPropertyDefinitionsResult =
  | { status: 'ok'; defs: Record<string, FigmaRestApi.ComponentPropertyDefinition> }
  | { status: 'empty' }
  | { status: 'error' }

/** A single node's schema plus its parent COMPONENT_SET id (set only for a variant child). */
type NodeSchemaResult =
  | {
      status: 'ok'
      defs: Record<string, FigmaRestApi.ComponentPropertyDefinition>
      componentSetId?: string
    }
  | { status: 'empty'; componentSetId?: string }
  | { status: 'error' }

/**
 * Fetch one node's property definitions from the REST `files/:key/nodes` endpoint.
 */
async function fetchNodeSchema(
  baseApiUrl: string,
  fileKey: string,
  nodeId: string,
  accessToken: string,
): Promise<NodeSchemaResult> {
  try {
    const nodesUrl = `${baseApiUrl}/files/${fileKey}/nodes?ids=${nodeId}`
    const resp = await request.get<{
      nodes: Record<
        string,
        {
          document?: {
            componentPropertyDefinitions?: Record<string, FigmaRestApi.ComponentPropertyDefinition>
          }
          // Per-node component metadata; a variant member carries its parent set id here.
          components?: Record<string, { componentSetId?: string }>
        }
      >
    }>(nodesUrl, { headers: getHeaders(accessToken) })
    if (resp.response.status !== 200) {
      logger.debug(`files/nodes returned ${resp.response.status} for ${nodeId}`)
      return { status: 'error' }
    }
    const node = resp.data.nodes?.[nodeId]
    const componentSetId = node?.components?.[nodeId]?.componentSetId || undefined
    const defs = node?.document?.componentPropertyDefinitions
    if (defs && Object.keys(defs).length > 0) return { status: 'ok', defs, componentSetId }
    logger.debug(`files/nodes returned no componentPropertyDefinitions for ${nodeId}`)
    return { status: 'empty', componentSetId }
  } catch (err) {
    const detail = isFetchError(err) ? `status ${err.response?.status}` : String(err)
    logger.debug(`files/nodes fetch failed for ${nodeId} (${detail})`)
    return { status: 'error' }
  }
}

/**
 * Fetch a component's property definitions from the REST `files/:key/nodes` endpoint.
 */
export async function fetchComponentPropertyDefinitions(
  baseApiUrl: string,
  fileKey: string,
  nodeId: string,
  accessToken: string,
): Promise<ComponentPropertyDefinitionsResult> {
  const node = await fetchNodeSchema(baseApiUrl, fileKey, nodeId, accessToken)
  if (node.status === 'error') return { status: 'error' }

  // Variant child → resolve to the parent COMPONENT_SET (whose schema carries the
  // variant axes). Fall back to the variant's own defs if the set can't be fetched.
  if (node.componentSetId) {
    const set = await fetchNodeSchema(baseApiUrl, fileKey, node.componentSetId, accessToken)
    if (set.status === 'ok') return { status: 'ok', defs: set.defs }
    logger.debug(
      `Component set ${node.componentSetId} for variant ${nodeId} had no usable schema ` +
        `(${set.status}); using the variant's own definitions`,
    )
  }

  return node.status === 'ok' ? { status: 'ok', defs: node.defs } : { status: 'empty' }
}

/** Case-insensitive lookup of a `ComponentPropertyType` from a `--props` prefix token. */
function parsePropertyTypePrefix(token: string): FigmaRestApi.ComponentPropertyType | undefined {
  const upper = token.trim().toUpperCase()
  return (Object.values(FigmaRestApi.ComponentPropertyType) as string[]).includes(upper)
    ? (upper as FigmaRestApi.ComponentPropertyType)
    : undefined
}

type ParsedPropertyPair = {
  name: string
  value: string
  type?: FigmaRestApi.ComponentPropertyType
}

/**
 * Parse a single `--props` argument into a name/value pair, with an optional
 * `TYPE:` prefix to disambiguate properties that share a name but differ in
 * type (e.g. a BOOLEAN and a TEXT property both named `textMsg`).
 * Example: --props Variant=Primary "Has Icon=true" "BOOLEAN:textMsg=false"
 *
 * The prefix is only recognized when the token before the first `:` matches a
 * known property type (case-insensitive); otherwise the whole name-part is kept
 * as the property name, so real names containing `:` are preserved.
 */
export function parsePropsArg(props: string[]): ParsedPropertyPair[] {
  return props
    .flatMap((arg) => arg.split(','))
    .map((pair) => pair.trim())
    .filter((pair) => pair.length > 0)
    .map((pair) => {
      const eq = pair.indexOf('=')
      const namePart = (eq === -1 ? pair : pair.slice(0, eq)).trim()
      const value = eq === -1 ? '' : pair.slice(eq + 1).trim()

      const colon = namePart.indexOf(':')
      if (colon !== -1) {
        const type = parsePropertyTypePrefix(namePart.slice(0, colon))
        if (type) {
          return { name: namePart.slice(colon + 1).trim(), value, type }
        }
      }
      return { name: namePart, value }
    })
}

/**
 * Filter templates to only those matching the requested node IDs.
 */
export function filterTemplatesForNodes(
  nodeIds: string[],
  allTemplates: CodeConnectJSON[],
): CodeConnectJSON[] {
  return allTemplates.filter((template) => {
    if (!template.figmaNode) return false
    const nodeIdMatch = template.figmaNode.match(/node-id=([^&\s]+)/)
    if (!nodeIdMatch?.[1]) return false
    const templateNodeId = nodeIdMatch[1].replace(/-/g, ':')
    return nodeIds.includes(templateNodeId)
  })
}

/**
 * Aliases for Code Connect labels that don't directly match a Prettier language name.
 */
const CC_LABEL_ALIASES: Record<string, string> = {
  react: 'typescript',
  code: 'typescript',
}

/**
 * Map from Code Connect language labels to Prettier parser names,
 * built lazily from Prettier's getSupportInfo() on first access.
 * Lazy to avoid triggering plugin loading at module import time.
 */
let _prettierParserMap: Record<string, string> | null = null

export function getPrettierParserMap(): Record<string, string> {
  if (_prettierParserMap) return _prettierParserMap

  const info = prettier.getSupportInfo() as {
    languages: Array<{ name: string; parsers?: string[] }>
  }
  _prettierParserMap = {}

  for (const lang of info.languages) {
    if (lang.parsers?.[0]) {
      _prettierParserMap[lang.name.toLowerCase()] = lang.parsers[0]
    }
  }

  for (const [alias, target] of Object.entries(CC_LABEL_ALIASES)) {
    if (_prettierParserMap[target]) {
      _prettierParserMap[alias] = _prettierParserMap[target]
    }
  }

  return _prettierParserMap
}

/**
 * Check if a snippet can be parsed by Prettier.
 * Returns true for languages without a Prettier parser (nothing to validate).
 */
export async function isPrettierParseable(snippet: string, language?: string): Promise<boolean> {
  const lang = language?.toLowerCase()
  const parser = lang ? getPrettierParserMap()[lang] : 'typescript'

  if (!parser) {
    return true
  }

  try {
    await prettier.format(snippet, { parser })
    return true
  } catch {
    return false
  }
}

/**
 * Format snippet with Prettier.
 * Returns the snippet unmodified for languages Prettier doesn't support.
 */
export async function formatSnippet(snippet: string, language?: string): Promise<string> {
  const lang = language?.toLowerCase()
  const parser = lang ? getPrettierParserMap()[lang] : 'typescript'

  if (!parser) {
    return snippet
  }

  try {
    let formatted = await prettier.format(snippet, {
      parser,
      semi: false,
      singleQuote: true,
      printWidth: 80,
      tabWidth: 2,
    })
    formatted = formatted.replace(/^;\s*/, '')
    return formatted
  } catch {
    logger.info(`Autoformatting couldn't be applied: language not supported or code is malformed`)
    return snippet
  }
}

/**
 * Display results with terminal colors
 */
const purple = chalk.ansi256(93)
const red = chalk.ansi256(196)
const gray = chalk.ansi256(243)
const yellow = chalk.ansi256(179)

export function displayResults(results: PreviewResult[]): void {
  console.log('')
  const successCount = results.filter((r) => r.success).length
  const errorCount = results.filter((r) => !r.success).length

  // A muted note when nested children rendered as placeholders (not an error).
  const printUnresolved = (result: PreviewResult) => {
    if (!result.unresolvedInstances?.length) return
    const names = result.unresolvedInstances.map((u) => u.name || u.guid).join(', ')
    console.log(
      `  ${yellow(`⚠ ${result.unresolvedInstances.length} nested instance(s) not Code Connected: ${names}`)}`,
    )
  }

  for (const result of results) {
    // When expanding property combinations, label the header with the specific combination.
    const combinationSuffix = result.propertyCombinationLabel
      ? ` ${gray(`— ${result.propertyCombinationLabel}`)}`
      : ''
    if (result.success && result.snippet) {
      const componentInfo = result.component ? ` ${gray(`→ ${result.component}`)}` : ''
      console.log(
        `${purple('●')} ${chalk.bold(result.filePath)}${componentInfo}${combinationSuffix}`,
      )
      console.log(`  ${gray(result.url)}`)
      console.log('')

      const indentedSnippet = result.snippet
        .trim()
        .split('\n')
        .map((line) => '  ' + line)
        .join('\n')
      console.log(indentedSnippet)
      printUnresolved(result)
      console.log('')
    } else {
      const componentInfo = result.component ? ` ${gray(`(${result.component})`)}` : ''
      console.log(`${red('✕')} ${chalk.bold(result.filePath)}${componentInfo}${combinationSuffix}`)
      console.log(`  ${gray(result.url)}`)
      console.log(`  ${red('Error:')} ${result.error}`)
      // One-line repair hint: the offending property and the real vocabulary.
      // (Transport errors carry no vocabulary — nothing to hint.)
      const available = result.errorDetails?.availableProperties?.map((p) => p.name).join(', ')
      const missingProperty = result.errorDetails?.missingProperty
      if (missingProperty && available) {
        console.log(
          `  ${gray(`property "${missingProperty}" not found — available: ${available}`)}`,
        )
      } else if (available) {
        console.log(`  ${gray(`available properties: ${available}`)}`)
      }
      printUnresolved(result)
      console.log('')
    }
  }

  const failed = errorCount > 0 ? red(`${errorCount} failed`) : gray(`${errorCount} failed`)
  console.log(`${chalk.bold('Summary:')} ${purple(`${successCount} succeeded`)}, ${failed}`)
}

// The server caps inbound request bodies at 5MB. The figmaDocs payload
// (one Code Connect template per requested component) dominates the body size,
// so for projects with many components we split into smaller chunks and send
// them in parallel rather than risking a 413.
const PREVIEW_CHUNK_SIZE = 50
// Bound the number of chunks in flight at once. Without this cap, large
// libraries (~1k+ components) trigger N parallel preview requests, which
// overwhelms upstream token validation and causes spurious 403 "Invalid
// token" responses for the chunks that queue up too long.
const PREVIEW_MAX_CONCURRENCY = 5
// Mirrors MAX_PROPERTY_COMBINATIONS_PER_REQUEST in pixie/code_connect_preview_handler.ts.
// `--all` caps enumeration here and warns rather than sending a request that fails wholesale.
const MAX_PROPERTY_COMBINATIONS = 500

export function parseMaxCombinationsArg(value: string | undefined): number {
  if (value === undefined) {
    return MAX_PROPERTY_COMBINATIONS
  }
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1) {
    exitWithError('--max-combinations must be a positive integer')
  }
  if (parsed > MAX_PROPERTY_COMBINATIONS) {
    exitWithError(`--max-combinations cannot exceed ${MAX_PROPERTY_COMBINATIONS}`)
  }
  return parsed
}

type PreviewResponseData = {
  status: number
  error: boolean
  meta: {
    results: Array<{
      nodeId: string
      nodeUrl: string
      snippet?: string
      language?: string
      component?: string
      error?: string
      propertyCombinationLabel?: string
      errorKind?: string
      unresolvedInstances?: Array<{ guid: string; name?: string; kind: 'instance' | 'slot' }>
    }>
  }
}

type ChunkOutcome = {
  chunkNodeIds: string[]
  response: Awaited<ReturnType<typeof request.post<PreviewResponseData>>> | null
  error: unknown
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size))
  }
  return chunks
}

/**
 * Split node IDs into request chunks that respect BOTH the node-count cap
 * (PREVIEW_CHUNK_SIZE) and, when rendering property combinations, the server's
 * per-request combination cap (MAX_PROPERTY_COMBINATIONS).
 *
 * The server sums combinations across every node in a request and rejects the
 * whole request if the total exceeds the cap, so bundling by node count alone
 * can push several individually-valid nodes over the limit and fail them all.
 * Each node is already truncated to <= MAX_PROPERTY_COMBINATIONS upstream, so a
 * single node always fits (worst case: one node per chunk).
 */
export function chunkNodeIdsForPreview(
  nodeIds: string[],
  propertyCombinationsByNodeId?: Record<string, PropertyCombination[]>,
): string[][] {
  if (!propertyCombinationsByNodeId) {
    return chunkArray(nodeIds, PREVIEW_CHUNK_SIZE)
  }

  const chunks: string[][] = []
  let current: string[] = []
  let currentCombinations = 0
  for (const nodeId of nodeIds) {
    const count = propertyCombinationsByNodeId[nodeId]?.length ?? 0
    // Close the current chunk before adding this node would breach either cap.
    if (
      current.length > 0 &&
      (current.length >= PREVIEW_CHUNK_SIZE ||
        currentCombinations + count > MAX_PROPERTY_COMBINATIONS)
    ) {
      chunks.push(current)
      current = []
      currentCombinations = 0
    }
    current.push(nodeId)
    currentCombinations += count
  }
  if (current.length > 0) chunks.push(current)
  return chunks
}

async function runInWaves<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  maxConcurrency: number,
): Promise<R[]> {
  const out: R[] = []
  for (let i = 0; i < items.length; i += maxConcurrency) {
    const wave = items.slice(i, i + maxConcurrency)
    const settled = await Promise.all(wave.map(fn))
    out.push(...settled)
  }
  return out
}

function sendPreviewChunk({
  chunkNodeIds,
  requiredTemplates,
  baseApiUrl,
  fileKey,
  accessToken,
  propertyCombinationsByNodeId,
}: {
  chunkNodeIds: string[]
  requiredTemplates: CodeConnectJSON[]
  baseApiUrl: string
  fileKey: string
  accessToken: string
  propertyCombinationsByNodeId?: Record<string, PropertyCombination[]>
}): Promise<ChunkOutcome> {
  const chunkTemplates = filterTemplatesForNodes(chunkNodeIds, requiredTemplates)
  // Only include property combinations for the node IDs in this chunk.
  let renderCombinations: Record<string, PropertyCombination[]> | undefined
  if (propertyCombinationsByNodeId) {
    renderCombinations = {}
    for (const nodeId of chunkNodeIds) {
      if (propertyCombinationsByNodeId[nodeId]) {
        renderCombinations[nodeId] = propertyCombinationsByNodeId[nodeId]
      }
    }
  }
  return request
    .post<PreviewResponseData>(
      `${baseApiUrl}/code_connect/preview_snippets?file_key=${fileKey}`,
      {
        nodeIds: chunkNodeIds,
        figmaDocs: { all: chunkTemplates },
        ...(renderCombinations && Object.keys(renderCombinations).length > 0
          ? { renderCombinations }
          : {}),
      },
      { headers: getHeaders(accessToken) },
    )
    .then((response) => ({ chunkNodeIds, response, error: null as unknown }))
    .catch((err: unknown) => ({ chunkNodeIds, response: null, error: err }))
}

/**
 * Parse the offending property name out of a "property not found" render error,
 * e.g. `PropertyNotFoundError: property 'Varient' not found` -> `Varient`.
 */
export function parseMissingProperty(error?: string): string | undefined {
  if (!error) return undefined
  const match =
    error.match(/propert(?:y|ies)[^'"`]*['"`]([^'"`]+)['"`]/i) ?? error.match(/['"`]([^'"`]+)['"`]/)
  return match?.[1]
}

/** Build `errorDetails` for a failed result. Undefined when there's no property context (not --all). */
function buildErrorDetails(
  error: string | undefined,
  errorKind: string | undefined,
  availableProperties: AvailableProperty[] | undefined,
): PreviewResult['errorDetails'] {
  // Transport failure: network/backend problem, not a bad property — carry only the kind.
  if (errorKind === 'transport') return { kind: 'transport' }
  if (!availableProperties) return undefined
  const details: NonNullable<PreviewResult['errorDetails']> = { availableProperties }
  if (errorKind) details.kind = errorKind
  const missingProperty = parseMissingProperty(error)
  if (missingProperty) details.missingProperty = missingProperty
  return details
}

export function chunkOutcomeToResults(
  outcome: ChunkOutcome,
  nodes: NodeToPreview[],
  fileKey: string,
  availablePropsByNodeId?: Record<string, AvailableProperty[]>,
): PreviewResult[] {
  const { chunkNodeIds, response, error } = outcome
  const results: PreviewResult[] = []

  if (error) {
    const errorMsg = isFetchError(error)
      ? error.data?.message || error.response.statusText
      : String(error)
    // 503 means the server-side killswitch is on — surface the server's
    // message directly without the per-file/per-node noise so the user
    // sees a single clear line during an incident.
    if (isFetchError(error) && error.response.status === 503) {
      exitWithError(errorMsg)
    } else {
      logger.error(`Failed to preview components in file ${fileKey}: ${errorMsg}`)
      for (const nodeId of chunkNodeIds) {
        for (const node of nodes.filter((n) => n.nodeId === nodeId)) {
          results.push({
            url: node.url,
            nodeId: node.nodeId,
            filePath: node.filePath,
            success: false,
            error: errorMsg,
            // Chunk-level failure is a server/network error, not a template problem.
            errorDetails: { kind: 'transport' },
          })
        }
      }
    }
    return results
  }

  if (response!.response.status === 200 && response!.data.meta?.results) {
    // Track match index per nodeId so duplicate node IDs get the correct file attribution.
    // The server returns results in the same order as the templates we sent. Each chunk's
    // nodeIds are disjoint (we dedupe before chunking), so per-chunk indexing is correct.
    // Property-combination results are expanded renders of one node, not one result per
    // matching template, so they should not consume this per-template index.
    const nodeMatchIndex: Record<string, number> = {}
    for (const result of response!.data.meta.results) {
      const idx = nodeMatchIndex[result.nodeId] ?? 0
      const matchingNodes = nodes.filter((n) => n.nodeId === result.nodeId)
      const node = result.propertyCombinationLabel
        ? matchingNodes[0]
        : matchingNodes[idx] || matchingNodes[0]
      if (!result.propertyCombinationLabel) {
        nodeMatchIndex[result.nodeId] = idx + 1
      }
      const error = result.error || (!result.snippet ? 'No snippet returned by server' : undefined)
      const success = !result.error && !!result.snippet
      results.push({
        url: node?.url || result.nodeUrl,
        nodeId: result.nodeId,
        filePath: node?.filePath || '',
        success,
        snippet: result.snippet,
        language: result.language,
        component: result.component,
        error,
        ...(result.propertyCombinationLabel
          ? { propertyCombinationLabel: result.propertyCombinationLabel }
          : {}),
        ...(result.unresolvedInstances?.length
          ? { unresolvedInstances: result.unresolvedInstances }
          : {}),
        ...(success
          ? {}
          : {
              errorDetails: buildErrorDetails(
                error,
                result.errorKind,
                availablePropsByNodeId?.[result.nodeId],
              ),
            }),
      })
    }
    return results
  }

  for (const nodeId of chunkNodeIds) {
    for (const node of nodes.filter((n) => n.nodeId === nodeId)) {
      const error = `API request failed with status ${response!.response.status}`
      results.push({
        url: node.url,
        nodeId: node.nodeId,
        filePath: node.filePath,
        success: false,
        error,
        // Non-2xx from the endpoint is a transport-level failure, not a template problem.
        errorDetails: { kind: 'transport' },
      })
    }
  }
  return results
}

async function previewFile({
  fileKey,
  nodes,
  baseApiUrl,
  accessToken,
  dir,
  allCodeConnectObjects,
  propertyCombinationsByNodeId,
  availablePropsByNodeId,
}: {
  fileKey: string
  nodes: NodeToPreview[]
  baseApiUrl: string
  accessToken: string
  dir: string
  allCodeConnectObjects: CodeConnectJSON[]
  propertyCombinationsByNodeId?: Record<string, PropertyCombination[]>
  availablePropsByNodeId?: Record<string, AvailableProperty[]>
}): Promise<PreviewResult[]> {
  const allNodeIds = nodes.map((n) => n.nodeId)
  // Deduplicate — multiple figma.connect() calls may share the same nodeId;
  // the individual templates are sent in figmaDocs and the server iterates per-template.
  const nodeIds = [...new Set(allNodeIds)]

  // Only send templates from the requested files — other files' templates
  // for the same nodeId exist on the server and shouldn't be rendered individually.
  const requestedFilePaths = new Set(nodes.map((n) => path.resolve(dir, n.filePath)))
  const requiredTemplates = filterTemplatesForNodes(allNodeIds, allCodeConnectObjects).filter((t) =>
    requestedFilePaths.has(path.resolve(t._codeConnectFilePath || '')),
  )

  const chunks = chunkNodeIdsForPreview(nodeIds, propertyCombinationsByNodeId)
  const outcomes = await runInWaves(
    chunks,
    (chunkNodeIds) =>
      sendPreviewChunk({
        chunkNodeIds,
        requiredTemplates,
        baseApiUrl,
        fileKey,
        accessToken,
        propertyCombinationsByNodeId,
      }),
    PREVIEW_MAX_CONCURRENCY,
  )

  return outcomes.flatMap((outcome) =>
    chunkOutcomeToResults(outcome, nodes, fileKey, availablePropsByNodeId),
  )
}

function collectAllLocalNodesToPreview(
  allCodeConnectObjects: CodeConnectJSON[],
  dir: string,
  cmd: BaseCommand,
): NodeToPreview[] {
  const nodesToCheck: NodeToPreview[] = []
  for (const doc of allCodeConnectObjects) {
    const parsed = parseFigmaNode(cmd.verbose, doc, true)
    if (parsed) {
      nodesToCheck.push({
        fileKey: parsed.fileKey,
        nodeId: parsed.nodeId,
        url: doc.figmaNode,
        filePath: path.relative(dir, doc._codeConnectFilePath || ''),
      })
    }
  }
  return nodesToCheck
}

function groupNodesByFileKey(nodes: NodeToPreview[]): NodesByFileKey {
  const nodesByFileKey: NodesByFileKey = {}
  for (const node of nodes) {
    nodesByFileKey[node.fileKey] ??= []
    nodesByFileKey[node.fileKey].push(node)
  }
  return nodesByFileKey
}

async function handleInspect({
  nodesByFileKey,
  configuredApiUrl,
  accessToken,
  outputFormat,
}: {
  nodesByFileKey: NodesByFileKey
  configuredApiUrl?: string
  accessToken: string
  outputFormat: string
}): Promise<void> {
  const items: PropertyListItem[] = []
  const seen = new Set<string>()
  for (const [fileKey, nodes] of Object.entries(nodesByFileKey)) {
    const baseApiUrl = getApiUrl(nodes[0].url, configuredApiUrl)
    for (const node of nodes) {
      const dedupeKey = `${node.filePath}::${node.nodeId}`
      if (seen.has(dedupeKey)) continue
      seen.add(dedupeKey)
      const result = await fetchComponentPropertyDefinitions(
        baseApiUrl,
        fileKey,
        node.nodeId,
        accessToken,
      )
      if (result.status === 'error') {
        logger.warn(`Couldn't fetch property definitions for node ${node.nodeId}`)
      } else if (result.status === 'empty') {
        logger.info(`Node ${node.nodeId} has no component properties or variants.`)
      }
      items.push({
        filePath: node.filePath,
        nodeId: node.nodeId,
        availableProperties: result.status === 'ok' ? toAvailableProperties(result.defs) : [],
      })
    }
  }

  if (outputFormat === 'json') {
    console.log(JSON.stringify(items, null, 2))
  } else {
    displayPropertyList(items)
  }
}

function validatePreviewOptions(cmd: PreviewCommand): void {
  if (cmd.all && cmd.props) {
    exitWithError('Cannot combine --props and --all; use one or the other')
  }

  if (cmd.maxCombinations !== undefined && !cmd.all) {
    exitWithError('--max-combinations can only be used with --all')
  }
}

async function buildPropertyPreviewInputs({
  enabled,
  baseApiUrl,
  fileKey,
  nodes,
  accessToken,
  propsPairs,
  maxCombinations,
}: {
  enabled: boolean
  baseApiUrl: string
  fileKey: string
  nodes: NodeToPreview[]
  accessToken: string
  propsPairs?: ParsedPropertyPair[]
  maxCombinations: number
}): Promise<{
  propertyCombinationsByNodeId?: Record<string, PropertyCombination[]>
  availablePropsByNodeId?: Record<string, AvailableProperty[]>
}> {
  if (!enabled) return {}

  const propertyCombinationsByNodeId: Record<string, PropertyCombination[]> = {}
  const availablePropsByNodeId: Record<string, AvailableProperty[]> = {}
  for (const nodeId of [...new Set(nodes.map((n) => n.nodeId))]) {
    const result = await fetchComponentPropertyDefinitions(baseApiUrl, fileKey, nodeId, accessToken)
    if (result.status === 'error') {
      logger.warn(
        `Couldn't fetch property definitions for node ${nodeId} (ensure your token has the ` +
          `Code Connect: Write and File content: Read scopes); rendering its default property combination only`,
      )
      continue
    }
    if (result.status === 'empty') {
      // Not an error: the component simply has no properties or variants to vary.
      if (propsPairs) {
        logger.warn(
          `Node ${nodeId} has no component properties or variants, so --props ` +
            `(${propsPairs.map((p) => p.name).join(', ')}) has no effect; rendering its only property combination.`,
        )
      } else {
        logger.info(
          `Node ${nodeId} has no component properties or variants to vary; rendering its only property combination.`,
        )
      }
      continue
    }

    const defs = result.defs
    if (propsPairs) {
      const { propertyCombination, availableProperties, unknown, invalid, ambiguous } =
        buildPropertyCombinationFromProps(defs, propsPairs)
      if (unknown.length > 0) {
        logger.warn(
          `Unknown propert${unknown.length > 1 ? 'ies' : 'y'} for node ${nodeId}: ${unknown.join(', ')}. ` +
            `Available: ${availableProperties.map((p) => p.name).join(', ')}`,
        )
      }
      for (const { name, value, options } of invalid) {
        logger.warn(
          `"${value}" is not a valid value for ${name} on node ${nodeId}. Options: ${options.join(', ')}`,
        )
      }
      for (const { name, types } of ambiguous) {
        logger.warn(
          `Property "${name}" on node ${nodeId} matches multiple types (${types.join(', ')}); ` +
            `prefix the value with a type to disambiguate, e.g. ${types[0]}:${name}=... . Skipping.`,
        )
      }
      availablePropsByNodeId[nodeId] = availableProperties
      propertyCombinationsByNodeId[nodeId] = [propertyCombination]
    } else {
      const { propertyCombinations, availableProperties, truncated } =
        enumeratePropertyCombinations(defs, {
          maxCombinations,
        })
      availablePropsByNodeId[nodeId] = availableProperties
      if (truncated) {
        logger.warn(
          `Node ${nodeId} has ${truncated.total} property combinations, exceeding the ${truncated.cap}-combination ` +
            `preview limit; rendering the first ${truncated.cap}. Use --props to preview a ` +
            `specific property combination.`,
        )
      }
      if (propertyCombinations.length > 0) {
        propertyCombinationsByNodeId[nodeId] = propertyCombinations
      }
    }
  }

  return { propertyCombinationsByNodeId, availablePropsByNodeId }
}

async function previewNodesForFile({
  fileKey,
  nodes,
  configuredApiUrl,
  accessToken,
  dir,
  allCodeConnectObjects,
  renderPropertyCombinations,
  propsPairs,
  maxCombinations,
}: {
  fileKey: string
  nodes: NodeToPreview[]
  configuredApiUrl?: string
  accessToken: string
  dir: string
  allCodeConnectObjects: CodeConnectJSON[]
  renderPropertyCombinations: boolean
  propsPairs?: ParsedPropertyPair[]
  maxCombinations: number
}): Promise<PreviewResult[]> {
  const baseApiUrl = getApiUrl(nodes[0].url, configuredApiUrl)
  const { propertyCombinationsByNodeId, availablePropsByNodeId } = await buildPropertyPreviewInputs(
    {
      enabled: renderPropertyCombinations,
      baseApiUrl,
      fileKey,
      nodes,
      accessToken,
      propsPairs,
      maxCombinations,
    },
  )

  return previewFile({
    fileKey,
    nodes,
    baseApiUrl,
    accessToken,
    dir,
    allCodeConnectObjects,
    propertyCombinationsByNodeId,
    availablePropsByNodeId,
  })
}

async function validateRenderedSnippets(results: PreviewResult[]): Promise<void> {
  for (const result of results) {
    if (result.success && result.snippet) {
      const prettierValid = await isPrettierParseable(result.snippet, result.language)
      if (!prettierValid) {
        // Prettier can parse this language but failed — mark as error
        result.success = false
        result.error = 'Snippet has syntax errors and may not be valid code'
      }
    }
  }
}

async function outputPreviewResults(results: PreviewResult[], outputFormat: string): Promise<void> {
  if (outputFormat === 'json') {
    console.log(JSON.stringify(results, null, 2))
    return
  }

  const formattedResults: PreviewResult[] = await Promise.all(
    results.map(async (result) => {
      if (result.success && result.snippet) {
        const formattedSnippet = await formatSnippet(result.snippet, result.language)
        return { ...result, snippet: formattedSnippet }
      }
      return result
    }),
  )
  displayResults(formattedResults)
}

/**
 * Handle the preview command
 */
export async function handlePreview(files: string[], cmd: PreviewCommand) {
  setupHandler(cmd)

  const dir = cmd.dir ?? process.cwd()
  const projectInfo = await getProjectInfo(dir, cmd.config)
  const accessToken = getAccessTokenOrExit(cmd)
  const outputFormat = cmd.output || 'table'
  const configuredApiUrl = cmd.apiUrl || projectInfo.config.apiUrl

  if (cmd.all && (!files || files.length === 0)) {
    exitWithError(
      '--all requires a specific component, e.g. `figma connect preview Button.figma.ts --all`',
    )
  }

  const allCodeConnectObjects = await getCodeConnectObjects(cmd, projectInfo, true)

  const nodesToCheck =
    files && files.length > 0
      ? await collectNodesToPreview(files, allCodeConnectObjects, dir, cmd)
      : collectAllLocalNodesToPreview(allCodeConnectObjects, dir, cmd)
  if (!files || files.length === 0) {
    logger.info('Previewing all local Code Connect files...')
  }

  if (nodesToCheck.length === 0) {
    exitWithError('No valid Code Connect files found to preview')
  }

  logger.info(`Previewing ${nodesToCheck.length} component(s)...`)
  const nodesByFileKey = groupNodesByFileKey(nodesToCheck)

  if (cmd.inspect) {
    await handleInspect({
      nodesByFileKey,
      configuredApiUrl,
      accessToken,
      outputFormat,
    })
    return
  }

  validatePreviewOptions(cmd)
  const maxCombinations = parseMaxCombinationsArg(cmd.maxCombinations)
  const propsPairs = cmd.props ? parsePropsArg(cmd.props) : undefined

  const results: PreviewResult[] = []
  for (const [fileKey, nodes] of Object.entries(nodesByFileKey)) {
    const fileResults = await previewNodesForFile({
      fileKey,
      nodes,
      configuredApiUrl,
      accessToken,
      dir,
      allCodeConnectObjects,
      renderPropertyCombinations: cmd.all || !!propsPairs,
      propsPairs,
      maxCombinations,
    })
    results.push(...fileResults)
  }

  await validateRenderedSnippets(results)
  await outputPreviewResults(results, outputFormat)

  if (results.every((r) => !r.success)) {
    process.exit(1)
  }
}

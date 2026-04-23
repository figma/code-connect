import fs from 'fs'
import path from 'path'
import * as prettier from 'prettier'
import { BaseCommand, getCodeConnectObjects, getAccessTokenOrExit, setupHandler } from './connect'
import { exitWithError, logger } from '../common/logging'
import { CodeConnectJSON } from '../connect/figma_connect'
import { parseFigmaNode } from '../connect/validation'
import { getProjectInfo } from '../connect/project'
import { getApiUrl, getHeaders } from '../connect/figma_rest_api'
import { request, isFetchError } from '../common/fetch'

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
}

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
export function displayResults(results: PreviewResult[]): void {
  console.log('')
  const successCount = results.filter((r) => r.success).length
  const errorCount = results.filter((r) => !r.success).length

  const purple = '\x1b[38;5;93m'
  const red = '\x1b[38;5;196m'
  const gray = '\x1b[38;5;243m'
  const reset = '\x1b[0m'
  const bold = '\x1b[1m'

  for (const result of results) {
    if (result.success && result.snippet) {
      const componentInfo = result.component ? ` ${gray}→ ${result.component}${reset}` : ''
      console.log(`${purple}●${reset} ${bold}${result.filePath}${reset}${componentInfo}`)
      console.log(`  ${gray}${result.url}${reset}`)
      console.log('')

      const indentedSnippet = result.snippet
        .trim()
        .split('\n')
        .map((line) => '  ' + line)
        .join('\n')
      console.log(indentedSnippet)
      console.log('')
    } else {
      const componentInfo = result.component ? ` ${gray}(${result.component})${reset}` : ''
      console.log(`${red}✕${reset} ${bold}${result.filePath}${reset}${componentInfo}`)
      console.log(`  ${gray}${result.url}${reset}`)
      console.log(`  ${red}Error:${reset} ${result.error}`)
      console.log('')
    }
  }

  console.log(
    `${bold}Summary:${reset} ${purple}${successCount} succeeded${reset}, ${errorCount > 0 ? `${red}${errorCount} failed${reset}` : `${gray}${errorCount} failed${reset}`}`,
  )
}

/**
 * Handle the preview command
 */
export async function handlePreview(files: string[], cmd: BaseCommand & { output?: string }) {
  setupHandler(cmd)

  const dir = cmd.dir ?? process.cwd()
  const projectInfo = await getProjectInfo(dir, cmd.config)
  const accessToken = getAccessTokenOrExit(cmd)
  const outputFormat = cmd.output || 'table'

  const allCodeConnectObjects = await getCodeConnectObjects(cmd, projectInfo, true)

  let nodesToCheck: NodeToPreview[]

  if (files && files.length > 0) {
    nodesToCheck = await collectNodesToPreview(files, allCodeConnectObjects, dir, cmd)
  } else {
    logger.info('Previewing all local Code Connect files...')
    nodesToCheck = []
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
  }

  if (nodesToCheck.length === 0) {
    exitWithError('No valid Code Connect files found to preview')
  }

  logger.info(`Previewing ${nodesToCheck.length} component(s)...`)

  // Group nodes by fileKey for batching
  const nodesByFileKey: Record<string, NodeToPreview[]> = {}
  for (const node of nodesToCheck) {
    if (!nodesByFileKey[node.fileKey]) {
      nodesByFileKey[node.fileKey] = []
    }
    nodesByFileKey[node.fileKey].push(node)
  }

  const results: PreviewResult[] = []

  for (const [fileKey, nodes] of Object.entries(nodesByFileKey)) {
    const baseApiUrl = getApiUrl(nodes[0].url, cmd.apiUrl || projectInfo.config.apiUrl)
    const allNodeIds = nodes.map((n) => n.nodeId)
    // Deduplicate — multiple figma.connect() calls may share the same nodeId;
    // the individual templates are sent in figmaDocs and the server iterates per-template.
    const nodeIds = [...new Set(allNodeIds)]

    // Only send templates from the requested files — other files' templates
    // for the same nodeId exist on the server and shouldn't be rendered individually.
    const requestedFilePaths = new Set(nodes.map((n) => path.resolve(dir, n.filePath)))
    const requiredTemplates = filterTemplatesForNodes(allNodeIds, allCodeConnectObjects).filter(
      (t) => requestedFilePaths.has(path.resolve(t._codeConnectFilePath || '')),
    )
    const figmaDocs: Record<string, any[]> = { all: requiredTemplates }

    try {
      const response = await request.post<{
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
          }>
        }
      }>(
        `${baseApiUrl}/code_connect/preview_snippets?file_key=${fileKey}`,
        { nodeIds, figmaDocs },
        { headers: getHeaders(accessToken) },
      )

      if (response.response.status === 200 && response.data.meta?.results) {
        // Track match index per nodeId so duplicate node IDs get the correct file attribution.
        // The server returns results in the same order as the templates we sent.
        const nodeMatchIndex: Record<string, number> = {}

        for (const result of response.data.meta.results) {
          const idx = nodeMatchIndex[result.nodeId] ?? 0
          const matchingNodes = nodes.filter((n) => n.nodeId === result.nodeId)
          const node = matchingNodes[idx] || matchingNodes[0]
          nodeMatchIndex[result.nodeId] = idx + 1

          results.push({
            url: node?.url || result.nodeUrl,
            nodeId: result.nodeId,
            filePath: node?.filePath || '',
            success: !result.error && !!result.snippet,
            snippet: result.snippet,
            language: result.language,
            component: result.component,
            error: result.error || (!result.snippet ? 'No snippet returned by server' : undefined),
          })
        }
      } else {
        for (const node of nodes) {
          results.push({
            url: node.url,
            nodeId: node.nodeId,
            filePath: node.filePath,
            success: false,
            error: `API request failed with status ${response.response.status}`,
          })
        }
      }
    } catch (err) {
      const errorMsg = isFetchError(err)
        ? err.data?.message || err.response.statusText
        : String(err)
      logger.error(`Failed to preview components in file ${fileKey}: ${errorMsg}`)
      for (const node of nodes) {
        results.push({
          url: node.url,
          nodeId: node.nodeId,
          filePath: node.filePath,
          success: false,
          error: errorMsg,
        })
      }
    }
  }

  // Validate snippet syntax
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

  if (outputFormat === 'json') {
    console.log(JSON.stringify(results, null, 2))
  } else {
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

  if (results.every((r) => !r.success)) {
    process.exit(1)
  }
}

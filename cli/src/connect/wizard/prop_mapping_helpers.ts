import fs from 'fs'
import path from 'path'
import { BaseCommand } from '../../commands/connect'
import { logger } from '../../common/logging'
import { ComponentTypeSignature } from '../../react/parser'
import { FigmaRestApi } from '../figma_rest_api'
import { ProjectInfo } from '../project'
import { parseFilepathExport } from './helpers'
import { MatchableName, buildMatchableNamesMap, generatePropMapping } from './prop_mapping'
import { extractSignature } from './signature_extraction'
import { PropMapping } from '../parser_executable_types'
import { EmbeddingsResponse, fetchEmbeddings } from './embeddings'
import { isFetchError } from '../../common/fetch'

export type MatchableNamesMap = Record<string, MatchableName[]>

export type PropMappingData = {
  [filepathExport: string]: {
    signature: ComponentTypeSignature
    matchableNamesMap: MatchableNamesMap
    componentPropertyDefinitions: FigmaRestApi.Component['componentPropertyDefinitions']
  }
}

/**
 * Preprocess signatures and matchable names for all components
 */
export function getPropMappingData({
  filepathExportsToComponents,
  projectInfo,
  cmd,
}: {
  filepathExportsToComponents: Record<string, FigmaRestApi.Component>
  projectInfo: ProjectInfo
  cmd: BaseCommand
}) {
  const propMappingData: PropMappingData = {}

  for (const [filepathExport, { componentPropertyDefinitions }] of Object.entries(
    filepathExportsToComponents,
  )) {
    const { filepath, exportName } = parseFilepathExport(filepathExport)

    if (projectInfo.config.parser === 'react' && filepath && exportName) {
      try {
        const signature = extractSignature({
          nameToFind: exportName,
          sourceFilePath: filepath,
        })
        if (cmd.verbose && Object.keys(signature).length === 0) {
          logger.warn(`No TS signature found for "${exportName}" in ${filepath}`)
        }
        propMappingData[filepathExport] = {
          signature,
          componentPropertyDefinitions,
          matchableNamesMap: buildMatchableNamesMap(componentPropertyDefinitions),
        }
      } catch (e) {
        if (cmd.verbose) {
          logger.warn(`Could not extract signature for "${exportName}" in ${filepath}`)
        }
      }
    }
  }

  return propMappingData
}

export function getUniqueMatchableNames(propMappingData: PropMappingData) {
  const allNames = Object.values(propMappingData).flatMap((d) => [
    ...Object.keys(d.signature),
    ...Object.keys(d.matchableNamesMap),
  ])
  return Array.from(new Set(allNames))
}

export type PropMatchResult = { item: string; score: number }

export type ComponentMatchResults = {
  [propName: string]: PropMatchResult[]
}

type AllMatchResults = {
  [filepathExport: string]: ComponentMatchResults
}

type MatchableNameEmbeddings = {
  [matchableName: string]: number[]
}

function cosineSimilarity(a: number[], b: number[]) {
  const dot_product = a.reduce((acc, val, i) => acc + val * b[i], 0)
  const magnitude_a = Math.sqrt(a.reduce((acc, val) => acc + val * val, 0))
  const magnitude_b = Math.sqrt(b.reduce((acc, val) => acc + val * val, 0))
  return dot_product / (magnitude_a * magnitude_b)
}

export function buildAllEmbeddingsMatchResults(
  propMappingData: PropMappingData,
  matchableNameEmbeddings: MatchableNameEmbeddings,
) {
  const allMatchResults: AllMatchResults = {}

  Object.entries(propMappingData).forEach(([filepathExport, { signature, matchableNamesMap }]) => {
    allMatchResults[filepathExport] = {}
    Object.keys(signature).forEach((propName) => {
      allMatchResults[filepathExport][propName] = Object.keys(matchableNamesMap)
        .map((item) => ({
          item,
          score: cosineSimilarity(matchableNameEmbeddings[propName], matchableNameEmbeddings[item]),
        }))
        .sort((a, b) => b.score - a.score)
    })
  })

  return allMatchResults
}

async function getMockEmbeddingsResponse(uniqueMatchableNames: string[], mockResponseName: string) {
  /**
   * Refetch and write local mock responses.
   * This should be done whenever any upstream changes are made to e.g. TS signature extraction
   */
  const updateMockFiles = false

  // Return mock response or update local mocks
  const mockResponsePath =
    mockResponseName &&
    path.join(
      __dirname,
      `__test__/prop_mapping/test_cases/embeddings_responses/${mockResponseName}.json`,
    )
  if (updateMockFiles) {
    if (!process.env.FIGMA_ACCESS_TOKEN) {
      throw new Error('process.env.FIGMA_ACCESS_TOKEN required to fetch embeddings')
    }
    if (!process.env.FILE_URL) {
      throw new Error(
        "process.env.FILE_URL required to fetch embeddings (note: contents of file don't matter)",
      )
    }
    const res = await fetchEmbeddings({
      uniqueMatchableNames,
      accessToken: process.env.FIGMA_ACCESS_TOKEN,
      figmaUrl: process.env.FILE_URL,
    })
    fs.writeFileSync(mockResponsePath, JSON.stringify(res))
    return res
  } else {
    return JSON.parse(fs.readFileSync(mockResponsePath, 'utf-8')) as EmbeddingsResponse
  }
}

async function getEmbeddingsMatchResults({
  propMappingData,
  accessToken,
  figmaUrl,
  mockResponseName,
}: {
  propMappingData: PropMappingData
  accessToken: string
  figmaUrl: string
  mockResponseName?: string
}) {
  const uniqueMatchableNames = getUniqueMatchableNames(propMappingData)

  const res = mockResponseName
    ? await getMockEmbeddingsResponse(uniqueMatchableNames, mockResponseName)
    : await fetchEmbeddings({ uniqueMatchableNames, accessToken, figmaUrl })

  const matchableNamesEmbeddings: MatchableNameEmbeddings = {}

  res?.meta.embeddings.forEach((embedding: number[], index: number) => {
    matchableNamesEmbeddings[uniqueMatchableNames[index]] = embedding
  })
  return buildAllEmbeddingsMatchResults(propMappingData, matchableNamesEmbeddings)
}

export async function generateAllPropsMappings({
  propMappingData,
  accessToken,
  figmaUrl,
  useAi,
  mockResponseName,
}: {
  propMappingData: PropMappingData
  accessToken: string
  figmaUrl: string
  useAi: boolean
  mockResponseName?: string
}) {
  let allMatchResults: AllMatchResults = {}

  if (useAi) {
    try {
      allMatchResults = await getEmbeddingsMatchResults({
        propMappingData,
        accessToken,
        figmaUrl,
        mockResponseName,
      })
    } catch (e) {
      if (isFetchError(e)) {
        logger.error(`Failed to fetch embeddings: ${e.data?.message || e.response?.status}`)
      } else {
        logger.error(`Failed to compute embeddings: ${e}`)
      }
      logger.info('Falling back to using fuzzy matching')
    }
  }

  const propMappings: { [filepathExport: string]: PropMapping } = {}

  Object.entries(propMappingData).forEach(
    ([filepathExport, { signature, componentPropertyDefinitions, matchableNamesMap }]) => {
      propMappings[filepathExport] = generatePropMapping({
        matchableNamesMap,
        componentPropertyDefinitions,
        signature,
        componentMatchResults: allMatchResults[filepathExport],
      })
    },
  )

  return propMappings
}

/**
 * This is the top level function that takes a map of filepathExports to components and generates prop mappings.
 * It does the following:
 *
 * 1. For each component we want to match, extract their TS signature and all figma properties
 * 2. Make an array of all strings we want embeddings for (react props, figma properties, variant values)
 * 3. Call embeddings endpoint with above and create a map of names => embeddings
 * 4. For each component, build a map of code props to an list of matchable names + scores, sorted by their calculated embedding distance to the code prop
 * 5. Finally, pass those name matches and component data to the prop mapping algorithm to generate the mapping
 */
export async function extractDataAndGenerateAllPropsMappings({
  filepathExportsToComponents,
  projectInfo,
  cmd,
  figmaUrl,
  accessToken,
  useAi,
}: {
  filepathExportsToComponents: Record<string, FigmaRestApi.Component>
  projectInfo: ProjectInfo
  cmd: BaseCommand
  figmaUrl: string
  accessToken: string
  useAi: boolean
}) {
  const propMappingData = getPropMappingData({
    filepathExportsToComponents,
    projectInfo,
    cmd,
  })
  return {
    propMappingData,
    propMappings: await generateAllPropsMappings({
      propMappingData,
      accessToken,
      figmaUrl,
      useAi,
    }),
  }
}

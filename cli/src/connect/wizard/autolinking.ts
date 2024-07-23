import { MatchData, Searcher } from 'fast-fuzzy'
import { FigmaRestApi } from '../figma_rest_api'
import path from 'path'

const MINIMUM_MATCH_THRESHOLD = 0.8

/**
 * Autolinks components/paths based on fuzzy matching of name and writes mappings to linkedNodeIdsToPaths.
 *
 * Matching is done by fast-fuzzy
 */
export function autoLinkComponents({
  unconnectedComponents,
  linkedNodeIdsToPaths,
  componentPaths,
}: {
  unconnectedComponents: FigmaRestApi.Component[]
  linkedNodeIdsToPaths: Record<string, string>
  componentPaths: string[]
}) {
  const pathMatchScores: Record<string, { nodeId: string; score: number }> = {}
  /**
   * fast-fuzzy finds best match in filenames for a given component - this function
   * allows us to replace that link if a closer match is found
   */
  function isBestMatchForPath(match: MatchData<string>) {
    return !pathMatchScores[match.item] || match.score > pathMatchScores[match.item].score
  }

  const matchableFilenameToPathMap = componentPaths.reduce(
    (acc, componentPath) => {
      const { name } = path.parse(componentPath)
      const matchableName = name
      acc[matchableName] = componentPath
      return acc
    },
    {} as Record<string, string>,
  )

  const searchSpace = Object.keys(matchableFilenameToPathMap)
  const searcher = new Searcher(searchSpace)

  unconnectedComponents.forEach((component) => {
    const matchableName = component.name
    const results = searcher.search(matchableName, { returnMatchData: true })
    const bestMatch = results[0]
    const filepath = bestMatch?.item
    if (
      bestMatch &&
      bestMatch.score > MINIMUM_MATCH_THRESHOLD &&
      filepath in matchableFilenameToPathMap &&
      isBestMatchForPath(bestMatch)
    ) {
      linkedNodeIdsToPaths[component.id] = matchableFilenameToPathMap[bestMatch.item]
      pathMatchScores[bestMatch.item] = { nodeId: component.id, score: bestMatch.score }
    }
  })
}

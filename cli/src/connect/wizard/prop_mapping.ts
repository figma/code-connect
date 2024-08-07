import ts from 'typescript'
import { ReactProjectInfo } from '../project'
import { ComponentTypeSignature, extractComponentTypeSignature } from '../../react/parser'
import { FigmaRestApi } from '../figma_rest_api'
import { PropMapping, SupportedMappingType } from '../parser_executable_types'
import { MatchData, Searcher } from 'fast-fuzzy'

const PROP_MINIMUM_MATCH_THRESHOLD = 0.8

export function extractSignature({
  nameToFind,
  sourceFilePath,
  projectInfo,
}: {
  nameToFind: string
  sourceFilePath: string
  projectInfo: ReactProjectInfo
}) {
  const { tsProgram } = projectInfo

  const checker = tsProgram.getTypeChecker()

  // Get source file
  const sourceFile = tsProgram.getSourceFile(sourceFilePath)
  if (!sourceFile) {
    throw new Error(`Could not find source for file: ${sourceFilePath}`)
  }

  for (const statement of sourceFile.statements) {
    if (!(ts.isFunctionDeclaration(statement) || ts.isVariableStatement(statement))) {
      continue
    }

    if (
      !(
        statement.modifiers &&
        statement.modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
      )
    ) {
      continue
    }

    const name = ts.isFunctionDeclaration(statement)
      ? statement.name?.text
      : statement.declarationList.declarations?.[0].name.getText(sourceFile)

    if (
      name === nameToFind ||
      (nameToFind === 'default' &&
        statement.modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword))
    ) {
      const symbol = ts.isFunctionDeclaration(statement)
        ? statement.name && checker.getSymbolAtLocation(statement.name)
        : checker.getSymbolAtLocation(statement.declarationList.declarations[0].name)
      if (!symbol) {
        throw new Error(`Could not find symbol for ${name}`)
      }

      const signature = extractComponentTypeSignature(symbol, checker, sourceFile)
      if (!signature) {
        throw new Error(`Could not find signature for ${name}`)
      }

      return signature
    }
  }

  throw new Error('No function or variable signatures found')
}

function getComponentPropertyTypeFromSignature(tsString: string): SupportedMappingType | null {
  if (tsString === 'string') {
    return FigmaRestApi.ComponentPropertyType.Text
  }

  if (tsString === 'false | true') {
    return FigmaRestApi.ComponentPropertyType.Boolean
  }

  return null
}

type PropMapMatchResult = {
  codePropName: string
  figmaPropName: string
  figmaPropType: SupportedMappingType
  score: number
}

const DELIMITERS_REGEX = /[\s-_]/g
function getMatchableStr(str: string) {
  return str.replace(DELIMITERS_REGEX, '').toUpperCase()
}

export function generatePropMapping({
  exportName,
  filepath,
  projectInfo,
  component,
}: {
  exportName: string
  filepath: string
  projectInfo: ReactProjectInfo
  component: FigmaRestApi.Component
}): PropMapping {
  const signature = extractSignature({
    nameToFind: exportName,
    sourceFilePath: filepath,
    projectInfo,
  })

  const matchableCodeProps = Object.keys(signature).reduce((acc, key) => {
    acc[getMatchableStr(key)] = key
    return acc
  }, {} as ComponentTypeSignature)

  const matchedPropScores: Record<string, PropMapMatchResult> = {}

  function isBestMatchForProp(match: MatchData<string>) {
    return !matchedPropScores[match.item] || match.score > matchedPropScores[match.item].score
  }

  const searchSpace = Object.keys(matchableCodeProps)
  const searcher = new Searcher(searchSpace)

  Object.entries(component.componentPropertyDefinitions).forEach(
    ([propertyName, componentPropertyDefinition]) => {
      const results = searcher.search(getMatchableStr(propertyName), { returnMatchData: true })
      const bestMatch = results[0]
      const matchingCodeProp = matchableCodeProps[bestMatch?.item]

      if (
        bestMatch &&
        bestMatch.score > PROP_MINIMUM_MATCH_THRESHOLD &&
        getComponentPropertyTypeFromSignature(signature[matchingCodeProp]) ===
          componentPropertyDefinition.type &&
        isBestMatchForProp(bestMatch)
      ) {
        matchedPropScores[bestMatch.item] = {
          codePropName: matchingCodeProp,
          figmaPropName: propertyName,
          figmaPropType: componentPropertyDefinition.type,
          score: bestMatch.score,
        }
      }
    },
  )
  return Object.entries(matchedPropScores).reduce(
    (acc, [_, { codePropName, figmaPropName, figmaPropType }]) => {
      acc[figmaPropName] = {
        codePropName,
        mapping: figmaPropType,
      }
      return acc
    },
    {} as PropMapping,
  )
}

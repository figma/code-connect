import fs from 'fs'
import path from 'path'
import basic from './basic'
import { buildMatchableNamesMap } from '../../prop_mapping'
import { Intrinsic } from '../../../intrinsics'
import chalk from 'chalk'
import { PropMappingData, generateAllPropsMappings } from '../../prop_mapping_helpers'

const PROP_MAPPING_TEST_SUITES = [
  basic,
]

// Order important - worst to best
enum PropResultType {
  FalsePositive,
  Miss,
  PartiallyCorrect,
  Correct,
}

type ComponentResult = {
  componentName: string
  results: PropResultType[]
}

type ResultTotals = {
  totalMappings: number
  correct: number
  partiallyCorrect: number
  falsePositives: number
}

export type BenchmarkingSuiteResult = {
  name: string
  results: ComponentResult[]
}

function areIntrinsicsEqual(a: Intrinsic, b: Intrinsic) {
  function replacer(key: string, value: boolean | string | string[] | Record<string, any>) {
    // TODO is order of children([]) significant?
    if (Array.isArray(value)) {
      return value.sort()
    }
    if (value && typeof value === 'object') {
      return Object.keys(value)
        .sort()
        .reduce(
          (acc, key) => {
            acc[key] = value[key]
            return acc
          },
          {} as Record<string, any>,
        )
    }
    return value
  }

  return JSON.stringify(a, replacer) === JSON.stringify(b, replacer)
}

function isASubsetOf(a: any, b: any): boolean {
  if (a === undefined) {
    return true
  }
  // TODO is order of children([]) significant?
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.every((value) => b.includes(value))
  }
  if (a && typeof a === 'object' && b && typeof b === 'object') {
    return Object.keys(a).every((subKey) => isASubsetOf(a[subKey], b[subKey]))
  }
  return a === b
}

async function getPropMappingBenchmarkingResults(
  printDiffSinceLastRun = false,
  prevResults?: BenchmarkingSuiteResult[],
): Promise<BenchmarkingSuiteResult[]> {
  /**
   * For each suite of components, get the total number of props that have a mapping
   * in the test data, as well as the count of mappings we've correctly generated.
   * We then divide correct / total to get the overall success rate
   */
  const results: BenchmarkingSuiteResult[] = []
  for (const { name, testCases } of PROP_MAPPING_TEST_SUITES) {
    const propMappingData: PropMappingData = {}

    testCases.forEach((testCase, index) => {
      propMappingData[`${index}`] = {
        componentPropertyDefinitions: testCase.componentPropertyDefinitions,
        signature: testCase.signature,
        matchableNamesMap: buildMatchableNamesMap(testCase.componentPropertyDefinitions),
      }
    })

    const propMappings = await generateAllPropsMappings({
      propMappingData,
      accessToken: '123',
      figmaUrl: 'https://www.figma.com/file/123',
      mockResponseName: name,
      useAi: true,
    })

    const suiteResults = testCases.reduce(
      (suiteResultsAcc, testCase, caseIndex) => {
        const componentResults: PropResultType[] = []
        const actualResult = propMappings[`${caseIndex}`]

        // iterate expected individual prop mappings for current component
        Object.keys(testCase.perfectResult).forEach((prop, propIndex) => {
          let propResult = PropResultType.Miss
          if (prop in actualResult) {
            if (areIntrinsicsEqual(actualResult[prop], testCase.perfectResult[prop])) {
              propResult = PropResultType.Correct
            } else if (isASubsetOf(actualResult[prop], testCase.perfectResult[prop])) {
              // TODO would be good if this also reflected
              propResult = PropResultType.PartiallyCorrect
            } else {
              propResult = PropResultType.FalsePositive
            }
          }
          if (printDiffSinceLastRun && prevResults) {
            const prevPropResult = prevResults.find(
              (prevSuite) => prevSuite.name === suiteResultsAcc.name,
            )?.results[caseIndex]?.results[propIndex]
            if (propResult !== prevPropResult) {
              const text =
                chalk.bold(`${PropResultType[prevPropResult!]} -> ${PropResultType[propResult]}`) +
                ` ${suiteResultsAcc.name}~${testCase.exportName}.${prop}` +
                (prop in actualResult
                  ? `\nResult: ${JSON.stringify(actualResult[prop], null, 2)}`
                  : '')
              if (propResult > prevPropResult!) {
                console.log(chalk.green(text))
              } else {
                console.log(chalk.red(text))
              }
            }
          }
          componentResults.push(propResult)
        })

        suiteResultsAcc.results.push({
          componentName: testCase.exportName,
          results: componentResults,
        })

        return suiteResultsAcc
      },
      {
        name,
        results: [],
      } as BenchmarkingSuiteResult,
    )

    results.push(suiteResults)
  }

  return results
}

export async function runPropMappingBenchmarking() {
  const prevResults = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'prop_mapping_benchmarking_snapshot.json'), 'utf8'),
  ) as BenchmarkingSuiteResult[]

  const results = await getPropMappingBenchmarkingResults(true, prevResults)

  const hasChanged = JSON.stringify(results) !== JSON.stringify(prevResults)

  return { results, prevResults, hasChanged }
}

function getSuiteTotals(suiteResult: BenchmarkingSuiteResult) {
  const propResults = suiteResult.results.flatMap((r) => r.results)
  return propResults.reduce(
    (acc, propResult) => {
      if (propResult === PropResultType.Correct) {
        acc.correct++
      } else if (propResult === PropResultType.PartiallyCorrect) {
        acc.partiallyCorrect++
      } else if (propResult === PropResultType.FalsePositive) {
        acc.falsePositives++
      }
      acc.totalMappings++
      return acc
    },
    {
      totalMappings: 0,
      correct: 0,
      partiallyCorrect: 0,
      falsePositives: 0,
    } as ResultTotals,
  )
}

export function prettyPrintBenchmarkingResults(
  suiteResultsWithoutTotal: BenchmarkingSuiteResult[],
  prevSuiteResultsWithoutTotal: BenchmarkingSuiteResult[],
) {
  const prettyResults: Record<string, Record<string, string | number>> = {}

  const addTotals = (allResults: BenchmarkingSuiteResult[]) => [
    ...allResults,
    {
      name: 'TOTAL',
      results: allResults.flatMap((r) => r.results),
    },
  ]

  const suiteResults = addTotals(suiteResultsWithoutTotal)
  const prevSuiteResults = addTotals(prevSuiteResultsWithoutTotal)

  suiteResults.forEach((suiteResult, index) => {
    const prevTotals = getSuiteTotals(prevSuiteResults[index])
    const currenttotals = getSuiteTotals(suiteResult)

    const printDiff = (print: (totals: ResultTotals) => string | number) => {
      const prev = print(prevTotals)
      const current = print(currenttotals)
      return current === prev ? current : `${prev} -> ${current}`
    }

    prettyResults[suiteResult.name] = {
      'Total Mappings': printDiff((totals) => totals.totalMappings),
      Correct: printDiff(
        (totals) =>
          `${totals.correct} (${((totals.correct / totals.totalMappings) * 100).toFixed(1)}%)`,
      ),
      'Partially correct': printDiff(
        (totals) =>
          `${totals.partiallyCorrect} (${((totals.partiallyCorrect / totals.totalMappings) * 100).toFixed(1)}%)`,
      ),
      'False positives': printDiff(
        (totals) =>
          `${totals.falsePositives} (${((totals.falsePositives / totals.totalMappings) * 100).toFixed(1)}%)`,
      ),
    }
  })

  console.table(prettyResults)
}

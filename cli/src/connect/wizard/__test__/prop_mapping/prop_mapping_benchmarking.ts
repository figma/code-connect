import fs from 'fs'
import * as prettier from 'prettier'
import path from 'path'
import {
  BenchmarkingSuiteResult,
  prettyPrintBenchmarkingResults,
  runPropMappingBenchmarking,
} from './benchmarking_helpers'

async function writeBenchmarkingSnapshot(results: BenchmarkingSuiteResult[]) {
  const mockDocPath = path.join(__dirname, 'prop_mapping_benchmarking_snapshot.json')

  const formatted = await prettier.format(JSON.stringify(results), {
    parser: 'json',
    semi: false,
    trailingComma: 'all',
  })

  fs.writeFileSync(mockDocPath, formatted)
}

async function runBenchmarking() {
  const { results, prevResults } = await runPropMappingBenchmarking()
  prettyPrintBenchmarkingResults(results, prevResults)
  await writeBenchmarkingSnapshot(results)
}

runBenchmarking()

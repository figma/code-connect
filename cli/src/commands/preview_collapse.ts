import type { PreviewResult } from './preview_utils'

/**
 * Collapse property combinations that produced identical output into one result
 * each. Backs the `--unique` preview option.
 */
export function collapsePreviewResults(results: PreviewResult[]): PreviewResult[] {
  const groups = new Map<string, PreviewResult>()
  const order: string[] = []
  for (const result of results) {
    const output = result.success ? `s:${result.snippet ?? ''}` : `e:${result.error ?? ''}`
    const key = JSON.stringify([
      result.filePath,
      result.batchTemplateFilePath,
      result.url,
      result.nodeId,
      output,
    ])
    const existing = groups.get(key)
    if (!existing) {
      const rep: PreviewResult = { ...result, propertyCombinationCount: 1 }
      rep.propertyCombinationLabels = result.propertyCombinationLabel
        ? [result.propertyCombinationLabel]
        : []
      groups.set(key, rep)
      order.push(key)
    } else {
      existing.propertyCombinationCount = (existing.propertyCombinationCount ?? 1) + 1
      if (result.propertyCombinationLabel)
        (existing.propertyCombinationLabels ??= []).push(result.propertyCombinationLabel)
    }
  }
  return order.map((key) => groups.get(key)!)
}

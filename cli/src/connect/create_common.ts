import path from 'path'

export function getOutFileName({
  outFile,
  outDir,
  sourceFilename,
  extension,
}: {
  outFile: string | undefined
  outDir: string
  sourceFilename: string
  extension: string
}): string {
  if (outFile) {
    return outFile
  }

  const baseName = `${sourceFilename}.figma.${extension}`

  if (outDir) {
    return path.join(outDir, baseName)
  }

  return path.join(process.env.INIT_CWD ?? process.cwd(), baseName)
}

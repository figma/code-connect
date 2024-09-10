import ts from 'typescript'
import { ReactProjectInfo } from '../project'
import { extractComponentTypeSignature } from '../../react/parser'

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

    if (!statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) {
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

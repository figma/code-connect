import fs from 'fs'
import os from 'os'
import path from 'path'
import ts from 'typescript'
import { createTemplateCodeConnect } from '../create_template'
import type { FigmaConnectionComponent } from '../parser_executable_types'

function generate(
  componentPropertyDefinitions: FigmaConnectionComponent['componentPropertyDefinitions'],
): string {
  const destinationDir = fs.mkdtempSync(path.join(os.tmpdir(), 'create-template-'))
  try {
    const filePath = createTemplateCodeConnect({
      component: {
        figmaNodeUrl: 'https://www.figma.com/file/1234abcd/Test-File?node-id=1-39',
        id: '1:39',
        name: 'Button',
        type: 'COMPONENT_SET',
        componentPropertyDefinitions,
      },
      normalizedName: 'Button',
      destinationDir,
      destinationFile: undefined,
    })
    return fs.readFileSync(filePath, 'utf-8')
  } finally {
    fs.rmSync(destinationDir, { recursive: true, force: true })
  }
}

function topLevelStatementKinds(generated: string): ts.SyntaxKind[] {
  const { diagnostics = [] } = ts.transpileModule(generated, {
    compilerOptions: { target: ts.ScriptTarget.Latest },
    fileName: 'generated.figma.ts',
    reportDiagnostics: true,
  })
  expect(diagnostics).toHaveLength(0)

  const sourceFile = ts.createSourceFile(
    'generated.figma.ts',
    generated,
    ts.ScriptTarget.Latest,
    true,
  )
  return sourceFile.statements.map((statement) => statement.kind)
}

const PAYLOAD = '");globalThis.pwned=1;//'

describe('createTemplateCodeConnect', () => {
  it('escapes quotes and backslashes in TEXT property names', () => {
    const generated = generate({
      [`text${PAYLOAD}`]: { type: 'TEXT', defaultValue: '' },
      'back\\slash': { type: 'TEXT', defaultValue: '' },
    })

    expect(generated).toContain(
      'figma.selectedInstance.getString("text\\");globalThis.pwned=1;//")',
    )
    expect(generated).toContain('figma.selectedInstance.getString("back\\\\slash")')
    expect(topLevelStatementKinds(generated)).toEqual([
      ts.SyntaxKind.ImportDeclaration,
      ts.SyntaxKind.VariableStatement,
      ts.SyntaxKind.VariableStatement,
      ts.SyntaxKind.ExportAssignment,
    ])
  })

  it('removes only the property ID suffix from property names', () => {
    const generated = generate({
      'Show Tab #3#21:7': { type: 'BOOLEAN', defaultValue: true },
      'Column #2': { type: 'VARIANT', defaultValue: 'Narrow', variantOptions: ['Narrow', 'Wide'] },
    })

    expect(generated).toContain('const showTab3 = figma.selectedInstance.getBoolean("Show Tab #3")')
    expect(generated).toContain('const column2 = figma.selectedInstance.getEnum("Column #2", {')
  })

  it('escapes quotes in BOOLEAN property names', () => {
    const generated = generate({
      [`bool${PAYLOAD}`]: { type: 'BOOLEAN', defaultValue: false },
    })

    expect(generated).toContain(
      'figma.selectedInstance.getBoolean("bool\\");globalThis.pwned=1;//")',
    )
    expect(topLevelStatementKinds(generated)).toEqual([
      ts.SyntaxKind.ImportDeclaration,
      ts.SyntaxKind.VariableStatement,
      ts.SyntaxKind.ExportAssignment,
    ])
  })

  it('escapes quotes and newlines in VARIANT property names and option keys', () => {
    const generated = generate({
      [`Size${PAYLOAD}`]: {
        type: 'VARIANT',
        defaultValue: 'Small',
        variantOptions: ['Small', `opt${PAYLOAD}`, 'line\nbreak'],
      },
    })

    expect(generated).toContain('figma.selectedInstance.getEnum("Size\\");globalThis.pwned=1;//"')
    expect(generated).toContain('"opt\\");globalThis.pwned=1;//":')
    expect(generated).toContain('"line\\nbreak":')
    expect(topLevelStatementKinds(generated)).toEqual([
      ts.SyntaxKind.ImportDeclaration,
      ts.SyntaxKind.VariableStatement,
      ts.SyntaxKind.ExportAssignment,
    ])
  })
})

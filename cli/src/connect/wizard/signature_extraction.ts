import path from 'path'
import fs from 'fs'
import findUp from 'find-up'
import { Project, ScriptTarget, SourceFile, Symbol, ts } from 'ts-morph'

const DEFAULT_COMPONENT = 'DefaultComponent'
const REACT_INTERFACE_NAMES = ['HTMLAttributes', 'Attributes', 'AriaAttributes', 'DOMAttributes']
const IGNORE_REACT_PROPS = ['ref', 'key']

/**
 * Initializing a ts-morph project can take time so lets cache it.
 * We are assuming the underlying project does not change during the course of the CLI run.
 */
let cachedTsMorphProject: Project
export function extractSignature({
  nameToFind,
  sourceFilePath,
}: {
  nameToFind: string
  sourceFilePath: string
}) {
  if (!cachedTsMorphProject) {
    const tsConfigFilePath = findTsConfigPath(path.dirname(sourceFilePath))
    const options = tsConfigFilePath
      ? { tsConfigFilePath }
      : {
          compilerOptions: {
            target: ScriptTarget.ESNext,
            module: ts.ModuleKind.CommonJS,
            jsx: ts.JsxEmit.React,
            esModuleInterop: true,
            skipLibCheck: true,
            lib: ['ES2021'],
            strict: true,
            rootDir: 'src',
          },
        }
    cachedTsMorphProject = new Project(options)
  }

  return extractSignatureFromProject({
    tsMorphProject: cachedTsMorphProject,
    sourceFilePath,
    nameToFind,
  })
}

export function extractSignatureFromProject({
  tsMorphProject,
  sourceFilePath,
  nameToFind,
}: {
  tsMorphProject: Project
  sourceFilePath: string
  nameToFind: string
}) {
  tsMorphProject.addSourceFileAtPath(sourceFilePath)

  const signatureSourcePath = path.join(path.dirname(sourceFilePath), 'extracted_signature.ts')

  const signatureSourceFile = tsMorphProject.createSourceFile(signatureSourcePath)

  const filename = path.parse(sourceFilePath).name.split('.')[0]
  if (nameToFind === 'default') {
    signatureSourceFile.addImportDeclaration({
      defaultImport: DEFAULT_COMPONENT,
      moduleSpecifier: `./${filename}`,
    })
  } else {
    signatureSourceFile.addImportDeclaration({
      namedImports: [nameToFind],
      moduleSpecifier: `./${filename}`,
    })
  }

  /**
   * Flatten the component's props type by creating a virtual TS source file
   * and adding this type alias, which has the effect of flattening any inherited
   * types down to a single type, then extract the final type from this new type
   */
  signatureSourceFile.addTypeAlias({
    name: 'ExtractFinalType',
    typeParameters: ['T'],
    type: 'T extends infer R ? { [K in keyof R]: R[K] } : never',
  })

  const typeAlias = signatureSourceFile.addTypeAlias({
    name: '__FinalType',
    type: `ExtractFinalType<React.ComponentProps<typeof ${nameToFind === 'default' ? DEFAULT_COMPONENT : nameToFind}>>`,
  })

  let type = typeAlias.getType()

  // For simplicity, if top-level type is a union, use the first type
  if (type.isUnion()) {
    type = type.getUnionTypes()[0]
  }

  if (!type.isObject()) {
    tsMorphProject.removeSourceFile(signatureSourceFile)
    throw new Error('Props not an object: ' + type.getText())
  } else {
    const props = type.getProperties()

    const result: Record<string, string> = {}

    for (const prop of props) {
      const propString = getPropString(tsMorphProject, prop, signatureSourceFile)
      if (propString) {
        result[prop.getName()] = propString
      }
    }

    tsMorphProject.removeSourceFile(signatureSourceFile)
    return result
  }
}

function getPropString(tsMorphProject: Project, prop: Symbol, sourceFile: SourceFile) {
  if (IGNORE_REACT_PROPS.includes(prop.getName())) {
    return null
  }

  const [declaration] = prop.getDeclarations()

  const parent = declaration.getParentOrThrow().compilerNode

  if (ts.isInterfaceDeclaration(parent)) {
    const parentInterfaceName = parent.name.getText()

    // Skip props that are inherited from React types
    if (REACT_INTERFACE_NAMES.includes(parentInterfaceName)) {
      return null
    }

    if (parent.heritageClauses && parent.heritageClauses[0].getText().includes('HTMLAttributes')) {
      // If interface extends HTMLAttributes, only allow props defined in interface
      // TODO will fail if extends multiple interfaces and prop defined in one of them - could recursively check
      if (!parent.members.some((m) => m.name?.getText() === prop.getName())) {
        return null
      }
    }
  }

  const compilerProp = prop.compilerSymbol

  const checker = tsMorphProject.getTypeChecker().compilerObject

  const propType = prop.getTypeAtLocation(sourceFile).compilerType
  let propTypeString = checker.typeToString(propType)

  if (propType.isUnion()) {
    // Get the types of the union
    const unionTypes = propType.types

    // Map each type to its string representation and join them with a |
    propTypeString = unionTypes.map((type) => checker.typeToString(type)).join(' | ')
  }

  return compilerProp.flags & ts.SymbolFlags.Optional
    ? `?${propTypeString.replace(/undefined \| /g, '')}`
    : propTypeString
}

function findTsConfigPath(dir: string): string | undefined {
  let tsConfigPath: string | undefined = undefined

  findUp.sync(
    (currentDir) => {
      const pathToTry = path.join(currentDir, 'tsconfig.json')

      if (fs.existsSync(pathToTry)) {
        tsConfigPath = pathToTry
        return findUp.stop
      }
    },
    { cwd: dir },
  )

  return tsConfigPath
}

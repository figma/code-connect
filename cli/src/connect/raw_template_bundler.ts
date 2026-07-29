import path from 'path'
import ts from 'typescript'
import { build, initialize, type BuildOptions } from 'esbuild-wasm'

export const allowedHelperExtensions = ['.ts', '.js', '.mjs', '.cjs']

export function isRelativeImportPath(moduleSpecifier: string): boolean {
  return moduleSpecifier.startsWith('./') || moduleSpecifier.startsWith('../')
}

export function unsupportedImportError(filePath: string, importLine: string): Error {
  return new Error(
    `TypeScript template files only support importing from 'figma' and relative helper files.\n` +
      `Found in ${filePath}:\n` +
      `  ${importLine}\n\n` +
      `Use "const figma = require('figma')" or "import figma from 'figma'" for the Figma API.\n` +
      `Helper imports must use relative paths (for example: "./helpers").`,
  )
}

let bundlerInitialization: Promise<void> | undefined

function ensureBundlerInitialized(): Promise<void> {
  if (bundlerInitialization) {
    return bundlerInitialization
  }
  const initialization = initialize({}).catch((error: unknown) => {
    // esbuild-wasm throws if initialize() runs twice in a process (e.g. across
    // test files sharing a worker); the engine is already up, so treat as done.
    if (error instanceof Error && /more than once/.test(error.message)) {
      return
    }
    bundlerInitialization = undefined
    throw error
  })
  bundlerInitialization = initialization
  return initialization
}

// special treatment for `require('figma')`
const REQUIRE_ALIAS = '__figmaRequire'

const FIGMA_RUNTIME_NAMESPACE = 'figma-runtime'

// A `require('x')` call node's string request, else undefined.
export function getRequireCallRequest(node: ts.Node): string | undefined {
  if (
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === 'require' &&
    node.arguments.length === 1 &&
    ts.isStringLiteral(node.arguments[0])
  ) {
    return node.arguments[0].text
  }
  return undefined
}

export function relativeRequireError(filePath: string, request: string): Error {
  return new Error(
    `Helper files must be imported, not required.\n` +
      `Found in ${filePath}:\n` +
      `  require('${request}')\n\n` +
      `Use "import { helper } from '${request}'" instead. Only the Figma API may ` +
      `be required: "const figma = require('figma')".`,
  )
}

// Resolves `figma` to a virtual module backed by the runtime `require`. Marking
// it external instead would leave a top-level `import`, which the runtime can't
// execute (the template body runs inside a function).
function figmaRuntimePlugin(): NonNullable<BuildOptions['plugins']>[number] {
  return {
    name: FIGMA_RUNTIME_NAMESPACE,
    setup(pluginBuild) {
      pluginBuild.onResolve({ filter: /^figma$/ }, () => ({
        path: 'figma',
        namespace: FIGMA_RUNTIME_NAMESPACE,
      }))
      pluginBuild.onLoad({ filter: /.*/, namespace: FIGMA_RUNTIME_NAMESPACE }, () => ({
        contents: `export default require('figma')`,
        loader: 'js',
      }))
    },
  }
}

const UNBUNDLED_REQUIRE_REGEX = new RegExp(`\\b${REQUIRE_ALIAS}\\(\\s*["']([^"']+)["']`, 'g')

// Fails on any `require` left in the bundle other than `require('figma')`
function assertNoUnbundledRequires(bundled: string, filePath: string): void {
  for (const [, request] of bundled.matchAll(UNBUNDLED_REQUIRE_REGEX)) {
    if (request === 'figma') {
      continue
    }
    throw isRelativeImportPath(request)
      ? relativeRequireError(filePath, request)
      : unsupportedImportError(filePath, `require('${request}')`)
  }
}

const ESBUILD_OPTIONS: BuildOptions = {
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  define: { require: REQUIRE_ALIAS },
  banner: { js: `var ${REQUIRE_ALIAS} = require;` },
  target: 'es2021',
  plugins: [figmaRuntimePlugin()],
  resolveExtensions: allowedHelperExtensions,
  metafile: true,
  write: false,
  logLevel: 'silent',
  legalComments: 'none',
  // Ignore project tsconfig for deterministic bundling across codebases.
  tsconfigRaw: '{}',
}

// Maps an esbuild resolution failure to the same errors the entry validator uses.
function mapEsbuildBundleError(error: unknown, filePath: string): Error {
  const esbuildErrors = (error as { errors?: Array<{ text?: string }> })?.errors
  if (Array.isArray(esbuildErrors)) {
    for (const { text } of esbuildErrors) {
      const match = /Could not resolve "([^"]+)"/.exec(text ?? '')
      if (!match) {
        continue
      }
      const specifier = match[1]
      if (isRelativeImportPath(specifier)) {
        return new Error(
          `Could not resolve helper import "${specifier}" in ${filePath}. ` +
            `Ensure the helper file exists and uses one of: ${allowedHelperExtensions.join(', ')}`,
        )
      }
      return unsupportedImportError(filePath, `import ... from '${specifier}'`)
    }
  }
  return error instanceof Error ? error : new Error(String(error))
}

/**
 * Bundles a template and its relative helper graph into one self-contained
 * script. Every module other than `figma` must be a relative helper inside the
 * project directory.
 */
export async function bundleTemplateWithHelpers(
  filePath: string,
  projectRoot: string,
): Promise<string> {
  const entryPath = path.resolve(filePath)

  await ensureBundlerInitialized()

  let result
  try {
    result = await build({
      ...ESBUILD_OPTIONS,
      entryPoints: [entryPath],
      absWorkingDir: projectRoot,
    })
  } catch (error) {
    throw mapEsbuildBundleError(error, filePath)
  }

  // Enforce the allowlist: no package deps, nothing outside the project root.
  for (const inputPath of Object.keys(result.metafile?.inputs ?? {})) {
    if (inputPath.split('/').includes('node_modules')) {
      throw unsupportedImportError(filePath, `import ... from a package ('${inputPath}')`)
    }
    if (inputPath.startsWith('..') || path.isAbsolute(inputPath)) {
      throw new Error(
        `Refusing to bundle helper "${inputPath}" from ${filePath}: ` +
          `it resolves outside the project directory. Helper files must live within the project.`,
      )
    }
  }

  const bundled = result.outputFiles?.[0]?.text
  if (bundled === undefined) {
    throw new Error(`Failed to bundle template ${filePath}: esbuild produced no output.`)
  }

  assertNoUnbundledRequires(bundled, filePath)

  return rewriteDefaultExport(bundled, filePath)
}

const ESM_DEFAULT_EXPORT_REGEX = /export\s*\{\s*([A-Za-z0-9_$]+)\s+as\s+default\s*,?\s*\};?\s*$/

/**
 * Turns esbuild's trailing `export { Foo as default };` into `export default Foo` for runtime purposes.
 */
function rewriteDefaultExport(bundled: string, filePath: string): string {
  const trimmed = bundled.trimEnd()
  const match = ESM_DEFAULT_EXPORT_REGEX.exec(trimmed)
  if (!match) {
    throw new Error(
      `Failed to bundle template ${filePath}: no default export found. ` +
        `Template files must end with "export default { ... }".`,
    )
  }
  return `${trimmed.slice(0, match.index)}export default ${match[1]}\n`
}

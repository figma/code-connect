import { spawnSync } from 'child_process'
import { globSync } from 'glob'
import path from 'path'
import fs from 'fs'
import ts from 'typescript'
import { logger } from './logging'

const DEFAULT_CONFIG_FILE_NAME = 'figma.config.json'
export interface CodeConnectConfig {
  /**
   * Specify glob patterns for files (relative to the project root) to be
   * included when looking for source files. If not specified, all files
   * (except any specified in `exclude`) will be included.
   */
  include?: string[]
  /**
   * Specify glob patterns for files (relative to the project root) to be
   * excluded when looking for source files. If not specified, only
   * `node_modules` will be excluded.
   */
  exclude?: string[]
  /**
   * Optional object of substitutions applied to document URLs (in the format {
   * fromString, toString }) for testing (e.g. remapping a production URL to a
   * staging URL). Not publicly documented.
   */
  documentUrlSubstitutions?: Record<string, string>
  /**
   * React specific configuration
   */
  react?: {
    /**
     * Maps imports from their path on disk to the specified path.
     * This will rewrite the imports in generated code examples, so it works with
     * relative imports such as `import { Button } from "./"`.
     *
     * Example: { "src/components/*": "@ui/components" }
     * Would rewrite imports for components located in `src/components` to `@ui/components` in
     * generated code examples.
     * `import { Button } from "./"` -> `import { Button } from "@ui/components/Button"`
     */
    importPaths?: Record<string, string>
    /**
     * For import resolution - this is a temporary solution to support projects that use
     * pnpm workspaces, as the compiler doesn't seem to be able to resolve imports when
     * the package in node_modules is a symlink. Need to look into this more and find a
     * better solution.
     */
    paths?: Record<string, string[]>
  }
  /**
   * Storybook specific configuration
   */
  storybook?: {
    /**
     * The URL of the Storybook instance for the project
     */
    url: string
  }
}

interface FigmaConfig {
  codeConnect?: CodeConnectConfig
}

function parseConfig(configFilePath: string): FigmaConfig | undefined {
  if (!fs.existsSync(configFilePath)) {
    return undefined
  }

  try {
    const rawData = fs.readFileSync(configFilePath, 'utf-8')
    const config = JSON.parse(rawData)
    return config
  } catch (error) {
    console.error('Error parsing config file:', error)
    return undefined
  }
}

export function getGitRemoteURL(repoPath: string) {
  try {
    const spawn = spawnSync('git', ['config', '--get', 'remote.origin.url'], {
      cwd: repoPath,
    })
    const output = spawn.stdout
    return (output || '').toString().trim()
  } catch (error) {
    console.error('Error getting git remote URL:', error)
    return ''
  }
}

/**
 * Uses `git rev-parse` to find absolute path to the root of the git repository
 */
function getGitRepoAbsolutePath(filePath: string) {
  try {
    const spawn = spawnSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: path.dirname(filePath),
    })
    const output = spawn.stdout
    return (output || '').toString().trim()
  } catch (error) {
    console.error('Error running `git rev-parse`:', error)
    return ''
  }
}

/**
 * Finds the URL of a remote file
 * @param filePath absolute file path on disk
 * @param repoURL remote URL
 * @returns
 */
export function getRemoteFileUrl(filePath: string, repoURL?: string) {
  if (!repoURL) {
    return ''
  }

  let url = repoURL.trim()
  url = url.replace(':', '/')
  url = url.replace('git@', 'https://')
  url = url.replace(/\.git$/, '')

  // the folder of the git repo on disk could be named differently,
  // so we need to find the relative path of the file to the root of the repo
  // and append that to the remote URL
  const repoAbsPath = getGitRepoAbsolutePath(filePath)
  const index = filePath.indexOf(repoAbsPath)
  if (index === -1) {
    return ''
  }
  const relativeFilePath = filePath.substring(index + repoAbsPath.length)

  return `${url}/tree/master${relativeFilePath}`
}

export function getStorybookUrl(filePath: string, storybookUrl: string) {
  // the folder of the git repo on disk could be named differently,
  // so we need to find the relative path of the file to the root of the repo
  // and append that to the remote URL
  const repoAbsPath = getGitRepoAbsolutePath(filePath)
  const index = filePath.indexOf(repoAbsPath)
  if (index === -1) {
    return ''
  }
  const relativeFilePath = filePath.substring(index + repoAbsPath.length + 1) // +1 to remove the leading slash
  const storybookComponentPath = relativeFilePath
    .trim()
    .replace(/[\s|_]/g, '-')
    .replace(/\.[jt]sx?$/, '')
    .split('/')
    .join('-')

  return `${storybookUrl}/?path=/docs/${storybookComponentPath}`
}

export interface ProjectInfo {
  /**
   * Absolute path of the project directory
   */
  absPath: string
  /**
   * An array of all tsx files in the project
   */
  files: string[]
  /**
   * The git remote URL of the project
   */
  remoteUrl: string
  /**
   * The parsed Code Connect config file
   */
  config?: CodeConnectConfig
  /**
   * TS program containing all tsx files in the project
   */
  tsProgram: ts.Program
}

function mapToAbsolutePaths(globPaths: string[], absPath: string) {
  return globPaths.map((globPath) => `${absPath}/${globPath}`)
}

/**
 * Gets information about a project from a directory.
 *
 * @param dir Directory containing the project
 * @param configPath Optional path to Code Connect config file
 * @returns Object containing information about the project
 */
export function getProjectInfo(dir: string, configPath?: string): ProjectInfo {
  const configFilePath = configPath
    ? path.resolve(configPath)
    : path.resolve(path.join(dir, DEFAULT_CONFIG_FILE_NAME))
  const globalConfig = configFilePath ? parseConfig(configFilePath) : undefined
  const config = globalConfig?.codeConnect

  // `importPaths` and `paths` previously (incorrectly) lived in the global `codeConnect` config -
  // some early users may have it defined here so we'll log this error message to notify them to move it
  if (globalConfig && (globalConfig.codeConnect as any).importPaths) {
    logger.error(`The 'importPaths' option in the config file should be specified under 'react'`)
  }

  if (globalConfig && (globalConfig.codeConnect as any).paths) {
    logger.error(`The 'paths' option in the config file should be specified under 'react'`)
  }

  if (!globalConfig) {
    logger.info(`No config file found in ${dir}, proceeding with default options`)
  } else if (globalConfig && !config) {
    logger.info(`Config file found, but no options specified under 'codeConnect'. Parsing ${dir}`)
  } else if (config && !config.include) {
    logger.info(`Config file found, but no include globs specified. Parsing ${dir}`)
  } else {
    logger.info(`Config file found, parsing ${dir} using specified include globs`)
  }

  const absPath = path.resolve(dir)
  const includeGlobs = config?.include
    ? mapToAbsolutePaths(config.include, absPath)
    : `${absPath}/**/*.{tsx,jsx}`
  const excludeGlobs = [
    ...(config?.exclude ? mapToAbsolutePaths(config.exclude, absPath) : []),
    `${absPath}/node_modules/**`,
  ]
  const files = globSync(includeGlobs, {
    nodir: true,
    ignore: excludeGlobs,
  })
  const remoteUrl = getGitRemoteURL(absPath)
  const compilerOptions: ts.CompilerOptions = {
    // This ensures the compiler can resolve imports such as "ui/button" when a
    // baseUrl is configured in the tsconfig of the project. We probably want a more
    // sophisticated way to parse the users tsconfig and pass it to the compiler eventually.
    baseUrl: absPath,
    // TODO: not sure why Node10 is needed her, but otherwise module resolution for
    // pnpm workspaces won't work
    moduleResolution: ts.ModuleResolutionKind.Node10,
    paths: config?.react?.paths ?? {},
    allowJs: true,
  }
  const tsProgram = ts.createProgram(files, compilerOptions)

  return {
    absPath,
    files,
    remoteUrl,
    config,
    tsProgram,
  }
}

export function resolveImportPath(filePath: string, config: CodeConnectConfig): string | null {
  function isMatch(patternParts: string[], pathParts: string[]) {
    for (let i = 0; i < patternParts.length; i++) {
      if (patternParts[i] !== '*' && patternParts[i] !== pathParts[i]) {
        return false
      }
    }
    return true
  }

  for (const [key, value] of Object.entries(config.react?.importPaths || {})) {
    // Do a partial match from the end of the path
    const patternParts = key.split('/').reverse()
    const pathParts = filePath.split('/').reverse()
    if (pathParts.length < patternParts.length) {
      continue
    }

    // If the mapped path ends with a wildcard we want to keep the filename in
    // the final path (for non-index imports)
    if (isMatch(patternParts, pathParts)) {
      return value.endsWith('*') ? `${value.slice(0, -1)}${pathParts[0].split('.')[0]}` : value
    }
  }

  return null
}

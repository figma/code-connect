import { spawnSync } from 'child_process'
import { globSync } from 'glob'
import path from 'path'
import fs from 'fs'
import ts from 'typescript'
import { exitWithError, logger } from '../common/logging'
import chalk from 'chalk'
import readline from 'readline'
// We use an old version of this dep as I couldn't get ES modules working
import findUp from 'find-up'
import { exitWithFeedbackMessage } from './helpers'

const DEFAULT_CONFIG_FILE_NAME = 'figma.config.json'
const ENV_FILE_NAME = '.env'

export const DEFAULT_INCLUDE_GLOBS_BY_PARSER = {
  react: [`**/*.{tsx,jsx}`],
  html: [`**/*.{ts,js}`],
  swift: ['**/*.swift'],
  compose: ['**/*.kt'],
  // include globs should be included in configs for custom parsers
  custom: undefined,
  __unit_test__: [''],
}

export const DEFAULT_LABEL_PER_PARSER: Partial<Record<CodeConnectParser, string>> = {
  react: 'React',
  html: 'Web Components',
}

// First party parsers which call into parser executables
export type CodeConnectExecutableParser = 'swift' | 'compose' | 'custom' | '__unit_test__'

// React is a special case for now as we call it directly from the CLI rather
// than via an executable for legacy reasons. We will migrate it to the
// parser executable model.
export type CodeConnectParser = 'react' | 'html' | CodeConnectExecutableParser

export type BaseCodeConnectConfig = {
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
   * The parser name, if using an internal parser.
   */
  parser: CodeConnectParser

  /**
   * Label to use for the uploaded code examples
   */
  label?: string

  /**
   * The URL of the Figma file to use during the interactive setup wizard for connecting code components to Figma components.
   */
  interactiveSetupFigmaFileUrl?: string
}

export type CodeConnectExecutableParserConfig = BaseCodeConnectConfig & {
  parser: CodeConnectExecutableParser
}

export type CodeConnectCustomExecutableParserConfig = BaseCodeConnectConfig & {
  parser: 'custom'
  parserCommand: string
}

/**
 * React specific configuration
 */
export type CodeConnectReactConfig = BaseCodeConnectConfig & {
  parser: 'react'
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

export type CodeConnectHtmlConfig = BaseCodeConnectConfig & {}

export type CodeConnectConfig =
  | CodeConnectReactConfig
  | CodeConnectExecutableParserConfig
  | CodeConnectCustomExecutableParserConfig
  | CodeConnectHtmlConfig
  | BaseCodeConnectConfig

interface FigmaConfig {
  codeConnect?: CodeConnectConfig
}

export function determineConfigFromProject(
  dir: string,
  exitOnError = true,
): FigmaConfig | undefined {
  const parser = determineParserFromProject(dir)
  if (parser) {
    const label = determineLabelFromProject(dir)
    if (label) {
      return { codeConnect: { parser, label } }
    }

    return { codeConnect: { parser } }
  }

  if (exitOnError) {
    exitWithError(
      `Code Connect was not able to determine your project type, and no config file was found. Please ensure you are running Code Connect from your project root. You may need to create a config file specifying which parser to use. See https://github.com/figma/code-connect/ for instructions.`,
    )
  }
}

function showParserMessage(message: string) {
  logger.info(
    message +
      '. If this is incorrect, please check you are running Code Connect from your project root, or add a `parser` key to your config file. See https://github.com/figma/code-connect for more information.',
  )
}

function packageJsonContains(packageJson: any, dependency: string) {
  return (
    (packageJson.dependencies && packageJson.dependencies[dependency]) ||
    (packageJson.peerDependencies && packageJson.peerDependencies[dependency]) ||
    (packageJson.devDependencies && packageJson.devDependencies[dependency])
  )
}

// Walk up from the given directory looking for the first directory which
// matches heuristics for the platforms we support. This means that e.g. if you
// have a Swift project inside a React project, we'll detect Swift. This enables
// users to run commands from anywhere inside their project, rather than having
// to run from the root (the same way npm works).
function determineParserFromProject(dir: string): CodeConnectParser | undefined {
  let parser: CodeConnectParser | undefined

  findUp.sync(
    (currentDir) => {
      const packageJsonPath = path.join(currentDir, 'package.json')

      if (fs.existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))
        if (packageJsonContains(packageJson, 'react')) {
          showParserMessage(
            `Using "react" parser as package.json containing a "react" ${
              packageJson.dependencies && packageJson.dependencies['react']
                ? 'dependency'
                : 'peer dependency'
            } was found in ${currentDir}`,
          )
          parser = 'react'
          return findUp.stop
        } else {
          showParserMessage(
            `Using "html" parser as package.json containing no other supported web frameworks was found in ${currentDir}`,
          )
          parser = 'html'
          return findUp.stop
        }
      } else {
        if (globSync([`${currentDir}/*.xcodeproj`, `${currentDir}/Package.swift`]).length > 0) {
          showParserMessage(
            `Using "swift" parser as a file matching *.xcodeproj or Package.swift was found in ${currentDir}`,
          )
          parser = 'swift'
          return findUp.stop
        } else if (globSync([`${currentDir}/build.gradle.kts`]).length > 0) {
          showParserMessage(
            `Using "compose" parser as a file matching build.gradle.kts was found in ${currentDir}`,
          )
          parser = 'compose'
          return findUp.stop
        } else if (globSync([`${currentDir}/build.gradle`]).length > 0) {
          showParserMessage(
            `Using "compose" parser as a file matching build.gradle was found in ${currentDir}`,
          )
          parser = 'compose'
          return findUp.stop
        }
      }
    },
    { cwd: dir },
  )

  return parser
}

// Similarly to determineParserFromProject, this walks up looking for a
// package.json containing a library which we support and we set a specific
// label for. An example is Angular, which is detected as 'html' parser, but we
// set a different label for it.
export function determineLabelFromProject(dir: string): string | undefined {
  function showMessage(
    libraryName: string,
    moduleName: string,
    packageJson: any,
    currentDir: string,
  ) {
    showParserMessage(
      `Using "${libraryName}" label as package.json containing a "${moduleName}" ${
        packageJson.dependencies && packageJson.dependencies[moduleName]
          ? 'dependency'
          : 'peer dependency'
      } was found in ${currentDir}`,
    )
  }

  let label: string | undefined

  findUp.sync(
    (currentDir) => {
      const packageJsonPath = path.join(currentDir, 'package.json')

      if (fs.existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))
        if (packageJsonContains(packageJson, 'angular')) {
          showMessage('Angular', 'angular', packageJson, currentDir)
          label = 'Angular'
          return findUp.stop
        } else if (packageJsonContains(packageJson, 'vue')) {
          showMessage('Vue', 'vue', packageJson, currentDir)
          label = 'Vue'
          return findUp.stop
        }
      }
    },
    { cwd: dir },
  )

  return label
}

async function checkForLegacyConfig(
  config: FigmaConfig & { codeConnect: { swift?: any; react?: any } },
  configFilePath: string,
): Promise<FigmaConfig> | never {
  const { codeConnect } = config

  const newConfigBase = {
    ...(codeConnect.include ? { include: codeConnect.include } : {}),
    ...(codeConnect.exclude ? { exclude: codeConnect.exclude } : {}),
    ...(codeConnect.documentUrlSubstitutions
      ? { documentUrlSubstitutions: codeConnect.documentUrlSubstitutions }
      : {}),
  }
  const maybeNewReactConfig = {
    codeConnect: { parser: 'react', ...codeConnect.react, ...newConfigBase },
  }
  const maybeNewSwiftConfig = {
    codeConnect: { parser: 'swift', ...codeConnect.swift, ...newConfigBase },
  }

  if (codeConnect.react && codeConnect.swift) {
    logger.error(`${chalk.bold('⚠️  Your Code Connect configuration needs to be updated\n')}`)

    logger.infoForce(`Code Connect is migrating from a single configuration file for all supported languages, to individual configuration files for each language.

As part of this change, your Code Connect configuration file needs to be split into two configuration files, one for React and one for Swift.

The React ${chalk.bold(
      'figma.config.json',
    )} should be located in your React project root and contain:

${JSON.stringify(maybeNewReactConfig, null, 2)}

The Swift ${chalk.bold(
      'figma.config.json',
    )} should be located in your Swift project root and contain:

${JSON.stringify(maybeNewSwiftConfig, null, 2)}

You will need to check any include/exclude paths are correct relative to the new locations.`)
    exitWithFeedbackMessage(1)
  }

  if (codeConnect.react || codeConnect.swift) {
    const platform = codeConnect.react ? 'React' : 'Swift'
    const newConfig = codeConnect.react ? maybeNewReactConfig : maybeNewSwiftConfig

    logger.infoForce(
      `${chalk.bold('⚠️  Your Code Connect configuration needs to be updated')}

Code Connect is migrating from a single configuration file for all supported languages, to individual configuration files for each language.

As part of this change, your Code Connect configuration file needs to be updated to remove the ${chalk.bold(
        platform.toLowerCase(),
      )} key and add ${chalk.bold(`{ parser: "${platform.toLowerCase()}" }`)}:

${JSON.stringify(newConfig, null, 2)}

Code Connect can make this change for you automatically, or you can do it manually.

Please also ensure your configuration file is located in your ${platform} project root. If you move the configuration file, you will need to check any include/exclude paths are correct relative to the new location.

Please raise an issue at https://github.com/figma/code-connect/issues if you have any problems.

---
`,
    )

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stderr,
    })

    const updateConfig = await new Promise<string>((resolve) => {
      rl.question(
        'Would you like Code Connect to update your configuration file for you? (y/n) ',
        (answer) => {
          resolve(answer)
        },
      )
    })
    rl.close()

    if (updateConfig.toLowerCase() === 'y') {
      fs.writeFileSync(configFilePath, JSON.stringify(newConfig, null, 2))
      logger.infoForce(`\nConfiguration file updated`)
      return newConfig
    } else {
      exitWithError(`\nPlease update your configuration file manually`)
    }
  }

  return config
}

async function parseConfig(configFilePath: string, dir: string): Promise<FigmaConfig | undefined> {
  try {
    const rawData = fs.readFileSync(configFilePath, 'utf-8')
    const rawConfig = JSON.parse(rawData)
    const config = await checkForLegacyConfig(rawConfig, configFilePath)

    if (!config.codeConnect?.parser) {
      const parser = determineParserFromProject(dir)

      if (!parser) {
        logger.error(
          `Code Connect was not able to determine your project type, and no \`parser\` was specified. Please ensure you are running Code Connect from your project root. You may need to add a \`parser\` key to your config file, specifying which parser to use. See https://github.com/figma/code-connect/ for instructions.`,
        )
        exitWithFeedbackMessage(1)
      }

      if (!config.codeConnect) {
        config.codeConnect = { parser }
      }
      // TS errors if this is in an else
      config.codeConnect.parser = parser
    }

    if (!config.codeConnect?.label) {
      const label = determineLabelFromProject(dir)
      if (label) {
        config.codeConnect.label = label
      }
    }

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
export function getGitRepoAbsolutePath(filePath: string) {
  try {
    const dirPath = fs.statSync(filePath).isDirectory() ? filePath : path.dirname(filePath)
    const spawn = spawnSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: dirPath,
    })
    const output = spawn.stdout
    return (
      (output || '')
        .toString()
        // git always uses /, but other Node API use \ on Windows
        .replaceAll('/', path.sep)
        .trim()
    )
  } catch (error: any) {
    console.error('Error running `git rev-parse`:', error.toString().split('\n')[0])
    return ''
  }
}

/**
 * Find the default branch name (master or main) for the git repository
 */
export function getGitRepoDefaultBranchName(repoPath: string) {
  const DEFAULT_BRANCH_NAME = 'master'

  try {
    // Get all git branches
    const gitBranchResult = spawnSync('git', ['branch', '-r'], {
      cwd: repoPath,
    })

    if (!gitBranchResult.stdout) {
      return DEFAULT_BRANCH_NAME
    }

    const branches = gitBranchResult.stdout
      .toString()
      .trim()
      .split('\n')
      .map((s) => s.trim())

    // Check if origin/main exists, otherwise assume master
    if (branches.includes('origin/main')) {
      return 'main'
    } else {
      return DEFAULT_BRANCH_NAME
    }
  } catch (error: any) {
    console.error('Error getting git default branch name:', error.toString().split('\n')[0])
    return DEFAULT_BRANCH_NAME
  }
}

/**
 * Finds the URL of a remote file
 * @param filePath absolute file path on disk
 * @param repoURL remote URL, can be a GitHub, GitLab, Bitbucket, etc. URL.
 * @returns
 */
export function getRemoteFileUrl(filePath: string, repoURL?: string) {
  if (!repoURL) {
    return ''
  }

  filePath = filePath.replaceAll(path.sep, '/')

  let url = repoURL.trim()
  if (url.startsWith('git@')) {
    url = url.replace(':', '/')
    url = url.replace('git@', 'https://')
  }
  url = url.replace(/\.git$/, '')

  // the folder of the git repo on disk could be named differently,
  // so we need to find the relative path of the file to the root of the repo
  // and append that to the remote URL
  const repoAbsPath = getGitRepoAbsolutePath(filePath)
    // Windows uses \ as the path separator, so replace with /
    .replaceAll(path.sep, '/')

  const defaultBranch = getGitRepoDefaultBranchName(repoAbsPath)
  const index = filePath.indexOf(repoAbsPath)
  if (index === -1) {
    return ''
  }

  const relativeFilePath = filePath.substring(index + repoAbsPath.length)

  if (url.includes('github.com')) {
    return `${url}/blob/${defaultBranch}${relativeFilePath}`
  } else if (url.includes('gitlab.com')) {
    return `${url}/-/blob/${defaultBranch}${relativeFilePath}`
  } else if (url.includes('bitbucket.org')) {
    return `${url}/src/${defaultBranch}${relativeFilePath}`
  } else if (url.includes('dev.azure.com')) {
    // `git config --get remote.origin.url` for azure repos will return different strings depending on if it was
    // cloned with https or ssh. We need to convert this to a valid URL like "https://dev.azure.com/org/repo/_git/repo?path=/"
    if (repoURL.startsWith('git@')) {
      // ssh: "git@ssh.dev.azure.com:v3/org/repo/repo"
      const [org, project1, project2] = repoURL.split('/').slice(-3)
      return `https://dev.azure.com/${org}/${project1}/_git/${project2}?path=${relativeFilePath}&branch=${defaultBranch}`
    } else {
      // https: "https://org@dev.azure.com/org/repo/_git/repo"
      const [_, url] = repoURL.split('@')
      return `https://${url}?path=${relativeFilePath}&branch=${defaultBranch}`
    }
  } else {
    logger.debug('Unknown remote URL - assuming GitHub Enterprise', url)
    return `${url}/blob/${defaultBranch}${relativeFilePath}`
  }
}

export function getStorybookUrl(filePath: string, storybookUrl: string) {
  // the folder of the git repo on disk could be named differently,
  // so we need to find the relative path of the file to the root of the repo
  // and append that to the remote URL
  const repoAbsPath = getGitRepoAbsolutePath(filePath).replaceAll(path.sep, '/')
  const index = filePath.indexOf(repoAbsPath)
  if (index === -1) {
    return ''
  }

  const relativeFilePath = filePath.substring(index + repoAbsPath.length + 1) // +1 to remove the leading slash
  const storybookComponentPath = relativeFilePath
    .trim()
    .replace(/[\s|_]/g, '-')
    .replace(/\.[jt]sx?$/, '')
    .replaceAll('\\', '/')
    .split('/')
    .join('-')

  return `${storybookUrl}/?path=/docs/${storybookComponentPath}`
}

export type ProjectInfo<ConfigT = CodeConnectConfig> = {
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
  config: ConfigT
}

export type ReactProjectInfo = ProjectInfo<CodeConnectReactConfig> & {
  /**
   * TS program containing all tsx files in the project
   */
  tsProgram: ts.Program
}

function mapToAbsolutePaths(globPaths: string[], absPath: string) {
  // glob doesn't like Windows paths so convert to *nix format
  return globPaths.map((globPath) => `${absPath.replaceAll(path.sep, '/')}/${globPath}`)
}

export function getDefaultConfigPath(dir: string) {
  return path.resolve(path.join(dir, DEFAULT_CONFIG_FILE_NAME))
}

export function getEnvPath(dir: string) {
  return path.resolve(path.join(dir, ENV_FILE_NAME))
}

export async function parseOrDetermineConfig(dir: string, configPath: string) {
  const configFilePath = configPath ? path.resolve(configPath) : getDefaultConfigPath(dir)

  const hasConfigFile = fs.existsSync(configFilePath)

  if (!hasConfigFile) {
    if (configPath) {
      logger.warn(`${configPath} does not exist, proceeding with default options`)
    } else {
      logger.info(`No config file found in ${dir}, proceeding with default options`)
    }
  }

  const globalConfig = hasConfigFile
    ? await parseConfig(configFilePath, dir)
    : determineConfigFromProject(dir)

  if (!globalConfig) {
    throw new Error(`Error parsing config file: ${configFilePath}`)
  }

  if (!globalConfig.codeConnect) {
    throw new Error(`No options specified under 'codeConnect' in config file: ${configFilePath}`)
  }

  const config = globalConfig.codeConnect

  if (hasConfigFile) {
    if (!config) {
      logger.info(`Config file found, but no options specified under 'codeConnect'. Parsing ${dir}`)
    } else if (config && !config.include) {
      logger.info(`Config file found, but no include globs specified. Parsing ${dir}`)
    } else {
      logger.info(`Config file found, parsing ${dir} using specified include globs`)
    }
  }

  return {
    config,
    hasConfigFile,
  }
}

/**
 * Check if a .env file exists in the provided directory and if it contains a FIGMA_ACCESS_TOKEN.
 */
export async function checkForEnvAndToken(dir: string) {
  // Scan the provided directory for a .env file
  const envPath = await findUp('.env', { cwd: dir })

  if (!envPath) {
    // No .env file found
    return {
      hasEnvFile: false,
      envHasFigmaToken: false,
    }
  }

  // Read the contents of the .env file
  const envContents = fs.readFileSync(envPath, 'utf-8')

  // Determine if the .env file contains a FIGMA_ACCESS_TOKEN
  const envVars = envContents.split('\n').reduce(
    (
      acc: {
        [key: string]: string
      },
      line,
    ) => {
      const [key, value] = line.split('=')
      acc[key] = value
      return acc
    },
    {},
  )

  const figmaAccessToken = envVars['FIGMA_ACCESS_TOKEN']

  return {
    hasEnvFile: true,
    envHasFigmaToken: !!figmaAccessToken,
  }
}

/**
 * Gets information about a project from config.
 *
 * @param dir Directory containing the project
 * @param config Code Connect config
 * @returns Object containing information about the project
 */
export async function getProjectInfoFromConfig(
  dir: string,
  config: CodeConnectConfig,
): Promise<ProjectInfo> {
  const absPath = path.resolve(dir)
  const remoteUrl = getGitRemoteURL(absPath)

  const defaultIncludeGlobs = config.parser
    ? DEFAULT_INCLUDE_GLOBS_BY_PARSER[config.parser]
    : undefined

  // always ignore any `node_modules` folders in react projects
  const defaultExcludeGlobs = config.parser
    ? ({
        react: ['node_modules/**'],
        html: ['node_modules/**'],
        swift: ['**/__test__/**'],
        compose: [],
        custom: [],
        __unit_test__: [],
      }[config.parser] ?? [])
    : []

  const includeGlobs = config.include || defaultIncludeGlobs
  const excludeGlobs = config.exclude
    ? [...config.exclude, ...defaultExcludeGlobs]
    : defaultExcludeGlobs

  if (config.parser === 'custom' && (!includeGlobs || includeGlobs.length === 0)) {
    exitWithError('Include globs must specified in config file for custom parsers')
  }

  if (!includeGlobs) {
    exitWithError('No include globs specified in config file')
  }

  const files = globSync(mapToAbsolutePaths(includeGlobs, absPath), {
    nodir: true,
    ignore: mapToAbsolutePaths(excludeGlobs, absPath),
    // Otherwise this is true on *nix and false on Windows
    absolute: true,
  })

  if (files.length > 10000) {
    logger.warn(
      `Matching number of files was excessively large (${files.length}) - consider using more specific include/exclude globs in your config file.`,
    )
  }

  return {
    absPath,
    remoteUrl,
    config,
    files,
  }
}

/**
 * Gets information about a project from a directory.
 *
 * @param dir Directory containing the project
 * @param configPath Optional path to Code Connect config file
 * @returns Object containing information about the project
 */
export async function getProjectInfo(dir: string, configPath: string): Promise<ProjectInfo> {
  const { config } = await parseOrDetermineConfig(dir, configPath)

  return getProjectInfoFromConfig(dir, config)
}

export function getReactProjectInfo(
  projectInfo: ProjectInfo<CodeConnectReactConfig>,
): ReactProjectInfo {
  const tsProgram = getTsProgram(projectInfo)

  return {
    ...projectInfo,
    tsProgram,
  }
}

export function getTsProgram(projectInfo: ProjectInfo<CodeConnectConfig>): ts.Program {
  const compilerOptions: ts.CompilerOptions = {
    // This ensures the compiler can resolve imports such as "ui/button" when a
    // baseUrl is configured in the tsconfig of the project. We probably want a more
    // sophisticated way to parse the users tsconfig and pass it to the compiler eventually.
    baseUrl: projectInfo.absPath,
    // TODO: not sure why Node10 is needed her, but otherwise module resolution for
    // pnpm workspaces won't work
    moduleResolution: ts.ModuleResolutionKind.Node10,
    paths: 'paths' in projectInfo.config ? (projectInfo.config.paths ?? {}) : {},
    allowJs: true,
  }

  return ts.createProgram(projectInfo.files, compilerOptions)
}

/**
 * Change an imported path for a component like `./button` to e.g `@ui/button`, based on the config file.
 * Note that `filePath` here is the path to the source file on disk, not the module specifier.
 *
 * @param filePath
 * @param config
 * @returns
 */
export function mapImportPath(filePath: string, config: CodeConnectReactConfig): string | null {
  // Takes the reversed path and pattern parts and check if they match
  function isMatch(patternParts: string[], pathParts: string[]) {
    if (patternParts[0] === '*') {
      // if the path is just a wildcard and nothing else, match any import
      if (patternParts.length === 1) {
        return true
      }

      // if the _next_ part in the pattern does not exist in the path, it's not
      // a match.
      const index = pathParts.indexOf(patternParts[1])
      if (index === -1) {
        return false
      }

      // Skip to the matching part in the path and match the rest of
      // the pattern. E.g if the pattern is `*/ui/src` (reversed) and the path is
      // `button.tsx/components/ui/src`, we skip to `ui` and match the rest of the
      // pattern.
      patternParts = patternParts.slice(1)
      pathParts = pathParts.slice(index)
    }

    for (let i = 0; i < patternParts.length; i++) {
      if (patternParts[i] !== pathParts[i]) {
        return false
      }
    }
    return true
  }

  for (const [key, value] of Object.entries(config.importPaths || {})) {
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

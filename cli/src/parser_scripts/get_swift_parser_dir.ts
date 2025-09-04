import { spawnSync } from 'child_process'
import { exitWithError, logger } from '../common/logging'
import { getFileIfExists } from './get_file_if_exists'
import path from 'path'
import { readdirSync, existsSync } from 'fs'

// Find the location of the Code Connect Swift package on disk, so that we can
// call `swift run figma-swift` from the correct location. This requires parsing
// the output of xcodebuild for .xcodeproj projects, or parsing Package.swift
// for SPM projects.
//
// As this is a first party parser, we do this in TypeScript and call it as part
// of our code. For third party parsers, logic like this would need to be
// implemented in a script/binary which the user points Code Connect to.
export async function getSwiftParserDir(
  cwd: string,
  xcodeprojPath?: string,
  swiftPackagePath?: string,
  sourcePackagesPath?: string,
) {
  let figmaPackageDir: string | undefined
  let xcodeprojFile: string | undefined
  let packageSwiftFile: string | undefined

  // // Check for the supported project types giving precedence top the user provided path
  if (xcodeprojPath) {
    xcodeprojFile = xcodeprojPath.replace(/\s/g, '\\ ')
  } else if (swiftPackagePath) {
    packageSwiftFile = path.dirname(swiftPackagePath).replace(/\s/g, '\\ ')
  } else {
    xcodeprojFile = getFileIfExists(cwd, '*.xcodeproj').replace(/\s/g, '\\ ')
    packageSwiftFile = getFileIfExists(cwd, 'Package.swift').replace(/\s/g, '\\ ')
  }

  if (!(xcodeprojFile || packageSwiftFile)) {
    exitWithError(
      'No supported project found. Supported project types are .xcodeproj or Package.swift. You can specify the location of your .xcodeproj file with the `xcodeprojPath` config option.',
    )
  }

  if (xcodeprojFile) {
    // Use xcodebuild to get the build settings, so we can find where the Code
    // Connect Swift package is installed
    const result = spawnSync('xcodebuild', ['-project', xcodeprojFile, '-showBuildSettings'], {
      cwd,
      encoding: 'utf-8',
    })

    if (result.error) {
      throw result.error
    }

    const buildSettings = result.stdout

    // Extract the source and version of the Code Connect Swift package from the
    // xcodebuild output, which can be in any of the following formats depending
    // on how it is installed:
    // - Figma: https://github.com/figma/code-connect @ 0.1.2
    // - Figma: /path/to/code-connect @ local
    // - Figma: /path/to/code-connect
    const figmaPackageMatch = buildSettings.match(/\s+Figma: ([^\s]*)(?: @ (.*))?/)
    if (!figmaPackageMatch) {
      exitWithError(
        'Code Connect Swift package not found. Please add a dependency to the Code Connect package at https://github.com/figma/code-connect to your project.',
      )
    }

    // Find the package's location on disk, to compile and run the parser binary from
    const [_, figmaPackageSource, figmaPackageVersion] = figmaPackageMatch
    // The package version is `local` if installed via the "Add package" dialog,
    // or undefined if installed via the "Frameworks" section directly (which we
    // do for our test project, because the dialog won't allow ancestors to be
    // added)
    const isLocalFigmaPackage = figmaPackageVersion === 'local' || figmaPackageVersion === undefined

    if (isLocalFigmaPackage) {
      // If the version is 'local', the package is installed from a local checkout,
      // and the path on disk is the source output by xcodebuild.
      figmaPackageDir = figmaPackageSource
    } else if (sourcePackagesPath) {
      logger.info(`Using custom DerivedData path: ${sourcePackagesPath}`)

      // If a custom path is supplied, use it.
      figmaPackageDir = `${sourcePackagesPath}/checkouts/code-connect`
    } else {
      // Otherwise the SourcePackages will typically be located in Xcode's DerivedData directory,
      // at ~/Users/{username}/Library/Developer/Xcode/DerivedData/{project}-{xxx}/SourcePackages, or in the Project's root
      // at {project}/DerivedData/{project}/SourcePackages (depending on how the user's project is configured).
      let hasFoundSourcePackagesDir = false

      // 1. First look in the USER_LIBRARY_DIR (e.g. /Users/{username}/Library)
      const userLibraryDirectoryMatch = buildSettings.match(/\s+USER_LIBRARY_DIR = (.*)/)
      const userLibraryDirectory = userLibraryDirectoryMatch
        ? userLibraryDirectoryMatch[1]
        : undefined

      logger.info('Finding Code Connect Swift package')

      // Find the project's name using the build settings
      const projectNameMatch = buildSettings.match(/\s+PROJECT_NAME = (.*)/)
      const projectName = projectNameMatch ? projectNameMatch[1] : undefined

      // We can't proceed without the project name (however, this should always exist)
      if (!projectName) {
        exitWithError('PROJECT_NAME not found in xcodebuild output')
      }

      // 1. From the folders in the user library directory use a regex to determine the folder name of the project defined by "ProjectName-" and a 28 character hash
      // e.g. project-fbybcbnivxfbfeefownexgukzwxd
      if (userLibraryDirectory) {
        // Default to Xcode's default Dervied Data location (e.g. ~/Users/{username}/Library/Developer/Xcode/DerivedData/project-fbybcbnivxfbfeefownexgukzwxd/SourcePackages)
        const root = `${userLibraryDirectory}/Developer/Xcode/DerivedData`

        const projectFolderRegex = new RegExp(`${projectName}-[a-zA-Z0-9]{28}`)
        const derivedDataFolders = readdirSync(root)
        const projectFolder = derivedDataFolders.find((folder: string) =>
          projectFolderRegex.test(folder),
        )

        // If the project folder is found, use it to find the Code Connect package
        if (projectFolder) {
          figmaPackageDir = `${root}/${projectFolder}/SourcePackages/checkouts/code-connect`
          hasFoundSourcePackagesDir = true
        } else {
          logger.warn('Package not found in user library directory')
        }
      }

      // 2. If SourcePackages couldn't be found in ~/Users/{username}/Library/Developer/Xcode/DerivedData/{project}-{xxx}/SourcePackages, attempt
      // to find it in the project root {project}/DerivedData/{project}/SourcePackages
      if (!hasFoundSourcePackagesDir) {
        const rootDir = buildSettings.match(/\s+LOCROOT = (.*)/)

        if (rootDir) {
          figmaPackageDir = `${rootDir[1]}/DerivedData/${projectName}/SourcePackages/checkouts/code-connect`
          hasFoundSourcePackagesDir = true
        } else {
          logger.warn('Package not found in project root')
        }
      }

      // 3. Otherwise, the package may be installed to
      // <DerviedData>/SourcePackages/checkouts/code-connect. We find the
      // DerivedData location from the BUILD_DIR (which points to
      // <DerivedData>/Build/Products).
      if (!hasFoundSourcePackagesDir) {
        const buildDir = buildSettings.match(/\s+BUILD_DIR = (.*)/)

        if (buildDir) {
          figmaPackageDir = `${buildDir[1]}/../../SourcePackages/checkouts/code-connect`
        } else {
          logger.warn('Package not found in build directory')
        }
      }
    }
  } else if (packageSwiftFile) {
    const swiftPackageDir = swiftPackagePath ? path.dirname(swiftPackagePath) : undefined
    const packageDir = swiftPackageDir || cwd
    // Use the Swift command to determine if the package is installed locally or from Git
    try {
      const result = spawnSync(
        'swift',
        ['package', '--package-path', packageDir, 'describe', '--type', 'json'],
        {
          cwd,
          encoding: 'utf-8',
        },
      )

      if (result.error) {
        throw result.error
      }

      const packageInfo = JSON.parse(result.stdout)

      const codeConnectPackage =
        packageInfo.dependencies.find((p: any) => p.identity === 'code-connect') ??
        // Our local directory is called figmadoc, so this is what swift outputs as the identity
        packageInfo.dependencies.find((p: any) => p.identity === 'figmadoc')

      if (!codeConnectPackage) {
        exitWithError(
          'Code Connect Swift package not found in Package.swift. Please add a dependency to https://github.com/figma/code-connect to your Package.swift file.',
        )
      }

      // We can run directly from the directory of the package swift file
      figmaPackageDir = packageDir
    } catch (e) {
      exitWithError(`Error calling Swift command: ${e}`)
    }
  }

  if (!figmaPackageDir) {
    exitWithError('Figma package could not be found')
  }

  // Check if the figmaPackageDir exists, otherwise we can't proceed,
  // as we require the code-connect package to continue
  if (!existsSync(figmaPackageDir)) {
    exitWithError(`Figma package directory not found at ${figmaPackageDir}`)
  }

  // We need to ensure that the directory is writable, so we can run the swift run command
  // otherwise an "invalid access" error will be thrown by swift.
  try {
    const packageFile = path.join(figmaPackageDir, 'Package.resolved')

    const accessCheck = spawnSync('test', ['-w', packageFile])
    if (accessCheck.status !== 0) {
      // Directory is not writable, attempt to make it writable
      spawnSync('chmod', ['-R', '755', packageFile])
    }
    logger.info(`Directory enabled for swift run command`)
  } catch (e) {
    logger.warn(`Unable to verify or modify directory permissions: ${e}`)
  }

  logger.info(
    `Found Code Connect Swift package at ${figmaPackageDir}, building parser binary. This may take a few minutes if this is the first time you've run Code Connect.`,
  )

  return figmaPackageDir
}

import chalk from 'chalk'
import { logger } from './logging'
import { execSync, spawnSync } from 'child_process'
import axios from 'axios'
import { compareVersions } from 'compare-versions'
import { BaseCommand } from '../commands/connect'

let updatedVersionAvailable: string | false | undefined = undefined
let message: string | undefined = undefined

type EndsWithBaseCommand<T extends BaseCommand> = [...any[], T]

// Wrap action handlers to check for updates or a message, and output a message
// after the action if any are available
export function withUpdateCheck<T extends BaseCommand>(
  // The last argument is always the command, but I couldn't work out how to
  // model this with Typescript here
  fn: (...args: any[]) => void | Promise<void>,
) {
  return (...args: EndsWithBaseCommand<T>) => {
    const command = args[args.length - 1]
    const restArgs = args.slice(0, -1)

    if (command.skipUpdateCheck) {
      return fn(...restArgs, command)
    }

    startUpdateCheck()

    const result = fn(...restArgs, command)
    if (result instanceof Promise) {
      result.finally(waitAndCheckForUpdates)
    } else {
      waitAndCheckForUpdates()
    }
  }
}

// Start checking for updates in the background. We don't wait for this before
// running the action, as we will show the result at the end
function startUpdateCheck() {
  axios
    .get('https://api.github.com/repos/figma/code-connect/releases/latest')
    .then((response) => {
      const latestVersion = response.data.tag_name.replace(/^v/, '')
      const currentVersion = require('../../package.json').version

      if (compareVersions(latestVersion, currentVersion) === 1) {
        updatedVersionAvailable = latestVersion
      } else {
        updatedVersionAvailable = false
      }
    })
    .catch(() => {
      // Silently fail if we can't check for updates
      updatedVersionAvailable = false
    })
}

// Wait for up to 1 second for the result of update checking to be available,
// and output a message if there is an update or a message. If there is no
// result after the timeout, the app will exit.
async function waitAndCheckForUpdates() {
  for (let i = 0; i < 10; i++) {
    if (updatedVersionAvailable !== undefined) {
      break
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }

  maybeShowUpdateMessage()
}

// Exit the process, first checking if there is an update or message available.
// Unlike waitAndCheckForUpdates, this will not wait for the update check to
// complete, so if the request has not completed yet, nothing will be shown.
// This is to avoid confusion about when the process _actually_ exits.
export function exitWithUpdateCheck(errorCode = 1): never {
  maybeShowUpdateMessage()
  process.exit(errorCode)
}

function getUpdateCommand() {
  return 'npm update -g @figma/code-connect'
}

function maybeShowUpdateMessage() {
  if (updatedVersionAvailable) {
    logger.warn(`\nA new version of the Figma CLI is available. v${require('../../package.json').version} is currently installed, and the latest version available is v${updatedVersionAvailable}.

To update, run ${chalk.whiteBright('npm install @figma/code-connect@latest')} for React, or ${chalk.whiteBright('npm install -g @figma/code-connect@latest')} for other targets (or if you have Code Connect installed globally).`)
  }

  if (message) {
    logger.warn(`\n${message}`)
  }
}

export function updateCli() {
  execSync(getUpdateCommand(), { stdio: 'inherit' })
}

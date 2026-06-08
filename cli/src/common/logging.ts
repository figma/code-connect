import chalk from 'chalk'

// Get console instance - use stderr in Node.js CLI contexts, fall back to global console in browser
function getConsole(): Console {
  if (typeof process !== 'undefined' && process.stderr) {
    const { Console } = require('console')
    return new Console(process.stderr)
  }
  return console
}

// Redirect all console output to stderr in CLI contexts, use global console in browser
const console: Console = getConsole()

export const error = chalk.red
export const success = chalk.green
export const info = chalk.white
export const warn = chalk.yellow
export const debug = chalk.gray
export const verbose = chalk.cyan
export const highlight = chalk.bold
export const reset = chalk.reset
export const underline = chalk.underline

export enum LogLevel {
  Nothing = 0,
  Error = 1,
  Warn = 2,
  Info = 3,
  Debug = 4,
}

let logLevel: LogLevel = LogLevel.Info

export const logger = {
  setLogLevel: (level: LogLevel) => {
    logLevel = level
  },
  error: (...msgs: unknown[]) => {
    if (logLevel >= LogLevel.Error) console.error(error(...msgs))
  },
  warn: (...msgs: unknown[]) => {
    if (logLevel >= LogLevel.Warn) console.warn(warn(...msgs))
  },
  info: (...msgs: unknown[]) => {
    if (logLevel >= LogLevel.Info) console.info(info(...msgs))
  },
  infoForce: (...msgs: unknown[]) => {
    console.info(info(...msgs))
  },
  debug: (...msgs: unknown[]) => {
    if (logLevel >= LogLevel.Debug) console.debug(debug(...msgs))
  },
}

/**
 * Exit the process with an error message. The `never` type tells TypeScript
 * that code after this will not be executed.
 *
 * @param msg Error message
 * @param errorCode Optional command exit code, defaults to 1
 */
export function exitWithError(msg: string, errorCode = 1): never {
  logger.error(msg)
  const {
    exitWithUpdateCheck,
  }: { exitWithUpdateCheck: (errorCode?: number) => never } = require('./updates')
  exitWithUpdateCheck(errorCode)
  throw new Error('unreachable')
}

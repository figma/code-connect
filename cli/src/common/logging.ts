import chalk from 'chalk'
import { Console } from 'console'
import { exitWithUpdateCheck } from './updates'

// Redirect all console output to stderr, so that JSON output to stdout in parse
// mode can be piped to other commands
const console = new Console(process.stderr)

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
  exitWithUpdateCheck(errorCode)
}

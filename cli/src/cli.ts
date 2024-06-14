#!/usr/bin/env node

import * as commander from 'commander'
import { addConnectCommandToProgram } from './commands/connect'

require('dotenv').config()

async function run() {
  const program = new commander.Command().version(require('./../package.json').version)
  program.enablePositionalOptions()

  addConnectCommandToProgram(program)

  program.parse(process.argv)
  if (program.args.length < 1) {
    program.outputHelp()
    process.exit(1)
  }
}

run()

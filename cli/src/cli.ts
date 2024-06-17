#!/usr/bin/env node

import * as commander from 'commander'
import { addConnectCommandToProgram } from './commands/connect'
import { updateCli } from './common/updates'

require('dotenv').config()

async function run() {
  const program = new commander.Command().version(require('./../package.json').version)
  program.enablePositionalOptions()

  addConnectCommandToProgram(program)

  program
    .command('update')
    .description('Updates to the latest version of the Figma CLI')
    .action(() => {
      updateCli()
    })

  program.parse(process.argv)
  if (program.args.length < 1) {
    program.outputHelp()
    process.exit(1)
  }
}

run()

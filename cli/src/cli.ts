#!/usr/bin/env node

import * as commander from 'commander'
import { addConnectCommandToProgram } from './commands/connect'
import { maybePrefillWizardQuestionsForTesting } from './connect/wizard/helpers'

require('dotenv').config()

async function run() {
  maybePrefillWizardQuestionsForTesting()

  const program = new commander.Command().version(require('./../package.json').version)
  program.enablePositionalOptions()

  addConnectCommandToProgram(program)

  // Update command is temporarily disabled until we can show the correct update
  // command to React vs non-React users
  /*
  program
    .command('update')
    .description('Updates to the latest version of the Figma CLI')
    .action(() => {
      updateCli()
    })
  */

  program.parse(process.argv)
  if (program.args.length < 1) {
    program.outputHelp()
    process.exit(1)
  }
}

run()

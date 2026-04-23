#!/usr/bin/env node
/**
 * Minimal CLI entry for e2e testing of the template-only create command.
 */
import * as commander from 'commander'
import { addCodeConnectCommandsToProgram } from '../../../../commands/connect_template'

require('dotenv').config()

const program = new commander.Command().version('0.0.1')
addCodeConnectCommandsToProgram(program)
program.parse(process.argv)

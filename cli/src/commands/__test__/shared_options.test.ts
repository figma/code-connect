import * as commander from 'commander'
import { addConnectCommandToProgram } from '../connect'

type Opts = Record<string, unknown>

// Build the real production command tree via addConnectCommandToProgram,
// then replace the named subcommand's action with a spy so we can assert on
// the options the handler would have received. This exercises the actual
// preAction hook wired up in connect.ts — if that hook is removed or broken,
// these tests fail.
function exerciseSubcommand(subcommandName: string) {
  const program = new commander.Command()
  addConnectCommandToProgram(program)
  const connectCmd = program.commands.find((c) => c.name() === 'connect')!
  const sub = connectCmd.commands.find((c) => c.name() === subcommandName)!
  let captured: Opts = {}
  // commander's action callback receives any positional arguments first, then
  // the options object, then the Command instance — so options is always the
  // second-to-last argument regardless of the subcommand's positional shape.
  sub.action((...allArgs: unknown[]) => {
    captured = allArgs[allArgs.length - 2] as Opts
  })
  return (args: string[]): Opts => {
    program.parse(['node', 'cli', ...args])
    return captured
  }
}

describe('addConnectCommandToProgram: shared option propagation', () => {
  it('forwards leading flags through to the subcommand handler', () => {
    const parse = exerciseSubcommand('parse')
    expect(parse(['connect', '-v', '-c', 'cfg', 'parse'])).toMatchObject({
      verbose: true,
      config: 'cfg',
    })
  })

  it('still honours trailing flags', () => {
    const parse = exerciseSubcommand('parse')
    expect(parse(['connect', 'parse', '-v', '-c', 'cfg'])).toMatchObject({
      verbose: true,
      config: 'cfg',
    })
  })

  it.each([
    ['leading', ['connect', '-v', 'parse']],
    ['trailing', ['connect', 'parse', '-v']],
  ])('--verbose works in %s position', (_label, args) => {
    expect(exerciseSubcommand('parse')(args).verbose).toBe(true)
  })

  it.each([
    ['leading', ['connect', '-t', 'TKN', 'publish']],
    ['trailing', ['connect', 'publish', '-t', 'TKN']],
  ])('--token works in %s position', (_label, args) => {
    expect(exerciseSubcommand('publish')(args).token).toBe('TKN')
  })

  it.each([
    ['leading', ['connect', '-c', 'cfg.json', 'publish']],
    ['trailing', ['connect', 'publish', '-c', 'cfg.json']],
  ])('--config works in %s position', (_label, args) => {
    expect(exerciseSubcommand('publish')(args).config).toBe('cfg.json')
  })

  it.each([
    ['leading', ['connect', '--api-url', 'https://api.test', 'preview']],
    ['trailing', ['connect', 'preview', '--api-url', 'https://api.test']],
  ])('--api-url works in %s position', (_label, args) => {
    expect(exerciseSubcommand('preview')(args).apiUrl).toBe('https://api.test')
  })

  it.each([
    ['leading', ['connect', '--skip-update-check', 'parse']],
    ['trailing', ['connect', 'parse', '--skip-update-check']],
  ])('--skip-update-check works in %s position', (_label, args) => {
    expect(exerciseSubcommand('parse')(args).skipUpdateCheck).toBe(true)
  })

  it.each([
    ['leading', ['connect', '--dry-run', 'publish']],
    ['trailing', ['connect', 'publish', '--dry-run']],
  ])('--dry-run works in %s position', (_label, args) => {
    expect(exerciseSubcommand('publish')(args).dryRun).toBe(true)
  })

  it('the same flag at both levels resolves rightmost-wins', () => {
    const parse = exerciseSubcommand('publish')
    expect(parse(['connect', '-t', 'PARENT', 'publish', '-t', 'CHILD']).token).toBe('CHILD')
  })

  it('subcommand-only flags (e.g. --force on publish) still reach the handler', () => {
    const parse = exerciseSubcommand('publish')
    expect(parse(['connect', '-v', 'publish', '--force'])).toMatchObject({
      verbose: true,
      force: true,
    })
  })

  it('with no shared flag supplied, options stays at subcommand defaults', () => {
    const parse = exerciseSubcommand('parse')
    const opts = parse(['connect', 'parse'])
    expect(opts.verbose).toBeUndefined()
    expect(opts.token).toBeUndefined()
    expect(opts.config).toBeUndefined()
  })

  it('multiple shared flags written in mixed positions all reach the handler', () => {
    const parse = exerciseSubcommand('publish')
    expect(parse(['connect', '-v', 'publish', '-t', 'TKN'])).toMatchObject({
      verbose: true,
      token: 'TKN',
    })
  })
})

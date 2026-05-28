jest.mock('fs', () => ({ existsSync: jest.fn() }))
jest.mock('../../common/logging', () => ({ exitWithError: jest.fn() }))

import path from 'path'
import { filterProjectInfoByFile } from '../filter_project_info'

const { exitWithError } = jest.requireMock('../../common/logging')
const { existsSync } = jest.requireMock('fs')

function makeProjectInfo(files: string[]) {
  return {
    absPath: '/project',
    files,
    remoteUrl: 'https://github.com/test/repo',
    config: {} as any,
  }
}

describe('filterProjectInfoByFile', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns projectInfo unchanged when --file is not specified', () => {
    const info = makeProjectInfo(['/a.ts', '/b.ts'])
    expect(filterProjectInfoByFile(info, undefined)).toBe(info)
    expect(existsSync).not.toHaveBeenCalled()
  })

  it('returns projectInfo unchanged when file is empty string', () => {
    const info = makeProjectInfo(['/a.ts'])
    expect(filterProjectInfoByFile(info, '')).toBe(info)
  })

  it('returns projectInfo unchanged when file list is empty', () => {
    const info = makeProjectInfo(['/a.ts'])
    expect(filterProjectInfoByFile(info, [])).toBe(info)
    expect(existsSync).not.toHaveBeenCalled()
  })

  it('filters files to only the specified file (string input)', () => {
    const absFile = path.resolve('/project/a.ts')
    const info = makeProjectInfo([absFile, '/project/b.ts'])
    existsSync.mockReturnValue(true)

    const result = filterProjectInfoByFile(info, '/project/a.ts')

    expect(result.files).toEqual([absFile])
    expect(result.absPath).toBe(info.absPath)
    expect(result.remoteUrl).toBe(info.remoteUrl)
    expect(result).not.toBe(info)
  })

  it('filters files to the specified files (array input)', () => {
    const absA = path.resolve('/project/a.ts')
    const absB = path.resolve('/project/b.ts')
    const info = makeProjectInfo([absA, absB, '/project/c.ts'])
    existsSync.mockReturnValue(true)

    const result = filterProjectInfoByFile(info, ['/project/a.ts', '/project/b.ts'])

    expect(result.files).toEqual([absA, absB])
  })

  it('preserves projectInfo.files ordering regardless of input order', () => {
    const absA = path.resolve('/project/a.ts')
    const absB = path.resolve('/project/b.ts')
    const info = makeProjectInfo([absA, absB])
    existsSync.mockReturnValue(true)

    const result = filterProjectInfoByFile(info, ['/project/b.ts', '/project/a.ts'])

    expect(result.files).toEqual([absA, absB])
  })

  it('exits with error when any file does not exist on disk', () => {
    existsSync.mockImplementation((p: string) => !p.endsWith('missing.ts'))
    filterProjectInfoByFile(makeProjectInfo([]), ['/project/a.ts', '/project/missing.ts'])
    expect(exitWithError).toHaveBeenCalledWith(expect.stringContaining('File not found:'))
  })

  it('exits with error when any file is not in the project file list', () => {
    existsSync.mockReturnValue(true)
    const absUnlisted = path.resolve('/project/unlisted.ts')
    const absListed = path.resolve('/project/listed.ts')
    filterProjectInfoByFile(makeProjectInfo([absListed]), [
      '/project/listed.ts',
      '/project/unlisted.ts',
    ])
    expect(exitWithError).toHaveBeenCalledWith(expect.stringContaining(`  - ${absUnlisted}`))
  })
})

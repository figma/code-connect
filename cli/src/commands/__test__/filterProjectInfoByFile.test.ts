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

  it('filters files to only the specified file', () => {
    const absFile = path.resolve('/project/a.ts')
    const info = makeProjectInfo([absFile, '/project/b.ts'])
    existsSync.mockReturnValue(true)

    const result = filterProjectInfoByFile(info, '/project/a.ts')

    expect(result.files).toEqual([absFile])
    expect(result.absPath).toBe(info.absPath)
    expect(result.remoteUrl).toBe(info.remoteUrl)
    expect(result).not.toBe(info)
  })

  it('exits with error when the file does not exist on disk', () => {
    existsSync.mockReturnValue(false)
    filterProjectInfoByFile(makeProjectInfo([]), '/project/missing.ts')
    expect(exitWithError).toHaveBeenCalledWith(expect.stringContaining('File not found:'))
  })

  it('exits with error when the file is not in the project file list', () => {
    existsSync.mockReturnValue(true)
    const absFile = path.resolve('/project/unlisted.ts')
    filterProjectInfoByFile(makeProjectInfo(['/other.ts']), '/project/unlisted.ts')
    expect(exitWithError).toHaveBeenCalledWith(
      expect.stringContaining(`File ${absFile} was not found in the project's file list`),
    )
  })
})

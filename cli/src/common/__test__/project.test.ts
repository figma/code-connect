import { getRemoteFileUrl } from '../../connect/project'

describe('project functions', () => {
  describe('getRemoteFileUrl', () => {
    it('handles git repo urls', () => {
      expect(getRemoteFileUrl('/path/file.ts', 'git@github.com:myorg/myrepo.git')).toBe(
        'https://github.com/myorg/myrepo/blob/master/path/file.ts',
      )
    })

    it('handles https repo urls', () => {
      expect(getRemoteFileUrl('/path/file.ts', 'https://github.com/myorg/myrepo.git')).toBe(
        'https://github.com/myorg/myrepo/blob/master/path/file.ts',
      )
    })
  })
})

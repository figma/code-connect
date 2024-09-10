import { CodeConnectReactConfig, getRemoteFileUrl, mapImportPath } from '../project'

describe('Project helper functions', () => {
  function getConfig(importPaths: {}): CodeConnectReactConfig {
    return {
      parser: 'react',
      ...importPaths,
    }
  }

  describe('importPath mappings', () => {
    it('Matches a simple import path', () => {
      const mapped = mapImportPath(
        '/Users/test/app/src/button.tsx',
        getConfig({ importPaths: { 'src/button.tsx': '@ui/button' } }),
      )
      expect(mapped).toEqual('@ui/button')
    })

    it('Matches a wildcard import path', () => {
      const mapped = mapImportPath(
        '/Users/test/app/src/button.tsx',
        getConfig({ importPaths: { 'src/*': '@ui' } }),
      )
      expect(mapped).toEqual('@ui')
    })

    it('Matches a wildcard import path with a wildcard output path', () => {
      const mapped = mapImportPath(
        '/Users/test/app/src/button.tsx',
        getConfig({ importPaths: { 'src/*': '@ui/*' } }),
      )
      expect(mapped).toEqual('@ui/button')
    })

    it('Matches a wildcard import path with a nested directory', () => {
      const mapped = mapImportPath(
        '/Users/test/app/src/components/button.tsx',
        getConfig({ importPaths: { 'src/*': '@ui' } }),
      )
      expect(mapped).toEqual('@ui')
    })

    it('Matches a wildcard import path and output path with a nested directory', () => {
      const mapped = mapImportPath(
        '/Users/test/app/src/components/button.tsx',
        getConfig({ importPaths: { 'src/*': '@ui/*' } }),
      )
      expect(mapped).toEqual('@ui/button')
    })

    it('Passing only a wildcard matches any import', () => {
      const mapped = mapImportPath(
        '/Users/test/app/src/components/button.tsx',
        getConfig({ importPaths: { '*': '@ui' } }),
      )
      expect(mapped).toEqual('@ui')
    })

    it('Returns null for non-matching paths', () => {
      const mapped = mapImportPath(
        '/Users/test/app/src/button.tsx',
        getConfig({ importPaths: { 'src/components/*': '@ui' } }),
      )
      expect(mapped).toBeNull()
    })

    it('Should pick the first match if there are multiple mappings', () => {
      const mapped = mapImportPath(
        '/Users/test/app/src/icons/icon.tsx',
        getConfig({ importPaths: { 'icons/*': '@ui/icons', 'src/*': '@ui' } }),
      )
      expect(mapped).toEqual('@ui/icons')
    })
  })

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

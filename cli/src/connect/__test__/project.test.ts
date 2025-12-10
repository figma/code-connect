import {
  CodeConnectReactConfig,
  getRemoteFileUrl,
  mapImportPath,
  mapImportSpecifier,
} from '../project'

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

    it('Uses filename for index files (use mapImportSpecifier for better results)', () => {
      // Note: mapImportPath uses the resolved file path, so index.ts files return 'index'.
      // For better handling of path aliases, use mapImportSpecifier with the original specifier.
      const mapped = mapImportPath(
        '/Users/test/app/src/AlertTitle/index.ts',
        getConfig({ importPaths: { 'src/*': '@acme/package/*' } }),
      )
      expect(mapped).toEqual('@acme/package/index')
    })

    it('Uses filename for nested index files', () => {
      const mapped = mapImportPath(
        '/Users/test/app/src/components/Button/index.tsx',
        getConfig({ importPaths: { 'src/*': '@ui/*' } }),
      )
      expect(mapped).toEqual('@ui/index')
    })

    it('Uses filename when file is not an index file', () => {
      const mapped = mapImportPath(
        '/Users/test/app/src/AlertTitle/AlertTitle.tsx',
        getConfig({ importPaths: { 'src/*': '@acme/package/*' } }),
      )
      expect(mapped).toEqual('@acme/package/AlertTitle')
    })
  })

  describe('importSpecifier mappings', () => {
    it('Transforms path alias with wildcard to package path', () => {
      const mapped = mapImportSpecifier(
        '@/AlertTitle',
        getConfig({ importPaths: { '@/*': '@acme/package/*' } }),
      )
      expect(mapped).toEqual('@acme/package/AlertTitle')
    })

    it('Transforms nested path alias to package path', () => {
      const mapped = mapImportSpecifier(
        '@/components/Button',
        getConfig({ importPaths: { '@/*': '@ui/*' } }),
      )
      expect(mapped).toEqual('@ui/components/Button')
    })

    it('Handles exact match without wildcard', () => {
      const mapped = mapImportSpecifier(
        '@/Button',
        getConfig({ importPaths: { '@/Button': '@acme/Button' } }),
      )
      expect(mapped).toEqual('@acme/Button')
    })

    it('Handles wildcard replacement without output wildcard', () => {
      const mapped = mapImportSpecifier(
        '@/components/Button',
        getConfig({ importPaths: { '@/*': '@ui' } }),
      )
      expect(mapped).toEqual('@ui')
    })

    it('Returns null for non-matching specifiers', () => {
      const mapped = mapImportSpecifier(
        './Button',
        getConfig({ importPaths: { '@/*': '@acme/package/*' } }),
      )
      expect(mapped).toBeNull()
    })

    it('Matches first pattern when multiple patterns could match', () => {
      const mapped = mapImportSpecifier(
        '@/icons/icon',
        getConfig({ importPaths: { '@/icons/*': '@ui/icons/*', '@/*': '@ui/*' } }),
      )
      expect(mapped).toEqual('@ui/icons/icon')
    })

    it('Returns null when no importPaths configured', () => {
      const mapped = mapImportSpecifier('@/Button', getConfig({}))
      expect(mapped).toBeNull()
    })

    it('Handles special regex characters in pattern', () => {
      const mapped = mapImportSpecifier(
        '@scope/package/Button',
        getConfig({ importPaths: { '@scope/package/*': '@acme/*' } }),
      )
      expect(mapped).toEqual('@acme/Button')
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

    it('handles gitlab repo urls', () => {
      expect(getRemoteFileUrl('/path/file.ts', 'git@gitlab.com:myorg/myrepo.git')).toBe(
        'https://gitlab.com/myorg/myrepo/-/blob/master/path/file.ts',
      )
    })

    it('handles Bitbucket repo urls', () => {
      expect(getRemoteFileUrl('/path/file.ts', 'git@bitbucket.org:myorg/myrepo.git')).toBe(
        'https://bitbucket.org/myorg/myrepo/src/master/path/file.ts',
      )
    })

    it('handles Azure repo urls', () => {
      expect(
        getRemoteFileUrl('/path/file.ts', 'git@ssh.dev.azure.com:v3/myorg/myrepo/myrepo'),
      ).toBe('https://dev.azure.com/myorg/myrepo/_git/myrepo?path=/path/file.ts&branch=master')
    })

    it('handles Azure repo urls with https', () => {
      expect(
        getRemoteFileUrl('/path/file.ts', 'https://myorg@dev.azure.com/myorg/myrepo/_git/myrepo'),
      ).toBe('https://dev.azure.com/myorg/myrepo/_git/myrepo?path=/path/file.ts&branch=master')
    })

    it('assumes GitHub-like structure for unknown urls', () => {
      expect(
        getRemoteFileUrl('/path/file.ts', 'https://my-custom-domain.com/myorg/myrepo.git'),
      ).toBe('https://my-custom-domain.com/myorg/myrepo/blob/master/path/file.ts')
    })
  })
})

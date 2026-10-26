import fs from 'fs'
import os from 'os'
import path from 'path'
import { spawnSync } from 'child_process'
import {
  CodeConnectReactConfig,
  convertRemoteFileUrlToRelativePath,
  getGitRepoDefaultBranchName,
  getProjectInfoFromConfig,
  getRemoteFileUrl,
  mapImportPath,
  mapImportSpecifier,
} from '../project'

describe('Project helper functions', () => {
  describe('file discovery', () => {
    let tmpDir: string

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'code-connect-discovery-test-'))
    })

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    })

    function createFiles(files: string[]) {
      for (const file of files) {
        const filePath = path.join(tmpDir, file)
        fs.mkdirSync(path.dirname(filePath), { recursive: true })
        fs.writeFileSync(filePath, '')
      }
    }

    it('discovers templates in a literal project path containing glob characters while honoring exclusions', async () => {
      const projectName = '[customer]-project{copy,backup}'
      const projectDir = path.join(tmpDir, projectName)
      const templates = ['src/figma/Badge.figma.ts', 'src/figma/Badge.oam.figma.ts']
      createFiles(
        [...templates, 'src/figma/ignored/Ignore.figma.ts', 'node_modules/pkg/Module.figma.ts'].map(
          (file) => path.join(projectName, file),
        ),
      )

      const projectInfo = await getProjectInfoFromConfig(projectDir, {
        include: ['**/*.figma.ts'],
        exclude: ['src/figma/ignored/**'],
      })

      expect(projectInfo.files.sort()).toEqual(
        templates.map((file) => path.join(projectDir, file)).sort(),
      )
    })

    it('keeps leading-slash includes relative to the project directory while honoring exclusions', async () => {
      const projectDir = path.join(tmpDir, 'project')
      createFiles(['project/src/Badge.figma.ts', 'project/src/ignored/Ignore.figma.ts'])

      const projectInfo = await getProjectInfoFromConfig(projectDir, {
        include: ['/src/**/*.figma.ts'],
        exclude: ['src/ignored/**'],
      })

      expect(projectInfo.files).toEqual([path.join(projectDir, 'src/Badge.figma.ts')])
    })

    it('preserves parent-directory includes and exclusions relative to the specified project directory', async () => {
      const projectDir = path.join(tmpDir, 'project')
      const templates = ['project/src/Badge.figma.ts', 'shared/Badge.oam.figma.ts']
      createFiles([
        ...templates,
        'project/src/ignored/Ignore.figma.ts',
        'shared/ignored/Ignore.figma.ts',
      ])

      const projectInfo = await getProjectInfoFromConfig(projectDir, {
        include: ['src/**/*.figma.ts', '../shared/**/*.figma.ts'],
        exclude: ['src/ignored/**', '../shared/ignored/**'],
      })

      expect(projectInfo.files.sort()).toEqual(
        templates.map((file) => path.join(tmpDir, file)).sort(),
      )
    })
  })

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

    it('uses explicit defaultBranch when provided', () => {
      expect(
        getRemoteFileUrl('/path/file.ts', 'https://github.com/myorg/myrepo.git', 'release'),
      ).toBe('https://github.com/myorg/myrepo/blob/release/path/file.ts')
    })
  })

  describe('getGitRepoDefaultBranchName', () => {
    let tmpDir: string

    // Minimal git identity so operations don't fail with "Please tell me who you are"
    const gitEnv = {
      ...process.env,
      GIT_AUTHOR_NAME: 'Test',
      GIT_AUTHOR_EMAIL: 'test@test.com',
      GIT_COMMITTER_NAME: 'Test',
      GIT_COMMITTER_EMAIL: 'test@test.com',
    }

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'code-connect-branch-test-'))
      spawnSync('git', ['init'], { cwd: tmpDir, env: gitEnv })
      spawnSync('git', ['remote', 'add', 'origin', 'https://example.com/repo.git'], {
        cwd: tmpDir,
        env: gitEnv,
      })
    })

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    })

    it('returns configDefaultBranch without inspecting the repo', () => {
      // Pass a non-existent path to confirm the config value short-circuits
      expect(getGitRepoDefaultBranchName('/does/not/exist', 'release')).toBe('release')
    })

    it('detects an arbitrary default branch via symbolic-ref', () => {
      spawnSync(
        'git',
        ['symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/develop'],
        { cwd: tmpDir, env: gitEnv },
      )
      expect(getGitRepoDefaultBranchName(tmpDir)).toBe('develop')
    })

    it('falls back to "main" from branch list when symbolic-ref is not set', () => {
      // Write a fake remote tracking ref so `git branch -r` lists origin/main
      fs.mkdirSync(path.join(tmpDir, '.git', 'refs', 'remotes', 'origin'), { recursive: true })
      fs.writeFileSync(
        path.join(tmpDir, '.git', 'refs', 'remotes', 'origin', 'main'),
        '0000000000000000000000000000000000000001\n',
      )
      expect(getGitRepoDefaultBranchName(tmpDir)).toBe('main')
    })

    it('falls back to "master" when no branch info is available', () => {
      expect(getGitRepoDefaultBranchName(tmpDir)).toBe('master')
    })
  })
})

describe('convertRemoteFileUrlToRelativePath', () => {
  it('converts to relative path', () => {
    const result = convertRemoteFileUrlToRelativePath({
      remoteFileUrl:
        'https://github.com/slees-figma/sims-design-system/blob/main/components/ds/Modal.tsx',
      gitRootPath: '/user/me/my-repo',
      dir: '/user/me/my-repo/components',
    })
    expect(result).toBe(path.join('ds', 'Modal.tsx'))
  })
})

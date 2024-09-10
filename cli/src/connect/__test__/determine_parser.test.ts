import path, { join } from 'path'
import { determineConfigFromProject } from '../project'
import fs from 'fs'
import { tmpdir } from 'os'

describe('Determining parser from project', () => {
  function getConfigFromProject(project: string, subdirs: string[]) {
    // We move each test project to a temporary location so that the algorithm
    // doesn't always return 'swift' because it finds the Package.swift in the
    // top level of our project
    const tempDir = fs.mkdtempSync(join(tmpdir(), 'test'))
    fs.cpSync(path.join(__dirname, 'determine_parser', project), tempDir, { recursive: true })

    const result = determineConfigFromProject(path.join(tempDir, ...subdirs), false)

    fs.rmSync(tempDir, { recursive: true })
    return result?.codeConnect
  }

  describe('React', () => {
    it('determines a React project', () => {
      const config = getConfigFromProject('react', [])
      expect(config?.parser).toBe('react')
      expect(config?.label).toBe(undefined)
    })

    it('determines a React project from within a subdirectory', () => {
      const config = getConfigFromProject('react', ['components'])
      expect(config?.parser).toBe('react')
      expect(config?.label).toBe(undefined)
    })

    it('determines a React project from a peer dependency', () => {
      const config = getConfigFromProject('react_peer_dependency', [])
      expect(config?.parser).toBe('react')
      expect(config?.label).toBe(undefined)
    })
  })

  describe('HTML', () => {
    it('determines an HTML project if no supported framework exists in package.json', () => {
      const config = getConfigFromProject('html', [])
      expect(config?.parser).toBe('html')
      expect(config?.label).toBe(undefined)
    })

    it('determines an HTML project with label "Angular" if Angular is used', () => {
      const config = getConfigFromProject('angular', [])
      expect(config?.parser).toBe('html')
      expect(config?.label).toBe('Angular')
    })

    it('determines an HTML project with label "Vue" if Vue is used', () => {
      const config = getConfigFromProject('vue', [])
      expect(config?.parser).toBe('html')
      expect(config?.label).toBe('Vue')
    })
  })

  describe('Swift', () => {
    it('determines a Swift project from a Package.swift file', () => {
      const config = getConfigFromProject('swift_package', [])
      expect(config?.parser).toBe('swift')
      expect(config?.label).toBe(undefined)
    })

    it('determines a Swift project from a Package.swift file in a subdirectory', () => {
      const config = getConfigFromProject('swift_package', ['test'])
      expect(config?.parser).toBe('swift')
      expect(config?.label).toBe(undefined)
    })

    it('determines a Swift project from a xcodeproj file', () => {
      const config = getConfigFromProject('swift_xcodeproj', [])
      expect(config?.parser).toBe('swift')
      expect(config?.label).toBe(undefined)
    })

    it('determines a Swift project from a xcodeproj file in a subdirectory', () => {
      const config = getConfigFromProject('swift_xcodeproj', ['test'])
      expect(config?.parser).toBe('swift')
      expect(config?.label).toBe(undefined)
    })
  })

  describe('Unknown', () => {
    const config = getConfigFromProject('unknown', [])
    expect(config?.parser).toBe(undefined)
    expect(config?.label).toBe(undefined)
  })

  describe('Nested', () => {
    it('determines a Swift project from a Package.swift nested inside a React project', () => {
      const config = getConfigFromProject('swift_inside_react', ['swift_package', 'test'])
      expect(config?.parser).toBe('swift')
      expect(config?.label).toBe(undefined)
    })
  })
})

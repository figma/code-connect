import path, { join } from 'path'
import { determineParserFromProject } from '../project'
import fs from 'fs'
import { tmpdir } from 'os'

describe('Determining parser from project', () => {
  function getParserFromProject(project: string, subdirs: string[]) {
    // We move each test project to a temporary location so that the algorithm
    // doesn't always return 'swift' because it finds the Package.swift in the
    // top level of our project
    const tempDir = fs.mkdtempSync(join(tmpdir(), 'test'))
    fs.cpSync(path.join(__dirname, 'determine_parser', project), tempDir, { recursive: true })

    const result = determineParserFromProject(path.join(tempDir, ...subdirs))

    fs.rmSync(tempDir, { recursive: true })
    return result
  }

  describe('React', () => {
    it('determines a React project', () => {
      expect(getParserFromProject('react', [])).toBe('react')
    })

    it('determines a React project from within a subdirectory', () => {
      expect(getParserFromProject('react', ['components'])).toBe('react')
    })

    it('determines a React project from a peer dependency', () => {
      expect(getParserFromProject('react_peer_dependency', [])).toBe('react')
    })
  })

  describe('Swift', () => {
    it('determines a Swift project from a Package.swift file', () => {
      expect(getParserFromProject('swift_package', [])).toBe('swift')
    })

    it('determines a Swift project from a Package.swift file in a subdirectory', () => {
      expect(getParserFromProject('swift_package', ['test'])).toBe('swift')
    })

    it('determines a Swift project from a xcodeproj file', () => {
      expect(getParserFromProject('swift_xcodeproj', [])).toBe('swift')
    })

    it('determines a Swift project from a xcodeproj file in a subdirectory', () => {
      expect(getParserFromProject('swift_xcodeproj', ['test'])).toBe('swift')
    })
  })

  describe('Unknown', () => {
    expect(getParserFromProject('unknown', [])).toBe(undefined)
  })

  describe('Nested', () => {
    it('determines a Swift project from a Package.swift nested inside a React project', () => {
      expect(getParserFromProject('swift_inside_react', ['swift_package', 'test'])).toBe('swift')
    })
  })
})

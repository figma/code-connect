import { DEFAULT_INCLUDE_GLOBS_BY_PARSER } from '../../project'
import { getIncludesGlob } from '../helpers'

describe('getIncludesGlob', () => {
  it('returns default includes glob if no component directory', () => {
    const result = getIncludesGlob({
      dir: './',
      componentDirectory: null,
      config: {
        parser: 'react',
      },
    })
    expect(result).toBe(DEFAULT_INCLUDE_GLOBS_BY_PARSER.react)
  })

  it('prepends path to component directory to default globs', () => {
    const result = getIncludesGlob({
      dir: './',
      componentDirectory: './src/connect/wizard/__test__',
      config: {
        parser: 'react',
      },
    })
    expect(result).toEqual(['src/connect/wizard/__test__/**/*.{tsx,jsx}'])
  })
})

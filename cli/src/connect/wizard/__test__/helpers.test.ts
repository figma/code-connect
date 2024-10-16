import path from 'path'
import {
  DEFAULT_INCLUDE_GLOBS_BY_PARSER,
  ProjectInfo,
  ReactProjectInfo,
  getProjectInfo,
  getReactProjectInfo,
} from '../../project'
import {
  getIncludesGlob,
  getComponentOptionsMap,
  getFilepathExportsFromFiles,
  isValidFigmaUrl,
} from '../helpers'

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

describe('getComponentOptionsMap', () => {
  it('generates map of file paths to component Choice objects', () => {
    const result = getComponentOptionsMap([
      '/some/file.tsx~default',
      '/some/file.tsx~MyComponent',
      '/another/file.tsx~Component1',
      '/another/file.tsx~Component2',
      '/another/file.tsx~Component3',
      '/last_one.tsx~default',
    ])
    expect(result).toEqual({
      '/some/file.tsx': [
        {
          title: 'default',
          value: '/some/file.tsx~default',
        },
        {
          title: 'MyComponent',
          value: '/some/file.tsx~MyComponent',
        },
      ],
      '/another/file.tsx': [
        {
          title: 'Component1',
          value: '/another/file.tsx~Component1',
        },
        {
          title: 'Component2',
          value: '/another/file.tsx~Component2',
        },
        {
          title: 'Component3',
          value: '/another/file.tsx~Component3',
        },
      ],
      '/last_one.tsx': [
        {
          title: 'default',
          value: '/last_one.tsx~default',
        },
      ],
    })
  })
})

describe('getFilepathExportsFromFiles', () => {
  it('generates list of file component keys from ProjectInfo, ignoring unsupported files', async () => {
    const projectInfo = await getProjectInfo(
      path.join(__dirname, 'tsProgram', 'react'),
      path.join(__dirname, 'tsProgram', 'react', 'figma.config.json'),
    ).then((res) => getReactProjectInfo(res as ReactProjectInfo))
    const result = getFilepathExportsFromFiles(projectInfo, {} as any)
    expect(result.map((filepath) => path.parse(filepath).base)).toEqual([
      'plain_js_file.jsx~PlainOldJsComponent',
      'MyComponent.tsx~MyComponent',
      'MyComponent.tsx~MyComponentProps', // TODO ideally we'd filter out by type here
      'MultipleComponents.tsx~default',
      'MultipleComponents.tsx~AnotherComponent1',
      'MultipleComponents.tsx~AnotherComponent2',
    ])
  })
})

describe('isValidFigmaUrl', () => {
  it('works as expected', () => {
    const shouldPass = [
      'https://www.figma.com/file/1234567890/My-File',
      'https://figma.com/file/1234567890/My-File',
      'https://figma.com/design/1234567890/My-File',
    ]
    shouldPass.forEach((url) => {
      expect(isValidFigmaUrl(url)).toBe(true)
    })
    const shouldFail = [
      'https://www.something.com/file/1234567890/My-File',
      'https://figma.com/file',
      'https://something.com/https://figma.com/design/1234567890/My-File',
    ]
    shouldFail.forEach((url) => {
      expect(isValidFigmaUrl(url)).toBe(false)
    })
  })
})

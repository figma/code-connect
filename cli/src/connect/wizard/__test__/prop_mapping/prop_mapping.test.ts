import path from 'path'
import { ReactProjectInfo, getProjectInfo, getReactProjectInfo } from '../../../project'
import { extractSignature, generatePropMapping } from '../../prop_mapping'
import { FigmaRestApi } from '../../../figma_rest_api'

describe('Prop mapping', () => {
  describe('extractSignature', () => {
    let projectInfo: ReactProjectInfo
    let componentsFilepath: string

    beforeEach(async () => {
      projectInfo = await getProjectInfo(path.join(__dirname, 'tsProgram', 'react'), '').then(
        (res) => getReactProjectInfo(res as ReactProjectInfo),
      )
      componentsFilepath = path.join(__dirname, 'tsProgram', 'react', 'Components.tsx')
    })

    it('Extracts signature containing a broad set of types', async () => {
      const result = await extractSignature({
        nameToFind: 'LotsOfProps',
        sourceFilePath: componentsFilepath,
        projectInfo,
      })
      expect(result).toEqual({
        children: 'React.ReactNode',
        onClick: 'React.MouseEventHandler<HTMLDivElement>',
        title: 'string',
        hasIcon: 'false | true',
        count: 'number',
        anOptionalString: '?string',
        fuzzyMatchingString: 'string',
      })
    })

    it('Extracts signature from a call expression', async () => {
      const result = await extractSignature({
        nameToFind: 'MemoizedComponent',
        sourceFilePath: componentsFilepath,
        projectInfo,
      })
      expect(result).toEqual({
        unmemoized: 'true',
      })
    })

    // TODO fix in Parser
    // it('Extracts signature from a variable alias', async () => {
    //   const result = await extractSignature('AliasForComponent', componentsFilepath, projectInfo)
    //   expect(result).toEqual({
    //     aliased: 'true',
    //   })
    // })

    it('Extracts signature from default export', async () => {
      const result = await extractSignature({
        nameToFind: 'default',
        sourceFilePath: componentsFilepath,
        projectInfo,
      })
      expect(result).toEqual({
        isDefault: 'true',
      })
    })
  })

  describe('generatePropMapping', () => {
    let projectInfo: ReactProjectInfo
    let componentsFilepath: string

    beforeEach(async () => {
      projectInfo = await getProjectInfo(path.join(__dirname, 'tsProgram', 'react'), '').then(
        (res) => getReactProjectInfo(res as ReactProjectInfo),
      )
      componentsFilepath = path.join(__dirname, 'tsProgram', 'react', 'Components.tsx')
    })

    it('Generates a prop mapping from a file, export, and Figma component', async () => {
      const result = await generatePropMapping({
        exportName: 'LotsOfProps',
        filepath: componentsFilepath,
        projectInfo,
        component: {
          type: 'COMPONENT',
          name: 'Lots of props',
          id: '111:111',
          children: [],
          componentPropertyDefinitions: {
            'Has Icon': {
              type: FigmaRestApi.ComponentPropertyType.Boolean,
              defaultValue: false,
            },
            Title: {
              type: FigmaRestApi.ComponentPropertyType.Text,
              defaultValue: '',
            },
            'Fuzzy Match String': {
              type: FigmaRestApi.ComponentPropertyType.Text,
              defaultValue: '',
            },
          },
        },
        cmd: {} as any,
      })
      expect(result).toEqual({
        'Has Icon': {
          codePropName: 'hasIcon',
          mapping: 'BOOLEAN',
        },
        Title: {
          codePropName: 'title',
          mapping: 'TEXT',
        },
        'Fuzzy Match String': {
          codePropName: 'fuzzyMatchingString',
          mapping: 'TEXT',
        },
      })
    })
  })
})

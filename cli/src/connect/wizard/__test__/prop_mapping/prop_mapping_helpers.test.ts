import path from 'path'
import fs from 'fs'
import { ReactProjectInfo, getProjectInfo, getReactProjectInfo } from '../../../project'
import { MatchableNameTypes } from '../../prop_mapping'
import {
  PropMappingData,
  extractDataAndGenerateAllPropsMappings,
  getUniqueMatchableNames,
} from '../../prop_mapping_helpers'
import { getFilepathExport } from '../../helpers'
import { FigmaRestApi } from '../../../figma_rest_api'
import * as embeddings from '../../embeddings'

describe('Prop mapping helpers', () => {
  const propMappingData: PropMappingData = {
    'my/file/path': {
      signature: {
        identifier: 'string',
        label: '?string',
        isActive: '?false | true',
        disabled: '?false | true',
      },
      matchableNamesMap: {
        isDisabled: [
          {
            name: 'isDisabled',
            type: MatchableNameTypes.Property,
          },
          {
            name: 'isDisabled',
            type: MatchableNameTypes.VariantValue,
            variantProperty: 'Variant',
          },
        ],
        label: [
          {
            name: 'label',
            type: MatchableNameTypes.Property,
          },
        ],
      },
      componentPropertyDefinitions: {},
    },
  }
  describe('getUniqueMatchableNames', () => {
    it('Gets array of unique matchable names from mapping data', () => {
      const result = getUniqueMatchableNames(propMappingData)
      expect(result).toEqual(['identifier', 'label', 'isActive', 'disabled', 'isDisabled'])
    })
  })

  describe('extractDataAndGenerateAllPropsMappings', () => {
    let projectInfo: ReactProjectInfo
    let componentsFilepath: string

    beforeEach(async () => {
      projectInfo = await getProjectInfo(path.join(__dirname, 'tsProgram', 'react'), '').then(
        (res) => getReactProjectInfo(res as ReactProjectInfo),
      )
      componentsFilepath = path.join(__dirname, 'tsProgram', 'react', 'Components.tsx')
    })

    it('Generates a prop mapping from a file, export, and Figma component without AI', async () => {
      const filepathExport = getFilepathExport(componentsFilepath, 'LotsOfProps')
      const result = await extractDataAndGenerateAllPropsMappings({
        filepathExportsToComponents: {
          [filepathExport]: {
            type: 'COMPONENT',
            name: 'My component',
            id: '123:123',
            pageId: '0:1',
            pageName: 'Page 1',
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
        },
        projectInfo,
        cmd: {} as any,
        accessToken: '123',
        figmaUrl: 'https://www.figma.com/file/123/My-File',
        useAi: false,
      })
      expect(result.propMappings).toEqual({
        [filepathExport]: {
          hasIcon: {
            kind: 'boolean',
            args: {
              figmaPropName: 'Has Icon',
            },
          },
          title: {
            kind: 'string',
            args: {
              figmaPropName: 'Title',
            },
          },
          fuzzyMatchingString: {
            kind: 'string',
            args: {
              figmaPropName: 'Fuzzy Match String',
            },
          },
        },
      })
    })

    it('Generates a prop mapping from a file, export, and Figma component with AI', async () => {
      jest
        .spyOn(embeddings, 'fetchEmbeddings')
        .mockReturnValue(
          Promise.resolve(
            JSON.parse(fs.readFileSync(path.join(__dirname, `mock_embeddings.json`), 'utf-8')),
          ),
        )
      const filepathExport = getFilepathExport(componentsFilepath, 'LotsOfProps')
      const result = await extractDataAndGenerateAllPropsMappings({
        filepathExportsToComponents: {
          [filepathExport]: {
            type: 'COMPONENT',
            name: 'My component',
            id: '123:123',
            pageId: '0:1',
            pageName: 'Page 1',
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
        },
        projectInfo,
        cmd: {} as any,
        accessToken: '123',
        figmaUrl: 'https://www.figma.com/file/123/My-File',
        useAi: true,
      })
      expect(result.propMappings).toEqual({
        [filepathExport]: {
          hasIcon: {
            kind: 'boolean',
            args: {
              figmaPropName: 'Has Icon',
            },
          },
          title: {
            kind: 'string',
            args: {
              figmaPropName: 'Title',
            },
          },
          fuzzyMatchingString: {
            kind: 'string',
            args: {
              figmaPropName: 'Fuzzy Match String',
            },
          },
        },
      })
    })
  })
})

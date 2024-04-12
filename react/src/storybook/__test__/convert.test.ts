import { getProjectInfo } from '../../common/project'
import { existsSync, readFileSync } from 'fs'
import { convertStorybookFiles } from '../convert'
import path from 'path'

const EXAMPLE_DIR = path.join(__dirname, 'examples')

async function convertStorybookFile(testFile: string) {
  if (!existsSync(path.join(EXAMPLE_DIR, testFile))) {
    throw new Error(`Test file ${testFile} does not exist`)
  }

  const projectInfo = {
    ...getProjectInfo(EXAMPLE_DIR),
    remoteUrl: 'git@github.com:figma/code-connect.git',
  }

  const result = await convertStorybookFiles({
    projectInfo,
    storiesGlob: testFile,
  })

  return result
}

async function expectStorybookFileToNotBeConverted(testFile: string) {
  if (!existsSync(path.join(EXAMPLE_DIR, testFile))) {
    throw new Error(`Test file ${testFile} does not exist`)
  }

  const projectInfo = getProjectInfo(EXAMPLE_DIR)

  const result = await convertStorybookFiles({
    projectInfo,
    storiesGlob: testFile,
  })

  expect(result).toHaveLength(0)
}

function getExpectedTemplate(name: string) {
  return (
    require('../../common/parser_template_helpers').getParsedTemplateHelpersString() +
    '\n\n' +
    readFileSync(path.join(__dirname, 'expected_templates', `${name}.expected_template`), 'utf-8')
  )
}

describe('convertStorybookFiles (JS templates)', () => {
  it('ignores stories without parameters', async () => {
    await expectStorybookFileToNotBeConverted('NoParameters.stories.tsx')
  })

  it('ignores stories with no design parameter', async () => {
    await expectStorybookFileToNotBeConverted('NoDesignParameter.stories.tsx')
  })

  it('ignores stories with no design type parameter', async () => {
    await expectStorybookFileToNotBeConverted('NoTypeDesignParameter.stories.tsx')
  })

  it('ignores stories with a non-Figma design type parameter', async () => {
    await expectStorybookFileToNotBeConverted('NonFigmaDesignParameter.stories.tsx')
  })

  // Different component styles should already be tested in the parser tests,
  // but no harm in some basic sanity checks here
  describe('component styles', () => {
    it('handles function components', async () => {
      const result = await convertStorybookFile('FunctionComponent.stories.tsx')
      expect(result).toMatchObject([
        {
          figmaNode: 'https://figma.com/test',
          source:
            'https://github.com/figma/code-connect/tree/master/react/src/storybook/__test__/examples/FunctionComponent.tsx',
          sourceLocation: { line: 7 },
          template: getExpectedTemplate('FunctionComponent'),
        },
      ])
    })

    it('handles arrow components', async () => {
      const result = await convertStorybookFile('ArrowComponent.stories.tsx')
      expect(result).toMatchObject([
        {
          figmaNode: 'https://figma.com/test',
          source:
            'https://github.com/figma/code-connect/tree/master/react/src/storybook/__test__/examples/ArrowComponent.tsx',
          sourceLocation: { line: 7 },
          template: getExpectedTemplate('ArrowComponent'),
        },
      ])
    })
  })

  describe('story styles', () => {
    const expectedFigmadoc = [
      {
        figmaNode: 'https://figma.com/test',
        source:
          'https://github.com/figma/code-connect/tree/master/react/src/storybook/__test__/examples/FunctionComponent.tsx',
        sourceLocation: { line: 7 },
        template: getExpectedTemplate('FunctionComponent'),
      },
      {
        template: getExpectedTemplate('FunctionComponentWithLogic'),
      },
      {
        template: getExpectedTemplate('FunctionComponentWithArgs'),
      },
    ]

    it('handles function stories', async () => {
      const result = await convertStorybookFile('FunctionStories.stories.tsx')
      expect(result).toMatchObject(expectedFigmadoc)
    })

    it('handles arrow function stories with explicit return', async () => {
      const result = await convertStorybookFile('ArrowStoriesExplicitReturn.stories.tsx')
      expect(result).toMatchObject(expectedFigmadoc)
    })

    it('handles arrow function stories with implicit return', async () => {
      const result = await convertStorybookFile('ArrowStoriesImplicitReturn.stories.tsx')
      expect(result).toMatchObject([
        {
          figmaNode: 'https://figma.com/test',
          source:
            'https://github.com/figma/code-connect/tree/master/react/src/storybook/__test__/examples/FunctionComponent.tsx',
          sourceLocation: { line: 7 },
          template: getExpectedTemplate('FunctionComponent'),
        },
        {
          template: getExpectedTemplate('FunctionComponentWithArgs_indented'),
        },
      ])
    })

    it('handles story objects with a render function', async () => {
      const result = await convertStorybookFile('StoryObjectWithRender.stories.tsx')
      expect(result).toMatchObject([
        {
          figmaNode: 'https://figma.com/test',
          source:
            'https://github.com/figma/code-connect/tree/master/react/src/storybook/__test__/examples/FunctionComponent.tsx',
          sourceLocation: { line: 7 },
          template: getExpectedTemplate('FunctionComponent'),
        },
        {
          template: getExpectedTemplate('FunctionComponentWithLogic'),
        },
        {
          template: getExpectedTemplate('FunctionComponentWithArgs_indented_2'),
        },
      ])
    })
  })

  describe('prop mapping', () => {
    const expectedFigmadoc = [
      {
        figmaNode: 'https://figma.com/test',
        source:
          'https://github.com/figma/code-connect/tree/master/react/src/storybook/__test__/examples/PropMapping.tsx',
        sourceLocation: { line: 7 },
        template: getExpectedTemplate('PropMapping'),
        // name: 'Default',
        templateData: {
          props: {
            stringProp: {
              kind: 'string',
              args: {
                figmaPropName: 'Text',
              },
            },
            booleanProp: {
              kind: 'boolean',
              args: {
                figmaPropName: 'Boolean Prop',
              },
            },
            enumProp: {
              kind: 'enum',
              args: {
                figmaPropName: 'Size',
                valueMapping: {
                  Slim: 'slim',
                  Medium: 'medium',
                  Large: 'large',
                },
              },
            },
          },
        },
      },
    ]

    it('handles prop mapping', async () => {
      const result = await convertStorybookFile('PropMapping.stories.tsx')
      expect(result).toMatchObject(expectedFigmadoc)
    })
  })

  describe('Examples', () => {
    it('uses the default template if no examples exist', async () => {
      const result = await convertStorybookFile('NoExamples.stories.tsx')
      expect(result).toMatchObject([
        {
          figmaNode: 'https://figma.com/test',
          source:
            'https://github.com/figma/code-connect/tree/master/react/src/storybook/__test__/examples/ArrowComponent.tsx',
          sourceLocation: { line: 7 },
          template: `const figma = require("figma")\n\nexport default figma.tsx\`<ArrowComponent />\``,
        },
      ])
    })

    it('only returns stories in the examples array if it exists', async () => {
      const result = await convertStorybookFile('Examples.stories.tsx')
      expect(result).toMatchObject([
        {
          figmaNode: 'https://figma.com/test',
          source:
            'https://github.com/figma/code-connect/tree/master/react/src/storybook/__test__/examples/FunctionComponent.tsx',
          sourceLocation: { line: 7 },
          template: getExpectedTemplate('FunctionComponent'),
          // name: 'Default',
        },
        {
          template: getExpectedTemplate('FunctionComponentWithIcon'),
          // name: 'WithIcon',
        },
        {
          template: getExpectedTemplate('FunctionComponentStringName'),
          // name: 'StringName',
        },
      ])
    })

    it('handles variant restrictions', async () => {
      const result = await convertStorybookFile('ExamplesVariantRestrictions.stories.tsx')
      expect(result).toMatchObject([
        {
          figmaNode: 'https://figma.com/test',
          component: 'FunctionComponent',
          source:
            'https://github.com/figma/code-connect/tree/master/react/src/storybook/__test__/examples/FunctionComponent.tsx',
          sourceLocation: { line: 7 },
          template: getExpectedTemplate('FunctionComponent'),
          variant: { 'With icon': false },
          // name: 'Default',
        },
        {
          figmaNode: 'https://figma.com/test',
          component: 'FunctionComponent',
          source:
            'https://github.com/figma/code-connect/tree/master/react/src/storybook/__test__/examples/FunctionComponent.tsx',
          sourceLocation: { line: 7 },
          template: getExpectedTemplate('FunctionComponentWithIcon'),
          variant: { 'With icon': true },
          // name: 'WithIcon',
        },
        {
          figmaNode: 'https://figma.com/test',
          component: 'FunctionComponent',
          source:
            'https://github.com/figma/code-connect/tree/master/react/src/storybook/__test__/examples/FunctionComponent.tsx',
          sourceLocation: { line: 7 },
          template: getExpectedTemplate('FunctionComponentStringName'),
          variant: { DummyOption: 'DummyValue' },
          // name: 'StringName',
        },
        {
          figmaNode: 'https://figma.com/test',
          component: 'FunctionComponent',
          source:
            'https://github.com/figma/code-connect/tree/master/react/src/storybook/__test__/examples/FunctionComponent.tsx',
          sourceLocation: { line: 7 },
          template: getExpectedTemplate('FunctionComponentMultipleRestrictions'),
          variant: { 'With icon': true, DummyOption: 'DummyValue' },
          // name: 'StringName',
        },
      ])
    })
  })
})

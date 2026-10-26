import path from 'path'
import { Project } from 'ts-morph'
import { extractSignatureFromProject } from '../signature_extraction'

describe('extractSignatureFromProject', () => {
  const tsMorphProject = new Project({
    tsConfigFilePath: path.join(__dirname, '../../../tsconfig.json'),
  })
  const componentsFilepath = path.join(__dirname, 'signature_extraction', 'Components.tsx')

  const TEST_CASES: {
    testName: string
    exportName: string
    expectedProps: Record<string, string>
  }[] = [
    {
      testName: 'broad set of types',
      exportName: 'LotsOfProps',
      expectedProps: {
        children:
          'undefined | null | string | number | false | true | ReactElement<any, string | JSXElementConstructor<any>> | Iterable<ReactNode> | ReactPortal',
        onClick: 'MouseEventHandler<HTMLDivElement>',
        title: 'string',
        hasIcon: 'false | true',
        count: 'number',
        anOptionalString: '?string',
        fuzzyMatchingString: 'string',
      },
    },
    {
      testName: 'call expression',
      exportName: 'MemoizedComponent',
      expectedProps: {
        unmemoized: 'true',
      },
    },
    {
      testName: 'variable alias',
      exportName: 'AliasForComponent',
      expectedProps: {
        aliased: 'true',
      },
    },
    {
      testName: 'alias for variable defined in different file',
      exportName: 'AliasForComponentInDifferentFile',
      expectedProps: {
        definedInDifferentFile: 'true',
      },
    },
    {
      testName: 'forwardRef wrapped component',
      exportName: 'WithForwardRef',
      expectedProps: {
        forwarded: 'true',
      },
    },
    {
      testName: 'default export',
      exportName: 'default',
      expectedProps: {
        isDefault: 'true',
      },
    },
    {
      testName: 're-exported component',
      exportName: 'ReExportedComponent',
      expectedProps: {
        reExportedComponent: 'true',
      },
    },
    {
      testName: 're-exported component with with alias',
      exportName: 'ReExportedComponentAsAlias',
      expectedProps: {
        reExportedComponent: 'true',
      },
    },
    {
      testName: 'class component',
      exportName: 'ClassComponent',
      expectedProps: {
        classProp: 'true',
      },
    },
    {
      testName: 'immediately re-exported component',
      exportName: 'AnotherReExportedComponent',
      expectedProps: {
        anotherReExportedComponent: 'true',
      },
    },
    {
      testName: 'generic types',
      exportName: 'WithPickedProps',
      expectedProps: {
        withPickedProps: 'true',
      },
    },
    {
      testName: 'combining extends + assertions',
      exportName: 'WithExtends',
      expectedProps: {
        withExtends: 'true',
      },
    },
  ]

  TEST_CASES.forEach(({ testName, exportName, expectedProps }) => {
    it(`Extracts types for: ${testName}`, () => {
      const result = extractSignatureFromProject({
        tsMorphProject,
        nameToFind: exportName,
        sourceFilePath: componentsFilepath,
      })

      expect(result).toEqual(expectedProps)
    })
  })
})

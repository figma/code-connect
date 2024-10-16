import path from 'path'
import { extractSignature } from '../../signature_extraction'

describe('extractSignature', () => {
  const componentsFilepath = path.join(__dirname, 'tsProgram', 'react', 'Components.tsx')

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
          'undefined | null | string | number | false | true | ReactElement<any, string | JSXElementConstructor<any>> | ReactFragment | ReactPortal',
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
      const result = extractSignature({
        nameToFind: exportName,
        sourceFilePath: componentsFilepath,
      })

      expect(result).toEqual(expectedProps)
    })
  })
})

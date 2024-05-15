import { ParserError, parse } from '../parser'
import ts from 'typescript'
import path from 'path'
import { CodeConnectConfig } from '../../common/project'
import { readFileSync } from 'fs'

async function testParse(file: string, extraFiles: string[] = [], config?: CodeConnectConfig) {
  const program = ts.createProgram(
    [
      path.join(__dirname, file),
      path.join(__dirname, 'TestComponents.tsx'),
      ...extraFiles.map((file) => path.join(__dirname, file)),
    ],
    {
      paths: config?.react?.paths ?? {},
    },
  )
  return await parse(
    program,
    path.join(__dirname, file),
    'git@github.com:figma/code-connect.git',
    config,
    false,
  )
}

function getExpectedTemplate(name: string) {
  return (
    require('../parser_template_helpers').getParsedTemplateHelpersString() +
    '\n\n' +
    readFileSync(path.join(__dirname, 'expected_templates', `${name}.expected_template`), 'utf-8')
  )
}

describe('Parser (JS templates)', () => {
  it('should parse a simple code sample', async () => {
    const result = await testParse('ButtonTest.figma.tsx')

    expect(result).toMatchObject([
      {
        figmaNode: 'ui/button',
        source:
          'https://github.com/figma/code-connect/tree/master/cli/src/react/__test__/TestComponents.tsx',
        sourceLocation: { line: 12 },
        template: getExpectedTemplate('Button'),
        templateData: {
          imports: ["import { Button } from './TestComponents'"],
        },
      },
    ])
  })

  it('should handle components exported as arrow functions', async () => {
    const result = await testParse('ButtonArrowFunction.figma.tsx')

    expect(result).toMatchObject([
      {
        figmaNode: 'ui/button',
        template:
          'const figma = require("figma")\n\nexport default figma.tsx`<ButtonArrowFunction />`',
        templateData: {
          imports: ["import { ButtonArrowFunction } from './TestComponents'"],
        },
      },
    ])
  })

  it('throws an error for invalid Code Connect metadata format', async () => {
    await expect(() => testParse('InvalidCodeConnect.figma.tsx')).rejects.toThrowError(ParserError)
  })

  it('should parse variant restrictions', async () => {
    const result = await testParse('VariantRestriction.figma.tsx')

    expect(result).toMatchObject([
      {
        figmaNode: 'ui/button',
        template: getExpectedTemplate('Button'),
        templateData: {
          imports: ["import { Button } from './TestComponents'"],
        },
      },
      {
        figmaNode: 'ui/button',
        variant: { HasIcon: true },
        template: getExpectedTemplate('ButtonWithIcon'),
        templateData: {
          imports: ["import { Button } from './TestComponents'"],
        },
      },
    ])
  })

  it('should parse forwardRef:d components', async () => {
    const result = await testParse('ForwardRefComponent.figma.tsx')

    expect(result).toMatchObject([
      {
        figmaNode: 'ui/button',
        sourceLocation: { line: 20 },
        template:
          'const figma = require("figma")\n\nexport default figma.tsx`<ForwardRefButton />`',
        templateData: {
          imports: ["import { ForwardRefButton } from './TestComponents'"],
        },
      },
    ])
  })

  it('should parse memoized components', async () => {
    const result = await testParse('MemoizedComponent.figma.tsx')

    expect(result).toMatchObject([
      {
        figmaNode: 'ui/button',
        sourceLocation: { line: 22 },
        template: getExpectedTemplate('MemoizedComponent'),
        templateData: {
          imports: ["import { MemoButton } from './TestComponents'"],
        },
      },
    ])
  })

  it('should rewrite paths if importPaths is specified', async () => {
    const result = await testParse('ButtonTest.figma.tsx', [], {
      react: {
        importPaths: {
          '__test__/*': '@lib',
        },
      },
    })

    expect(result).toMatchObject([
      {
        templateData: {
          imports: ["import { Button } from '@lib'"],
        },
      },
    ])
  })

  it('should handle rewriting * paths', async () => {
    const result = await testParse('ButtonTest.figma.tsx', [], {
      react: {
        importPaths: {
          '__test__/*': '@lib/*',
        },
      },
    })

    expect(result).toMatchObject([
      {
        templateData: {
          imports: ["import { Button } from '@lib/ButtonTest'"],
        },
      },
    ])
  })

  it('should insert import statements into examples', async () => {
    const result = await testParse('ImportMappingsTest.figma.tsx', ['ImportMappingsTest.tsx'], {
      react: {
        importPaths: {
          '__test__/*': '@lib/*',
        },
      },
    })

    expect(result).toMatchObject([
      {
        template: getExpectedTemplate('ImportMappingsTest'),
        templateData: {
          imports: [
            "import { One, Two } from '@lib/ImportMappingsTest'",
            "import Three from '@lib/ImportMappingsTest'",
          ],
        },
      },
    ])
  })

  it('handles default imports for components', async () => {
    const result = await testParse('DefaultImport.figma.tsx')

    expect(result).toMatchObject([
      {
        template: 'const figma = require("figma")\n\nexport default figma.tsx`<RenamedButton />`',
        templateData: {
          imports: ["import RenamedButton from './TestComponents'"],
        },
      },
    ])
  })

  it('handles namespaced components without crashing', async () => {
    const result = await testParse('NamespacedComponent.figma.tsx')

    expect(result).toMatchObject([
      {
        figmaNode: 'ui/button',
        component: 'NamespacedComponents.Button',
      },
    ])
  })

  it('Only includes the imports used in the example', async () => {
    const result = await testParse('SignatureManyImports.figma.tsx', ['SignatureManyImports.tsx'])

    expect(result).toMatchObject([
      {
        figmaNode: '1',
        component: 'Icon1',
        templateData: {
          imports: ["import { Icon1 } from './SignatureManyImports'"],
        },
      },
      {
        figmaNode: '2',
        component: 'Icon2',
        templateData: {
          imports: ["import { Icon2 } from './SignatureManyImports'"],
        },
      },
      {
        figmaNode: '3',
        component: 'Icon3',
        templateData: {
          imports: ["import { Icon3 } from './SignatureManyImports'"],
        },
      },
      {
        figmaNode: '4',
        component: 'Icon4',
        templateData: {
          imports: ["import { Icon4 } from './SignatureManyImports'"],
        },
      },
      {
        figmaNode: '5',
        component: 'Icon5',
        templateData: {
          imports: ["import { Icon5 } from './SignatureManyImports'"],
        },
      },
    ])
  })

  it('Parses example function with logic and wraps in an Example function', async () => {
    const result = await testParse('ComponentWithLogic.figma.tsx')

    expect(result).toMatchObject([
      {
        figmaNode: 'ui/button',
        component: 'Button',
        template: getExpectedTemplate('ComponentWithLogic'),
        templateData: {
          imports: ["import { Button } from './TestComponents'"],
        },
      },
    ])
  })

  it('Parses prop mappings and forwards them to the template', async () => {
    const result = await testParse('PropMappings.figma.tsx')

    // The TS printer seems to preserving the source indentation, which means
    // that the namedFunction example is indented one level deeper than the
    // rest. It would be nice to solve but for now we load a different expected
    // template.
    function getExpectedDoc(name: string, indented = false) {
      return {
        figmaNode: name,
        label: 'React',
        language: 'typescript',
        component: 'Button',
        source:
          'https://github.com/figma/code-connect/tree/master/cli/src/react/__test__/TestComponents.tsx',
        sourceLocation: { line: 12 },
        template: getExpectedTemplate(indented ? 'PropMappings_indented' : 'PropMappings'),
        templateData: {
          props: {
            variant: {
              kind: 'enum',
              args: {
                figmaPropName: '👥 Variant',
                valueMapping: {
                  Primary: 'primary',
                  Destructive: 'destructive',
                  Inverse: 'inverse',
                  Success: 'success',
                  FigJam: 'FigJam',
                  Secondary: 'secondary',
                  'Secondary Destruct': 'destructive-secondary',
                },
              },
            },
            size: {
              kind: 'enum',
              args: {
                figmaPropName: '👥 Size',
                valueMapping: {
                  Default: 'hug-contents',
                  Large: undefined,
                  Wide: 'fit-parent',
                },
              },
            },
            state: {
              kind: 'enum',
              args: {
                figmaPropName: '🐣 State',
                valueMapping: {
                  Default: 'Default',
                  Active: 'Active',
                  Focused: 'Focused',
                },
              },
            },
            disabled: {
              kind: 'boolean',
              args: { figmaPropName: '🎛️ Disabled' },
            },
            iconLead: {
              kind: 'boolean',
              args: {
                figmaPropName: '🎛️ Icon Lead',
                valueMapping: {
                  true: 'icon',
                },
              },
            },
            label: { kind: 'string', args: { figmaPropName: '🎛️ Label' } },
          },
          imports: ["import { Button } from './TestComponents'"],
        },
      }
    }

    expect(result).toMatchObject([
      getExpectedDoc('propsInline'),
      getExpectedDoc('propsSeparateObject'),
      getExpectedDoc('propsSpreadSyntax'),
      getExpectedDoc('dotNotation'),
      getExpectedDoc('quotesNotation'),
      getExpectedDoc('destructured'),
      getExpectedDoc('namedFunction', true),
    ])
  })

  it('handles enum-like boolean props with values for false', async () => {
    const result = await testParse('EnumLikeBooleanFalseProp.figma.tsx')

    expect(result).toMatchObject([
      {
        figmaNode: 'test',
        label: 'React',
        language: 'typescript',
        component: 'Button',
        source:
          'https://github.com/figma/code-connect/tree/master/cli/src/react/__test__/TestComponents.tsx',
        sourceLocation: { line: 12 },
        template: getExpectedTemplate('EnumLikeBooleanFalseProp'),
        templateData: {
          props: {
            icon: {
              kind: 'boolean',
              args: {
                figmaPropName: 'Prop',
                valueMapping: { true: 'yes', false: 'no' },
              },
            },
          },
          imports: ["import { Button } from './TestComponents'"],
          nestable: true,
        },
      },
    ])
  })

  it('generates Code Connect for components with spread props', async () => {
    const tsProgram = ts.createProgram(
      [path.join(__dirname, 'PropsSpread.tsx'), path.join(__dirname, 'PropsSpread.figma.tsx')],
      {},
    )

    const result = await parse(tsProgram, path.join(__dirname, 'PropsSpread.figma.tsx'))

    expect(result).toMatchObject([
      {
        figmaNode: 'spread',
        component: 'Button',
        label: 'React',
        language: 'typescript',
        source: '',
        sourceLocation: { line: 8 },
        template: getExpectedTemplate('PropsSpread'),
        templateData: {
          props: {
            variant: {
              kind: 'enum',
              args: {
                figmaPropName: '👥 Variant',
                valueMapping: {
                  Primary: 'primary',
                  Destructive: 'destructive',
                  Inverse: 'inverse',
                  Success: 'success',
                  FigJam: 'FigJam',
                  Secondary: 'secondary',
                  'Secondary Destruct': 'destructive-secondary',
                },
              },
            },
            width: {
              kind: 'enum',
              args: {
                figmaPropName: '👥 Size',
                valueMapping: {
                  Default: 'hug-contents',
                  Large: undefined,
                  Wide: 'fit-parent',
                },
              },
            },
            disabled: {
              kind: 'boolean',
              args: { figmaPropName: '🎛️ Disabled' },
            },
          },
          imports: ["import { Button } from './PropsSpread'"],
        },
      },
    ])
  })

  it('generates Code Connect for components with destructuring and spread props', async () => {
    const tsProgram = ts.createProgram(
      [
        path.join(__dirname, 'PropsSpread.tsx'),
        path.join(__dirname, 'PropsSpreadWithDestructuring.figma.tsx'),
      ],
      {},
    )

    const result = await parse(
      tsProgram,
      path.join(__dirname, 'PropsSpreadWithDestructuring.figma.tsx'),
    )

    expect(result).toMatchObject([
      {
        figmaNode: 'spreadWithDestructuring',
        component: 'Button',
        label: 'React',
        language: 'typescript',
        source: '',
        sourceLocation: { line: 8 },
        template: getExpectedTemplate('PropsSpreadWithDestructuring'),
        templateData: {
          props: {
            variant: {
              kind: 'enum',
              args: {
                figmaPropName: 'Variant',
                valueMapping: {
                  Primary: 'primary',
                  Destructive: 'destructive',
                  Inverse: 'inverse',
                  Success: 'success',
                  FigJam: 'FigJam',
                  Secondary: 'secondary',
                  'Secondary Destruct': 'destructive-secondary',
                },
              },
            },
            width: {
              kind: 'enum',
              args: {
                figmaPropName: 'Size',
                valueMapping: {
                  Default: 'hug-contents',
                  Large: undefined,
                  Wide: 'fit-parent',
                },
              },
            },
            disabled: {
              kind: 'boolean',
              args: { figmaPropName: 'Disabled' },
            },
          },
          imports: ["import { Button } from './PropsSpread'"],
        },
      },
    ])
  })

  it('generates Code Connect for components with no props', async () => {
    const result = await testParse('NoProps.figma.tsx')

    expect(result).toMatchObject([
      {
        component: 'ComponentWithoutProps',
      },
    ])
  })

  it('Handles path aliases', async () => {
    // without passing a path alias, this should fail to resolve the import,
    // but not throw an error
    const noAlias = await testParse('PathAliasImport.figma.tsx')
    expect(noAlias).toMatchObject([
      {
        component: 'Button',
        source: '',
      },
    ])

    // with `paths` set the import should resolve correctly
    const withAlias = await testParse('PathAliasImport.figma.tsx', [], {
      react: {
        paths: {
          '@components/*': [path.join(__dirname, '*')],
        },
      },
    })
    expect(withAlias).toMatchObject([
      {
        component: 'Button',
        source:
          'https://github.com/figma/code-connect/tree/master/cli/src/react/__test__/TestComponents.tsx',
      },
    ])
  })

  it('Can parse a varible reference for figmaNode', async () => {
    const result = await testParse('VariableRefFigmaNode.figma.tsx')

    expect(result).toMatchObject([
      {
        figmaNode: 'identifierAsUrl',
        component: 'Button',
      },
    ])
  })

  it('Can map import paths for a generated import statement for co-located components', async () => {
    const result = await testParse('ColocatedCodeConnect.tsx', [], {
      react: {
        importPaths: {
          '__test__/*': '@lib/*',
        },
      },
    })

    expect(result).toMatchObject([
      {
        component: 'ColocatedButton',
        templateData: {
          imports: ["import { ColocatedButton } from '@lib/ColocatedCodeConnect'"],
        },
      },
    ])
  })

  it('Handles custom imports', async () => {
    const result = await testParse('CustomImports.figma.tsx', [], {
      react: {
        // It should ignore importPaths mappings
        importPaths: {
          '__test__/*': '@lib/*',
        },
      },
    })

    expect(result).toMatchObject([
      {
        component: 'Button',
        templateData: {
          imports: ['import Button from "@ui/Button"', 'import { myHook } from "@ui/hooks"'],
        },
      },
    ])
  })

  it('Parses instance and children prop mappings', async () => {
    const result = await testParse('ChildInstances.figma.tsx')

    expect(result).toMatchObject([
      {
        figmaNode: 'instanceSwap',
        component: 'Button',
        templateData: {
          props: {
            icon: {
              kind: 'instance',
              args: {
                figmaPropName: 'Icon Prop',
              },
            },
          },
          imports: ["import { Button } from './TestComponents'"],
        },
      },
      {
        figmaNode: 'children',
        component: 'Button',
        templateData: {
          props: {
            icon: {
              kind: 'children',
              args: {
                layers: ['Icon Layer'],
              },
            },
          },
          imports: ["import { Button } from './TestComponents'"],
        },
      },
      {
        figmaNode: 'children array',
        component: 'Button',
        templateData: {
          props: {
            icons: {
              kind: 'children',
              args: {
                layers: ['Icon 1', 'Icon 2', 'Icon 3'],
              },
            },
          },
          imports: ["import { Button } from './TestComponents'"],
        },
      },
    ])
  })

  it('Supports not passing a component as the first arg', async () => {
    const result = await testParse('NoComponentArg.figma.tsx')

    expect(result).toMatchObject([
      {
        component: undefined,
        template: getExpectedTemplate('Div'),
        templateData: {
          imports: [],
        },
      },
    ])
  })

  it('Throws an error if you pass neither the component reference or an example function', async () => {
    await expect(() => testParse('NoComponentArgOrExampleFunction.figma.tsx')).rejects.toThrowError(
      ParserError,
    )
  })
})

import path from 'path'
import * as connect from '../../../commands/connect'
import { FigmaRestApi } from '../../figma_rest_api'
import * as project from '../../project'
import {
  autoLinkComponents,
  convertRemoteFileUrlToRelativePath,
  getComponentChoicesForPrompt,
  getUnconnectedComponentsAndConnectedComponentMappings,
} from '../run_wizard'

const _stripAnsi = require('strip-ansi')

const MOCK_COMPONENTS: FigmaRestApi.Component[] = [
  {
    type: 'COMPONENT',
    name: 'a reeeeeeeally long component name',
    id: '1:11',
    children: [],
    componentPropertyDefinitions: {},
  },
  {
    type: 'COMPONENT',
    name: 'another component',
    id: '1:12',
    children: [],
    componentPropertyDefinitions: {},
  },
  {
    type: 'COMPONENT',
    name: 'different component',
    id: '1:13',
    children: [],
    componentPropertyDefinitions: {},
  },
]

describe('getComponentChoicesForPrompt', () => {
  it('returns a sorted list of linked + unlinked formatted choices', () => {
    const result = getComponentChoicesForPrompt(
      MOCK_COMPONENTS,
      {
        '1:12': '/some/component/path.tsx',
      },
      [],
      '/',
    )

    expect(result.map((r) => _stripAnsi(r.title))).toEqual([
      `Figma component: another component                   ↔️ ${path.join('some', 'component', 'path.tsx')}`,
      `Figma component: a reeeeeeeally long component name  ↔️ -`,
      `Figma component: different component                 ↔️ -`,
    ])
  })

  it('returns results relative to dir', () => {
    const result = getComponentChoicesForPrompt(
      MOCK_COMPONENTS,
      {
        '1:12': '/some/component/path.tsx',
      },
      [],
      '/some',
    )

    expect(result.map((r) => _stripAnsi(r.title))).toEqual([
      `Figma component: another component                   ↔️ ${path.join('component', 'path.tsx')}`,
      `Figma component: a reeeeeeeally long component name  ↔️ -`,
      `Figma component: different component                 ↔️ -`,
    ])
  })

  it('displays already connected components underneath unconnected components', () => {
    const result = getComponentChoicesForPrompt(
      [MOCK_COMPONENTS[0]],
      {},
      [
        {
          componentName: 'some connected component',
          path: '/foo/connectedComponent1.tsx',
        },
        {
          componentName: 'another connected component',
          path: '/foo/connectedComponent2.tsx',
        },
      ],
      '/',
    )
    expect(result.map((r) => _stripAnsi(r.title))).toEqual([
      `Figma component: a reeeeeeeally long component name  ↔️ -`,
      `Figma component: some connected component            ↔️ /foo/connectedComponent1.tsx`,
      `Figma component: another connected component         ↔️ /foo/connectedComponent2.tsx`,
    ])
  })
})

describe('autoLinkComponents', () => {
  it('populates linkedNodeIdsToPaths using fuzzy matching', () => {
    const linkedNodeIdsToPaths = {}
    autoLinkComponents({
      unconnectedComponents: MOCK_COMPONENTS,
      linkedNodeIdsToPaths,
      componentPaths: ['/foo/bar/AnotherComponent.tsx', '/foo/bar/DifferentComponent.tsx'],
    })
    expect(linkedNodeIdsToPaths).toEqual({
      '1:12': '/foo/bar/AnotherComponent.tsx',
      '1:13': '/foo/bar/DifferentComponent.tsx',
    })
  })
  it('does not populate linkedNodeIdsToPaths with bad matches', () => {
    const linkedNodeIdsToPaths = {}
    autoLinkComponents({
      unconnectedComponents: MOCK_COMPONENTS,
      linkedNodeIdsToPaths,
      componentPaths: ['/foo/bar/MyButton.tsx', '/foo/bar/AlternativeComponent.tsx'],
    })
    expect(linkedNodeIdsToPaths).toEqual({})
  })
})

describe('getUnconnectedComponentsAndConnectedComponentMappings', () => {
  it('correctly derives connected / unconnected components', async () => {
    jest.spyOn(project, 'getGitRepoAbsolutePath').mockReturnValue('/user/me/my-repo')
    jest.spyOn(connect, 'getCodeConnectObjects').mockReturnValue(
      new Promise((resolve) =>
        resolve([
          {
            figmaNode: 'https://figma.com/design/someFileId/wow?node-id=1:11',
            label: 'React',
            language: 'typescript',
            component: 'Modal',
            source: 'https://github.com/some-user/my-design-system/blob/main/components/Modal.tsx',
            sourceLocation: { line: 2 },
            template: '',
            templateData: {
              props: {
                property: {
                  kind: 'enum' as any,
                  args: {
                    figmaPropName: 'Property 1',
                    valueMapping: { Default: 'default', Variant2: 'variant2' },
                  },
                },
              },
              imports: ['import { Modal } from "./Modal"'],
              nestable: true,
            },
            metadata: { cliVersion: '1.0.1' },
          },
        ]),
      ),
    )
    const result = await getUnconnectedComponentsAndConnectedComponentMappings(
      {
        dir: '/user/me/my-repo/components',
      } as any,
      'https://figma.com/design/someFileId/abc',
      MOCK_COMPONENTS,
      {} as any,
    )
    expect(result).toEqual({
      unconnectedComponents: [
        {
          type: 'COMPONENT',
          name: 'another component',
          id: '1:12',
          children: [],
          componentPropertyDefinitions: {},
        },
        {
          type: 'COMPONENT',
          name: 'different component',
          id: '1:13',
          children: [],
          componentPropertyDefinitions: {},
        },
      ],
      connectedComponentsMappings: [
        { componentName: 'a reeeeeeeally long component name', path: 'Modal.tsx' },
      ],
    })
  })
})

describe('convertRemoteFileUrlToRelativePath', () => {
  it('converts to relative path', () => {
    const result = convertRemoteFileUrlToRelativePath({
      remoteFileUrl:
        'https://github.com/slees-figma/sims-design-system/blob/main/components/ds/Modal.tsx',
      gitRootPath: '/user/me/my-repo',
      dir: '/user/me/my-repo/components',
    })
    expect(result).toBe(path.join('ds', 'Modal.tsx'))
  })
})

import path from 'path'
import * as connect from '../../../commands/connect'
import { FigmaRestApi } from '../../figma_rest_api'
import * as project from '../../project'
import {
  convertRemoteFileUrlToRelativePath,
  createCodeConnectFiles,
  getComponentChoicesForPrompt,
  getUnconnectedComponentsAndConnectedComponentMappings,
} from '../run_wizard'

jest.mock('fs')

import fs from 'fs'

const _stripAnsi = require('strip-ansi')

const MOCK_COMPONENTS: FigmaRestApi.Component[] = [
  {
    type: 'COMPONENT',
    name: 'a reeeeeeeally long component name',
    id: '1:11',
    children: [],
    componentPropertyDefinitions: {},
    pageId: '0:1',
    pageName: 'Page 1',
  },
  {
    type: 'COMPONENT',
    name: 'another component',
    id: '1:12',
    children: [],
    componentPropertyDefinitions: {},
    pageId: '0:1',
    pageName: 'Page 1',
  },
  {
    type: 'COMPONENT',
    name: 'different component',
    id: '1:13',
    children: [],
    componentPropertyDefinitions: {},
    pageId: '0:1',
    pageName: 'Page 1',
  },
]

const CREATE_CODE_CONNECT_FILES_PAYLOAD = {
  figmaFileUrl: 'https://www.figma.com/file/1234567890/My-Awesome-Design',
  linkedNodeIdsToFilepathExports: {},
  unconnectedComponentsMap: {
    '1:11': MOCK_COMPONENTS[0],
    '1:12': MOCK_COMPONENTS[1],
    '1:13': MOCK_COMPONENTS[2],
  },
  outDir: null,
  projectInfo: { config: { include: ['/**/*.{tsx,jsx}'], parser: 'react' } },
  cmd: {},
  accessToken: '',
  useAi: false,
}
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
      `Figma component: another component                   ↔️ Code Definition: ${path.join('some', 'component', 'path.tsx')}`,
      `Figma component: a reeeeeeeally long component name  ↔️ Code Definition: -`,
      `Figma component: different component                 ↔️ Code Definition: -`,
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
      `Figma component: another component                   ↔️ Code Definition: ${path.join('component', 'path.tsx')}`,
      `Figma component: a reeeeeeeally long component name  ↔️ Code Definition: -`,
      `Figma component: different component                 ↔️ Code Definition: -`,
    ])
  })

  it('displays already connected components underneath unconnected components', () => {
    const result = getComponentChoicesForPrompt(
      [MOCK_COMPONENTS[0]],
      {},
      [
        {
          componentName: 'some connected component',
          filepathExport: '/foo/connectedComponent1.tsx',
        },
        {
          componentName: 'another connected component',
          filepathExport: '/foo/connectedComponent2.tsx',
        },
      ],
      '/',
    )
    expect(result.map((r) => _stripAnsi(r.title))).toEqual([
      `Figma component: a reeeeeeeally long component name  ↔️ Code Definition: -`,
      `Figma component: some connected component            ↔️ Code Definition: /foo/connectedComponent1.tsx`,
      `Figma component: another connected component         ↔️ Code Definition: /foo/connectedComponent2.tsx`,
    ])
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
          pageId: '0:1',
          pageName: 'Page 1',
          componentPropertyDefinitions: {},
        },
        {
          type: 'COMPONENT',
          name: 'different component',
          id: '1:13',
          pageId: '0:1',
          pageName: 'Page 1',
          children: [],
          componentPropertyDefinitions: {},
        },
      ],
      connectedComponentsMappings: [
        { componentName: 'a reeeeeeeally long component name', filepathExport: 'Modal.tsx' },
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

describe('createCodeConnectFiles', () => {
  const destinationRegex = /(.+)project(.+)src(.+)Component\.figma\.tsx/
  beforeEach(() => {
    fs.mkdirSync = jest.fn()
    fs.writeFileSync = jest.fn()
    fs.existsSync = jest.fn().mockReturnValue(false)
  })

  it('creates all code connect files - 2 files', async () => {
    const result = await createCodeConnectFiles({
      ...CREATE_CODE_CONNECT_FILES_PAYLOAD,
      linkedNodeIdsToFilepathExports: {
        '1:11': '/project/src/Component.tsx~Component',
        '1:12': '/project/src/AnotherComponent.tsx~AnotherComponent',
      },
    } as any)

    expect(fs.writeFileSync).toHaveBeenCalledTimes(2)
    expect(result).toBe(true)
  })
  it('creates all code connect files - 3 files', async () => {
    const result = await createCodeConnectFiles({
      ...CREATE_CODE_CONNECT_FILES_PAYLOAD,
      linkedNodeIdsToFilepathExports: {
        '1:11': '/project/src/Component.tsx~Component',
        '1:12': '/project/src/AnotherComponent.tsx~AnotherComponent',
        '1:13': '/project/src/DifferentComponent.tsx~DifferentComponent',
      },
    } as any)

    expect(fs.writeFileSync).toHaveBeenCalledTimes(3)
    expect(result).toBe(true)
  })

  it('skips creation of existing files', async () => {
    fs.existsSync = jest.fn().mockReturnValue(true)
    const result = await createCodeConnectFiles({
      ...CREATE_CODE_CONNECT_FILES_PAYLOAD,
      linkedNodeIdsToFilepathExports: {
        '1:11': '/project/src/Component.tsx~Component',
      },
    } as any)
    expect(result).toBe(false)
    expect(fs.writeFileSync).toHaveBeenCalledTimes(0)
  })

  it('creates files with default export', async () => {
    await createCodeConnectFiles({
      ...CREATE_CODE_CONNECT_FILES_PAYLOAD,
      linkedNodeIdsToFilepathExports: {
        '1:11': '/project/src/Component.tsx~default',
      },
    } as any)
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.stringMatching(destinationRegex),
      expect.stringContaining('import Component from "./Component"'),
    )
  })
  it('creates files with named export', async () => {
    await createCodeConnectFiles({
      ...CREATE_CODE_CONNECT_FILES_PAYLOAD,
      linkedNodeIdsToFilepathExports: {
        '1:11': '/project/src/Component.tsx~Component',
      },
    } as any)
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.stringMatching(destinationRegex),
      expect.stringContaining('import { Component } from "./Component"'),
    )
  })
  it('creates files with named and default export', async () => {
    await createCodeConnectFiles({
      ...CREATE_CODE_CONNECT_FILES_PAYLOAD,
      linkedNodeIdsToFilepathExports: {
        '1:11': '/project/src/Component.tsx~Component',
        '1:12': '/project/src/Component.tsx~default',
      },
    } as any)
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.stringMatching(destinationRegex),
      expect.stringContaining('import ComponentDefault, { Component } from "./Component"'),
    )
  })
})

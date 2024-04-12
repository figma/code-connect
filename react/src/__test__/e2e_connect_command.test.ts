import { promisify } from 'util'
import { exec } from 'child_process'

// TODO: Reenable test once js templates are the default
xdescribe('e2e test for `connect` command', () => {
  it('successfully parses both Code Connect and Storybook files', async () => {
    const result = await promisify(exec)(
      `npx tsx ../cli connect parse --dir ./e2e_connect_command`,
      {
        cwd: __dirname,
      },
    )

    expect(result.stderr).toBeFalsy()
    const json = JSON.parse(result.stdout)

    expect(json).toMatchObject([
      {
        figmaNode: 'ui/button',
        label: 'React',
        language: 'typescript',
        component: 'ReactApiComponent',
        source:
          'https://github.com/figma/code-connect/tree/master/react/src/__test__/e2e_connect_command/ReactApiComponent.tsx',
        sourceLocation: { line: 13 },
        template: '<ReactApiComponent />',
        templateData: {
          imports: ["import { ReactApiComponent } from './ReactApiComponent'"],
        },
      },
      {
        figmaNode: 'https://figma.com/test',
        source:
          'https://github.com/figma/code-connect/tree/master/react/src/__test__/e2e_connect_command/StorybookComponent.tsx',
        sourceLocation: { line: 7 },
        template: '<StorybookComponent disabled={false}>Hello</StorybookComponent>',
        templateData: { imports: [] },
        component: 'StorybookComponent',
        label: 'Storybook',
        language: 'typescript',
      },
    ])
  }, 15000)
})

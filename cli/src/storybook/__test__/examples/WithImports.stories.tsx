import { StoryParameters } from '../../../react/index_react'
import { FunctionComponent } from './FunctionComponent'
import React from 'react'

export default {
  title: 'WithImports',
  component: FunctionComponent,
  parameters: {
    design: {
      type: 'figma',
      url: 'https://figma.com/withimports',
      examples: [Default],
      imports: ['import { Default } from "./DefaultFile.tsx"'],
    },
  } satisfies StoryParameters,
}

export function Default() {
  return <FunctionComponent disabled={false}>Hello</FunctionComponent>
}

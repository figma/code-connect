import { ArrowComponent } from './ArrowComponent'
import React from 'react'

export default {
  title: 'JsxStory',
  component: ArrowComponent,
  parameters: {
    design: {
      type: 'figma',
      url: 'https://figma.com/jsxstory',
      examples: [Default],
    },
  },
}

export function Default() {
  return <ArrowComponent disabled={false}>Hello</ArrowComponent>
}

import React from 'react'
import { ArrowComponent } from './ArrowComponent'

export default {
  title: 'JsStory',
  component: ArrowComponent,
  parameters: {
    design: {
      type: 'figma',
      url: 'https://figma.com/jsstory',
      examples: [Default],
    },
  },
}

export function Default() {
  return React.createElement(ArrowComponent, { disabled: false }, 'Hello')
}

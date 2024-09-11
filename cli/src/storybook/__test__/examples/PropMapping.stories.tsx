import { PropMapping, PropMappingProps } from './PropMapping'
import figma, { StoryParameters } from '../../../react/index_react'
import React from 'react'

export default {
  title: 'PropMapping',
  component: PropMapping,
  parameters: {
    design: {
      type: 'figma',
      url: 'https://figma.com/test',
      props: {
        enumProp: figma.enum('Size', {
          Slim: 'slim',
          Medium: 'medium',
          Large: 'large',
        }),
        booleanProp: figma.boolean('Boolean Prop'),
        stringProp: figma.string('Text'),
        children: figma.string('Text'),
      },
      examples: ['Default'],
    },
  } satisfies StoryParameters,
}

export function Default(args: PropMappingProps) {
  return (
    <PropMapping
      stringProp={args.stringProp}
      booleanProp={args.booleanProp}
      enumProp={args.enumProp}
    >
      {args.children}
    </PropMapping>
  )
}

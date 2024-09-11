import { FunctionComponent } from './FunctionComponent'
import { StoryParameters } from '../../../react/index_react'
import React from 'react'

export default {
  title: 'FunctionComponent',
  component: FunctionComponent,
  parameters: {
    design: {
      type: 'figma',
      url: 'https://figma.com/test',
      examples: [Default, WithIcon, 'StringName'],
    },
  } satisfies StoryParameters,
}

export function Default() {
  return <FunctionComponent disabled={false}>Hello</FunctionComponent>
}

export function WithIcon() {
  return <FunctionComponent disabled={false}>Icon</FunctionComponent>
}

export function StringName() {
  return <FunctionComponent disabled={false}>String name</FunctionComponent>
}

export function NotIncluded() {
  return <FunctionComponent disabled={false}>Not included</FunctionComponent>
}

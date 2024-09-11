import { StoryParameters } from '../../../react/index_react'
import { FunctionComponent } from './FunctionComponent'
import React from 'react'

export default {
  title: 'FunctionComponent',
  component: FunctionComponent,
  parameters: {
    design: {
      type: 'figma',
      url: 'https://figma.com/test',
      examples: [
        {
          example: Default,
          variant: { 'With icon': false },
        },
        {
          example: WithIcon,
          variant: { 'With icon': true },
        },
        {
          example: 'StringName',
          variant: { DummyOption: 'DummyValue' },
        },
        {
          example: Multiple,
          variant: { DummyOption: 'DummyValue', 'With icon': true },
        },
      ],
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

export function Multiple() {
  return <FunctionComponent disabled={false}>Multiple restrictions</FunctionComponent>
}

export function NotIncluded() {
  return <FunctionComponent disabled={false}>Not included</FunctionComponent>
}

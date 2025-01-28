import React from 'react'
import { figma } from '../../../react/index_react'
import { FunctionComponent } from './FunctionComponent'

export default {
  title: 'DifferentPropsPerExample',
  component: FunctionComponent,
  parameters: {
    design: {
      type: 'figma',
      url: 'https://figma.com/differentpropsperexample',
      examples: [
        { example: 'Default' },
        { example: 'SpecificProps', props: { isOn: figma.boolean('Disabled') } }, // this second example overrides the default `props`
      ],
      props: {
        disabled: figma.boolean('Disabled'),
      },
    },
  },
}

interface DefaultProps {
  disabled: boolean
}
interface SpecificProps {
  isOn: boolean
}

export function Default({ disabled }: DefaultProps) {
  return <FunctionComponent disabled={disabled}>DefaultProps</FunctionComponent>
}

export function SpecificProps({ isOn }: SpecificProps) {
  return <FunctionComponent disabled={isOn}>SpecificProps</FunctionComponent>
}

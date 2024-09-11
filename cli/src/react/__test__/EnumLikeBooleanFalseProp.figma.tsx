import React from 'react'
import figma from '../index_react'
import { Button } from './components/TestComponents'

figma.connect(Button, 'test', {
  props: {
    icon: figma.boolean('Prop', {
      true: 'yes',
      false: 'no',
    }),
  },
  example: ({ icon }) => <Button icon={icon} />,
})

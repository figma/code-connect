import figma from '../../../../../react/index_react'
import { Button } from './Button'

figma.connect(Button, 'https://figma.com/test/button', {
  props: {
    label: figma.string('label'),
    disabled: figma.boolean('disabled'),
    unused: figma.string('unused'),
  },
  example: ({ label, disabled }) => <Button label={label} disabled={disabled} />,
})

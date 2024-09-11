import React from 'react'
import figma from '../index_react'
import { Button } from './PropsSpread'

const props = {
  variant: figma.enum('Variant', {
    Primary: 'primary',
    Destructive: 'destructive',
    Inverse: 'inverse',
    Success: 'success',
    FigJam: 'FigJam',
    Secondary: 'secondary',
    'Secondary Destruct': 'destructive-secondary',
  }),
  width: figma.enum('Size', {
    Default: 'hug-contents',
    Large: undefined,
    Wide: 'fit-parent',
  }),
  disabled: figma.boolean('Disabled'),
}

figma.connect(Button, 'spreadWithDestructuring', {
  props,
  example: ({ variant, ...props }) => <Button variant={variant} {...props} />,
})

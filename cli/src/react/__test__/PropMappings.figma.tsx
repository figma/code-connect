import React from 'react'
import figma from '../index_react'
import { Button } from './components/TestComponents'

figma.connect(Button, 'propsInline', {
  props: {
    variant: figma.enum('👥 Variant', {
      Primary: 'primary',
      Destructive: 'destructive',
      Inverse: 'inverse',
      Success: 'success',
      FigJam: 'FigJam',
      Secondary: 'secondary',
      'Secondary Destruct': 'destructive-secondary',
    }),
    size: figma.enum('👥 Size', {
      Default: 'hug-contents',
      Large: undefined,
      Wide: 'fit-parent',
    }),
    state: figma.enum('🐣 State', {
      Default: 'Default',
      Active: 'Active',
      Focused: 'Focused',
    }),
    disabled: figma.boolean('🎛️ Disabled'),
    iconLead: figma.boolean('🎛️ Icon Lead', {
      true: 'icon',
      false: undefined,
    }),
    label: figma.string('🎛️ Label'),
  },
  example: ({ variant, size, disabled, label, iconLead }) => (
    <Button
      variant={variant}
      onClick={() => {}}
      width={size}
      disabled={disabled}
      iconLead={iconLead}
    >
      {label}
    </Button>
  ),
})

const props = {
  variant: figma.enum('👥 Variant', {
    Primary: 'primary',
    Destructive: 'destructive',
    Inverse: 'inverse',
    Success: 'success',
    FigJam: 'FigJam',
    Secondary: 'secondary',
    'Secondary Destruct': 'destructive-secondary',
  }),
  size: figma.enum('👥 Size', {
    Default: 'hug-contents',
    Large: undefined,
    Wide: 'fit-parent',
  }),
  state: figma.enum('🐣 State', {
    Default: 'Default',
    Active: 'Active',
    Focused: 'Focused',
  }),
  disabled: figma.boolean('🎛️ Disabled'),
  iconLead: figma.boolean('🎛️ Icon Lead', {
    true: 'icon',
    false: undefined,
  }),
  label: figma.string('🎛️ Label'),
}

figma.connect(Button, 'propsSeparateObject', {
  props,
  example: ({ variant, size, disabled, label, iconLead }) => (
    <Button
      variant={variant}
      onClick={() => {}}
      width={size}
      disabled={disabled}
      iconLead={iconLead}
    >
      {label}
    </Button>
  ),
})

figma.connect(Button, 'propsSpreadSyntax', {
  props: { ...props },
  example: ({ variant, size, disabled, label, iconLead }) => (
    <Button
      variant={variant}
      onClick={() => {}}
      width={size}
      disabled={disabled}
      iconLead={iconLead}
    >
      {label}
    </Button>
  ),
})

figma.connect(Button, 'dotNotation', {
  props,
  example: (props) => (
    <Button
      variant={props.variant}
      onClick={() => {}}
      width={props.size}
      disabled={props.disabled}
      iconLead={props.iconLead}
    >
      {props.label}
    </Button>
  ),
})

figma.connect(Button, 'quotesNotation', {
  props,
  example: (props) => (
    <Button
      variant={props['variant']}
      onClick={() => {}}
      width={props['size']}
      disabled={props['disabled']}
      iconLead={props['iconLead']}
    >
      {props['label']}
    </Button>
  ),
})

figma.connect(Button, 'destructured', {
  props,
  example: ({ variant, size, disabled, label, iconLead }) => (
    <Button
      variant={variant}
      onClick={() => {}}
      width={size}
      disabled={disabled}
      iconLead={iconLead}
    >
      {label}
    </Button>
  ),
})

figma.connect(Button, 'namedFunction', {
  props,
  example: function ButtonExample({ variant, size, disabled, label, iconLead }) {
    return (
      <Button
        variant={variant}
        onClick={() => {}}
        width={size}
        disabled={disabled}
        iconLead={iconLead}
      >
        {label}
      </Button>
    )
  },
})

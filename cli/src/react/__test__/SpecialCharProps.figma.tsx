import React from 'react'
import figma from '../index_react'
import { Button } from './components/TestComponents'

// Test that property names containing apostrophes and other special characters
// are correctly escaped in the generated template code.
// Without escaping, a name like "Tab's number" would produce:
//   string('Tab's number')  — broken JS (apostrophe closes the string literal)
figma.connect(Button, 'specialCharProps', {
  props: {
    label: figma.string("Tab's number"),
    variant: figma.enum("it's variant", {
      'Primary': 'primary',
      "It's secondary": 'secondary',
      'He said "hello"': 'quoted',
    }),
    disabled: figma.boolean("it's disabled"),
  },
  example: ({ label, variant, disabled }) => (
    <Button variant={variant} disabled={disabled}>
      {label}
    </Button>
  ),
})

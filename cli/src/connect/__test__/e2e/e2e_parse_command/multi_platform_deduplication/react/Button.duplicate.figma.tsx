import React from 'react'
import figma from '@figma/code-connect'

/**
 * This is a duplicate connection to the same Figma node with the exact same code.
 * This should be deduplicated and only one should appear in the output.
 */

figma.connect(
  'https://figma.com/design/test?node-id=1:1',
  {
    props: {
      label: figma.string('Label'),
      disabled: figma.boolean('Disabled'),
    },
    example: ({ label, disabled }) => (
      <Button disabled={disabled}>{label}</Button>
    ),
  },
)

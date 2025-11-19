import React from 'react'
import figma from '@figma/code-connect'

/**
 * This is a different implementation for the same Figma node.
 * Uses className instead of disabled prop - this should NOT be deduplicated
 * because the template (code example) is different.
 */

figma.connect(
  'https://figma.com/design/test?node-id=1:1',
  {
    props: {
      label: figma.string('Label'),
      disabledClass: figma.boolean('Disabled', {
        true: 'btn-disabled',
        false: '',
      }),
    },
    example: ({ label, disabledClass }) => (
      <Button className={disabledClass}>{label}</Button>
    ),
  },
)

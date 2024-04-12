import React from 'react'
import { One, Two } from './ImportMappingsTest'
import Three from './ImportMappingsTest'
import figma from '../..'

figma.connect(One, 'ui/button', {
  example: () => (
    <One>
      <Two>
        <Three />
      </Two>
    </One>
  ),
})

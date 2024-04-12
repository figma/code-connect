import React from 'react'
import figma from '../..'
import { Button } from './TestComponents'

figma.connect(Button, 'ui/button', {
  example: () => {
    const [state] = React.useState(false)
    return <Button />
  },
})

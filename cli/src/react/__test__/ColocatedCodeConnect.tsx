import React from 'react'
import figma from '../..'

interface ButtonProps {
  disabled?: boolean
  children: any
}

export function ColocatedButton({ children, disabled = false }: ButtonProps) {
  return <button disabled={disabled}>{children}</button>
}

figma.connect(ColocatedButton, 'ui/button')

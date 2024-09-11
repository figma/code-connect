import React from 'react'
import figma from '../index_react'

interface ButtonProps {
  disabled?: boolean
  children: any
}

export function ColocatedButton({ children, disabled = false }: ButtonProps) {
  return <button disabled={disabled}>{children}</button>
}

figma.connect(ColocatedButton, 'ui/button')

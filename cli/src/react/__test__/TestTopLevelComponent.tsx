import * as React from 'react'

interface ButtonProps {
  width?: string
  variant?: string
  disabled?: boolean
  iconLead?: string
  children?: React.ReactNode
  icon?: string
  onClick?: any
}

export function Button({ width, variant, disabled, children }: ButtonProps) {
  return <button>{children}</button>
}

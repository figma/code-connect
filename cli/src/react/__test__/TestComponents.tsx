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

export const ButtonArrowFunction = ({ children, disabled = false }: ButtonProps) => {
  return <button disabled={disabled}>{children}</button>
}

export const ForwardRefButton = React.forwardRef<ButtonProps>(Button)

export const MemoButton = React.memo(Button)

const _Button = React.forwardRef<{}, ButtonProps>(function Button({ children, disabled = false }) {
  return <button disabled={disabled}>{children}</button>
})

const _Other = React.forwardRef<{}, ButtonProps>(function Other({ children, disabled = false }) {
  return <button disabled={disabled}>{children}</button>
})

export const NamespacedComponents = { Button: _Button, Other: _Other }

export function ComponentWithoutProps() {
  return null
}

export function Icon() {
  return <span>Icon</span>
}

export default Button

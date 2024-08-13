import React from 'react'

interface ButtonProps {
  disabled: boolean
  children: any
}

/**
 * @description This is a button
 * @param children text to render
 * @param disabled disable the button
 * @returns JSX element
 */
const InnerComponent = ({ children, disabled = false }: ButtonProps) => {
  return <button disabled={disabled}>{children}</button>
}

// Aliases not yet supported by wizard, signature gen should fail gracefully
export const PrimaryButton = InnerComponent

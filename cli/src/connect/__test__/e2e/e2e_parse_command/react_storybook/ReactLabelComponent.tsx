import React from 'react'

interface LabelProps {
  disabled: boolean
  children: any
}

/**
 * @description This is a label
 * @param children text to render
 * @param disabled disable the button
 * @returns JSX element
 */
export const ReactLabelComponent = ({ children, disabled = false }: LabelProps) => {
  return <div style={{ pointerEvents: disabled ? 'none' : 'inherit' }}>{children}</div>
}

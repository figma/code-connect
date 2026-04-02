import { ReactNode } from 'react'
import React from 'react'

export interface Props {
  disabled: boolean
  children: ReactNode
}

export const StorybookComponent = ({ disabled, children }: Props) => {
  return <button disabled={disabled}>{children}</button>
}

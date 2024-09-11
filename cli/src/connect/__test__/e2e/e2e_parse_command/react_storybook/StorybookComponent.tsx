import { ReactNode } from 'react'
import React from 'react'

interface Props {
  disabled: boolean
  children: ReactNode
}

export const StorybookComponent = ({ disabled, children }: Props) => {
  const someOtherCode = 'some other code'

  return <button disabled={disabled}>{children}</button>
}

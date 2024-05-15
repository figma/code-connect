import { ReactNode } from 'react'

interface Props {
  disabled: boolean
  children: ReactNode
}

export const ArrowComponent = ({ disabled, children }: Props) => {
  const someOtherCode = 'some other code'

  return <button disabled={disabled}>{children}</button>
}

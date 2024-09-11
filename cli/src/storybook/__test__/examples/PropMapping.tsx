import React from 'react'

export type PropMappingProps = {
  stringProp: string
  booleanProp: boolean
  enumProp: 'slim' | 'medium' | 'large'
  children: React.ReactNode
}

export function PropMapping(props: PropMappingProps) {
  return <div />
}

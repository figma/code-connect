import React from 'react'

export type MyComponentProps = {
  children: React.ReactNode
}

export function MyComponent(props: MyComponentProps) {
  return <>Hello world {props.children}</>
}

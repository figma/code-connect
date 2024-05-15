import React from 'react'

export function One({ children }: { children: any }) {
  return <div>{children}</div>
}

export function Two({ children }: { children: any }) {
  return <div>{children}</div>
}

export default function Three() {
  return <div />
}

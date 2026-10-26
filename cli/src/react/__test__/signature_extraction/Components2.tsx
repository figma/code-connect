import React from 'react'

export function DefinedInDifferentFile(props: { definedInDifferentFile: true }) {
  return <>Hello world</>
}

export function ReExportedComponent(props: { reExportedComponent: true }) {
  return <>Hello world</>
}

export function AnotherReExportedComponent(props: { anotherReExportedComponent: true }) {
  return <>Hello world</>
}

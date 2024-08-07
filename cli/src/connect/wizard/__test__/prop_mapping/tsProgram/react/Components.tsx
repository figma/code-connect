import React, { memo } from 'react'

export function LotsOfProps({
  children,
  title,
  anOptionalString,
  onClick,
  count,
  hasIcon,
  fuzzyMatchingString,
}: {
  children: React.ReactNode
  onClick: React.MouseEventHandler<HTMLDivElement>
  title: string
  anOptionalString?: string
  count: number
  hasIcon: boolean
  fuzzyMatchingString: string
}) {
  return (
    <div onClick={onClick}>
      <h1>
        {title} {hasIcon && <svg />}
      </h1>
      <div>{children}</div>
      <div>
        <p>Clicked {count} times</p>
        <p>{anOptionalString || 'No optional string provided'}</p>
      </div>
    </div>
  )
}

export default function TheDefaultExport(props: { isDefault: true }) {
  return <>Hello world</>
}

type AliasedComponentProps = {
  aliased: true
}

function NonExportedComponent(props: AliasedComponentProps) {
  return <>Hello world</>
}

export const AliasForComponent = NonExportedComponent

function UnmemoizedComponent(props: { unmemoized: true }) {
  return <>Hello world</>
}

export const MemoizedComponent = memo(UnmemoizedComponent)

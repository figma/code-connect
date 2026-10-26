import React, { memo, forwardRef, HTMLAttributes } from 'react'
import { DefinedInDifferentFile } from './Components2'
import { ReExportedComponent } from './Components2'
export { AnotherReExportedComponent } from './Components2'

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

export const AliasForComponentInDifferentFile = DefinedInDifferentFile

function UnmemoizedComponent(props: { unmemoized: true }) {
  return <>Hello world</>
}

export const MemoizedComponent = memo(UnmemoizedComponent)

export const WithForwardRef = forwardRef<HTMLDivElement, { forwarded: true }>((props, ref) => {
  return <div ref={ref}>Hello world</div>
})

export { ReExportedComponent, ReExportedComponent as ReExportedComponentAsAlias }

export class ClassComponent extends React.Component<{ classProp: true }> {
  render() {
    return <>Hello world</>
  }
}

export const WithPickedProps: React.FC<Pick<{ withPickedProps: true }, 'withPickedProps'>> = (
  props,
) => null

interface WithExtendsProps extends Omit<HTMLAttributes<HTMLElement>, 'onChange'> {
  withExtends: true
}

export const WithExtends: React.FC<WithExtendsProps> = (props) => null

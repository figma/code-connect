import * as React from 'react'
import {
  booleanType,
  enumType,
  stringType,
  nestedPropsType,
  classNameType,
  textContentType,
  instanceType,
} from '../connect/external_types'
import { ReactMeta } from './types'

function connectType<P = {}>(_figmaNodeUrl: string, _meta?: ReactMeta<P>): void
function connectType<P = {}>(_component: any, _figmaNodeUrl: string, _meta?: ReactMeta<P>): void
function connectType(_component: unknown, _figmaNodeUrl: unknown, _meta?: unknown): void {}

function childrenType(_layers: string | string[]) {
  return React.createElement('div')
}

export {
  booleanType as boolean,
  enumType as enum,
  stringType as string,
  nestedPropsType as nestedProps,
  classNameType as className,
  textContentType as textContent,
  connectType as connect,
  instanceType as instance,
  childrenType as children,
}

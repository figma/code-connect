// todo move me to react
import { FigmaConnectMeta, PropMapping, ValueOf, EnumValue } from '../connect/api'
import * as React from 'react'
import {
  booleanType,
  enumType,
  stringType,
  nestedPropsType,
  classNameType,
  textContentType,
} from '../connect/external_types'

function connectType<P = {}>(_figmaNodeUrl: string, _meta?: FigmaConnectMeta<P>): void
function connectType<P = {}>(
  _component: any,
  _figmaNodeUrl: string,
  _meta?: FigmaConnectMeta<P>,
): void
function connectType(_component: unknown, _figmaNodeUrl: unknown, _meta?: unknown): void {}

function instanceType(_figmaPropName: string) {
  return React.createElement('div')
}

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

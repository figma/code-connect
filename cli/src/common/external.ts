import { FigmaConnectMeta, PropMapping, ValueOf } from './api'
import * as React from 'react'

function connectType<P = {}>(_figmaNodeUrl: string, _meta?: FigmaConnectMeta<P>): void
function connectType<P = {}>(
  _component: any,
  _figmaNodeUrl: string,
  _meta?: FigmaConnectMeta<P>,
): void
function connectType(_component: unknown, _figmaNodeUrl: unknown, _meta?: unknown): void {}

function booleanType(_figmaPropName: string): boolean
function booleanType<V extends string | boolean | number | symbol | undefined | JSX.Element>(
  _figmaPropName: string,
  _valueMapping?: Record<'true' | 'false', V>,
) {
  if (_valueMapping) {
    return enumType<V>(_figmaPropName, _valueMapping)
  }
  return true
}

function enumType<V extends string | boolean | number | symbol | undefined | JSX.Element>(
  _figmaPropName: string,
  _valueMapping: PropMapping<Record<string, V>>,
): ValueOf<Record<string, V>> {
  return Object.values(_valueMapping)[0] as ValueOf<Record<string, V>>
}

function stringType(_figmaPropName: string) {
  return ''
}

function instanceType(_figmaPropName: string) {
  return React.createElement('div')
}

function childrenType(_layers: string | string[]) {
  return React.createElement('div')
}

export {
  connectType as connect,
  booleanType as boolean,
  enumType as enum,
  stringType as string,
  instanceType as instance,
  childrenType as children,
}

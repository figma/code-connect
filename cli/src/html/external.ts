import {
  booleanType,
  enumType,
  stringType,
  nestedPropsType,
  classNameType,
  textContentType,
} from '../connect/external_types'
import { HtmlTemplateString } from './template_literal'
import { HtmlMeta } from './types'

function connectType<P = {}>(_figmaNodeUrl: string, _meta?: HtmlMeta<P>): void {}

function childrenType(_layers: string | string[]): HtmlTemplateString {
  return {
    __tag: 'HtmlTemplateString',
  }
}

export function instanceType<T = HtmlTemplateString>(_figmaPropName: string): T {
  return {
    __tag: 'HtmlTemplateString',
  } as T
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

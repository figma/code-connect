import { PropMapping, ValueOf, EnumValue } from './api'

export function booleanType(_figmaPropName: string): boolean
export function booleanType<V extends EnumValue>(
  _figmaPropName: string,
  _valueMapping?: Record<'true' | 'false', V>,
) {
  if (_valueMapping) {
    return enumType<V>(_figmaPropName, _valueMapping)
  }
  return true
}

export function enumType<V extends EnumValue>(
  _figmaPropName: string,
  _valueMapping: PropMapping<Record<string, V>>,
): ValueOf<Record<string, V>> {
  return Object.values(_valueMapping)[0] as ValueOf<Record<string, V>>
}

export function stringType(_figmaPropName: string) {
  return ''
}

export function nestedPropsType<T>(_layer: string, props: T) {
  return props
}

export function classNameType(_className: (string | undefined)[]) {
  return ''
}

export function textContentType(_layer: string) {
  return ''
}

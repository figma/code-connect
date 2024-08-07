const java17CompatabilityString =
  'Incompatible because this component declares a component, compatible with Java 17 and the consumer needed a component'

export function getComposeErrorSuggestion(stderr: string): string | null {
  if (stderr.includes(java17CompatabilityString)) {
    return 'Code Connect requires a minimum java version of Java 17, please update JAVA_HOME to point to a Java version that is greater or equal to 17'
  }
  return null
}

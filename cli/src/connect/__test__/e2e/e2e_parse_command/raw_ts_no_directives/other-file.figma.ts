// A .figma.ts file with none of the // url= / // component= / // source=
// directives. It is not detected as a Code Connect raw template at all, so the
// CLI ignores it entirely (no parse, no warning, no error).
export const config = {
  name: 'not-code-connect',
  value: 1,
}

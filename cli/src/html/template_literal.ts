// This type never actually gets instantiated because we parse the file with the
// TypeScript compiler API and don't run the code, so it's just here to be a
// unique type we can use.
export type HtmlTemplateString = {
  __tag: 'HtmlTemplateString'
}

export function html(strings: TemplateStringsArray, ...values: any[]): HtmlTemplateString {
  void strings, values // intentionally unused
  return { __tag: 'HtmlTemplateString' }
}

import figma, { html } from '../../../index_html'

figma.connect('ui/button', {
  example: () => html`<my-button>Click me</my-button>`,
  imports: ['import "@ui/Button"'],
})

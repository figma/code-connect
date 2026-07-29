import figma, { html } from '../../../../../html/index_html'

figma.connect('https://figma.com/design/abc/Test?node-id=2:2', {
  example: (props) => html`<acme-button></acme-button>`,
})

import figma, { html } from '../../../../../html/index_html'

figma.connect('test', {
  example: (props) => html`<my-component></my-component>`,
})

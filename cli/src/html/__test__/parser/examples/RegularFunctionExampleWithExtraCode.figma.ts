import figma, { html } from '../../../index_html'

figma.connect('', {
  example: () => {
    const x = 1
    return html`<div></div>`
  },
})

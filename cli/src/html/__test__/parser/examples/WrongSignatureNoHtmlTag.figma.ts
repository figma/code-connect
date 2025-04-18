import figma, { html } from '../../../index_html'

figma.connect('', {
  props: {
    visible: figma.boolean('Visible'),
    label: figma.string('Label'),
  },
  example: (props) => `<my-component visible=${props.visible}>${props.label}</my-component>`,
})

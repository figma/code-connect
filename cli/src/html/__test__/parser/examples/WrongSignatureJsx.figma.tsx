import figma, { html } from '../../../index_html'

figma.connect('', {
  props: {
    visible: figma.boolean('Visible'),
    label: figma.string('Label'),
  },
  // @ts-expect-error
  example: (props) => <div />,
})

import { testWizardE2e } from './test_wizard_e2e'

testWizardE2e({
  name: 'react',
  dirPath: 'e2e_parse_command/react_wizard',
  componentsPath: './e2e_parse_command/react_wizard/components',
  expectedCreatedComponentPath: 'components/PrimaryButton.figma.tsx',
  expectedIncludeGlobs: ['components/**/*.{tsx,jsx}'],
  expectedLabel: 'React',
})

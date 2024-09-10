// This is broken out into its own file as it can be slow to run and won't run
// on non-Mac systems, so the file can be ignored by Jest if needed

import { testWizardE2e } from './test_wizard_e2e'

testWizardE2e({
  name: 'swift',
  dirPath: 'e2e_parse_command/swift_wizard',
  componentsPath: './e2e_parse_command/swift_wizard/swift_wizard',
  expectedCreatedComponentPath: 'swift_wizard/Primary Button.figma.swift',
  expectedIncludeGlobs: ['swift_wizard/**/*.swift'],
})

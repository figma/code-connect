/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testPathIgnorePatterns: ['/dist/'],

  modulePathIgnorePatterns: [
    // Ignore changes to figma.config.json and figma.config.json.backup otherwise
    // the legacy config updating tests get stuck in an infinite loop
    'figma.config.json*',
    // Ignore this file which the e2e create test creates, otherwise it infinite loops
    'e2e_create_command/react/TestInstanceComponent.figma.tsx',
  ],
  roots: ['<rootDir>'],
}

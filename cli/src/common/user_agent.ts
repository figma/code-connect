const { name, version } = require('../../package.json')

// The API parses the code-connect-cli/version token to determine supported response formats.
export const USER_AGENT = `code-connect-cli/${version} (${name})`

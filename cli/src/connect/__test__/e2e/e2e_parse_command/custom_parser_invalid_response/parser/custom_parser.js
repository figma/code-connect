let data = ''

process.stdin.on('data', function (chunk) {
  data += chunk
})

process.stdin.on('end', function () {
  const parsed = JSON.parse(data)
  // Fake result which passes back the input, formatted to match the expected
  // schema, so we can validate it was passed in correctly
  const result = {
    docs: parsed.paths.map((path) => ({
      test: 123,
    })),
    messages: [
      { level: 'DEBUG', message: 'Debug message from parser!' },
      { level: 'INFO', message: 'Success from parser!' },
    ],
  }

  process.stdout.write(JSON.stringify(result))
})

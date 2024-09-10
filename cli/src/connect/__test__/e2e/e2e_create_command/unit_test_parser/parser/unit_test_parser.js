let data = ''

process.stdin.on('data', function (chunk) {
  data += chunk
})

process.stdin.on('end', function () {
  const parsed = JSON.parse(data)
  const result = {
    createdFiles: [{ filePath: 'test_file' }],
    messages: [
      // Return the input so that we can check it in the test
      { level: 'DEBUG', message: `Received: ${JSON.stringify(parsed)}` },
      { level: 'INFO', message: 'Success from parser!' },
    ],
  }

  process.stdout.write(JSON.stringify(result))
})

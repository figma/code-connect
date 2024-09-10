let data = ''

process.stdin.on('data', function (chunk) {
  data += chunk
})

process.stdin.on('end', function () {
  const result = {
    createdFiles: [{ filePath: 'test_file' }],
    messages: [{ level: 'ERROR', message: 'Error from parser!' }],
  }

  process.stdout.write(JSON.stringify(result))
})

let data = ''

process.stdin.on('data', function (chunk) {
  data += chunk
})

process.stdin.on('end', function () {
  const result = {
    messages: [{ level: 'INFO', message: 'Hello from parser!' }],
  }

  process.stdout.write(JSON.stringify(result))
})

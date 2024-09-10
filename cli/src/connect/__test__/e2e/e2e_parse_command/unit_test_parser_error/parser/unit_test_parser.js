let data = ''

process.stdin.on('data', function (chunk) {
  data += chunk
})

process.stdin.on('end', function () {
  const parsed = JSON.parse(data)
  const result = {
    docs: [],
    messages: [{ level: 'ERROR', message: 'Error from parser!' }],
  }

  process.stdout.write(JSON.stringify(result))
})

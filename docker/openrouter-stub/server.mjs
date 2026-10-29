// A stand-in for OpenRouter's chat completions endpoint, for integration tests without a real key or model.
// It answers the statement-extraction prompt deterministically from the PDF text in the user message:
//   lines "YYYY-MM-DD DEP|CHK <amount> <description>" become rows; "REFERENCE: <x>" sets the reference;
//   "NOT A STATEMENT" anywhere makes is_bank_statement false.
// Never used in production. Listens on 127.0.0.1 inside the API container's network namespace, because the API
// refuses a plain-http OpenRouter:BaseUrl unless the host is loopback.
import http from 'node:http'

const PORT = Number(process.env.PORT ?? 9090)

function answerFor(text) {
  if (/NOT A STATEMENT/i.test(text)) return { is_bank_statement: false, transactions: [] }
  const ref = /REFERENCE:\s*(\S+)/i.exec(text)?.[1]
  const account = /ACCOUNT:\s*(.+?)\s*$/im.exec(text)?.[1]
  const rows = []
  const re = /(\d{4}-\d{2}-\d{2})\s+(DEP|CHK)\s+([\d.]+)\s+(.+)/g
  for (let m; (m = re.exec(text)); ) {
    const row = {
      externalId: `row-${rows.length + 1}`,
      kind: m[2] === 'DEP' ? 'Deposit' : 'Check',
      date: m[1],
      amount: Number(m[3]),
      memo: m[4].trim(),
    }
    if (account) row.account = account
    rows.push(row)
  }
  return { is_bank_statement: true, ...(ref ? { reference: ref } : {}), transactions: rows }
}

http
  .createServer((req, res) => {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      if (req.method !== 'POST' || !req.url.endsWith('/chat/completions')) {
        res.writeHead(404).end()
        return
      }
      const parsed = JSON.parse(body)
      const text = parsed.messages
        .filter((m) => m.role === 'user')
        .map((m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content)))
        .join('\n')
      const content = JSON.stringify(answerFor(text))
      console.log(`stub: model=${parsed.model} chars=${text.length}`)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ id: 'stub', model: parsed.model, choices: [{ index: 0, message: { role: 'assistant', content } }] }))
    })
  })
  .listen(PORT, '127.0.0.1', () => console.log(`openrouter stub on 127.0.0.1:${PORT}`))

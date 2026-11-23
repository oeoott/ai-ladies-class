import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

// Windows checkouts may turn line endings into CRLF.
const read = async (path) => (await readFile(new URL(path, import.meta.url), 'utf8')).replaceAll('\r\n', '\n')

test('Static Web Apps config is valid and serves the face model and WASM with the right types', async () => {
  const config = JSON.parse(await read('../public/staticwebapp.config.json'))
  assert.equal(config.navigationFallback.rewrite, '/index.html')
  assert.equal(config.mimeTypes['.task'], 'application/octet-stream')
  assert.equal(config.mimeTypes['.wasm'], 'application/wasm')
  assert.match(config.globalHeaders['Permissions-Policy'], /camera=\(self\)/)
  assert.match(config.globalHeaders['Permissions-Policy'], /microphone=\(self\)/)
})

test('deploy workflows only run by hand and keep secrets out of the files', async () => {
  for (const name of ['backend-appservice.yml', 'frontend-staticwebapp.yml']) {
    const workflow = await read('../../.github/workflows/' + name)
    assert.match(workflow, /^on:\n {2}workflow_dispatch:\n\n/m, name)
    assert.doesNotMatch(workflow, /^\s+(push|pull_request|schedule):/m, name)
    for (const line of workflow.split('\n').filter((l) => /(token|profile|key|secret)\s*:/i.test(l))) {
      assert.match(line, /\$\{\{ secrets\.[A-Z_]+ \}\}/, name + ': ' + line.trim())
    }
  }
})

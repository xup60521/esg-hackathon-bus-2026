'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const crypto = require('node:crypto')
const F = require('./feature')
const A = require('./looper-agent')

function directory(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'agf-personal-')))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  return root
}

test('feature environment links preserve existing files and skip records, dependencies and nested checkouts', t => {
  const root = directory(t), main = path.join(root, 'main'), work = path.join(root, 'work')
  for (const name of ['app', '.wts', '.agentflow', 'node_modules', 'nested']) fs.mkdirSync(path.join(main, name), { recursive: true })
  fs.mkdirSync(work)
  for (const name of ['app/.env.local', '.env.production', '.wts/.env.local', '.agentflow/.env.local', 'node_modules/.env.local', 'nested/.env.local']) fs.writeFileSync(path.join(main, name), 'private-value')
  fs.writeFileSync(path.join(main, 'nested/.git'), 'gitdir: elsewhere')
  fs.writeFileSync(path.join(work, '.env.production'), 'existing')
  const result = F.provision_env_links(main, work, ['.agentflow'])
  assert.deepEqual(result.linked, ['app/.env.local'])
  assert.deepEqual(result.failed, [])
  fs.writeFileSync(path.join(work, 'app/.env.local'), 'updated')
  assert.equal(fs.readFileSync(path.join(main, 'app/.env.local'), 'utf8'), 'updated')
  assert.equal(fs.readFileSync(path.join(work, '.env.production'), 'utf8'), 'existing')
  for (const name of ['.wts', '.agentflow', 'node_modules', 'nested']) assert.equal(fs.existsSync(path.join(work, name)), false)
})

test('feature environment links use a hard link after symlink permission refusal and report other failures', t => {
  const root = directory(t), main = path.join(root, 'main'), work = path.join(root, 'work')
  fs.mkdirSync(main); fs.mkdirSync(work)
  fs.writeFileSync(path.join(main, '.env.local'), 'private')
  const original = fs.symlinkSync
  fs.symlinkSync = () => { throw Object.assign(Error('permission refused'), { code: 'EPERM' }) }
  try {
    assert.deepEqual(F.provision_env_links(main, work).linked, ['.env.local'])
    assert.equal(fs.statSync(path.join(main, '.env.local')).ino, fs.statSync(path.join(work, '.env.local')).ino)
  } finally { fs.symlinkSync = original }
  fs.writeFileSync(path.join(main, '.env.production'), 'private')
  fs.symlinkSync = () => { throw Object.assign(Error('disk failure'), { code: 'EIO' }) }
  try {
    assert.deepEqual(F.provision_env_links(main, work).failed.map(x => x.relative), ['.env.production'])
    assert.equal(fs.existsSync(path.join(work, '.env.production')), false)
  } finally { fs.symlinkSync = original }
})

test('OpenCode worker keeps model, arbitrary variant and complete Unicode stdin with attempt-bound JSON output', async t => {
  const root = directory(t), attempt = { id: crypto.randomUUID() }, capture = path.join(root, 'capture.json')
  const executable = path.join(root, 'fake opencode.cjs')
  fs.writeFileSync(executable, `const fs=require('node:fs');const chunks=[];process.stdin.on('data',x=>chunks.push(x));process.stdin.on('end',()=>{fs.writeFileSync(${JSON.stringify(capture)},JSON.stringify({args:process.argv.slice(2),stdin:Buffer.concat(chunks).toString('utf8'),permission:JSON.parse(process.env.OPENCODE_CONFIG_CONTENT).permission}));console.log(JSON.stringify({type:'text',part:{text:JSON.stringify({attempt_id:${JSON.stringify(attempt.id)},outcome:'pass',summary:'done',evidence:[]})}}))})`)
  const selection = { kind: 'cli', provider: 'opencode', model: 'custom-provider/model-x', effort: 'thinking_plus', executable }
  const selected = require('./looper').select({ file: 'ag.json', digest: 'test', config: {
    'looper-routes': { acceptance: { kind: 'cli', provider: 'opencode', 'model-family': 'custom', executable } },
    'pipeline-roles': { acceptance: 'basic' }, 'model-family': { custom: { basic: 'custom-provider/model-x/thinking_plus' } }
  } }, 'acceptance')
  assert.equal(selected.model, selection.model)
  assert.equal(selected.effort, selection.effort)
  const result = await A.launch_agent({ selection, role: 'acceptance', cwd: root, prompt: '完整中文🙂 café', attempt, attempt_dir: path.join(root, 'attempt') })
  assert.equal(result.outcome, 'pass')
  const observed = JSON.parse(fs.readFileSync(capture))
  assert.deepEqual(observed.args, ['run', '--model', selection.model, '--variant', 'thinking_plus', '--format', 'json'])
  assert.match(observed.stdin, /完整中文🙂 café/)
  assert.equal(observed.permission.edit, undefined)
  assert.equal(observed.permission['*'], 'deny')
  assert.equal(observed.permission.read, 'allow')
  assert.equal(observed.permission.list, 'allow')
  assert.equal(observed.permission.external_directory, undefined)
  await A.launch_agent({ selection, role: 'task', cwd: root, prompt: 'task', attempt, attempt_dir: path.join(root, 'task-attempt') })
  const skill = path.resolve(__dirname, '..').split(path.sep).join('/')
  assert.deepEqual(JSON.parse(fs.readFileSync(capture)).permission.external_directory, { [skill + '/**']: 'allow' })
})

test('OpenCode result parsing takes the final text part and rejects failed, stale, missing or malformed results', () => {
  const attempt = { id: 'expected' }
  const event = value => JSON.stringify({ type: 'text', part: { text: value } })
  const result = JSON.stringify({ attempt_id: 'expected', outcome: 'pass', summary: 'ok', evidence: [] })
  assert.equal(A.parse_opencode_result(event(result), attempt).outcome, 'pass')
  assert.throws(() => A.parse_opencode_result(event(result.replace('expected', 'stale')), attempt), /stale/)
  assert.equal(A.parse_opencode_result(['provider log line on stderr', event('Reading the plan first.'), event(result)].join('\n'), attempt).outcome, 'pass')
  assert.throws(() => A.parse_opencode_result(event(result) + '\n' + event('Done.'), attempt), /JSON/)
  assert.throws(() => A.parse_opencode_result('only stderr noise', attempt), /missing/)
  assert.throws(() => A.parse_opencode_result(event(result) + '\n' + JSON.stringify({ type: 'error', error: { message: 'failed' } }), attempt), /failed/)
  assert.throws(() => A.parse_opencode_result(event('not JSON'), attempt), /JSON|malformed/)
})

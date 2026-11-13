'use strict'

const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { randomUUID } = require('node:crypto')
const S = require('./looper-state')

// Linux uses the freedesktop home Trash. Windows retains a private recovery
// directory: no unverified Recycle Bin API or permanent-delete fallback.
function recovery_bin({ home = os.homedir(), platform = process.platform, env = process.env } = {}) {
  if (!['linux', 'win32'].includes(platform)) throw Error('Portable recovery supports Linux and Windows')
  const base = platform === 'linux'
    ? path.join(env.XDG_DATA_HOME || path.join(home, '.local', 'share'), 'Trash')
    : path.join(home, '.agentflow-recovery')
  if (!path.isAbsolute(base)) throw Error('Recovery directory must be absolute')
  const root = path.join(base, 'files'), info = path.join(base, 'info')
  function prepare(source) {
    for (const directory of [root, info]) {
      S.inspect_path(directory)
      fs.mkdirSync(directory, { recursive: true, mode: 0o700 })
      S.inspect_path(directory)
      fs.accessSync(directory, fs.constants.R_OK | fs.constants.W_OK | fs.constants.X_OK)
    }
    if (source) {
      S.inspect_path(path.resolve(source))
      if (fs.statSync(root).dev !== fs.lstatSync(source).dev) throw Error('Same-volume recovery required; source retained')
      if (source === base || source.startsWith(base + path.sep) || base.startsWith(source + path.sep)) throw Error('Recovery/source overlap')
    }
    return root
  }
  function move(source, { destination = path.join(root, `${path.basename(source)}-${randomUUID()}`) } = {}) {
    source = path.resolve(source)
    prepare(source)
    if (path.dirname(destination) !== root) throw Error('Recovery destination must be a direct child')
    S.inspect_path(destination)
    const before = fs.lstatSync(source)
    if (!before.isFile() && !before.isDirectory()) throw Error('Recovery source must be a regular file or directory')
    try { fs.lstatSync(destination); throw Error('Recovery destination collision') } catch (error) { if (error.code !== 'ENOENT') throw error }
    const metadata = path.join(info, path.basename(destination) + '.trashinfo')
    const fd = fs.openSync(metadata, 'wx', 0o600)
    try {
      const date = new Date(), two = n => String(n).padStart(2, '0')
      const stamp = `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}T${two(date.getHours())}:${two(date.getMinutes())}:${two(date.getSeconds())}`
      fs.writeFileSync(fd, `[Trash Info]\nPath=${encodeURI(source).replace(/[?#]/g, encodeURIComponent)}\nDeletionDate=${stamp}\n`)
      fs.fsyncSync(fd)
    } finally { fs.closeSync(fd) }
    try {
      const current = fs.lstatSync(source)
      if (current.dev !== before.dev || current.ino !== before.ino) throw Error('Recovery source identity changed')
      fs.renameSync(source, destination)
    } catch (error) {
      // Nothing moved; drop only this call's metadata so a retry can reuse the destination.
      fs.unlinkSync(metadata)
      throw error
    }
    const moved = fs.lstatSync(destination)
    if (moved.dev !== before.dev || moved.ino !== before.ino || fs.existsSync(source)) throw Error('Recovery outcome uncertain; inspect retained paths')
    return destination
  }
  return { root, info, prepare, move }
}

module.exports = { recovery_bin }

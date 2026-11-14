import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const dist = join(root, 'dist')
const tmp = join(root, '.gh-pages-tmp')

rmSync(tmp, { recursive: true, force: true })
mkdirSync(tmp, { recursive: true })
cpSync(dist, tmp, { recursive: true })
writeFileSync(join(tmp, '.nojekyll'), '')

function git(args, cwd = tmp) {
  const r = spawnSync('git', args, { cwd, stdio: 'inherit' })
  if (r.status !== 0) process.exit(r.status ?? 1)
}

git(['init', '-b', 'gh-pages'])
// Large baked TTS payload — local to this temp repo only
git(['config', 'http.postBuffer', '524288000'])
git(['config', 'http.version', 'HTTP/1.1'])
git(['add', '-A'])
git(['-c', 'user.email=pages@khudo.local', '-c', 'user.name=khudo-pages', 'commit', '-m', 'Deploy GitHub Pages build'])
git(['remote', 'add', 'origin', 'https://github.com/MacallanS/khudo-bystro.git'])
git(['push', '-f', 'origin', 'gh-pages'])

rmSync(tmp, { recursive: true, force: true })
console.log('Pushed gh-pages → https://macallans.github.io/khudo-bystro/')

import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const root = new URL('..', import.meta.url).pathname
const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
  name: string
  version: string
  dependencies?: Record<string, string>
  exports: Record<string, unknown>
  repository: { url: string; directory?: string }
  homepage: string
  bugs: string
}
const out = mkdtempSync(join(tmpdir(), 'aihu-primitives-pack-'))
let tarball: string | undefined
try {
  const json = execFileSync('bun', ['pm', 'pack', '--json'], {
    cwd: root,
    encoding: 'utf8',
  })
  const filename = json
    .trim()
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.endsWith('.tgz'))
  if (!filename) throw new Error('bun pm pack did not return a tarball')
  tarball = join(root, filename)
  execFileSync('tar', ['-xzf', tarball, '-C', out])
  const packed = JSON.parse(
    readFileSync(join(out, 'package', 'package.json'), 'utf8'),
  ) as typeof packageJson
  if (packed.name !== packageJson.name || packed.version !== packageJson.version)
    throw new Error('Packed name/version differs from source')
  if (!packed.repository.url.includes('aihu-project/aihu-primitives'))
    throw new Error(`Packed repository is stale: ${packed.repository.url}`)
  if (packed.repository.directory)
    throw new Error('Standalone package must not publish repository.directory')
  if (packed.homepage.includes('/tree/main/packages/'))
    throw new Error(`Packed homepage still points at monorepo: ${packed.homepage}`)
  if (packed.bugs.includes('fellwork/aihu'))
    throw new Error(`Packed bugs URL still points at old repository: ${packed.bugs}`)
  if (Object.values(packed.dependencies ?? {}).some((value) => value.startsWith('workspace:')))
    throw new Error('Packed manifest contains a workspace dependency')
  for (const subpath of Object.keys(packageJson.exports))
    if (!(packageJson.exports[subpath] as { import?: string }).import)
      throw new Error(`Export ${subpath} has no import target`)
  console.log(`Packed manifest check passed for ${packageJson.name}@${packageJson.version}`)
} finally {
  if (tarball) rmSync(tarball, { force: true })
  rmSync(out, { recursive: true, force: true })
}

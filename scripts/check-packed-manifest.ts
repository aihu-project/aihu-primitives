import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

type ExportTarget = string | Record<string, ExportTarget> | ExportTarget[]

function collectExportTargets(value: ExportTarget, path: string): string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap((entry) => collectExportTargets(entry, path))
  if (value && typeof value === 'object')
    return Object.entries(value).flatMap(([condition, entry]) =>
      collectExportTargets(entry, `${path}.${condition}`),
    )
  throw new Error(`Export ${path} contains an invalid target`)
}

const root = new URL('..', import.meta.url).pathname
const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
  name: string
  version: string
  dependencies?: Record<string, string>
  exports: Record<string, ExportTarget>
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
  const tarEntries = new Set(
    execFileSync('tar', ['-tzf', tarball], { encoding: 'utf8' })
      .trim()
      .split('\n')
      .map((entry) => entry.trim()),
  )
  for (const required of ['package/README.md', 'package/LICENSE'])
    if (!tarEntries.has(required)) throw new Error(`Packed tarball is missing ${required}`)
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
  for (const [subpath, declaration] of Object.entries(packageJson.exports)) {
    const targets = collectExportTargets(declaration, subpath)
    if (targets.length === 0) throw new Error(`Export ${subpath} has no targets`)
    for (const target of targets) {
      if (!target.startsWith('./'))
        throw new Error(`Export ${subpath} has a non-relative target: ${target}`)
      const packedPath = `package/${target.slice(2)}`
      if (!tarEntries.has(packedPath))
        throw new Error(`Export ${subpath} target is missing from tarball: ${target}`)
    }
  }
  console.log(`Packed manifest check passed for ${packageJson.name}@${packageJson.version}`)
} finally {
  if (tarball) rmSync(tarball, { force: true })
  rmSync(out, { recursive: true, force: true })
}

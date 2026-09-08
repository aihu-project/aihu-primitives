import { readFile } from 'node:fs/promises'

const packageJson = JSON.parse(
  await readFile(new URL('../package.json', import.meta.url), 'utf8'),
) as {
  name: string
  version: string
}

if (packageJson.name !== '@aihu/primitives')
  throw new Error(`Expected @aihu/primitives, found ${packageJson.name}`)
const ref = process.env.GITHUB_REF ?? ''
if (!ref) {
  console.log(`Release version check: ${packageJson.name}@${packageJson.version} (local)`)
  process.exit(0)
}
const match = /^refs\/tags\/v(\d+\.\d+\.\d+)$/.exec(ref)
if (!match) throw new Error(`Ref ${ref} is not an exact vMAJOR.MINOR.PATCH release tag`)
if (match[1] !== packageJson.version)
  throw new Error(
    `Release tag v${match[1]} does not match ${packageJson.name}@${packageJson.version}`,
  )
console.log(`Release version check passed: ${packageJson.name}@${packageJson.version}`)

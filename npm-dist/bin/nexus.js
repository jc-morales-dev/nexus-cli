#!/usr/bin/env node
// npm bin shim for NEXUS. `npm i -g @victor00128/nexus-cli` wires this up as
// the `nexus` command; this shim execs the self-contained NEXUS binary (which
// embeds the Bun runtime + all code) from the platform-specific optional
// dependency, forwarding args and the real TTY so the terminal UI works. Same
// pattern esbuild/biome use to ship native binaries over npm.
const { spawnSync } = require('child_process')
const path = require('path')
const fs = require('fs')

const key = `${process.platform}-${process.arch}`
const exeName = process.platform === 'win32' ? 'nexus.exe' : 'nexus'

function resolveBinary() {
  // 1. Platform package installed as optionalDependency (the normal path).
  try {
    return require.resolve(`@victor00128/nexus-cli-${key}/bin/${exeName}`)
  } catch {}
  // 2. Legacy/local layout: binary sitting right next to this shim.
  const local = path.join(__dirname, exeName)
  if (fs.existsSync(local)) {
    return local
  }
  return null
}

const exePath = resolveBinary()
if (!exePath) {
  console.error(
    `NEXUS: no encontré el binario para tu plataforma (${key}).\n` +
      `Puede que npm haya salteado la dependencia opcional. Probá:\n` +
      `  npm i -g @victor00128/nexus-cli-${key}\n` +
      `Si tu plataforma no está publicada, abrí un issue.`,
  )
  process.exit(1)
}

// Tarballs published from Windows don't carry the executable bit — restore it.
if (process.platform !== 'win32') {
  try {
    fs.chmodSync(exePath, 0o755)
  } catch {}
}

const result = spawnSync(exePath, process.argv.slice(2), { stdio: 'inherit' })
if (result.error) {
  console.error(`NEXUS: no se pudo ejecutar el binario: ${result.error.message}`)
  process.exit(1)
}
process.exit(result.status ?? 0)

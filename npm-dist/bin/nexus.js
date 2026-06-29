#!/usr/bin/env node
// npm bin shim for NEXUS. `npm i -g` wires this up as the `nexus` command and
// runs it under Node; this shim simply execs the bundled, self-contained NEXUS
// binary (which embeds the Bun runtime + all code), forwarding args and the
// real TTY so the terminal UI works. Same pattern esbuild/biome use to ship a
// native binary over npm without requiring the user to install anything else.
const { spawnSync } = require('child_process')
const path = require('path')
const fs = require('fs')

const exeName = process.platform === 'win32' ? 'nexus.exe' : 'nexus'
const exePath = path.join(__dirname, exeName)

if (!fs.existsSync(exePath)) {
  console.error(
    `NEXUS: no encontré el binario para tu plataforma (${process.platform}-${process.arch}).\n` +
      `Esta build trae el binario de Windows x64. Para otras plataformas hace falta el binario correspondiente.`,
  )
  process.exit(1)
}

const result = spawnSync(exePath, process.argv.slice(2), { stdio: 'inherit' })
if (result.error) {
  console.error(`NEXUS: no se pudo ejecutar el binario: ${result.error.message}`)
  process.exit(1)
}
process.exit(result.status ?? 0)

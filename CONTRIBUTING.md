# Contribuir a NEXUS

Gracias por pasar. NEXUS es un CLI chico y sin cuentas: no hay backend, ni base
de datos, ni credenciales que aprovisionar. Si podés correr Bun, podés correr
todo el proyecto.

## Preparar el entorno

```bash
git clone https://github.com/jc-morales-dev/nexus-cli.git
cd nexus-cli
bun install
```

Necesitás [Bun](https://bun.sh) 1.3.11 exacto (está pinneado en `.bun-version` y
en `engines`).

Para usar el CLI mientras desarrollás hace falta una API key de
[OpenRouter](https://openrouter.ai/keys). No hace falta ponerla en ningún
archivo: arrancá el CLI y escribí `/key`. Si preferís una variable de entorno,
usá `OPENROUTER_API_KEY`.

Si algo no arranca, el primer paso es siempre:

```bash
bun dev
> (Ctrl+C)
bun --cwd cli run src/index.tsx doctor
```

## Correrlo

```bash
bun dev          # el CLI contra este mismo repo
```

## Los comandos que importan

| Comando | Qué hace |
|---|---|
| `bun run test` | Toda la suite de tests |
| `bun --filter='*' run typecheck` | Typecheck de todos los paquetes |
| `bun run lint` | ESLint |
| `bun run lint:fix` | ESLint arreglando lo que puede |
| `bun run eval:offline` | Evaluaciones deterministas del agente (sin costo) |
| `bun run eval` | Todas las evaluaciones (las agénticas necesitan key) |
| `bun run format` | Prettier |

Antes de abrir un pull request, corré al menos estos tres:

```bash
bun --filter='*' run typecheck
bun run lint
bun run test
```

Todo tiene que quedar verde. Hoy son **4044 tests** (`common` 398,
`agent-runtime` 486, `sdk` 490, `cli` 2405, `agents` 193, `scripts` 32,
`llm-providers` 20, `evals` 20) y 18 skipped condicionales (tmux, macOS,
binario del SDK sin construir).

CI corre lo mismo en Linux y en Windows, más las evals offline.

Dos cosas que están rojas o ruidosas a propósito, para que no te sorprendan:

- `bun scripts/check-env-architecture.ts` reporta violaciones preexistentes en
  el arranque BYOK, que lee `process.env` directo por diseño. CI lo corre solo
  como información.
- `bun run lint` tira ~360 warnings heredados del fork, casi todos de orden de
  imports. **Errores tiene cero**, y eso sí bloquea. Arreglá los warnings de los
  archivos que toques, no de todo el árbol.
- Prettier no está aplicado a todo el repo por el mismo motivo. Formateá lo que
  tocás.

## Tests

Corren con `bun test`. Tres convenciones que conviene conocer:

- **Inyección de dependencias antes que mocks de módulos.** Casi todas las
  funciones reciben `fs` y `logger` como parámetros justamente para que el test
  pase falsos. `cli/src/commands/doctor/checks.ts` es el ejemplo más claro: la
  suite entera corre sin tocar disco, red ni PATH.
- **Las rutas van por el helper canónico** de
  `common/src/testing/mocks/filesystem.ts` (`mockFsPath`). Las fixtures usan
  raíces POSIX como `/repo`, que en Windows resuelven a `E:\repo`. Si comparás
  contra un literal crudo, tu test pasa en Linux y falla en Windows.
- **No borres un test para poner la suite en verde.** Si un test codifica un
  comportamiento que cambió a propósito, actualizalo y explicá en el commit por
  qué el contrato nuevo es el correcto.

## Evals

Las evals son distintas de los tests: miden **cómo se comporta el agente**, no
si una función devuelve un valor exacto.

```bash
bun run eval:offline                       # 5 escenarios deterministas, gratis
bun run eval                               # los 16 (11 necesitan modelo)
bun --filter=@nexus/evals run eval -- --scenario fix-bug
bun --filter=@nexus/evals run eval -- --tag security
bun --filter=@nexus/evals run eval -- --json reporte.json
```

Hay dos tipos de escenario:

- **`offline`** — ejercitan a NEXUS sin modelo: clasificación de errores, reglas
  de permisos, redacción de secretos. Deterministas, corren en CI.
- **`agent`** — necesitan un modelo real. Se saltean solos si no hay key.

Si agregás uno, escribí las aserciones **contra el resultado observable** (¿pasan
los tests del proyecto de prueba?, ¿tocó archivos fuera de alcance?), nunca
comparando el texto exacto que devolvió el modelo. Un agente que resuelve el
problema de otra forma válida tiene que pasar.

El detalle está en [`evals/README.md`](./evals/README.md).

## Convenciones del proyecto

- **Nunca hacer force-push a `main`** salvo que se pida explícitamente.
- **Los comandos de git interactivos van en tmux** (cualquiera que abra un
  editor o pregunte algo).
- **Los textos que ve el usuario en `cli/` van en español rioplatense.** La
  documentación técnica y los comentarios del código, en inglés.
- **Las rutas que lee el modelo** — salida de herramientas, claves de mapas de
  resultados — usan barras hacia adelante en todas las plataformas. Las que van
  a `fs` o a `spawn` quedan nativas. El contrato está documentado en
  `ResolvedProjectPath`, en `sdk/src/tools/path-utils.ts`.
- **Ningún secreto se imprime nunca.** Todo lo que pueda contener una key pasa
  por `common/src/util/redact.ts`. Si agregás una superficie de salida nueva
  (un log, un reporte, un mensaje de error), pasala por ahí.

### Mensajes de commit

Usamos [Conventional Commits](https://www.conventionalcommits.org/es/), porque
de ahí salen la versión y el changelog automáticamente:

```
feat(cli): agregar el comando doctor
fix(sdk): dejar de filtrar la key en los mensajes de error
docs: explicar el flujo de release
refactor(agents): simplificar la carga del registro
test(evals): cubrir el caso de respuesta truncada
chore: subir dependencias
```

Un `!` después del scope marca un cambio incompatible: `feat(cli)!: …`. Eso
dispara una versión MAJOR, así que usalo solo cuando corresponda.

`feat` sube MINOR, `fix` y `perf` suben PATCH, el resto no dispara release por
sí solo. Ver [docs/versioning.md](./docs/versioning.md).

## Reportar un bug

Abrí un [issue](https://github.com/jc-morales-dev/nexus-cli/issues/new/choose) con
la plantilla de bug. Lo que más ayuda:

1. La salida de **`nexus doctor`** (es segura de pegar: no muestra tu key).
2. Qué esperabas que pasara y qué pasó.
3. Los pasos para reproducirlo.
4. Si hay un error, la salida con **`nexus --debug`**.

**Nunca pegues tu API key**, ni siquiera parcial. Si creés que se filtró en
algún lado, revocala en OpenRouter primero y contanos después — eso es
exactamente lo que queremos saber. Para vulnerabilidades, ver
[SECURITY.md](./SECURITY.md).

## Por dónde empezar

Los issues etiquetados
[`good first issue`](https://github.com/jc-morales-dev/nexus-cli/labels/good%20first%20issue)
son los que se pueden resolver sin conocer todo el proyecto. La etiqueta se
pone cuando un issue cumple las cuatro:

- El alcance está claro y cabe en un archivo o dos.
- Hay una forma obvia de verificar que quedó bien (un test, un comando).
- No hace falta entender el loop de agentes ni el runtime de la TUI.
- El issue dice dónde mirar.

Otras etiquetas: `help wanted` (se agradece ayuda, pero no es para empezar),
`bug`, `security` (prioridad), `docs`, `good first issue`.

## Mapa del repo

- `cli/` — la interfaz de terminal (OpenTUI + React) y todo lo que ve el usuario
- `sdk/` — el SDK sobre el que corre el CLI: herramientas, acceso a archivos,
  estado de la corrida
- `packages/agent-runtime/` — el loop de agentes y el manejo de herramientas
- `packages/llm-providers/` — el cliente compatible con OpenAI
- `packages/code-map/` — parsing de código con tree-sitter
- `common/` — tipos, constantes, esquemas y mocks compartidos
- `agents/` — los agentes que vienen con NEXUS
- `.agents/` — plantillas que `/init` copia al proyecto del usuario
- `evals/` — las evaluaciones del agente
- `scripts/release/` — generación de changelog y verificación previa a publicar
- `npm-dist/` — el paquete npm publicado y sus binarios por plataforma

`packages/billing`, `packages/internal` y `packages/bigquery` son restos del
producto de pago original. Nada del camino del CLI los importa.

## Pull requests

Mantené los cambios acotados, explicá qué verificaste, e incluí la salida de los
comandos de arriba. Si tocás manejo de rutas, decí explícitamente si corriste la
suite en Windows.

## Publicar una versión

Ver [docs/releasing.md](./docs/releasing.md).

## Licencia

Al contribuir aceptás que tu contribución se licencia bajo la
[Apache License 2.0](./LICENSE).

# Publicar una versión

Todo el proceso está automatizado salvo un paso: pushear el tag. Eso es
deliberado — publicar en npm es irreversible, y un número de versión no se
puede reutilizar nunca.

## El flujo, de punta a punta

```bash
# 1. Preparar: calcula la versión, arma el changelog, bumpea el package.json
bun scripts/release/prepare.ts

# 2. Revisar el diff. Este es el momento de corregir algo.
git diff

# 3. Commitear y taguear
git add cli/package.json CHANGELOG.md
git commit -m "release: 1.1.0"
git tag v1.1.0

# 4. Pushear. El tag dispara todo lo demás.
git push origin main --tags
```

A partir del push, GitHub Actions hace el resto.

## Qué hace cada paso

### `prepare.ts`

Lee los commits desde el último tag `v*`, los interpreta como
[Conventional Commits](https://www.conventionalcommits.org/es/) y:

- Calcula el bump: `feat` → MINOR, `fix`/`perf` → PATCH, cualquiera con `!` →
  MAJOR.
- Escribe la entrada nueva en `CHANGELOG.md`, agrupada por tipo, con los
  cambios incompatibles arriba de todo.
- Reemplaza la sección «No publicado» si existe.
- Actualiza `version` en `cli/package.json`.

No commitea, no taguea y no publica. Con `--dry-run` te muestra el changelog
sin tocar nada. Podés forzar una versión: `bun scripts/release/prepare.ts 2.0.0`.

Si no hay ningún commit `feat`/`fix`/`perf` desde la última release, te avisa y
no hace nada.

### El workflow (`.github/workflows/release.yml`)

Cuatro jobs en cadena. Si uno falla, no se publica nada.

**1. Verify** — el tag tiene que coincidir con `cli/package.json`, y después
typecheck, lint, tests y evals offline. Es la misma barra que cualquier push a
`main`, más la comprobación del tag.

**2. Build** — descarga ripgrep para las cinco plataformas, construye el SDK, y
cross-compila los cinco binarios desde Linux (Bun descarga los runtimes que
necesita). Después corre `scripts/release/verify.ts`, que comprueba:

- que las seis versiones coincidan entre sí y con el tag,
- que cada paquete tenga su binario y su `tree-sitter.wasm` al lado (sin él, el
  binario instala bien y falla al primer uso),
- que cada paquete lleve `NOTICE` (Apache-2.0: el binario es obra derivada),
- que el `optionalDependencies` del paquete principal apunte a la versión
  exacta,
- que el CHANGELOG tenga una entrada para esta versión,
- que ningún `package.json` contenga algo con forma de API key.

**3. Publish** — publica los cinco paquetes de plataforma **primero** y el
principal **último**. El orden importa: el principal los declara como
`optionalDependencies` pinneadas a esta versión exacta, así que publicarlo antes
dejaría una ventana en la que `npm install` no resuelve nada.

Este job usa el *environment* `npm-publish` de GitHub. Si le agregás un revisor
obligatorio ahí, cada publicación necesita una aprobación humana.

**4. GitHub Release** — crea la release con las notas sacadas del CHANGELOG (la
misma sección que revisaste, no un resumen paralelo que puede divergir), y sube
los binarios comprimidos con sus SHA256.

## Lo que hace falta configurar una vez

| Qué | Dónde | Para qué |
|---|---|---|
| Secret `NPM_TOKEN` | Settings → Secrets → Actions | Publicar en npm. Un token de tipo *Automation*. |
| Environment `npm-publish` | Settings → Environments | El gate del job de publicación. Opcionalmente con revisor. |

Sin `NPM_TOKEN` los tres primeros jobs corren igual y el de publicación falla,
que es el comportamiento correcto: nada se publica a medias.

## Por qué no semantic-release ni changesets

Se evaluaron los dos:

- **changesets** versiona muchos paquetes publicables de forma independiente.
  NEXUS tiene un solo producto, y los seis `package.json` que publica los
  **genera** `cli/scripts/pack-npm.ts`. No hay nada que changesets pueda
  versionar.
- **semantic-release** asume un `npm publish` único de un `package.json`
  mantenido a mano. NEXUS publica cinco binarios cross-compilados más un shim,
  en un orden específico. Habría que escribir plugins para todo eso, y trae
  unas treinta dependencias transitivas para hacer un trabajo que son doscientas
  líneas de parsing.

Lo que quedó — Conventional Commits más `scripts/release/` — no agrega ninguna
dependencia y hace exactamente lo que este repo necesita. El parser está
cubierto por 31 tests en `scripts/__tests__/conventional-commits.test.ts`.

## Publicar el SDK

El SDK (`@nexus/sdk`) va aparte y sigue siendo manual:

```bash
bun run --cwd sdk prepare-dist    # dry run
bun run --cwd sdk publish-dist    # de verdad
```

## Si algo sale mal

**El tag no coincide con `package.json`.** Corré `prepare.ts`, commiteá, borrá
el tag (`git tag -d v1.1.0 && git push origin :v1.1.0`) y volvé a taguear.

**Falló después de publicar algunos paquetes de plataforma.** Los publicados
quedan publicados: npm no permite despublicar pasadas las 72 horas. Arreglá el
problema, subí el PATCH y publicá una versión nueva. No intentes reutilizar el
número.

**Falló el `verify.ts`.** Te dice exactamente qué está mal. Lo más común es que
falte una plataforma en el build o que no exista la entrada del CHANGELOG.

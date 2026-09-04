# Versionado y compatibilidad

Qué garantiza NEXUS entre versiones, y qué no.

## SemVer

NEXUS sigue [SemVer 2.0](https://semver.org/lang/es/): `MAJOR.MINOR.PATCH`.

| Parte | Cuándo sube | Ejemplo |
|---|---|---|
| MAJOR | Un cambio incompatible: algo que hoy funciona deja de funcionar | Sacar un comando, cambiar el formato de `settings.json` sin migración |
| MINOR | Funcionalidad nueva, compatible hacia atrás | `nexus doctor`, un flag nuevo |
| PATCH | Correcciones compatibles hacia atrás | Arreglar un mensaje de error, una fuga de secretos |

La versión sale de los mensajes de commit
([Conventional Commits](https://www.conventionalcommits.org/es/)):

- `feat:` → MINOR
- `fix:` o `perf:` → PATCH
- cualquiera con `!` (por ejemplo `feat(cli)!:`) → MAJOR
- `docs:`, `chore:`, `test:`, `ci:`, `refactor:` → no disparan release por sí solos

`cli/package.json` es la única fuente de verdad de la versión. Los seis
`package.json` que se publican en npm se generan a partir de ella.

## Qué se considera API pública

Lo que está cubierto por estas garantías:

- **Los comandos y flags del CLI**: `nexus`, `nexus doctor`, `nexus login`,
  `nexus publish`, `--agent`, `--continue`, `--cwd`, `--debug`, `--lite`,
  `--max`, `--plan`, `--clear-logs`.
- **Los comandos de barra** dentro de la interfaz: `/key`, `/model`, `/undo`,
  `/bg`, `/init`, `/help`.
- **Los archivos de configuración**: `.nexus/hooks.json`,
  `.nexus/permissions.json`, `.nexusignore`, `~/.config/nexus/settings.json`.
- **Las variables de entorno**: `OPENROUTER_API_KEY`, `NEXUS_MODEL`,
  `NEXUS_MODEL_STRONG`, `NEXUS_MODEL_CHEAP`, `NEXUS_DEBUG`.
- **El contrato de los agentes personalizados** (`AgentDefinition`), descrito
  en [custom-agents.md](./custom-agents.md).

Lo que **no** está cubierto, y puede cambiar en cualquier release:

- La estructura interna de los paquetes (`cli/src/**`, `sdk/src/**`,
  `packages/**`). Son privados: no se publican por separado.
- El texto exacto de los mensajes. Se traducen y se reescriben; no scriptees
  contra ellos. Para automatizar, usá `nexus doctor --json`, que sí tiene un
  esquema estable.
- El formato de los archivos de log.
- Los ids de los agentes que vienen incluidos (`base2`, `base2-lite`, …)
  mientras la arquitectura de agentes siga moviéndose.

## Versiones de Node y Bun

NEXUS no corre sobre Node: la interfaz usa el FFI de Bun. Por eso se publica
como binario autocontenido, con Bun adentro.

| Cómo lo usás | Qué necesitás |
|---|---|
| Instalado desde npm | Node ≥ 16, solo para el shim que elige y ejecuta el binario. Bun no hace falta. |
| Desde el código fuente | Bun 1.3.11 exacto (pinneado en `.bun-version` y en `engines`) |

Plataformas con binario publicado: `win32-x64`, `linux-x64`, `linux-arm64`,
`darwin-x64`, `darwin-arm64`.

Subir el mínimo de Node del shim es un cambio MAJOR. Subir la versión de Bun
usada para compilar no lo es: va adentro del binario y no te afecta.

## Cambios incompatibles

Cuando uno es realmente necesario:

1. **Se justifica** en el CHANGELOG, en la sección "⚠️ Cambios incompatibles",
   diciendo qué se rompe y por qué no había alternativa.
2. **Se documenta la migración**, con los pasos concretos.
3. **Sube el MAJOR.**

Si hay forma de mantener las dos cosas andando por un tiempo, se hace eso en
vez de romper.

## Deprecaciones

El camino para sacar algo:

1. **Marcarlo.** Sigue funcionando, pero avisa que va a desaparecer y qué usar
   en su lugar. En el código va un `@deprecated`.
2. **Esperar al menos una MINOR.** Nada se marca y se saca en la misma versión.
3. **Sacarlo**, en la siguiente MAJOR.

Ejemplo vivo: el flag `--free` está deprecado en favor de `--lite`, y sigue
funcionando.

## Compatibilidad de la configuración

Una versión nueva de NEXUS **lee la configuración de las versiones anteriores**.
Los campos desconocidos se ignoran, no se borran.

Cuando un valor cambia de forma, se migra al leer, en silencio: `mode: "FREE"`
guardado por una versión vieja se lee hoy como `"LITE"`.

Un archivo de configuración corrupto **no impide arrancar**: NEXUS usa los
valores por defecto y `nexus doctor` te dice cuál es el archivo problemático.

Lo que **no** se garantiza es la compatibilidad hacia adelante: una versión
vieja frente a un `settings.json` escrito por una nueva puede ignorar campos
que no conoce.

## Entre releases

- Las versiones publicadas en npm **nunca se despublican ni se reescriben**. Un
  número de versión no se reutiliza jamás.
- Cada release lleva su tag de git (`v1.2.3`) y su GitHub Release con los
  binarios y sus SHA256.
- Los paquetes por plataforma y el principal siempre se publican en la misma
  versión, y el gate de release lo verifica antes de publicar nada.

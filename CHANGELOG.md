# Changelog

Todas las versiones publicadas de NEXUS, con lo que cambió en cada una.

El formato lo genera `bun scripts/release/prepare.ts` a partir de los mensajes
de commit ([Conventional Commits](https://www.conventionalcommits.org/es/)), así
que lo que aparece acá depende de cómo se escriban los commits. El versionado
sigue [SemVer](./docs/versioning.md).

La sección «No publicado» junta lo que ya está en `main` pero todavía no salió
en una versión. Al preparar una release, `prepare.ts` la reemplaza por la
entrada de la versión correspondiente.

## 1.1.0 — 2026-09-04

### Novedades

- **cli:** comando `nexus doctor`, que diagnostica la instalación (runtime,
  configuración, permisos, key, conectividad real con el proveedor) y termina
  con un resumen de checks OK / WARNING / ERROR
- **cli:** flag `--debug` para ver el detalle completo de un error (stack y
  mensaje crudo del proveedor). Sin ese flag, NEXUS ya no vuelca stack traces
- **cli:** mensajes de error diferenciados por causa — falta la key, la key fue
  rechazada, el modelo no existe, el proveedor está caído, timeout, sin
  conexión, sin permisos, respuesta inválida del modelo — cada uno con el paso
  concreto para resolverlo
- **evals:** suite de evaluaciones repetibles del agente (`bun run eval`), con
  15 escenarios, métricas por escenario y reporte JSON comparable entre
  versiones
- **ci:** job de lint, job de evals deterministas, workflow de release
  automatizado, Dependabot y CodeQL

### Correcciones

- **doctor:** la comprobación de conectividad usaba `/api/v1/models`, que es
  público y responde 200 aun con una key revocada. Ahora usa `/api/v1/key`, que
  falla exactamente cuando fallaría una consulta al modelo
- **security:** `sanitizeErrorMessage` no sanitizaba nada: devolvía el mensaje
  tal cual. Ahora redacta cualquier credencial antes de mostrarla
- **security:** el logger escribía `data` sin filtrar al archivo de log y a la
  telemetría. Ahora todo pasa por un redactor central
- **security:** `settings.json` (que guarda la API key en texto plano) se
  escribe con permisos 0600
- **cli:** un error 504 se clasificaba como problema de red por la palabra
  "timeout" del mensaje; ahora el código HTTP tiene prioridad sobre el texto

### Documentación

- README reescrito alrededor de BYOK en vez de "gratis"
- `docs/custom-agents.md`, `docs/versioning.md`, `docs/releasing.md`,
  `ROADMAP.md` y plantillas de issues

## 1.0.3 — 2026-08-25

Primera versión con los paquetes npm alineados y cumplimiento de Apache-2.0
(LICENSE + NOTICE en cada paquete publicado).

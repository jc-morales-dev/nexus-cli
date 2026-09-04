# NEXUS

**Status:** `active` — fork of [Codebuff](https://github.com/CodebuffAI/codebuff). Install/release notes: see [ORIGINAL_WORK.md](./ORIGINAL_WORK.md) and [NOTICE](./NOTICE).

## Releases / install

- GitHub Release: https://github.com/jc-morales-dev/nexus-cli/releases/tag/v1.1.0
- What this fork adds + install notes: [ORIGINAL_WORK.md](./ORIGINAL_WORK.md)
- Upstream attribution: [NOTICE](./NOTICE)


**El agente de terminal BYOK para desarrolladores que quieren controlar modelo,
costo y datos.**

Sin suscripción. Usá modelos gratuitos o de pago con tu propia API key.

NEXUS edita tu código a partir de instrucciones en lenguaje natural, desde la
terminal. La diferencia con otros agentes está en quién controla la inferencia:
vos ponés la key, vos elegís el modelo, y las peticiones van directo al
proveedor. No hay una cuenta de NEXUS, ni créditos, ni un backend nuestro en el
medio.

## Sobre este fork

NEXUS es un fork de [Codebuff](https://github.com/CodebuffAI/codebuff), que
aportó la arquitectura multi-agente, las herramientas de edición y la mayor
parte del historial que ves acá. La atribución vive en [NOTICE](./NOTICE).

Lo que agrega este fork:

- **BYOK con OpenRouter** — tu key, tus modelos, directo al proveedor.
- **Sin producto de pago en el medio** — se sacaron el backend, las cuentas, los
  créditos, la facturación y la app web.
- **Paquete de npm propio** — binarios autocontenidos para cinco plataformas.
- **CI abierto** — corre en Linux y Windows sin credenciales del producto
  comercial original.
- **En español** — la interfaz de terminal y la documentación.

Todo eso es comprobable commit a commit en
[ORIGINAL_WORK.md](./ORIGINAL_WORK.md), que acota el rango exacto donde empieza
el trabajo propio.

## Qué significa BYOK

BYOK es *bring your own key*: traé tu propia clave de API.

- **Ponés tu key.** NEXUS la guarda en tu carpeta de configuración, no la sube
  a ningún lado. Las peticiones salen de tu máquina directo a
  [OpenRouter](https://openrouter.ai).
- **Elegís el modelo.** Cualquiera del catálogo de OpenRouter, y lo cambiás
  cuando quieras con `/model`.
- **Ves el costo real.** Lo que gastás es lo que te cobra tu proveedor, al
  precio de tu proveedor. NEXUS no agrega margen porque no está en el medio.

Dicho al derecho y al revés, para que quede claro:

- NEXUS **no cobra suscripción**. Instalarlo y usarlo no tiene costo.
- NEXUS **no incluye el costo de las APIs de pago**. Si elegís un modelo que
  cobra, eso lo pagás vos a OpenRouter.
- Si tu proveedor ofrece **modelos gratuitos**, podés usarlos y no pagar nada
  por la inferencia. Suelen tener límites de velocidad más bajos.
- **No necesitás cuenta de NEXUS** porque no existe tal cosa.

## Para quién es

Desarrolladores hispanohablantes que trabajan en la terminal y quieren decidir
qué modelo corre su código, cuánto gastan, y a dónde van sus datos. Toda la
interfaz está en español.

## Instalación

```bash
npm install -g @jc-morales-dev/nexus-cli
```

Trae un binario autocontenido: no necesitás instalar Node ni Bun aparte.

> Si tenías instalado `@victor00128/nexus-cli`, ese paquete ya no está en npm y
> no recibe actualizaciones. Desinstalalo (`npm uninstall -g
> @victor00128/nexus-cli`) e instalá el de arriba.

## Primeros pasos

```bash
nexus
```

1. La primera vez, escribí `/key` y pegá tu API key de OpenRouter
   (se saca gratis en https://openrouter.ai/keys).
2. Elegí un modelo con `/model`.
3. Contale a NEXUS qué querés hacer.

Ejemplos:

- "Arreglá la inyección SQL en el registro de usuarios"
- "Agregá rate limiting a todos los endpoints"
- "Refactorizá el código de conexión a la base de datos"

Si algo no arranca, `nexus doctor` te dice qué falta.

### Sobre el modelo por defecto

El default es MiniMax M3: tiene un nivel gratuito, buen rendimiento para tareas
de agente y hasta 1M de contexto. OpenRouter limita la cantidad de solicitudes
gratuitas por día; si llegás al límite o querés más potencia, cambialo cuando
quieras con `/model`. DeepSeek V3.2 es una alternativa económica y GLM 5.3 Flash
ofrece hasta 1.3M de contexto por un costo bajo.

## Proveedores y modelos

Hoy NEXUS habla con **OpenRouter**, y solo con OpenRouter. Es una sola
integración, pero da acceso a cientos de modelos de decenas de proveedores
(Anthropic, OpenAI, DeepSeek, Google, Qwen, Meta y demás) con una única key.

NEXUS usa dos modelos a la vez para gastar menos:

| Tier | Para qué | Cómo se configura |
|---|---|---|
| STRONG | Razonar y editar código | `/model`, o `NEXUS_MODEL_STRONG` |
| CHEAP | Tareas utilitarias (buscar archivos, podar contexto) | `NEXUS_MODEL_CHEAP` |

Con `NEXUS_MODEL` forzás un único modelo para todo e ignorás los tiers.

## Comandos

| Comando | Qué hace |
|---|---|
| `/key` | Pegar, ver o borrar tu API key de OpenRouter |
| `/model` | Elegir el modelo |
| `/undo` | Revertir las ediciones del último turno |
| `/bg` | Listar o matar procesos en segundo plano |
| `/init` | Preparar la estructura de agentes personalizados |
| `/help` | Ayuda y atajos de teclado |

Desde la shell:

| Comando | Qué hace |
|---|---|
| `nexus` | Abrir la interfaz |
| `nexus doctor` | Diagnosticar la instalación y reportar problemas |
| `nexus --debug` | Mostrar el detalle completo de los errores |
| `nexus publish` | Publicar agentes en el registro |

## Qué hace NEXUS

- 🔑 **BYOK** — tu key vive en tu máquina; las peticiones no pasan por ningún
  servidor nuestro.
- 🧠 **Cualquier modelo de OpenRouter** — gratuito o de pago, cambiable en
  cualquier momento.
- 🔁 **Multi-agente** — agentes especializados exploran, planifican, editan y
  revisan, en vez de un solo modelo haciendo todo.
- 🪝 **Hooks deterministas** — formateo, lint o typecheck automáticos
  (`.nexus/hooks.json`).
- ⏪ **Undo** — revertir ediciones sin depender de git.
- 🌐 **Búsqueda web incorporada** — sin API key aparte.
- 🛡️ **Permisos** — reglas que bloquean comandos peligrosos antes de ejecutarlos
  (`.nexus/permissions.json`).
- 🔌 **MCP** — conectar herramientas externas.
- 🩺 **`nexus doctor`** — diagnóstico de la instalación en un comando.

## Configuración

Por proyecto, en un directorio `.nexus/`:

- `.nexus/hooks.json` — comandos a correr después de editar (PostToolUse) o
  antes de terminar (Stop).
- `.nexus/permissions.json` — reglas allow/deny para comandos de terminal.
- `.nexusignore` — archivos que NEXUS debe ignorar.

Tu key y el modelo elegido se guardan en tu carpeta de usuario
(`~/.config/nexus/settings.json`), con permisos de solo-tu-usuario.

## Agentes personalizados

Podés definir tus propios agentes en `.agents/`, con control total sobre sus
herramientas, prompts y comportamiento paso a paso. Corré `/init` dentro de
NEXUS para generar la estructura, y mirá
[docs/custom-agents.md](./docs/custom-agents.md) para la guía completa.

## Documentación

- [CONTRIBUTING.md](./CONTRIBUTING.md) — cómo trabajar en NEXUS
- [ROADMAP.md](./ROADMAP.md) — qué viene
- [CHANGELOG.md](./CHANGELOG.md) — qué cambió en cada versión
- [docs/custom-agents.md](./docs/custom-agents.md) — crear agentes propios
- [docs/versioning.md](./docs/versioning.md) — SemVer, versiones de Node,
  cambios incompatibles
- [docs/releasing.md](./docs/releasing.md) — cómo se publica una versión
- [SECURITY.md](./SECURITY.md) — reportar vulnerabilidades
- [WINDOWS.md](./WINDOWS.md) — particularidades de Windows

## Trabajar en NEXUS

Hay dos cosas distintas, y conviene no mezclarlas:

| | Comando | Qué corre |
|---|---|---|
| **Instalado** | `nexus` | El binario publicado en npm. Lo que reciben los usuarios. |
| **Desarrollo** | `bun dev` | El código fuente vivo de este repo, sin recompilar. |

```bash
git clone https://github.com/jc-morales-dev/nexus-cli.git
cd nexus-cli
bun install
bun dev
```

Los detalles (tests, evals, lint, convenciones) están en
[CONTRIBUTING.md](./CONTRIBUTING.md).

## Licencia

NEXUS se publica bajo la [Apache License 2.0](./LICENSE). Es un fork de
[Codebuff](https://github.com/CodebuffAI/codebuff); ver [NOTICE](./NOTICE) para
la atribución.


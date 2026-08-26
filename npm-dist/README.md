<div align="center">

# NEXUS

**Un CLI de coding con IA — gratis y sin cuenta.**

Traé tu propia API key de [OpenRouter](https://openrouter.ai/keys) (modelos gratis o de pago) y programá desde la terminal con cualquier modelo. Como Claude Code, pero gratis y con tu key.

[![npm](https://img.shields.io/npm/v/@victor00128/nexus-cli?color=cb3837&logo=npm)](https://www.npmjs.com/package/@victor00128/nexus-cli)
[![license](https://img.shields.io/badge/license-Apache--2.0-blue)](https://www.apache.org/licenses/LICENSE-2.0)
![platforms](https://img.shields.io/badge/plataformas-Windows%20%C2%B7%20macOS%20%C2%B7%20Linux-informational)

</div>

---

## Instalar

```bash
npm install -g @victor00128/nexus-cli
```

> Trae un binario autocontenido: **no necesitás instalar Node ni Bun aparte**.
> npm baja automáticamente solo el binario de tu plataforma.

**Plataformas soportadas:** Windows (x64) · macOS (Intel y Apple Silicon) · Linux (x64 y ARM64).

## Empezar

```bash
nexus
```

1. La primera vez, escribí **`/key`** y pegá tu API key de OpenRouter
   (conseguí una gratis en <https://openrouter.ai/keys>).
2. Elegí el modelo con **`/model`**. Por defecto viene **Ox Alpha**: nivel
   frontera, 1M de contexto y hoy sale $0. Ojo, es un modelo *stealth* — el
   proveedor es anónimo, registra los prompts (o sea, tu código) para evaluarlo
   y puede desaparecer sin aviso. Si preferís algo estable y sin registro,
   `/model deepseek/deepseek-v3.2` es barato y razona muy bien.
3. Escribí lo que querés hacer en lenguaje natural. NEXUS explora el repo, edita
   archivos y te muestra los cambios para que los apruebes.

Tu key queda **solo en tu PC** (`~/.config/nexus`). NEXUS no tiene servidor ni cuenta: hablás directo con OpenRouter con tu propia key.

## Comandos útiles

| Comando | Qué hace |
|---|---|
| `/key` | Pegá, mirá o borrá tu API key de OpenRouter |
| `/model` | Elegí el modelo de IA |
| `/undo` | Revertí las ediciones del último turno del agente |
| `/bg` | Ver y administrar procesos en background |
| `/help` | Ayuda y atajos de teclado |

## Qué trae

- 🆓 **Gratis y sin cuenta** — tu key vive solo en tu máquina.
- 🧠 **Cualquier modelo de OpenRouter**, gratis o de pago (DeepSeek, Llama, Qwen, GPT, Claude…).
- 🔁 **Multi-agente** — explora, edita y revisa el código en pasos.
- ✅ **Chequeo de errores incorporado** — corre el compilador/typechecker sobre lo que edita (TypeScript/JavaScript nativo; Python, Go y Rust con tu toolchain) y corrige antes de terminar.
- 🪝 **Hooks deterministas**, 🌐 **búsqueda web sin key**, ⏪ **undo**, 🛡️ **permisos y sandbox** para las acciones sensibles.

## Requisitos

- Una API key de OpenRouter (el registro y muchos modelos son gratis).
- Nada más: el binario incluye todo lo necesario para correr.

## Licencia

Apache-2.0. NEXUS deriva de un proyecto open-source bajo la misma licencia; ver `NOTICE`.

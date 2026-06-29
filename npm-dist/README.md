# NEXUS

Un CLI de coding con IA, **gratis** y **sin cuenta**. Traé tu propia API key de
OpenRouter (modelos gratis o de pago) y usá cualquier modelo para programar desde
la terminal — como Claude Code, pero gratis y con tu key.

## Instalar

```bash
npm install -g nexus-ai-cli
```

> Trae un binario autocontenido (no necesitás instalar Node ni Bun aparte).
> Esta versión incluye el binario de **Windows x64**.

## Usar

```bash
nexus
```

1. La primera vez, escribí `/key` y pegá tu API key de OpenRouter
   (conseguí una gratis en https://openrouter.ai/keys).
2. Elegí el modelo con `/model` (DeepSeek por defecto: razonamiento fuerte y barato).
3. ¡A codear!

## Comandos útiles

| Comando | Qué hace |
|---|---|
| `/key` | Pegá / mirá / borrá tu API key de OpenRouter |
| `/model` | Elegí el modelo de IA |
| `/undo` | Revertí las ediciones del último turno del agente |
| `/bg` | Ver / matar procesos en background |
| `/help` | Ayuda y atajos |

## Características

- 🆓 Gratis y sin cuenta — tu key queda solo en tu PC.
- 🧠 Cualquier modelo de OpenRouter (gratis o de pago).
- 🔁 Multi-agente: explora, edita y revisa el código.
- 🪝 Hooks deterministas, 🌐 búsqueda web sin key, ⏪ undo, 🛡️ permisos de seguridad.

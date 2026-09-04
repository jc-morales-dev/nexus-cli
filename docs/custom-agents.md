# Crear agentes personalizados

NEXUS no es un modelo con un prompt: es un conjunto de agentes que se llaman
entre sí. Podés agregar los tuyos, con sus propias herramientas, su propio
modelo y su propia lógica paso a paso.

Un agente personalizado es **un archivo TypeScript que exporta un objeto**. No
hay que compilar nada ni registrar nada: NEXUS lee el directorio al arrancar.

## Dónde viven

NEXUS busca agentes en tres lugares, en este orden:

```
{directorio actual}/.agents/
{directorio actual}/../.agents/
{tu carpeta de usuario}/.agents/
```

Los del proyecto ganan sobre los de tu carpeta de usuario, así que un equipo
puede versionar sus agentes en el repo y vos podés tener los tuyos para todo.

Para generar la estructura:

```bash
nexus
> /init
```

Eso crea `.agents/` con los tipos (`types/agent-definition.ts`) y un
`tsconfig.json`, para que tu editor te autocomplete todo.

## El ejemplo mínimo

`.agents/changelog-writer.ts`:

```typescript
import type { AgentDefinition } from './types/agent-definition'

const definition: AgentDefinition = {
  id: 'changelog-writer',
  displayName: 'Escritor de changelog',
  model: 'deepseek/deepseek-v3.2',

  // Sin toolNames el agente solo puede hablar. Con estas dos puede leer el
  // repo y terminar su turno.
  toolNames: ['read_files', 'code_search', 'end_turn'],

  spawnerPrompt:
    'Redacta una entrada de changelog a partir de los cambios recientes. ' +
    'Usalo cuando haya que documentar qué cambió, no para escribir código.',

  systemPrompt:
    'Sos un redactor técnico. Escribís entradas de changelog en español ' +
    'rioplatense, concretas y sin marketing.',

  instructionsPrompt:
    'Leé los archivos que te indiquen y escribí la entrada de changelog. ' +
    'Agrupá por tipo de cambio. No inventes cambios que no veas en el código.',
}

export default definition
```

Con eso ya podés correrlo:

```bash
nexus --agent changelog-writer "resumí los cambios en cli/src/utils/"
```

O dejar que otro agente lo invoque, si lo listás en su `spawnableAgents`.

## El contrato

El tipo completo está en `.agents/types/agent-definition.ts`. Los campos que
importan:

### Obligatorios

| Campo | Tipo | Qué es |
|---|---|---|
| `id` | `string` | Identificador único. Solo minúsculas, números y guiones. |
| `displayName` | `string` | Cómo se muestra en la interfaz. |
| `model` | `string` | Cualquier id de [OpenRouter](https://openrouter.ai/models), con formato `autor/modelo`. |

### Herramientas y capacidades

| Campo | Qué hace |
|---|---|
| `toolNames` | Las herramientas que puede usar. **Sin esto no puede hacer nada más que responder texto.** |
| `spawnableAgents` | Los agentes que puede invocar, por id. |
| `mcpServers` | Servidores MCP que se le exponen como herramientas. |

Herramientas disponibles: `read_files`, `write_file`, `str_replace`,
`apply_patch`, `code_search`, `find_files`, `glob`, `list_directory`,
`read_url`, `web_search`, `run_terminal_command`, `spawn_agents`,
`create_plan`, `add_subgoal`, `ask_user`, `set_output`, `end_turn`,
`task_completed`, `skill`, y algunas más. La lista viva está en
`common/src/tools/constants.ts`.

Dale lo mínimo que necesite. Un agente de revisión que solo lee no debería
tener `write_file`, y uno que no ejecuta comandos no debería tener
`run_terminal_command`.

### Prompts

Son tres, y hacen cosas distintas:

| Campo | Cuándo se usa |
|---|---|
| `systemPrompt` | Quién es el agente. Va como mensaje de sistema. |
| `instructionsPrompt` | Qué tiene que hacer en este turno. Va después del pedido del usuario. |
| `stepPrompt` | Se repite en cada paso. Sirve para recordarle una regla que tiende a olvidar. |
| `spawnerPrompt` | Se lo muestra a *otros* agentes para que sepan cuándo invocarlo. |

`inheritParentSystemPrompt: true` hace que además reciba el system prompt del
agente que lo invocó, útil para subagentes que deben respetar el mismo
contexto.

### Entrada y salida

```typescript
{
  inputSchema: {
    prompt: { type: 'string', description: 'El archivo a revisar' },
    params: {
      type: 'object',
      properties: { severity: { type: 'string' } },
    },
  },
  outputMode: 'structured_output',
  outputSchema: {
    type: 'object',
    properties: {
      findings: { type: 'array', items: { type: 'string' } },
    },
  },
}
```

`outputMode` puede ser:

- `last_message` (por defecto) — devuelve su último mensaje.
- `all_messages` — devuelve toda la conversación.
- `structured_output` — devuelve el objeto que el agente arme con `set_output`,
  validado contra `outputSchema`. Es el que querés si otro agente va a consumir
  el resultado por código.

### Modelo y proveedor

```typescript
{
  model: 'anthropic/claude-opus-4.7',
  reasoningOptions: { enabled: true, effort: 'high' },
  providerOptions: { order: ['anthropic'], allow_fallbacks: false },
}
```

`reasoningOptions` solo aplica a modelos que soportan tokens de razonamiento.
`providerOptions` es el
[routing de OpenRouter](https://openrouter.ai/docs/features/provider-routing):
sirve para forzar un proveedor concreto cuando te importa la latencia o la
política de retención de datos.

Ojo: si tenés `NEXUS_MODEL` seteado, **ese modelo pisa el de todos los
agentes**. Y sin `NEXUS_MODEL`, el mapa de tiers STRONG/CHEAP puede redirigir
el modelo que pusiste acá. Es a propósito — así el usuario controla el gasto —
pero explica por qué a veces no corre el modelo que declaraste.

## Control paso a paso con `handleSteps`

Para lógica determinista, `handleSteps` es un generador que intercala pasos
tuyos con pasos del modelo:

```typescript
const definition: AgentDefinition = {
  id: 'test-runner',
  displayName: 'Corredor de tests',
  model: 'deepseek/deepseek-v3.2',
  toolNames: ['run_terminal_command', 'read_files', 'end_turn'],

  handleSteps: function* ({ prompt, logger }) {
    // 1. Un paso nuestro: correr los tests, siempre, sin pedirle permiso
    //    al modelo ni depender de que se le ocurra.
    const { toolResult } = yield {
      toolName: 'run_terminal_command',
      input: { command: 'bun test', timeout_seconds: 300 },
    }

    logger.info('Tests terminados')

    // 2. Un paso del modelo, que ya tiene el resultado en su contexto.
    yield 'STEP'

    // 3. Y otro nuestro, condicional.
    const output = JSON.stringify(toolResult)
    if (output.includes('fail')) {
      yield {
        toolName: 'read_files',
        input: { paths: ['package.json'] },
      }
      yield 'STEP_ALL'
    }
  },
}
```

Qué podés emitir:

- `{ toolName, input }` — ejecuta una herramienta directamente. Devuelve
  `{ toolResult }`.
- `'STEP'` — le deja un paso al modelo.
- `'STEP_ALL'` — le deja pasos al modelo hasta que termine solo.

Usalo cuando el orden importa de verdad: correr los tests *antes* de opinar,
levantar un servidor antes de probarlo, validar antes de escribir. Para todo lo
demás, los prompts alcanzan y son más fáciles de mantener.

Una advertencia del código real: `handleSteps` se serializa con `.toString()`,
así que **no puede referirse a variables de fuera de la función**. Las
constantes van adentro. Si ves un agente fallar con "variable no definida" en
un paso, es esto.

## Probarlo

```bash
# Directo
nexus --agent changelog-writer "tu pedido"

# Ver que NEXUS lo encontró
nexus doctor
```

Si el agente no aparece, lo más común es:

- El `id` no coincide con lo que pasaste en `--agent`.
- El archivo no exporta por defecto (`export default definition`).
- Está en un `.agents/` que no es ninguno de los tres que NEXUS mira.

Con `nexus --debug` vas a ver el error de validación completo.

## Publicarlo

```bash
nexus publish tu-agente-id
```

Necesita un campo `publisher` en la definición. La versión sube sola en cada
publicación si no la fijás vos.

## De dónde copiar

Los agentes que trae NEXUS están en `agents/` del repo y son ejemplos reales:

- `agents/base2.ts` — el agente principal, el más completo.
- `agents/reviewer/` — revisión de código, con salida estructurada.
- `agents/file-explorer/` — exploración de archivos, con modelo barato a
  propósito.
- `agents/researcher/researcher-web.ts` — investigación web, ejemplo corto y
  legible.
- `.agents/nexus-local-cli.ts` — un `handleSteps` real, con tmux.

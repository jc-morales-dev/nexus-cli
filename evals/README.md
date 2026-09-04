# Evaluaciones de NEXUS

Los tests dicen si una función devuelve lo que tiene que devolver. Las evals
dicen si **el agente se comportó bien** en una tarea cuya respuesta correcta
tiene muchas formas posibles.

Por eso ninguna aserción de acá compara texto exacto contra la salida del
modelo. Se mide el resultado observable: ¿pasan ahora los tests del proyecto de
prueba?, ¿tocó archivos fuera del alcance pedido?, ¿nombró la vulnerabilidad?,
¿se le escapó algo con forma de credencial?

## Correrlas

```bash
bun run eval:offline    # 5 escenarios deterministas, sin costo
bun run eval            # los 16 (11 necesitan un modelo real)
```

Con filtros:

```bash
bun --filter=@nexus/evals run eval -- --scenario fix-bug
bun --filter=@nexus/evals run eval -- --tag security
bun --filter=@nexus/evals run eval -- --json reporte.json
```

Sin `OPENROUTER_API_KEY` los escenarios agénticos se reportan como `skipped` en
vez de fallar, así que `bun run eval` sirve igual en un clone recién hecho y en
CI.

## Los dos tipos de escenario

**`offline`** — ejercitan a NEXUS sin modelo: cómo clasifica una respuesta
malformada, si las reglas de permisos frenan un comando destructivo, si el
redactor aguanta. Son deterministas, cuestan cero y **corren en CI en cada
push**. Son la parte de la suite que realmente frena regresiones.

**`agent`** — necesitan un modelo real, corriendo contra un proyecto de prueba
temporal fuera del repo. Miden capacidad, y por eso su resultado depende del
modelo que tengas configurado. Sirven para comparar versiones de NEXUS, o el
mismo NEXUS con distintos modelos.

## Los 16 escenarios

| id | Qué mide | Tipo |
|---|---|---|
| `recover-invalid-model-response` | Clasificar y recuperarse de una respuesta inválida | offline |
| `handle-tool-errors` | Traducir errores del sistema a mensajes accionables | offline |
| `handle-incomplete-response` | Reconocer una respuesta cortada como reintentable | offline |
| `refuse-dangerous-command` | Bloquear comandos destructivos antes de ejecutarlos | offline |
| `avoid-secret-exposure` | Que ninguna superficie de salida deje pasar una key | offline |
| `fix-bug` | Corregir un bug existente sin romper lo demás | agent |
| `add-feature` | Agregar una funcionalidad chica respetando el estilo | agent |
| `add-feature-with-tests` | Agregar funcionalidad **y** sus tests | agent |
| `find-vulnerability` | Encontrar y arreglar una inyección SQL | agent |
| `multi-file-change` | Renombrar una API a través de varios archivos | agent |
| `respect-repo-instructions` | Respetar las convenciones de `AGENTS.md` | agent |
| `stay-in-scope` | No tocar archivos fuera de lo pedido | agent |
| `detect-failing-test` | Identificar qué test falla y por qué | agent |
| `fix-without-breaking` | Arreglar un caso nuevo sin romper los cubiertos | agent |
| `cross-file-consistency` | Mantener código, tipos y docs consistentes | agent |
| `never-writes-secrets` | No escribir credenciales en el código | agent |

## Qué reporta

Por escenario:

- **Estado**: `passed`, `partial`, `failed`, `error` o `skipped`.
- **Duración** en milisegundos.
- **Intentos** — cuántas veces hubo que reintentar por fallos transitorios del
  proveedor. Un número alto separa "el proveedor está inestable" de "el
  escenario está roto".
- **Uso de herramientas** — qué herramientas llamó y cuántas veces.
- **Razón del fallo** — qué aserción no se cumplió y por qué.

`--json` escribe todo eso a un archivo, para comparar dos versiones de NEXUS
sobre los mismos escenarios.

### `partial` vs `failed`

Cada aserción es `required` u opcional.

- Falla una **required** → el escenario es `failed`.
- Fallan solo **opcionales** → es `partial`.

Es la forma de puntuar cosas como "¿además escribió un test?" sin que una
solución buena pero distinta tire abajo la suite. Solo `failed` y `error` hacen
salir con código distinto de cero.

## Agregar un escenario

Los escenarios agénticos van en `scenarios/coding.ts`, los deterministas en
`scenarios/resilience.ts`.

```typescript
export const miEscenario: Scenario = {
  id: 'mi-escenario',
  title: 'Qué capacidad mide, en una línea',
  kind: 'agent',
  tags: ['bugfix'],

  // El proyecto de prueba, como mapa de ruta → contenido. Sin dependencias:
  // una eval que necesita `npm install` es una eval que falla por motivos que
  // no tienen nada que ver con el agente.
  fixture: {
    'algo.js': '...',
    'run-tests.js': '...',
  },

  prompt: 'Lo que escribiría el usuario',

  assertions: [
    projectTestsPass('node', ['run-tests.js']),
    onlyTouches(['algo.js']),
    fileMatches('algo.js', [/patrón/], { required: false }),
  ],
}
```

Y sumalo al array que exporta el archivo.

Aserciones disponibles en `assertions.ts`: `fileMatches`, `fileDoesNotMatch`,
`fileExists`, `onlyTouches`, `projectTestsPass`, `projectTestsFail`,
`transcriptMatches`, `transcriptDoesNotMatch`, `usedTool`, `didNotUseTool`,
`noSecretsLeaked`, y `custom` para lo que no encaje.

### La regla que importa

**Nunca compares la salida exacta del modelo.** `transcriptMatches` toma
expresiones regulares justamente para eso: aceptá cualquier redacción que
demuestre que el agente entendió. Si tu aserción falla porque el agente dijo
"inyección SQL" en vez de "SQL injection", la aserción está mal, no el agente.

Preferí, en este orden:

1. **¿Pasan los tests del proyecto de prueba?** Es la señal menos manipulable.
2. **¿Qué archivos cambiaron?** Objetivo y fácil de verificar.
3. **¿El contenido matchea un patrón amplio?** Aceptable.
4. **¿El transcript dice algo?** Solo cuando la tarea es explicar, no hacer.

## Cómo está armado

- `types.ts` — `Scenario`, `Assertion`, `EvalResult`, `EvalReport`
- `runner.ts` — prepara el workspace, ejecuta y puntúa. El driver del agente
  está **inyectado**, que es lo que permite testear el runner con un agente
  falso: un harness que solo se puede verificar gastando plata es un harness
  que nadie verifica.
- `driver.ts` — el driver real, sobre el SDK de NEXUS
- `workspace.ts` — directorios temporales y diff contra la fixture
- `assertions.ts` — las aserciones reutilizables
- `scenarios/` — los escenarios
- `__tests__/runner.test.ts` — 20 tests del harness mismo

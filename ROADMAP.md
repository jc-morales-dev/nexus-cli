# Roadmap

Hacia dónde va NEXUS. Sin fechas: esto lo mantiene una persona, y una fecha
inventada no le sirve a nadie. El orden dentro de cada bloque sí indica
prioridad.

Si algo de acá te interesa o te falta, abrí un
[issue](https://github.com/jc-morales-dev/nexus-cli/issues) — lo que la gente pide
mueve las cosas de "más adelante" a "ahora".

## Ahora

Lo que se está trabajando o es lo siguiente en la fila.

- **Evals con modelo real en CI.** Los 5 escenarios deterministas ya corren en
  cada push. Los 11 que necesitan un modelo corren solo a mano; falta decidir
  cómo pagarlos y cada cuánto (¿nightly? ¿solo antes de una release?).
- **Reducir el ruido de lint.** Quedan ~360 warnings heredados del fork,
  mayormente de orden de imports. Se van arreglando por archivo tocado, pero
  vale la pena una pasada por paquete.
- **Cerrar los advisories abiertos.** Queda uno crítico (`shell-quote`,
  transitivo de `@opentui`) sin fix disponible en la versión pinneada. Hay que
  seguir las releases de OpenTUI.
- **Terminar de sacar los restos del backend.** Quedan rutas que asumen una
  cuenta y un servidor que no existen (el flujo de login, `usage`,
  `subscription`). Funcionan porque nunca se ejecutan en modo BYOK, pero
  confunden a quien lee el código.

## Después

Cosas decididas, todavía sin empezar.

- **Un segundo proveedor.** Hoy la única integración es OpenRouter. La
  arquitectura ya separa "qué modelo" de "cómo se llama al proveedor", así que
  agregar Anthropic u OpenAI directo es sobre todo trabajo de configuración y
  de mensajes de error. Sirve a quien ya tiene una key de un proveedor y no
  quiere abrir cuenta en otro.
- **Reporte de costo por sesión.** Los tiers STRONG/CHEAP existen justamente
  para gastar menos, pero hoy no se ve cuánto se gastó. OpenRouter devuelve el
  costo en cada respuesta; falta acumularlo y mostrarlo.
- **`nexus doctor --fix`.** Varios de los checks saben exactamente qué hay que
  hacer (crear el directorio de config, corregir permisos, agregar `.env` al
  `.gitignore`). Podrían hacerlo con confirmación.
- **Más escenarios de eval.** Sobre todo de resiliencia: cortes a mitad de
  stream, herramientas que cuelgan, respuestas que violan el esquema.
- **Documentar el protocolo de herramientas.** Quien quiera agregar una
  herramienta propia hoy tiene que leer el código de `sdk/src/tools/`.

## Ideas

Sin compromiso. Acá está lo que parece buena idea y todavía no se pensó en
serio.

- Modo no interactivo (`nexus -p "…"`) que devuelva por stdout, para usar NEXUS
  dentro de scripts y en CI.
- Perfiles de configuración por proyecto (modelo y permisos distintos según
  dónde estés parado).
- Un catálogo de agentes de la comunidad, ahora que `/init` y `publish` ya
  existen.
- Soporte para gateways compatibles con OpenAI que no sean OpenRouter
  (LiteLLM, vLLM, Ollama), útil para quien corre modelos locales.
- Traducción de la interfaz al inglés. Hoy todo está en español a propósito,
  porque es el público al que apunta; ampliar es una decisión de producto, no
  solo de strings.

## Explícitamente fuera de alcance

Para que no haya dudas:

- **Una cuenta de NEXUS, créditos o suscripción.** BYOK no es una etapa
  intermedia hacia un producto de pago; es la propuesta.
- **Un backend propio que intermedie la inferencia.** Si tus prompts pasan por
  un servidor nuestro, se acabó el control sobre tus datos.
- **Telemetría que mande tu código a algún lado.** Los binarios publicados
  salen con analítica desactivada.

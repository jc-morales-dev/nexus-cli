import { CHATGPT_OAUTH_ENABLED } from '@nexus/common/constants/chatgpt-oauth'
import { isByokDirectMode } from '@nexus/common/constants/byok'
import { AGENT_MODES, IS_FREETIER } from '../utils/constants'
import { getChatGptOAuthStatus } from '../utils/chatgpt-oauth'

import type { SkillsMap } from '@nexus/common/types/skill'


export interface SlashCommand {
  id: string
  label: string
  description: string
  aliases?: string[]
  /**
   * If true, this command can be invoked without a leading slash when the
   * input matches the command id exactly (no arguments).
   */
  implicitCommand?: boolean
  /**
   * If set, selecting this command inserts this text into the input field
   * instead of executing a command. Useful for agent shortcuts.
   */
  insertText?: string
}

// Generate mode commands from the AGENT_MODES constant (excluded in FreeTier)
const MODE_COMMANDS: SlashCommand[] = IS_FREETIER
  ? []
  : AGENT_MODES.map((mode) => ({
      id: `mode:${mode.toLowerCase()}`,
      label: `mode:${mode.toLowerCase()}`,
      description: `Cambiar al modo ${mode}`,
      aliases: [`model:${mode.toLowerCase()}`],
    }))

const FREETIER_REMOVED_COMMAND_IDS = new Set([
  'ads:enable',
  'ads:disable',
  'usage',
  'subscribe',
  'agent:gpt-5',
  'image',
  'publish',
  'init',
])

const FREETIER_ONLY_COMMAND_IDS = new Set([
  'connect',
  'plan',
  'end-session',
])

// Commands that only make sense with a Nexus account/backend. Hidden in BYOK
// direct mode (the free, account-less setup) so the slash menu stays clean.
const BYOK_HIDDEN_COMMAND_IDS = new Set([
  'usage',
  'subscribe',
  'ads:enable',
  'ads:disable',
  'feedback',
  'agent:gpt-5',
  'logout',
])

const ALL_SLASH_COMMANDS: SlashCommand[] = [
  {
    id: 'help',
    label: 'help',
    description: 'Ver atajos de teclado y consejos',
    aliases: ['h', '?'],
    implicitCommand: true,
  },
  {
    id: 'key',
    label: 'key',
    description: 'Pegá, mirá o borrá tu API key de OpenRouter',
    aliases: ['apikey', 'openrouter'],
  },
  {
    id: 'model',
    label: 'model',
    description: 'Elegí el modelo de IA (razonamiento)',
    aliases: ['models', 'modelo'],
  },
  ...(CHATGPT_OAUTH_ENABLED
    ? [
        {
          id: 'connect',
          label: 'connect',
          description: 'Conectar tu cuenta de ChatGPT',
          aliases: ['connect:chatgpt', 'chatgpt'],
        },
      ]
    : []),

  {
    id: 'ads:enable',
    label: 'ads:enable',
    description: 'Activar los anuncios contextuales',
  },
  {
    id: 'ads:disable',
    label: 'ads:disable',
    description: 'Desactivar los anuncios contextuales',
  },
  {
    id: 'init',
    label: 'init',
    description: 'Crear un archivo knowledge.md inicial',
    implicitCommand: true,
  },
  {
    id: 'undo',
    label: 'undo',
    description: 'Revertir las ediciones del último turno del agente',
    aliases: ['revert'],
  },
  {
    id: 'bg',
    label: 'bg',
    description: 'Ver / matar procesos en background (/bg kill <id>)',
    aliases: ['jobs', 'processes'],
  },
  {
    id: 'usage',
    label: 'usage',
    description: 'Ver créditos y cuota de suscripción',
    aliases: ['credits'],
  },
  {
    id: 'subscribe',
    label: 'subscribe',
    description: 'Suscribirte para tener más uso',
    aliases: ['strong', 'sub', 'buy-credits'],
  },
  {
    id: 'interview',
    label: 'interview',
    description: 'La IA te hace preguntas para convertir tu pedido en una spec',
  },
  {
    id: 'plan',
    label: 'plan',
    description: 'Crear un plan de trabajo',
  },
  {
    id: 'review',
    label: 'review',
    description: 'Revisar los cambios de código',
  },
  {
    id: 'new',
    label: 'new',
    description: 'Borrar el historial y empezar una conversación nueva',
    aliases: ['n', 'clear', 'c', 'reset'],
    implicitCommand: true,
  },
  {
    id: 'history',
    label: 'history',
    description: 'Ver y retomar conversaciones anteriores',
    aliases: ['chats'],
  },
  {
    id: 'agent:gpt-5',
    label: 'agent:gpt-5',
    description: 'Lanzar el agente GPT-5 para problemas complejos',
    insertText: '@GPT-5 Agent ',
  },
  // {
  //   id: 'agent:opus',
  //   label: 'agent:opus',
  //   description: 'Spawn the Opus agent to help solve any problem',
  //   insertText: '@Opus Agent ',
  // },
  {
    id: 'feedback',
    label: 'feedback',
    description: IS_FREETIER
      ? 'Dejar comentarios sobre FreeTier'
      : 'Dejar comentarios sobre NEXUS',
  },
  {
    id: 'bash',
    label: 'bash',
    description: 'Entrar en modo bash (también con "!" al principio)',
    aliases: ['!'],
  },
  {
    id: 'image',
    label: 'image',
    description: 'Adjuntar una imagen (o Ctrl+V para pegar del portapapeles)',
    aliases: ['img', 'attach'],
  },
  ...MODE_COMMANDS,
  // {
  //   id: 'publish',
  //   label: 'publish',
  //   description: 'Publish agents to the agent store',
  // },
  {
    id: 'theme:toggle',
    label: 'theme:toggle',
    description: 'Alternar entre tema claro y oscuro',
  },
  {
    id: 'end-session',
    label: 'end-session',
    description: 'Terminar tu sesión gratuita (te deja cambiar de modelo)',
    aliases: ['model'],
  },
  {
    id: 'logout',
    label: 'logout',
    description: 'Cerrar sesión',
    aliases: ['signout'],
    implicitCommand: true,
  },
  {
    id: 'exit',
    label: 'exit',
    description: 'Salir del CLI',
    aliases: ['quit', 'q'],
    implicitCommand: true,
  },
]

export const SLASH_COMMANDS = (
  IS_FREETIER
    ? ALL_SLASH_COMMANDS.filter(
        (cmd) => !FREETIER_REMOVED_COMMAND_IDS.has(cmd.id),
      )
    : ALL_SLASH_COMMANDS.filter(
        (cmd) => !FREETIER_ONLY_COMMAND_IDS.has(cmd.id),
      )
).filter((cmd) => !(isByokDirectMode() && BYOK_HIDDEN_COMMAND_IDS.has(cmd.id)))

export const SLASHLESS_COMMAND_IDS = new Set(
  SLASH_COMMANDS.filter((cmd) => cmd.implicitCommand).map((cmd) =>
    cmd.id.toLowerCase(),
  ),
)

/** Maximum description length for skill commands in the slash menu */
const SKILL_MENU_DESCRIPTION_MAX_LENGTH = 50

function truncateDescription(description: string): string {
  if (description.length <= SKILL_MENU_DESCRIPTION_MAX_LENGTH) {
    return description
  }
  return description.slice(0, SKILL_MENU_DESCRIPTION_MAX_LENGTH - 1) + '…'
}

/**
 * Returns SLASH_COMMANDS merged with skill commands.
 * Skills become slash commands that users can invoke directly.
 */
export function getSlashCommandsWithSkills(skills: SkillsMap): SlashCommand[] {
  const skillCommands: SlashCommand[] = Object.values(skills).map((skill) => ({
    id: `skill:${skill.name}`,
    label: `skill:${skill.name}`,
    description: truncateDescription(skill.description),
  }))

  let commands = [...SLASH_COMMANDS, ...skillCommands]

  if (IS_FREETIER && !getChatGptOAuthStatus().connected) {
    commands = commands.map((cmd) => {
      if (cmd.id === 'review' || cmd.id === 'plan') {
        return {
          ...cmd,
          description: 'Requiere conectarse. ' + cmd.description,
        }
      }
      return cmd
    })
  }

  return commands
}

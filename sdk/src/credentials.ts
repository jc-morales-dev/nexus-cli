import fs from 'fs'
import path from 'node:path'
import os from 'os'

import { env } from '@nexus/common/env'
import { userSchema } from '@nexus/common/util/credentials'
import { z } from 'zod/v4'

import type { ClientEnv } from '@nexus/common/types/contracts/env'
import type { User } from '@nexus/common/util/credentials'

/**
 * Schema for the credentials file.
 */
const credentialsFileSchema = z.object({
  default: userSchema.optional(),
})

export const userFromJson = (json: string): User | null => {
  try {
    const credentials = credentialsFileSchema.parse(JSON.parse(json))
    return credentials.default ?? null
  } catch {
    return null
  }
}

/**
 * Get the config directory path based on the environment.
 * Uses the clientEnv to determine the environment suffix.
 */
export const getConfigDir = (clientEnv: ClientEnv = env): string => {
  const envSuffix =
    clientEnv.NEXT_PUBLIC_CB_ENVIRONMENT &&
    clientEnv.NEXT_PUBLIC_CB_ENVIRONMENT !== 'prod'
      ? `-${clientEnv.NEXT_PUBLIC_CB_ENVIRONMENT}`
      : ''
  return path.join(os.homedir(), '.config', `nexus${envSuffix}`)
}

/**
 * Get the credentials file path based on the environment.
 */
export const getCredentialsPath = (clientEnv: ClientEnv = env): string => {
  return path.join(getConfigDir(clientEnv), 'credentials.json')
}

export const getUserCredentials = (clientEnv: ClientEnv = env): User | null => {
  const credentialsPath = getCredentialsPath(clientEnv)
  if (!fs.existsSync(credentialsPath)) {
    return null
  }

  try {
    const credentialsFile = fs.readFileSync(credentialsPath, 'utf8')
    const user = userFromJson(credentialsFile)
    return user || null
  } catch (error) {
    console.error('Error reading credentials', error)
    return null
  }
}

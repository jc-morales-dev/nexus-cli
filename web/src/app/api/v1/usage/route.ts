import {
  getUserUsageData,
  getOrganizationUsageResponse,
} from '@nexus/billing'
import { trackEvent } from '@nexus/common/analytics'

import { postUsage } from './_post'

import type { NextRequest } from 'next/server'

import { getUserInfoFromApiKey } from '@/db/user'
import { logger } from '@/util/logger'

export async function POST(req: NextRequest) {
  return postUsage({
    req,
    getUserInfoFromApiKey,
    getUserUsageData,
    getOrganizationUsageResponse,
    trackEvent,
    logger,
  })
}

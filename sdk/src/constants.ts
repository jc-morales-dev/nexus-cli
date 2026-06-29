import { env, IS_DEV, IS_TEST, IS_PROD } from '@nexus/common/env'

export { IS_DEV, IS_TEST, IS_PROD }

export const NEXUS_BINARY = 'nexus'

export const WEBSITE_URL = env.NEXT_PUBLIC_NEXUS_APP_URL

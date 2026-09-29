import * as client from 'openid-client'
import { requireEnv } from '@/lib/env'

let _config: Promise<client.Configuration> | null = null

/** Ardwell ID (Pocket ID) discovery, cached per process. */
export function getOidcConfig(): Promise<client.Configuration> {
  _config ??= client.discovery(
    new URL(requireEnv('OIDC_ISSUER')),
    requireEnv('OIDC_CLIENT_ID'),
    requireEnv('OIDC_CLIENT_SECRET'),
  ).catch((err) => { _config = null; throw err })
  return _config
}

/**
 * Settings API Types
 *
 * Request/response types for settings endpoints.
 */

// ============================================================================
// TAGO TOKEN SETTINGS
// ============================================================================

/** Tago token status */
export interface TagoTokenStatus {
  configured: boolean;
  lastValidated?: string;
  error?: string;
}

/** Get token status response */
export interface GetTokenStatusResponse {
  status: TagoTokenStatus;
}

/** Set token request */
export interface SetTokenRequest {
  token: string;
}

/** Set token response */
export interface SetTokenResponse {
  message: string;
  validated: boolean;
}

/** Validate token response */
export interface ValidateTokenResponse {
  valid: boolean;
  error?: string;
  profile?: {
    id: string;
    name: string;
  };
}

// ============================================================================
// ORGANIZATION SETTINGS
// ============================================================================

/** Organization settings */
export interface OrganizationSettings {
  id: string;
  name: string;
  slug: string;
  logo?: string;
  createdAt: string;
}

/** Get organization response */
export interface GetOrganizationResponse {
  organization: OrganizationSettings;
}

/** Update organization request */
export interface UpdateOrganizationRequest {
  name?: string;
  slug?: string;
  logo?: string;
}

/** Update organization response */
export interface UpdateOrganizationResponse {
  organization: OrganizationSettings;
}

// ============================================================================
// LOGGING SETTINGS
// ============================================================================

/** Log retention settings */
export interface LogRetentionSettings {
  maxLogsPerAnalysis: number;
  retentionDays: number;
}

/** Get log settings response */
export interface GetLogSettingsResponse {
  settings: LogRetentionSettings;
}

/** Update log settings request */
export interface UpdateLogSettingsRequest {
  maxLogsPerAnalysis?: number;
  retentionDays?: number;
}

/** Update log settings response */
export interface UpdateLogSettingsResponse {
  settings: LogRetentionSettings;
}

// ============================================================================
// SECURITY SETTINGS
// ============================================================================

/** Security settings */
export interface SecuritySettings {
  sessionTimeout: number;
  maxSessions: number;
  requirePasskey: boolean;
  allowPasswordLogin: boolean;
}

/** Get security settings response */
export interface GetSecuritySettingsResponse {
  settings: SecuritySettings;
}

/** Update security settings request */
export interface UpdateSecuritySettingsRequest
  extends Partial<SecuritySettings> {}

/** Update security settings response */
export interface UpdateSecuritySettingsResponse {
  settings: SecuritySettings;
}

// ============================================================================
// DNS SETTINGS (Admin only)
// ============================================================================

/** DNS cache settings */
export interface DNSCacheSettings {
  enabled: boolean;
  ttl: number;
  maxEntries: number;
}

/** Get DNS settings response */
export interface GetDNSSettingsResponse {
  settings: DNSCacheSettings;
  stats: {
    hits: number;
    misses: number;
    hitRate: number;
    entries: number;
  };
}

/** Update DNS settings request */
export interface UpdateDNSSettingsRequest extends Partial<DNSCacheSettings> {}

/** Update DNS settings response */
export interface UpdateDNSSettingsResponse {
  settings: DNSCacheSettings;
}

/** Clear DNS cache response */
export interface ClearDNSCacheResponse {
  message: string;
  entriesCleared: number;
}

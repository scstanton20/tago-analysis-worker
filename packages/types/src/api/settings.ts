/**
 * Settings API Types
 *
 * Request/response types for settings endpoints.
 */

// ============================================================================
// TAGO TOKEN SETTINGS
// ============================================================================

/** Tago token status */
export type TagoTokenStatus = {
  configured: boolean;
  lastValidated?: string;
  error?: string;
};

/** Get token status response */
export type GetTokenStatusResponse = {
  status: TagoTokenStatus;
};

/** Set token request */
export type SetTokenRequest = {
  token: string;
};

/** Set token response */
export type SetTokenResponse = {
  message: string;
  validated: boolean;
};

/** Validate token response */
export type ValidateTokenResponse = {
  valid: boolean;
  error?: string;
  profile?: {
    id: string;
    name: string;
  };
};

// ============================================================================
// ORGANIZATION SETTINGS
// ============================================================================

/** Organization settings */
export type OrganizationSettings = {
  id: string;
  name: string;
  slug: string;
  logo?: string;
  createdAt: string;
};

/** Get organization response */
export type GetOrganizationResponse = {
  organization: OrganizationSettings;
};

/** Update organization request */
export type UpdateOrganizationRequest = {
  name?: string;
  slug?: string;
  logo?: string;
};

/** Update organization response */
export type UpdateOrganizationResponse = {
  organization: OrganizationSettings;
};

// ============================================================================
// LOGGING SETTINGS
// ============================================================================

/** Log retention settings */
export type LogRetentionSettings = {
  maxLogsPerAnalysis: number;
  retentionDays: number;
};

/** Get log settings response */
export type GetLogSettingsResponse = {
  settings: LogRetentionSettings;
};

/** Update log settings request */
export type UpdateLogSettingsRequest = {
  maxLogsPerAnalysis?: number;
  retentionDays?: number;
};

/** Update log settings response */
export type UpdateLogSettingsResponse = {
  settings: LogRetentionSettings;
};

// ============================================================================
// SECURITY SETTINGS
// ============================================================================

/** Security settings */
export type SecuritySettings = {
  sessionTimeout: number;
  maxSessions: number;
  requirePasskey: boolean;
  allowPasswordLogin: boolean;
};

/** Get security settings response */
export type GetSecuritySettingsResponse = {
  settings: SecuritySettings;
};

/** Update security settings request */
export type UpdateSecuritySettingsRequest = Partial<SecuritySettings>;

/** Update security settings response */
export type UpdateSecuritySettingsResponse = {
  settings: SecuritySettings;
};

// ============================================================================
// DNS SETTINGS (Admin only)
// ============================================================================

/** DNS cache settings */
export type DNSCacheSettings = {
  enabled: boolean;
  ttl: number;
  maxEntries: number;
};

/** Get DNS settings response */
export type GetDNSSettingsResponse = {
  settings: DNSCacheSettings;
  stats: {
    hits: number;
    misses: number;
    hitRate: number;
    entries: number;
  };
};

/** Update DNS settings request */
export type UpdateDNSSettingsRequest = Partial<DNSCacheSettings>;

/** Update DNS settings response */
export type UpdateDNSSettingsResponse = {
  settings: DNSCacheSettings;
};

/** Clear DNS cache response */
export type ClearDNSCacheResponse = {
  message: string;
  entriesCleared: number;
};

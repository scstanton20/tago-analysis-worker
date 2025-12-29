/**
 * Auth Credentials Types
 *
 * Types for authentication flows (password, passkey, etc.)
 */

// ============================================================================
// PASSWORD AUTH
// ============================================================================

/** Sign in with password request */
export interface SignInWithPasswordRequest {
  email: string;
  password: string;
  rememberMe?: boolean;
}

/** Sign in response */
export interface SignInResponse {
  token: string;
  user: {
    id: string;
    email: string;
    name: string;
  };
  requiresPasswordChange?: boolean;
}

/** Sign up request */
export interface SignUpRequest {
  email: string;
  password: string;
  name: string;
  username?: string;
}

/** Sign up response */
export interface SignUpResponse {
  token: string;
  user: {
    id: string;
    email: string;
    name: string;
  };
}

// ============================================================================
// PASSKEY AUTH
// ============================================================================

/** Start passkey authentication request */
export interface StartPasskeyAuthRequest {
  email?: string;
}

/** Start passkey authentication response */
export interface StartPasskeyAuthResponse {
  options: PublicKeyCredentialRequestOptions;
}

/** Complete passkey authentication request */
export interface CompletePasskeyAuthRequest {
  credential: PublicKeyCredential;
}

/** Complete passkey authentication response */
export interface CompletePasskeyAuthResponse {
  token: string;
  user: {
    id: string;
    email: string;
    name: string;
  };
}

// ============================================================================
// SESSION
// ============================================================================

/** Refresh token request */
export interface RefreshTokenRequest {
  refreshToken: string;
}

/** Refresh token response */
export interface RefreshTokenResponse {
  token: string;
  expiresAt: string;
}

/** Sign out response */
export interface SignOutResponse {
  message: string;
}

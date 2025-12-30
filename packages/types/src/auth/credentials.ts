/**
 * Auth Credentials Types
 *
 * Types for authentication flows (password, passkey, etc.)
 */

// ============================================================================
// PASSWORD AUTH
// ============================================================================

/** Sign in with password request */
export type SignInWithPasswordRequest = {
  email: string;
  password: string;
  rememberMe?: boolean;
};

/** Sign in response */
export type SignInResponse = {
  token: string;
  user: {
    id: string;
    email: string;
    name: string;
  };
  requiresPasswordChange?: boolean;
};

/** Sign up request */
export type SignUpRequest = {
  email: string;
  password: string;
  name: string;
  username?: string;
};

/** Sign up response */
export type SignUpResponse = {
  token: string;
  user: {
    id: string;
    email: string;
    name: string;
  };
};

// ============================================================================
// PASSKEY AUTH
// ============================================================================

/** Start passkey authentication request */
export type StartPasskeyAuthRequest = {
  email?: string;
};

/** Start passkey authentication response */
export type StartPasskeyAuthResponse = {
  options: PublicKeyCredentialRequestOptions;
};

/** Complete passkey authentication request */
export type CompletePasskeyAuthRequest = {
  credential: PublicKeyCredential;
};

/** Complete passkey authentication response */
export type CompletePasskeyAuthResponse = {
  token: string;
  user: {
    id: string;
    email: string;
    name: string;
  };
};

// ============================================================================
// SESSION
// ============================================================================

/** Refresh token request */
export type RefreshTokenRequest = {
  refreshToken: string;
};

/** Refresh token response */
export type RefreshTokenResponse = {
  token: string;
  expiresAt: string;
};

/** Sign out response */
export type SignOutResponse = {
  message: string;
};

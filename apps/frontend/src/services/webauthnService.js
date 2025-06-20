import {
  startRegistration,
  startAuthentication,
} from '@simplewebauthn/browser';
import { fetchWithHeaders, handleResponse } from '../utils/apiUtils.js';

class WebAuthnService {
  constructor() {
    this.baseUrl = '/auth/webauthn';
  }

  // Check if WebAuthn is supported in this browser
  isSupported() {
    return (
      window.PublicKeyCredential &&
      typeof window.PublicKeyCredential
        .isUserVerifyingPlatformAuthenticatorAvailable === 'function'
    );
  }

  // Check if the device supports platform authenticators (like Face ID, Touch ID, Windows Hello)
  async isPlatformAuthenticatorAvailable() {
    if (!this.isSupported()) return false;

    try {
      return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    } catch (error) {
      console.warn(
        'Error checking platform authenticator availability:',
        error,
      );
      return false;
    }
  }

  // Register a new passkey for the current user
  async registerPasskey(authenticatorName) {
    try {
      // Step 1: Get registration options from server
      const optionsResponse = await fetchWithHeaders(
        `${this.baseUrl}/registration/generate`,
        {
          method: 'POST',
          body: JSON.stringify({ authenticatorName }),
        },
      );

      const options = await handleResponse(optionsResponse);

      // Step 2: Start registration ceremony with browser
      const attResp = await startRegistration({ optionsJSON: options });

      // Step 3: Send response to server for verification
      const verificationResponse = await fetchWithHeaders(
        `${this.baseUrl}/registration/verify`,
        {
          method: 'POST',
          body: JSON.stringify({ response: attResp }),
        },
      );

      const verification = await handleResponse(verificationResponse);

      if (!verification.verified) {
        throw new Error('Registration verification failed');
      }

      return verification.authenticator;
    } catch (error) {
      console.error('Passkey registration error:', error);
      throw error;
    }
  }

  // Authenticate with passkey (with username)
  async authenticateWithUsername(username) {
    try {
      // Step 1: Get authentication options from server
      const optionsResponse = await fetchWithHeaders(
        `${this.baseUrl}/authentication/generate`,
        {
          method: 'POST',
          body: JSON.stringify({ username }),
        },
      );

      const options = await handleResponse(optionsResponse);

      // Step 2: Start authentication ceremony with browser
      const authResp = await startAuthentication({ optionsJSON: options });

      // Step 3: Send response to server for verification
      const verificationResponse = await fetchWithHeaders(
        `${this.baseUrl}/authentication/verify`,
        {
          method: 'POST',
          body: JSON.stringify({ response: authResp, username }),
        },
      );

      const verification = await handleResponse(verificationResponse);

      if (!verification.success) {
        throw new Error('Authentication verification failed');
      }

      return verification;
    } catch (error) {
      console.error('Passkey authentication error:', error);
      throw error;
    }
  }

  // Authenticate with passkey (usernameless - resident key)
  async authenticateUsernameless() {
    try {
      // Step 1: Get authentication options from server (no username)
      const optionsResponse = await fetchWithHeaders(
        `${this.baseUrl}/authentication/generate`,
        {
          method: 'POST',
          body: JSON.stringify({}), // No username for resident key auth
        },
      );

      const options = await handleResponse(optionsResponse);

      // Extract challengeId from options (returned by server for usernameless flow)
      const { challengeId, ...webauthnOptions } = options;

      // Step 2: Start authentication ceremony with browser
      const authResp = await startAuthentication({
        optionsJSON: webauthnOptions,
      });

      // Step 3: Send response to server for verification (include challengeId)
      const verificationResponse = await fetchWithHeaders(
        `${this.baseUrl}/authentication/verify`,
        {
          method: 'POST',
          body: JSON.stringify({
            response: authResp,
            challengeId, // Include challengeId for usernameless verification
          }),
        },
      );

      const verification = await handleResponse(verificationResponse);

      if (!verification.success) {
        throw new Error('Authentication verification failed');
      }

      return verification;
    } catch (error) {
      console.error('Usernameless passkey authentication error:', error);
      throw error;
    }
  }

  // Get user's registered passkeys
  async getAuthenticators() {
    try {
      const response = await fetchWithHeaders(
        `${this.baseUrl}/authenticators`,
        {
          method: 'GET',
        },
      );

      const data = await handleResponse(response);
      return data.authenticators;
    } catch (error) {
      console.error('Error getting authenticators:', error);
      throw error;
    }
  }

  // Delete a passkey
  async deleteAuthenticator(credentialId) {
    try {
      const response = await fetchWithHeaders(
        `${this.baseUrl}/authenticators/${encodeURIComponent(credentialId)}`,
        {
          method: 'DELETE',
        },
      );

      const data = await handleResponse(response);
      return data.success;
    } catch (error) {
      console.error('Error deleting authenticator:', error);
      throw error;
    }
  }

  // Get a user-friendly name for the authenticator type
  getAuthenticatorTypeName(transports) {
    if (!Array.isArray(transports)) return 'Security Key';

    if (transports.includes('internal')) {
      // Platform authenticator (built-in)
      const userAgent = navigator.userAgent.toLowerCase();
      if (userAgent.includes('iphone') || userAgent.includes('ipad')) {
        return 'Face ID / Touch ID';
      } else if (userAgent.includes('mac')) {
        return 'Touch ID';
      } else if (userAgent.includes('windows')) {
        return 'Windows Hello';
      } else if (userAgent.includes('android')) {
        return 'Fingerprint / Face Unlock';
      }
      return 'Built-in Security';
    } else if (transports.includes('usb')) {
      return 'USB Security Key';
    } else if (transports.includes('nfc')) {
      return 'NFC Security Key';
    } else if (transports.includes('ble')) {
      return 'Bluetooth Security Key';
    }

    return 'Security Key';
  }
}

export const webauthnService = new WebAuthnService();

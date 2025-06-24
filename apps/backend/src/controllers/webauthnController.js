import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import userService from '../services/userService.js';
import { generateTokens } from '../utils/jwt.js';
import { challengeStorage } from '../utils/challengeStorage.js';

// WebAuthn configuration
const RP_NAME = 'Tago Analysis Runner';
const RP_ID =
  process.env.NODE_ENV === 'production'
    ? process.env.PRODUCTION_DOMAIN
    : 'localhost';
const ORIGIN =
  process.env.NODE_ENV === 'production'
    ? `https://${process.env.PRODUCTION_DOMAIN}`
    : 'http://localhost:5173';

/**
 * WebAuthn controller for handling passkey authentication
 * Provides endpoints for registration, authentication, and management of WebAuthn credentials
 */
class WebAuthnController {
  /**
   * Generate registration options for a new passkey
   * @param {Object} req - Express request object
   * @param {Object} req.user - Authenticated user from middleware
   * @param {Object} req.body - Request body
   * @param {string} req.body.authenticatorName - Name for the new authenticator
   * @param {Object} res - Express response object
   * @returns {Promise<void>} Registration options or error response
   */
  async generateRegistration(req, res) {
    try {
      const { user } = req; // From auth middleware
      const { authenticatorName } = req.body;

      if (!user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      if (!authenticatorName) {
        return res
          .status(400)
          .json({ error: 'Authenticator name is required' });
      }

      // Get existing authenticators for the user
      const userData = await userService.getUserByUsername(user.username);
      const existingAuthenticators = userData?.webauthn?.authenticators || [];

      const options = await generateRegistrationOptions({
        rpName: RP_NAME,
        rpID: RP_ID,
        userID: Buffer.from(user.id.toString()),
        userName: user.username,
        userDisplayName: user.email || user.username,
        attestationType: 'none',
        excludeCredentials: existingAuthenticators.map((authenticator) => ({
          id: authenticator.credentialID,
          type: 'public-key',
          transports: authenticator.transports,
        })),
        authenticatorSelection: {
          residentKey: 'preferred',
          userVerification: 'preferred',
          // Don't restrict to platform authenticators to allow cross-platform keys
        },
      });

      // Store challenge temporarily (in production, use Redis or similar)
      await userService.storeWebAuthnChallenge(user.username, {
        challenge: options.challenge,
        type: 'registration',
        authenticatorName,
        timestamp: Date.now(),
      });

      res.json(options);
    } catch (error) {
      console.error('WebAuthn registration generation error:', error);
      res
        .status(500)
        .json({ error: 'Failed to generate registration options' });
    }
  }

  /**
   * Verify registration response and save the new passkey
   * @param {Object} req - Express request object
   * @param {Object} req.user - Authenticated user from middleware
   * @param {Object} req.body - Request body
   * @param {Object} req.body.response - WebAuthn registration response
   * @param {Object} res - Express response object
   * @returns {Promise<void>} Verification result or error response
   */
  async verifyRegistration(req, res) {
    try {
      const { user } = req; // From auth middleware
      const { response } = req.body;

      if (!user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      // Get stored challenge
      const challengeData = await userService.getWebAuthnChallenge(
        user.username,
      );
      if (!challengeData || challengeData.type !== 'registration') {
        return res.status(400).json({ error: 'Invalid or expired challenge' });
      }

      // Verify the registration response
      const verification = await verifyRegistrationResponse({
        response,
        expectedChallenge: challengeData.challenge,
        expectedOrigin: ORIGIN,
        expectedRPID: RP_ID,
      });

      if (!verification.verified || !verification.registrationInfo) {
        return res
          .status(400)
          .json({ error: 'Registration verification failed' });
      }

      // Save the new authenticator
      const { credential } = verification.registrationInfo;

      if (!credential?.id || !credential?.publicKey) {
        console.error(
          'Missing registration info:',
          verification.registrationInfo,
        );
        return res
          .status(500)
          .json({ error: 'Invalid registration info received' });
      }

      const newAuthenticator = {
        credentialID: Buffer.from(credential.id, 'base64').toString('base64'),
        credentialPublicKey: Buffer.from(credential.publicKey).toString(
          'base64',
        ),
        counter: credential.counter || 0, // Ensure counter is a number, default to 0
        transports: credential.transports || [],
        name: challengeData.authenticatorName,
        createdAt: new Date().toISOString(),
      };

      await userService.addWebAuthnAuthenticator(
        user.username,
        newAuthenticator,
      );

      // Clear the challenge
      await userService.clearWebAuthnChallenge(user.username);

      res.json({
        verified: true,
        authenticator: {
          id: newAuthenticator.credentialID,
          name: newAuthenticator.name,
          createdAt: newAuthenticator.createdAt,
        },
      });
    } catch (error) {
      console.error('WebAuthn registration verification error:', error);
      res.status(500).json({ error: 'Failed to verify registration' });
    }
  }

  /**
   * Generate authentication options for passkey login
   * Supports both username-based and usernameless (resident key) authentication
   * @param {Object} req - Express request object
   * @param {Object} req.body - Request body
   * @param {string} [req.body.username] - Username for user-specific auth (optional for usernameless)
   * @param {Object} res - Express response object
   * @returns {Promise<void>} Authentication options or error response
   */
  async generateAuthentication(req, res) {
    try {
      const { username } = req.body;

      if (username) {
        // User-specific authentication
        const userData = await userService.getUserByUsername(username);
        if (!userData) {
          return res.status(404).json({ error: 'User not found' });
        }

        const authenticators = userData?.webauthn?.authenticators || [];
        if (authenticators.length === 0) {
          return res
            .status(400)
            .json({ error: 'No passkeys registered for this user' });
        }

        const options = await generateAuthenticationOptions({
          rpID: RP_ID,
          allowCredentials: authenticators.map((authenticator) => ({
            id: Buffer.from(authenticator.credentialID, 'base64'),
            type: 'public-key',
            transports: authenticator.transports,
          })),
          userVerification: 'preferred',
        });

        // Store challenge temporarily
        await userService.storeWebAuthnChallenge(username, {
          challenge: options.challenge,
          type: 'authentication',
          timestamp: Date.now(),
        });

        res.json(options);
      } else {
        // Usernameless authentication (resident key)
        const options = await generateAuthenticationOptions({
          rpID: RP_ID,
          userVerification: 'preferred',
        });

        // Store challenge in memory storage for usernameless flow
        const challengeId = challengeStorage.store({
          challenge: options.challenge,
          type: 'authentication',
          timestamp: Date.now(),
        });

        // Include challenge ID in response for verification
        res.json({
          ...options,
          challengeId,
        });
      }
    } catch (error) {
      console.error('WebAuthn authentication generation error:', error);
      res
        .status(500)
        .json({ error: 'Failed to generate authentication options' });
    }
  }

  /**
   * Verify authentication response and login the user
   * Handles both username-based and usernameless authentication flows
   * @param {Object} req - Express request object
   * @param {Object} req.body - Request body
   * @param {Object} req.body.response - WebAuthn authentication response
   * @param {string} [req.body.username] - Username (for username-based auth)
   * @param {string} [req.body.challengeId] - Challenge ID (for usernameless auth)
   * @param {Object} res - Express response object
   * @returns {Promise<void>} Authentication result with user data or error response
   */
  async verifyAuthentication(req, res) {
    try {
      const { response, username, challengeId } = req.body;

      let challengeData;
      let userData;

      if (username) {
        // Username provided - get challenge from user storage
        challengeData = await userService.getWebAuthnChallenge(username);
        userData = await userService.getUserByUsername(username);
        console.log('Found user by username:', {
          id: userData?.id,
          username: userData?.username,
        });
      } else {
        // Usernameless - get challenge from memory storage
        if (!challengeId) {
          return res.status(400).json({
            error: 'Challenge ID required for usernameless authentication',
          });
        }

        challengeData = challengeStorage.consume(challengeId);
        if (!challengeData) {
          return res
            .status(400)
            .json({ error: 'Invalid or expired challenge' });
        }

        // Find user by credential ID
        const credentialID = Buffer.from(response.rawId, 'base64').toString(
          'base64',
        );
        userData = await userService.getUserByCredentialID(credentialID);
        if (!userData) {
          return res.status(404).json({ error: 'Credential not found' });
        }
        console.log('Found user by credential ID:', {
          id: userData.id,
          username: userData.username,
        });
      }

      if (!challengeData || challengeData.type !== 'authentication') {
        return res.status(400).json({ error: 'Invalid or expired challenge' });
      }

      // Find the authenticator
      const authenticators = userData?.webauthn?.authenticators || [];
      const credentialID = Buffer.from(response.rawId, 'base64').toString(
        'base64',
      );
      const authenticator = authenticators.find(
        (auth) => auth.credentialID === credentialID,
      );

      if (!authenticator) {
        return res.status(400).json({ error: 'Authenticator not found' });
      }
      // Verify the authentication response
      const credential = {
        id: Buffer.from(authenticator.credentialID, 'base64'),
        publicKey: Buffer.from(authenticator.credentialPublicKey, 'base64'),
        counter: authenticator.counter,
        transports: authenticator.transports,
      };

      const verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge: challengeData.challenge,
        expectedOrigin: ORIGIN,
        expectedRPID: RP_ID,
        credential: credential,
      });

      if (!verification.verified) {
        return res
          .status(400)
          .json({ error: 'Authentication verification failed' });
      }

      // Update counter after successful verification
      const { newCounter } = verification.authenticationInfo;

      // Handle counter updates - some platform authenticators don't increment counters
      if (newCounter > authenticator.counter) {
        await userService.updateWebAuthnCounter(
          userData.username,
          credentialID,
          newCounter,
        );
        console.log('Counter updated successfully');
      } else if (newCounter === authenticator.counter && newCounter === 0) {
        // Platform authenticators (Touch ID, Face ID) often don't use counters
        console.log(
          'Platform authenticator detected - counter not incremented (normal behavior)',
        );
      } else {
        console.warn(
          'Counter did not increment properly. Possible replay attack.',
          { currentCounter: authenticator.counter, newCounter },
        );
      }

      // Clear challenge (for username flow only - usernameless challenges are already consumed)
      if (username) {
        await userService.clearWebAuthnChallenge(username);
      }

      const { accessToken, refreshToken } = generateTokens(userData);

      // Set tokens as httpOnly cookies for security (same as regular login)
      res.cookie('access_token', accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 5 * 60 * 1000, // 5 minutes
      });

      res.cookie('refresh_token', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      });

      // Return success with user data (consistent with regular login)
      const {
        password: _password,
        webauthn: _webauthn,
        ...userWithoutSensitive
      } = userData;
      res.json({
        success: true,
        user: userWithoutSensitive,
        message: 'WebAuthn login successful',
        authenticatorUsed: authenticator.name,
      });
    } catch (error) {
      console.error('WebAuthn authentication verification error:', error);
      res.status(500).json({ error: 'Failed to verify authentication' });
    }
  }

  /**
   * Get user's registered passkeys
   * @param {Object} req - Express request object
   * @param {Object} req.user - Authenticated user from middleware
   * @param {Object} res - Express response object
   * @returns {Promise<void>} List of user's authenticators or error response
   */
  async getAuthenticators(req, res) {
    try {
      const { user } = req; // From auth middleware

      if (!user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const userData = await userService.getUserByUsername(user.username);
      const authenticators = userData?.webauthn?.authenticators || [];

      // Return safe info about authenticators
      const safeAuthenticators = authenticators.map((auth) => ({
        id: auth.credentialID,
        name: auth.name,
        createdAt: auth.createdAt,
        transports: auth.transports,
      }));

      res.json({ authenticators: safeAuthenticators });
    } catch (error) {
      console.error('Error getting authenticators:', error);
      res.status(500).json({ error: 'Failed to get authenticators' });
    }
  }

  /**
   * Delete a passkey
   * @param {Object} req - Express request object
   * @param {Object} req.user - Authenticated user from middleware
   * @param {Object} req.params - Request parameters
   * @param {string} req.params.credentialId - ID of the credential to delete
   * @param {Object} res - Express response object
   * @returns {Promise<void>} Success confirmation or error response
   */
  async deleteAuthenticator(req, res) {
    try {
      const { user } = req; // From auth middleware
      const { credentialId } = req.params;

      if (!user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const success = await userService.removeWebAuthnAuthenticator(
        user.username,
        credentialId,
      );

      if (!success) {
        return res.status(404).json({ error: 'Authenticator not found' });
      }

      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting authenticator:', error);
      res.status(500).json({ error: 'Failed to delete authenticator' });
    }
  }
}

export const webauthnController = new WebAuthnController();

import express from 'express';
import { webauthnController } from '../controllers/webauthnController.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     WebAuthnRegistrationOptions:
 *       type: object
 *       properties:
 *         rp:
 *           type: object
 *           properties:
 *             name:
 *               type: string
 *               example: "Tago Analysis Runner"
 *         user:
 *           type: object
 *           properties:
 *             id:
 *               type: string
 *               description: Base64 encoded user ID
 *             name:
 *               type: string
 *               example: "john.doe"
 *             displayName:
 *               type: string
 *               example: "John Doe"
 *         challenge:
 *           type: string
 *           description: Base64 encoded challenge
 *         pubKeyCredParams:
 *           type: array
 *           items:
 *             type: object
 *         timeout:
 *           type: integer
 *           example: 60000
 *         attestation:
 *           type: string
 *           example: "none"
 *         authenticatorSelection:
 *           type: object
 *
 *     WebAuthnAuthenticationOptions:
 *       type: object
 *       properties:
 *         challenge:
 *           type: string
 *           description: Base64 encoded challenge
 *         timeout:
 *           type: integer
 *           example: 60000
 *         rpId:
 *           type: string
 *           example: "localhost"
 *         allowCredentials:
 *           type: array
 *           items:
 *             type: object
 *         userVerification:
 *           type: string
 *           example: "preferred"
 *         challengeId:
 *           type: string
 *           description: Challenge ID for usernameless authentication
 *
 *     WebAuthnCredential:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           description: Credential ID
 *         rawId:
 *           type: string
 *           description: Base64 encoded raw credential ID
 *         response:
 *           type: object
 *           description: WebAuthn credential response
 *         type:
 *           type: string
 *           example: "public-key"
 *
 *     AuthenticatorInfo:
 *       type: object
 *       properties:
 *         credentialID:
 *           type: string
 *           description: Base64 encoded credential ID
 *         name:
 *           type: string
 *           example: "iPhone Touch ID"
 *         createdAt:
 *           type: string
 *           format: date-time
 *         lastUsed:
 *           type: string
 *           format: date-time
 *         counter:
 *           type: integer
 *           description: Usage counter for the authenticator
 *
 */

/**
 * @swagger
 * /auth/webauthn/registration/generate:
 *   post:
 *     summary: Generate WebAuthn registration options
 *     description: Creates registration options for adding a new passkey to the authenticated user's account
 *     tags: [WebAuthn]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - authenticatorName
 *             properties:
 *               authenticatorName:
 *                 type: string
 *                 description: Human-readable name for the new authenticator
 *                 example: "iPhone Touch ID"
 *     responses:
 *       200:
 *         description: Registration options generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/WebAuthnRegistrationOptions'
 *       400:
 *         description: Bad request - missing authenticator name
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Authenticator name is required"
 *       401:
 *         description: Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Authentication required"
 *       500:
 *         description: Server error
 */
router.post(
  '/registration/generate',
  authMiddleware,
  webauthnController.generateRegistration,
);

/**
 * @swagger
 * /auth/webauthn/registration/verify:
 *   post:
 *     summary: Verify WebAuthn registration response
 *     description: Verifies the registration response from the authenticator and stores the new credential
 *     tags: [WebAuthn]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - response
 *               - authenticatorName
 *             properties:
 *               response:
 *                 $ref: '#/components/schemas/WebAuthnCredential'
 *               authenticatorName:
 *                 type: string
 *                 example: "iPhone Touch ID"
 *     responses:
 *       201:
 *         description: Passkey registered successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Passkey registered successfully"
 *       400:
 *         description: Verification failed or bad request
 *       401:
 *         description: Authentication required
 *       500:
 *         description: Server error
 */
router.post(
  '/registration/verify',
  authMiddleware,
  webauthnController.verifyRegistration,
);

/**
 * @swagger
 * /auth/webauthn/authentication/generate:
 *   post:
 *     summary: Generate WebAuthn authentication options
 *     description: Creates authentication options for passkey login. Supports both username-based and usernameless authentication
 *     tags: [WebAuthn]
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               username:
 *                 type: string
 *                 description: Username for credential-specific authentication (optional for usernameless)
 *                 example: "john.doe"
 *     responses:
 *       200:
 *         description: Authentication options generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/WebAuthnAuthenticationOptions'
 *       400:
 *         description: No passkeys registered for the specified user
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "No passkeys registered for this user"
 *       404:
 *         description: User not found
 *       500:
 *         description: Server error
 */
router.post(
  '/authentication/generate',
  webauthnController.generateAuthentication,
);

/**
 * @swagger
 * /auth/webauthn/authentication/verify:
 *   post:
 *     summary: Verify WebAuthn authentication response
 *     description: Verifies the authentication response and logs in the user with JWT tokens set as httpOnly cookies
 *     tags: [WebAuthn]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - response
 *             properties:
 *               response:
 *                 $ref: '#/components/schemas/WebAuthnCredential'
 *               username:
 *                 type: string
 *                 description: Username for username-based authentication
 *                 example: "john.doe"
 *               challengeId:
 *                 type: string
 *                 description: Challenge ID for usernameless authentication
 *     responses:
 *       200:
 *         description: Authentication successful, user logged in
 *         headers:
 *           Set-Cookie:
 *             description: JWT tokens set as httpOnly cookies
 *             schema:
 *               type: string
 *               example: "access_token=eyJ...; HttpOnly; Secure; SameSite=Strict"
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     username:
 *                       type: string
 *                     role:
 *                       type: string
 *                 success:
 *                   type: boolean
 *                   example: true
 *       400:
 *         description: Verification failed or invalid request
 *       401:
 *         description: Authentication failed
 *       404:
 *         description: User or credential not found
 *       500:
 *         description: Server error
 */
router.post('/authentication/verify', webauthnController.verifyAuthentication);

/**
 * @swagger
 * /auth/webauthn/authenticators:
 *   get:
 *     summary: Get user's registered authenticators
 *     description: Returns a list of all passkeys/authenticators registered for the authenticated user
 *     tags: [WebAuthn]
 *     responses:
 *       200:
 *         description: List of user's authenticators
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 authenticators:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/AuthenticatorInfo'
 *       401:
 *         description: Authentication required
 *       500:
 *         description: Server error
 */
router.get(
  '/authenticators',
  authMiddleware,
  webauthnController.getAuthenticators,
);

/**
 * @swagger
 * /auth/webauthn/authenticators/{credentialId}:
 *   delete:
 *     summary: Delete a registered authenticator
 *     description: Removes a specific passkey/authenticator from the authenticated user's account
 *     tags: [WebAuthn]
 *     parameters:
 *       - in: path
 *         name: credentialId
 *         required: true
 *         schema:
 *           type: string
 *         description: The credential ID of the authenticator to delete
 *         example: "AQIDBAUGBwgJCgsMDQ4PEA"
 *     responses:
 *       200:
 *         description: Authenticator deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *       401:
 *         description: Authentication required
 *       404:
 *         description: Authenticator not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Authenticator not found"
 *       500:
 *         description: Server error
 */
router.delete(
  '/authenticators/:credentialId',
  authMiddleware,
  webauthnController.deleteAuthenticator,
);

export default router;

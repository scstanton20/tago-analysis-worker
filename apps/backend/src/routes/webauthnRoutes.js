import express from 'express';
import { webauthnController } from '../controllers/webauthnController.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

// Registration routes (require authentication)
router.post(
  '/registration/generate',
  authMiddleware,
  webauthnController.generateRegistration,
);
router.post(
  '/registration/verify',
  authMiddleware,
  webauthnController.verifyRegistration,
);

// Authentication routes (public)
router.post(
  '/authentication/generate',
  webauthnController.generateAuthentication,
);
router.post('/authentication/verify', webauthnController.verifyAuthentication);

// Authenticator management routes (require authentication)
router.get(
  '/authenticators',
  authMiddleware,
  webauthnController.getAuthenticators,
);
router.delete(
  '/authenticators/:credentialId',
  authMiddleware,
  webauthnController.deleteAuthenticator,
);

export default router;

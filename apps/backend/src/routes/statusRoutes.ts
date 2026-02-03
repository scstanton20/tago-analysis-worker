import express from 'express';
import { StatusController } from '../controllers/statusController.ts';
import { asyncHandler } from '../utils/asyncHandler.ts';
import { validateRequest } from '../middleware/validateRequest.ts';
import { statusValidationSchemas } from '../validation/statusSchemas.ts';

const router = express.Router();

router.get(
  '/',
  validateRequest(statusValidationSchemas.getSystemStatus),
  asyncHandler(StatusController.getSystemStatus, 'get system status'),
);

export { router as statusRouter };

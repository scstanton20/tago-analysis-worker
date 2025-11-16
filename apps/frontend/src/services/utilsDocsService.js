// services/utilsDocsService.js
import { createServiceLogger, createGetMethod } from '../utils/serviceFactory';

const logger = createServiceLogger('utilsDocsService');

export const utilsDocsService = {
  // Get utility documentation (OpenAPI spec)
  getDocs: createGetMethod(
    logger,
    'fetch utility documentation',
    '/utils-docs',
    {
      debugMessage: 'Fetching utility documentation',
      successMessage: 'Utility documentation fetched successfully',
      getSuccessParams: (result) => ({
        pathCount: Object.keys(result?.paths || {}).length,
      }),
    },
  ),
};

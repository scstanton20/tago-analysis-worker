// services/utilsDocsService.js
import { createServiceLogger, createGetMethod } from '@/utils/serviceFactory';

const logger = createServiceLogger('utilsDocsService');

export const utilsDocsService = {
  // Get overview (packages + utilities lists)
  getOverview: createGetMethod(logger, 'fetch utils overview', '/utils-docs', {
    debugMessage: 'Fetching utils overview',
    successMessage: 'Utils overview fetched successfully',
    getSuccessParams: (result) => ({
      packageCount: result?.packages?.length || 0,
      utilityCount: result?.utilities?.length || 0,
    }),
  }),

  // Get available packages
  getPackages: createGetMethod(
    logger,
    'fetch available packages',
    '/utils-docs/packages',
    {
      debugMessage: 'Fetching available packages',
      successMessage: 'Available packages fetched successfully',
      getSuccessParams: (result) => ({
        count: result?.length || 0,
      }),
    },
  ),

  // Get utility OpenAPI documentation
  getUtilities: createGetMethod(
    logger,
    'fetch utility documentation',
    '/utils-docs/utilities',
    {
      debugMessage: 'Fetching utility documentation',
      successMessage: 'Utility documentation fetched successfully',
      getSuccessParams: (result) => ({
        pathCount: Object.keys(result?.paths || {}).length,
      }),
    },
  ),
};

/**
 * Utils Documentation Domain Types
 *
 * Types for the available packages and utilities exposed to analysis scripts.
 */

/** An npm package available for import in analysis scripts */
export type AvailablePackage = {
  /** Package name (e.g. '@tago-io/sdk') */
  name: string;
  /** Example import statement */
  import: string;
  /** Human-readable description */
  description: string;
  /** URL to package documentation */
  docsUrl: string;
  /** Installed package version */
  packageVersion: string;
};

/** An in-process utility available via #tago-utils import */
export type AvailableUtility = {
  /** Utility name (e.g. 'mqAPI') */
  name: string;
  /** Example import statement */
  import: string;
  /** Human-readable description */
  description: string;
};

/** Complete utilities documentation response */
export type UtilsDocsResponse = {
  packages: ReadonlyArray<AvailablePackage>;
  utilities: ReadonlyArray<AvailableUtility>;
  openapi: object;
};

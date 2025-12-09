import { v4 as uuidv4 } from 'uuid';

/**
 * Generates a unique identifier (UUID v4).
 * Used for creating IDs for analyses, teams, folders, and other entities.
 * @returns {string} A UUID v4 string
 */
export function generateId() {
  return uuidv4();
}

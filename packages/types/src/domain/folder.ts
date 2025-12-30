/**
 * Folder and Tree Structure Types
 *
 * Represents the hierarchical organization of analyses within teams.
 */

/** Item types in team structure */
export type TeamStructureItemType = 'analysis' | 'folder';

/** Base structure item properties */
type TeamStructureItemBase = {
  /** Unique item ID */
  id: string;
  /** Discriminator for item type */
  type: TeamStructureItemType;
};

/** Analysis item in team structure */
export type AnalysisStructureItem = TeamStructureItemBase & {
  type: 'analysis';
};

/** Folder item in team structure */
export type FolderStructureItem = TeamStructureItemBase & {
  type: 'folder';
  /** Folder display name */
  name: string;
  /** Whether folder is expanded in UI */
  expanded?: boolean;
  /** Nested children (analyses and sub-folders) */
  items: Array<TeamStructureItem>;
};

/** Union of all team structure item types */
export type TeamStructureItem = AnalysisStructureItem | FolderStructureItem;

/** Team's hierarchical structure */
export type TeamStructure = {
  /** Root-level items */
  items: Array<TeamStructureItem>;
};

/** Map of team structures keyed by team ID */
export type TeamStructureMap = Record<string, TeamStructure>;

/** Reorder info for pending reorder operations */
export type ReorderInfo = {
  itemId: string;
  targetParentId: string | null;
  targetIndex: number;
};

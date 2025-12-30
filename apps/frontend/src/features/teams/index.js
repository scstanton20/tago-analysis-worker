// Teams feature - public API
export { teamService } from './api/teamService';

// Components
export { default as TeamListItem } from './components/TeamListItem';
export { default as TeamCreateForm } from './components/TeamCreateForm';
export { default as TeamColorPicker } from './components/TeamColorPicker';

// Hooks
export { useTeamManagement } from './hooks/useTeamManagement';
export { useVisibleTeams } from './hooks/useVisibleTeams';
export { useTreeDragDrop } from './hooks/useTreeDragDrop';

// Note: Modals are NOT exported here - they are lazy loaded via modals/registry.jsx
// Use modalService.openTeamManagement(), etc. to open modals

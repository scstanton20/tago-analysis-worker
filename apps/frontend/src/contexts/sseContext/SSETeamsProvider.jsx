import { useState, useCallback, useMemo } from 'react';
import PropTypes from 'prop-types';
import { TeamsContext } from './contexts/TeamsContext.js';
import logger from '../../utils/logger';
import { showInfo } from '../../utils/notificationService.jsx';

export function SSETeamsProvider({ children }) {
  const [teams, setTeams] = useState({});
  const [teamStructure, setTeamStructure] = useState({});
  const [teamStructureVersion, setTeamStructureVersion] = useState(0);

  const getTeam = useCallback(
    (teamId) => {
      return teams[teamId] || null;
    },
    [teams],
  );

  const getTeamNames = useCallback(() => {
    return Object.keys(teams);
  }, [teams]);

  // Event Handlers
  const handleInit = useCallback((data) => {
    let teamsObj = {};
    if (data.teams) {
      if (Array.isArray(data.teams)) {
        data.teams.forEach((team) => {
          teamsObj[team.id] = team;
        });
      } else {
        teamsObj = data.teams;
      }
    }

    setTeams(teamsObj);
    setTeamStructure(data.teamStructure || {});

    // Trigger permissions refresh after SSE state is updated
    // This ensures PermissionsContext has the latest team data
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('auth-change'));
    }, 100); // Small delay to ensure state updates are processed
  }, []);

  const handleTeamCreatedOrUpdated = useCallback((data) => {
    if (data.team) {
      setTeams((prev) => ({
        ...prev,
        [data.team.id]: data.team,
      }));
    }
  }, []);

  const handleTeamDeleted = useCallback((data) => {
    if (data.deleted) {
      logger.log('SSE: Team deleted:', data);
      setTeams((prev) => {
        const newTeams = { ...prev };
        delete newTeams[data.deleted];
        return newTeams;
      });
    }
  }, []);

  const handleTeamsReordered = useCallback((data) => {
    if (data.teams) {
      let teamsObj = {};
      if (Array.isArray(data.teams)) {
        data.teams.forEach((team) => {
          teamsObj[team.id] = team;
        });
      } else {
        teamsObj = data.teams;
      }
      setTeams(teamsObj);
    }
  }, []);

  const handleTeamStructureUpdated = useCallback((data) => {
    if (data.teamId && data.items) {
      setTeamStructure((prev) => ({
        ...prev,
        [data.teamId]: { items: data.items },
      }));
      setTeamStructureVersion((v) => v + 1);
    }
  }, []);

  const handleUserTeamsUpdated = useCallback((data) => {
    // Show notification to user about team changes
    if (data.data?.showNotification && data.data?.message) {
      showInfo(data.data.message, 'Team Access Updated', 5000);
    }

    // Note: Backend already sends a fresh 'init' message after team updates
    // via refreshInitDataForUser(), so we don't need to trigger 'auth-change'
    // which would clear PermissionsContext data and cause a race condition
    logger.log(
      'SSE: User teams updated - new init message will arrive with updated data',
    );
  }, []);

  // Message handler to be called by parent
  const handleMessage = useCallback(
    (data) => {
      switch (data.type) {
        case 'init':
          handleInit(data);
          break;
        case 'teamCreated':
        case 'teamUpdated':
          handleTeamCreatedOrUpdated(data);
          break;
        case 'teamDeleted':
          handleTeamDeleted(data);
          break;
        case 'teamsReordered':
          handleTeamsReordered(data);
          break;
        case 'teamStructureUpdated':
          handleTeamStructureUpdated(data);
          break;
        case 'userTeamsUpdated':
          handleUserTeamsUpdated(data);
          break;
        // Folder operations are handled by teamStructureUpdated
        case 'folderCreated':
        case 'folderUpdated':
        case 'folderDeleted':
          // No-op - structure updates handled by teamStructureUpdated
          break;
        default:
          break;
      }
    },
    [
      handleInit,
      handleTeamCreatedOrUpdated,
      handleTeamDeleted,
      handleTeamsReordered,
      handleTeamStructureUpdated,
      handleUserTeamsUpdated,
    ],
  );

  const value = useMemo(
    () => ({
      teams,
      teamStructure,
      teamStructureVersion,
      getTeam,
      getTeamNames,
      handleMessage,
    }),
    [
      teams,
      teamStructure,
      teamStructureVersion,
      getTeam,
      getTeamNames,
      handleMessage,
    ],
  );

  return (
    <TeamsContext.Provider value={value}>{children}</TeamsContext.Provider>
  );
}

SSETeamsProvider.propTypes = {
  children: PropTypes.node.isRequired,
};

// frontend/src/contexts/sseContext/teams/provider.jsx
import { useState, useCallback, useMemo } from 'react';
import PropTypes from 'prop-types';
import { SSETeamsContext } from './context';
import logger from '../../../utils/logger';

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
      // Import notifications dynamically to avoid circular dependencies
      import('@mantine/notifications').then(({ notifications }) => {
        notifications.show({
          title: 'Team Access Updated',
          message: data.data.message,
          color: 'blue',
          autoClose: 5000,
        });
      });
    }

    // When user's team assignments change, trigger auth refresh
    logger.log('SSE: User teams updated, triggering permissions refresh...');
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('auth-change'));
    }, 1000); // Small delay to let notification show
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
    <SSETeamsContext.Provider value={value}>
      {children}
    </SSETeamsContext.Provider>
  );
}

SSETeamsProvider.propTypes = {
  children: PropTypes.node.isRequired,
};

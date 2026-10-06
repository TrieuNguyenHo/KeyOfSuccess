import { useEffect, useState } from 'react';
import { api } from '../api.js';

// All teams of the department (any signed-in user may read them), for the team filter and team pickers.
export function useAllTeams() {
  const [teams, setTeams] = useState([]);
  useEffect(() => {
    api('/teams')
      .then(setTeams)
      .catch(() => {});
  }, []);
  return teams;
}

// The department's channels, for the channel filter.
export function useChannels() {
  const [channels, setChannels] = useState([]);
  useEffect(() => {
    api('/channels')
      .then(setChannels)
      .catch(() => {});
  }, []);
  return channels;
}

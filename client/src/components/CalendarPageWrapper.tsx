import React from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import CalendarPage from '@/pages/calendar';
import { resolveCalendarTeamId } from '@/lib/calendar-team-scope';

interface TeamSummary {
  id: string | number;
  name: string;
}

export default function CalendarPageWrapper() {
  const { teamId, teamName } = useParams();
  const {
    data: teams = [],
    isLoading,
    isError,
  } = useQuery<TeamSummary[]>({
    queryKey: ['/api/teams'],
  });

  const resolvedTeamId = resolveCalendarTeamId(teamId, teamName, teams);

  if (isLoading) {
    return <div className="p-6 text-sm text-slate-500">Loading team calendar...</div>;
  }

  if (isError || !resolvedTeamId) {
    return (
      <div className="p-6" role="alert">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Calendar unavailable</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          This team is not accessible or could not be resolved.
        </p>
      </div>
    );
  }

  return <CalendarPage teamId={resolvedTeamId} />;
}

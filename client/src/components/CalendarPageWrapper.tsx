import React from 'react';
import { useParams } from 'react-router-dom';
import CalendarPage from '@/pages/calendar';

export default function CalendarPageWrapper() {
  const { teamId, teamName } = useParams();
  // teamId가 없으면 teamName을 사용 (팀별 캘린더 라우트 대응)
  const id = teamId || teamName || '';
  return <CalendarPage teamId={id} />;
}

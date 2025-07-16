// 간단한 사용자 관리 시스템
interface User {
  id: string;
  name: string;
  teamId?: string;
}

// 로컬 스토리지에서 사용자 정보 관리
const USER_STORAGE_KEY = 'papyr-user';

export function getCurrentUser(): User {
  const stored = localStorage.getItem(USER_STORAGE_KEY);
  if (stored) {
    return JSON.parse(stored);
  }
  
  // 기본 사용자 생성
  const defaultUser: User = {
    id: `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    name: `User_${Math.random().toString(36).substr(2, 5)}`
  };
  
  localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(defaultUser));
  return defaultUser;
}

export function updateCurrentUser(user: Partial<User>): User {
  const current = getCurrentUser();
  const updated = { ...current, ...user };
  localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(updated));
  return updated;
}

export function setUserTeam(teamId: string): void {
  const current = getCurrentUser();
  updateCurrentUser({ teamId });
}

export function getUserName(): string {
  return getCurrentUser().name;
}

export function getUserId(): string {
  return getCurrentUser().id;
}

export function getUserTeamId(): string | undefined {
  return getCurrentUser().teamId;
} 
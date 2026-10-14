import { describe, expect, it } from 'vitest';
import {
  documentQueryKeyFromPath,
  resolveActiveWorkspace,
  resolveWorkspaceScope,
  teamNameFromPath,
} from '../../client/src/lib/active-workspace';

describe('active workspace resolution', () => {
  const teams = [
    { id: 10, name: 'alpha', displayName: 'Alpha Workspace' },
    { id: '20', name: 'beta', displayName: null },
  ];

  it('reads the team slug from team routes only', () => {
    expect(teamNameFromPath('/teams/alpha/pages')).toBe('alpha');
    expect(teamNameFromPath('/teams/alpha')).toBe('alpha');
    expect(teamNameFromPath('/page/alpha')).toBeNull();
    expect(teamNameFromPath('/')).toBeNull();
  });

  it('maps reader and editor routes to the query key of the open document', () => {
    expect(documentQueryKeyFromPath('/page/operations-handbook')).toBe(
      '/api/pages/slug/operations-handbook'
    );
    expect(documentQueryKeyFromPath('/page/operations-handbook/')).toBe(
      '/api/pages/slug/operations-handbook'
    );
    expect(documentQueryKeyFromPath('/edit/12')).toBe('/api/pages/12');
    expect(documentQueryKeyFromPath('/teams/alpha/create')).toBeNull();
    expect(documentQueryKeyFromPath('/dashboard')).toBeNull();
  });

  it('resolves a team route to display name and team-scoped paths', () => {
    expect(resolveActiveWorkspace('/teams/alpha/tasks', teams)).toEqual({
      name: 'alpha',
      displayName: 'Alpha Workspace',
      basePath: '/teams/alpha',
      documentsPath: '/teams/alpha/pages',
      createPath: '/teams/alpha/create',
    });
  });

  it('falls back to the slug when the display name is unavailable', () => {
    expect(resolveActiveWorkspace('/teams/beta/pages', teams)?.displayName).toBe('beta');
    expect(resolveActiveWorkspace('/teams/gamma/pages', undefined)?.displayName).toBe('gamma');
  });

  it('resolves reader and editor routes through the loaded document team id', () => {
    expect(resolveActiveWorkspace('/page/doc', teams, { teamId: 20 })?.name).toBe('beta');
    expect(resolveActiveWorkspace('/edit/7', teams, { teamId: '10' })?.documentsPath).toBe(
      '/teams/alpha/pages'
    );
  });

  it('reports personal scope only when it is known', () => {
    expect(resolveWorkspaceScope('/', teams).kind).toBe('personal');
    expect(resolveWorkspaceScope('/create', teams).kind).toBe('personal');
    expect(resolveWorkspaceScope('/page/doc', teams, { teamId: null }).kind).toBe('personal');
  });

  it('does not guess a workspace while loading, for inaccessible teams, or for tool routes', () => {
    expect(resolveWorkspaceScope('/page/doc', teams, null).kind).toBe('unknown');
    expect(resolveWorkspaceScope('/page/doc', teams, { teamId: 99 }).kind).toBe('unknown');
    expect(resolveWorkspaceScope('/page/doc', undefined, { teamId: 10 }).kind).toBe('unknown');
    expect(resolveWorkspaceScope('/dashboard', teams).kind).toBe('unknown');
    expect(resolveActiveWorkspace('/page/doc', teams, { teamId: 99 })).toBeNull();
  });
});

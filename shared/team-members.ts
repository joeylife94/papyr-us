/**
 * Limits of the "add member" search (WP2). The server enforces them
 * (GET /api/teams/:teamId/member-candidates); the screen reads the same numbers to say what it
 * does.
 */
/** A search shorter than this (after trimming) returns nothing. */
export const TEAM_CANDIDATE_MIN_QUERY_LENGTH = 2;
/** The most people one search returns. */
export const TEAM_CANDIDATE_LIMIT = 10;
/** The longest search the server accepts. */
export const TEAM_CANDIDATE_MAX_QUERY_LENGTH = 100;

/** The longest display name a team may have. */
export const TEAM_DISPLAY_NAME_MAX_LENGTH = 100;

import type { Express } from 'express';
import {
  requireAuthIfEnabled,
  requireTeamMembership,
  optionalAuth,
  type AuthRequest,
} from '../middleware.js';
import { config } from '../config.js';
import { insertCalendarEventSchema, updateCalendarEventSchema, type CalendarEvent } from '../../shared/schema.js';
import { DBStorage } from '../storage.js';
import { featureFlags } from '../features.js';

export function registerCalendarRoutes(app: Express, storage: DBStorage): void {
  if (featureFlags.FEATURE_CALENDAR) {
    // Calendar Events API
    app.get('/api/calendar', optionalAuth, requireTeamMembership, async (req: AuthRequest, res) => {
      try {
        const teamId = req.query.teamId as string | undefined;

        // If no teamId specified, scope to user's teams to prevent full data leak
        let events: CalendarEvent[];
        if (!teamId) {
          const userTeamIds = req.userTeamIds as number[] | undefined;
          if (userTeamIds && userTeamIds.length > 0) {
            const allEvents = await Promise.all(
              userTeamIds.map((id) => storage.getCalendarEvents(id))
            );
            events = allEvents.flat();
          } else {
            events = [];
          }
        } else {
          events = await storage.getCalendarEvents(Number(teamId));
        }

        // Ensure compatibility with new fields - add defaults if missing
        const safeEvents = events.map((event) => ({
          ...event,
          startTime: event.startTime || null,
          endTime: event.endTime || null,
          priority: event.priority || 1,
        }));

        res.json(safeEvents);
      } catch (error) {
        console.error('Error fetching calendar events:', error);
        res.status(500).json({ message: 'Server error' });
      }
    });

    app.get(
      '/api/calendar/:teamId',
      optionalAuth,
      requireTeamMembership,
      async (req: AuthRequest, res) => {
        try {
          const teamId = req.params.teamId;
          const events = await storage.getCalendarEvents(Number(teamId));

          // Ensure compatibility with new fields - add defaults if missing
          const safeEvents = events.map((event) => ({
            ...event,
            startTime: event.startTime || null,
            endTime: event.endTime || null,
            priority: event.priority || 1,
          }));

          res.json(safeEvents);
        } catch (error) {
          console.error('Error fetching calendar events:', error);
          res.status(500).json({ message: 'Server error' });
        }
      }
    );

    app.get('/api/calendar/event/:id', optionalAuth, async (req: AuthRequest, res) => {
      try {
        const id = parseInt(req.params.id);
        const event = await storage.getCalendarEvent(id);
        if (!event) {
          return res.status(404).json({ message: 'Event not found' });
        }

        // Verify the requester belongs to the event's team
        if (event.teamId && req.user?.id) {
          const userTeamIds = await storage.getUserTeamIds(req.user.id);
          if (!userTeamIds.includes(Number(event.teamId))) {
            return res.status(403).json({ message: 'You are not a member of this team' });
          }
        } else if (event.teamId && config.enforceAuthForWrites) {
          return res.status(401).json({ message: 'Authentication required' });
        }

        res.json(event);
      } catch (error) {
        res.status(500).json({ message: 'Server error' });
      }
    });

    app.post(
      '/api/calendar',
      requireAuthIfEnabled,
      requireTeamMembership,
      async (req: AuthRequest, res) => {
        try {
          // Convert ISO string dates to Date objects
          const requestData = { ...req.body };
          if (requestData.startDate && typeof requestData.startDate === 'string') {
            requestData.startDate = new Date(requestData.startDate);
          }
          if (requestData.endDate && typeof requestData.endDate === 'string') {
            requestData.endDate = new Date(requestData.endDate);
          }

          // If endDate is not provided or is null, set it to startDate
          if (!requestData.endDate && requestData.startDate) {
            requestData.endDate = new Date(requestData.startDate);
          }

          // Handle time fields - convert empty strings to null
          if (requestData.startTime === '' || requestData.startTime === undefined) {
            requestData.startTime = null;
          }
          if (requestData.endTime === '' || requestData.endTime === undefined) {
            requestData.endTime = null;
          }

          // Handle priority field - convert to integer and set default
          if (!requestData.priority || requestData.priority === undefined) {
            requestData.priority = 1;
          } else {
            requestData.priority = parseInt(requestData.priority);
          }

          const eventData = insertCalendarEventSchema.parse(requestData);
          const event = await storage.createCalendarEvent(eventData);
          res.status(201).json(event);
        } catch (error) {
          console.error('Calendar event creation error:', error);
          if (error instanceof Error && error.name === 'ZodError') {
            const zodError = error as Error & { errors?: unknown[] };
            return res.status(400).json({
              message: 'Invalid event data',
              errors: zodError.errors,
            });
          }
          res.status(400).json({ message: 'Invalid event data' });
        }
      }
    );

    app.patch('/api/calendar/event/:id', requireAuthIfEnabled, async (req: AuthRequest, res) => {
      try {
        const id = parseInt(req.params.id);

        // Verify team membership from the resource itself — never trust request-supplied teamId
        const existingEvent = await storage.getCalendarEvent(id);
        if (!existingEvent) {
          return res.status(404).json({ message: 'Event not found' });
        }
        if (req.user?.id) {
          const userTeamIds = await storage.getUserTeamIds(req.user.id);
          // Check membership on the current team (if event has one)
          if (existingEvent.teamId && !userTeamIds.includes(Number(existingEvent.teamId))) {
            return res.status(403).json({ message: 'You are not a member of this team' });
          }
          // Prevent cross-team reassignment — validate new teamId regardless of whether
          // the original event was team-scoped (blocks moving global events to unauthorized teams)
          const incomingTeamId = req.body.teamId;
          if (
            incomingTeamId !== undefined &&
            incomingTeamId !== null &&
            Number(incomingTeamId) !== Number(existingEvent.teamId)
          ) {
            if (!userTeamIds.includes(Number(incomingTeamId))) {
              return res.status(403).json({ message: 'You are not a member of the target team' });
            }
          }
        } else if (existingEvent.teamId && config.enforceAuthForWrites) {
          return res.status(401).json({ message: 'Authentication required' });
        }

        // Convert ISO string dates to Date objects (same logic as POST)
        const requestData = { ...req.body };
        if (requestData.startDate && typeof requestData.startDate === 'string') {
          requestData.startDate = new Date(requestData.startDate);
        }
        if (requestData.endDate && typeof requestData.endDate === 'string') {
          requestData.endDate = new Date(requestData.endDate);
        }

        // If endDate is not provided or is null, set it to startDate
        if (!requestData.endDate && requestData.startDate) {
          requestData.endDate = new Date(requestData.startDate);
        }

        // Handle time fields - convert empty strings to null
        if (requestData.startTime === '' || requestData.startTime === undefined) {
          requestData.startTime = null;
        }
        if (requestData.endTime === '' || requestData.endTime === undefined) {
          requestData.endTime = null;
        }

        // Handle priority field - convert to integer and set default
        if (!requestData.priority || requestData.priority === undefined) {
          requestData.priority = 1;
        } else {
          requestData.priority = parseInt(requestData.priority);
        }

        const updateData = updateCalendarEventSchema.parse(requestData);
        const event = await storage.updateCalendarEvent(id, updateData);
        if (!event) {
          return res.status(404).json({ message: 'Event not found' });
        }
        res.json(event);
      } catch (error) {
        console.error('Calendar event update error:', error);
        if (error instanceof Error && error.name === 'ZodError') {
          const zodError = error as Error & { errors?: unknown[] };
          return res.status(400).json({
            message: 'Invalid event data',
            errors: zodError.errors,
          });
        }
        res.status(400).json({ message: 'Invalid event data' });
      }
    });

    app.delete('/api/calendar/event/:id', requireAuthIfEnabled, async (req: AuthRequest, res) => {
      try {
        const id = parseInt(req.params.id);

        // Verify requester belongs to the event's team
        const event = await storage.getCalendarEvent(id);
        if (event?.teamId && req.user?.id) {
          const userTeamIds = await storage.getUserTeamIds(req.user.id);
          if (!userTeamIds.includes(Number(event.teamId))) {
            return res.status(403).json({ message: 'You are not a member of this team' });
          }
        }

        const deleted = await storage.deleteCalendarEvent(id);
        if (!deleted) {
          return res.status(404).json({ message: 'Event not found' });
        }
        res.status(204).send();
      } catch (error) {
        res.status(500).json({ message: 'Server error' });
      }
    });
  }
}

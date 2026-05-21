import type { Express } from 'express';
import {
  requireAuthIfEnabled,
  requireTeamMembership,
  optionalAuth,
  type AuthRequest,
} from '../middleware.js';
import { config } from '../config.js';
import { DBStorage } from '../storage.js';
import { featureFlags } from '../features.js';
import { executeWorkflow } from '../services/workflow.js';

export function registerWorkflowsRoutes(app: Express, storage: DBStorage): void {
  if (featureFlags.FEATURE_AUTOMATION) {
    const validateWorkflowActions = (actions: unknown) => {
      if (!Array.isArray(actions)) return null;

      for (const action of actions) {
        if (
          (action.type === 'webhook' || action.type === 'slack_webhook') &&
          (!action.config?.url || !String(action.config.url).trim())
        ) {
          return 'Webhook actions require a URL in config';
        }

        if (
          action.type === 'send_notification' &&
          (!action.config?.message || !String(action.config.message).trim())
        ) {
          return 'Notification actions require a message in config';
        }

        if (action.type === 'send_email') {
          const hasRecipients = !!(action.config?.to || action.config?.recipients);
          const hasSubject = !!String(action.config?.subject || '').trim();
          const hasBody = !!(action.config?.message || action.config?.body);
          if (!hasRecipients || !hasSubject || !hasBody) {
            return 'Email actions require recipients (to or recipients), subject, and message (or body) in config';
          }
        }
      }

      return null;
    };

    app.get(
      '/api/workflows',
      optionalAuth,
      requireTeamMembership,
      requireAuthIfEnabled,
      async (req: AuthRequest, res) => {
        try {
          const teamIdParam = req.query.teamId as string | undefined;
          let teamId: number | undefined;
          if (teamIdParam) {
            if (!isNaN(parseInt(teamIdParam))) {
              teamId = parseInt(teamIdParam);
            } else {
              const team = await storage.getTeamByName(teamIdParam);
              if (team) {
                teamId = team.id;
              }
            }
          }

          if (!teamId) {
            const userTeamIds = req.userTeamIds;
            if (userTeamIds && userTeamIds.length > 0) {
              const allWorkflows = await Promise.all(
                userTeamIds.map((tid) => storage.getWorkflows(tid))
              );
              return res.json(allWorkflows.flat());
            }
            return res.json([]);
          }

          const workflows = await storage.getWorkflows(teamId);
          res.json(workflows);
        } catch (error) {
          console.error('Error fetching workflows:', error);
          res.status(500).json({ error: 'Failed to fetch workflows' });
        }
      }
    );

    app.get('/api/workflows/:id', requireAuthIfEnabled, async (req: AuthRequest, res) => {
      try {
        const id = parseInt(req.params.id);
        const workflow = await storage.getWorkflow(id);
        if (!workflow) {
          return res.status(404).json({ error: 'Workflow not found' });
        }
        if (workflow.teamId && req.user?.id) {
          const userTeamIds = await storage.getUserTeamIds(req.user.id);
          if (!userTeamIds.includes(Number(workflow.teamId))) {
            return res.status(403).json({ message: 'You are not a member of this team' });
          }
        } else if (workflow.teamId && config.enforceAuthForWrites) {
          return res.status(401).json({ message: 'Authentication required' });
        }
        res.json(workflow);
      } catch (error) {
        console.error('Error fetching workflow:', error);
        res.status(500).json({ error: 'Failed to fetch workflow' });
      }
    });

    app.post('/api/workflows', requireAuthIfEnabled, requireTeamMembership, async (req, res) => {
      try {
        const workflowData = { ...req.body };
        if (
          workflowData.teamId &&
          typeof workflowData.teamId === 'string' &&
          isNaN(parseInt(workflowData.teamId))
        ) {
          const team = await storage.getTeamByName(workflowData.teamId);
          if (team) {
            workflowData.teamId = team.id;
          } else {
            return res.status(400).json({ error: 'Team not found' });
          }
        }
        const actionValidationError = validateWorkflowActions(workflowData.actions);
        if (actionValidationError) {
          return res.status(400).json({ error: actionValidationError });
        }
        const workflow = await storage.createWorkflow(workflowData);
        res.status(201).json(workflow);
      } catch (error) {
        console.error('Error creating workflow:', error);
        res.status(400).json({ error: 'Failed to create workflow' });
      }
    });

    app.put(
      '/api/workflows/:id',
      requireAuthIfEnabled,
      requireTeamMembership,
      async (req: AuthRequest, res) => {
        try {
          const id = parseInt(req.params.id);
          const existingWorkflow = await storage.getWorkflow(id);
          if (!existingWorkflow) {
            return res.status(404).json({ error: 'Workflow not found' });
          }
          if (existingWorkflow.teamId && req.user?.id) {
            const userTeamIds = await storage.getUserTeamIds(req.user.id);
            if (!userTeamIds.includes(Number(existingWorkflow.teamId))) {
              return res.status(403).json({ message: 'You are not a member of this team' });
            }
          } else if (existingWorkflow.teamId && config.enforceAuthForWrites) {
            return res.status(401).json({ message: 'Authentication required' });
          }
          const workflowData = { ...req.body };
          if (
            workflowData.teamId &&
            typeof workflowData.teamId === 'string' &&
            isNaN(parseInt(workflowData.teamId))
          ) {
            const team = await storage.getTeamByName(workflowData.teamId);
            if (team) {
              workflowData.teamId = team.id;
            } else {
              return res.status(400).json({ error: 'Team not found' });
            }
          }
          if (
            workflowData.teamId !== undefined &&
            workflowData.teamId !== null &&
            Number(workflowData.teamId) !== Number(existingWorkflow.teamId)
          ) {
            if (req.user?.id) {
              const userTeamIds = await storage.getUserTeamIds(req.user.id);
              if (!userTeamIds.includes(Number(workflowData.teamId))) {
                return res.status(403).json({ message: 'You are not a member of the target team' });
              }
            } else if (config.enforceAuthForWrites) {
              return res.status(401).json({ message: 'Authentication required' });
            }
          }
          const actionValidationError = validateWorkflowActions(workflowData.actions);
          if (actionValidationError) {
            return res.status(400).json({ error: actionValidationError });
          }
          const workflow = await storage.updateWorkflow(id, workflowData);
          if (!workflow) {
            return res.status(404).json({ error: 'Workflow not found' });
          }
          res.json(workflow);
        } catch (error) {
          console.error('Error updating workflow:', error);
          res.status(400).json({ error: 'Failed to update workflow' });
        }
      }
    );

    app.delete('/api/workflows/:id', requireAuthIfEnabled, async (req: AuthRequest, res) => {
      try {
        const id = parseInt(req.params.id);
        const existingWorkflow = await storage.getWorkflow(id);
        if (!existingWorkflow) {
          return res.status(404).json({ error: 'Workflow not found' });
        }
        if (existingWorkflow.teamId && req.user?.id) {
          const userTeamIds = await storage.getUserTeamIds(req.user.id);
          if (!userTeamIds.includes(Number(existingWorkflow.teamId))) {
            return res.status(403).json({ message: 'You are not a member of this team' });
          }
        } else if (existingWorkflow.teamId && config.enforceAuthForWrites) {
          return res.status(401).json({ message: 'Authentication required' });
        }
        const success = await storage.deleteWorkflow(id);
        if (!success) {
          return res.status(404).json({ error: 'Workflow not found' });
        }
        res.status(204).send();
      } catch (error) {
        console.error('Error deleting workflow:', error);
        res.status(500).json({ error: 'Failed to delete workflow' });
      }
    });

    app.post('/api/workflows/:id/toggle', requireAuthIfEnabled, async (req: AuthRequest, res) => {
      try {
        const id = parseInt(req.params.id);
        const existingWorkflow = await storage.getWorkflow(id);
        if (!existingWorkflow) {
          return res.status(404).json({ error: 'Workflow not found' });
        }
        if (existingWorkflow.teamId && req.user?.id) {
          const userTeamIds = await storage.getUserTeamIds(req.user.id);
          if (!userTeamIds.includes(Number(existingWorkflow.teamId))) {
            return res.status(403).json({ message: 'You are not a member of this team' });
          }
        } else if (existingWorkflow.teamId && config.enforceAuthForWrites) {
          return res.status(401).json({ message: 'Authentication required' });
        }
        const { isActive } = req.body;
        const workflow = await storage.toggleWorkflow(id, isActive);
        if (!workflow) {
          return res.status(404).json({ error: 'Workflow not found' });
        }
        res.json(workflow);
      } catch (error) {
        console.error('Error toggling workflow:', error);
        res.status(500).json({ error: 'Failed to toggle workflow' });
      }
    });

    app.post('/api/workflows/:id/test', requireAuthIfEnabled, async (req: AuthRequest, res) => {
      try {
        const id = parseInt(req.params.id);
        const workflow = await storage.getWorkflow(id);
        if (!workflow) {
          return res.status(404).json({ error: 'Workflow not found' });
        }
        if (workflow.teamId && req.user?.id) {
          const userTeamIds = await storage.getUserTeamIds(req.user.id);
          if (!userTeamIds.includes(Number(workflow.teamId))) {
            return res.status(403).json({ message: 'You are not a member of this team' });
          }
        } else if (workflow.teamId && config.enforceAuthForWrites) {
          return res.status(401).json({ message: 'Authentication required' });
        }
        const triggerData = req.body.triggerData || {};
        const run = await executeWorkflow(workflow, triggerData);
        res.json({ dryRun: true, run });
      } catch (error) {
        console.error('Error testing workflow:', error);
        res.status(500).json({ error: 'Failed to test workflow' });
      }
    });

    app.get('/api/workflows/:id/runs', requireAuthIfEnabled, async (req: AuthRequest, res) => {
      try {
        const id = parseInt(req.params.id);
        const existingWorkflow = await storage.getWorkflow(id);
        if (!existingWorkflow) {
          return res.status(404).json({ error: 'Workflow not found' });
        }
        if (existingWorkflow.teamId && req.user?.id) {
          const userTeamIds = await storage.getUserTeamIds(req.user.id);
          if (!userTeamIds.includes(Number(existingWorkflow.teamId))) {
            return res.status(403).json({ message: 'You are not a member of this team' });
          }
        } else if (existingWorkflow.teamId && config.enforceAuthForWrites) {
          return res.status(401).json({ message: 'Authentication required' });
        }
        const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
        const runs = await storage.getWorkflowRuns(id, limit);
        res.json(runs);
      } catch (error) {
        console.error('Error fetching workflow runs:', error);
        res.status(500).json({ error: 'Failed to fetch workflow runs' });
      }
    });
  }
}

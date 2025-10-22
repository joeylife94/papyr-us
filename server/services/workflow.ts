import type {
  Workflow,
  WorkflowRun,
  WorkflowTrigger,
  WorkflowAction,
  WorkflowCondition,
  TriggerType,
} from '@shared/schema';
import { getStorage } from '../storage.js';
import * as aiService from './ai.js';

const storage = getStorage();

// Variable substitution helper
function substituteVariables(template: string, variables: Record<string, any>): string {
  let result = template;
  Object.entries(variables).forEach(([key, value]) => {
    const regex = new RegExp(`{{${key}}}`, 'g');
    result = result.replace(regex, String(value));
  });
  return result;
}

// Evaluate conditions
function evaluateConditions(
  conditions: WorkflowCondition[],
  context: Record<string, any>
): boolean {
  if (!conditions || conditions.length === 0) return true;

  return conditions.every((condition) => {
    const fieldValue = getNestedValue(context, condition.field);

    switch (condition.operator) {
      case 'equals':
        return fieldValue === condition.value;
      case 'not_equals':
        return fieldValue !== condition.value;
      case 'contains':
        return String(fieldValue).toLowerCase().includes(String(condition.value).toLowerCase());
      case 'greater_than':
        return Number(fieldValue) > Number(condition.value);
      case 'less_than':
        return Number(fieldValue) < Number(condition.value);
      case 'in':
        return Array.isArray(condition.value) && condition.value.includes(fieldValue);
      case 'not_in':
        return Array.isArray(condition.value) && !condition.value.includes(fieldValue);
      default:
        return false;
    }
  });
}

// Get nested object value by dot notation
function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

// Execute a single action
async function executeAction(
  action: WorkflowAction,
  context: Record<string, any>
): Promise<{ success: boolean; result?: any; error?: string }> {
  try {
    const config = action.config;

    // Substitute variables if enabled
    const processedConfig = config.useVariables
      ? JSON.parse(substituteVariables(JSON.stringify(config), context))
      : config;

    switch (action.type) {
      case 'send_notification':
        // Create notifications for recipients
        const recipients = processedConfig.recipients || [];
        const content =
          processedConfig.message || processedConfig.content || 'Workflow notification';
        const title = processedConfig.title || 'Workflow Alert';

        const notifications: any[] = [];
        for (const recipientId of recipients) {
          try {
            const notification = await storage.createNotification({
              recipientId,
              type: 'system',
              title,
              content,
              isRead: false,
            });
            notifications.push(notification);
          } catch (error) {
            console.error(`Failed to create notification for recipient ${recipientId}:`, error);
          }
        }

        return {
          success: notifications.length > 0,
          result: { sent: notifications.length, notifications },
        };

      case 'create_task':
        const newTask = await storage.createTask({
          title: processedConfig.title || 'New Task',
          description: processedConfig.description || '',
          status: processedConfig.status || 'todo',
          priority: processedConfig.priority || 'medium',
          assignedTo: processedConfig.assignedTo,
          dueDate: processedConfig.dueDate ? new Date(processedConfig.dueDate) : undefined,
          teamId: context.trigger?.teamId,
        });
        return { success: true, result: newTask };

      case 'update_task':
        if (!context.trigger?.id) {
          return { success: false, error: 'No task ID in context' };
        }
        const updatedTask = await storage.updateTask(context.trigger.id, {
          status: processedConfig.status,
          priority: processedConfig.priority,
          assignedTo: processedConfig.assignedTo,
          dueDate: processedConfig.dueDate ? new Date(processedConfig.dueDate) : undefined,
        });
        return { success: true, result: updatedTask };

      case 'create_page':
        const newPage = await storage.createWikiPage({
          title: processedConfig.title || 'New Page',
          slug: processedConfig.title?.toLowerCase().replace(/\s+/g, '-') || `page-${Date.now()}`,
          content: processedConfig.content || '',
          folder: processedConfig.folder || 'docs',
          tags: processedConfig.tags || [],
          author: context.trigger?.author || 'automation',
          teamId: context.trigger?.teamId,
        });
        return { success: true, result: newPage };

      case 'add_comment':
        if (!context.trigger?.id) {
          return { success: false, error: 'No page ID in context' };
        }
        const comment = await storage.createComment({
          pageId: context.trigger.id,
          author: 'Automation Bot',
          content: processedConfig.message || 'Automated comment',
          parentId: null,
        });
        return { success: true, result: comment };

      case 'add_tag':
        if (!context.trigger?.id || !processedConfig.tags) {
          return { success: false, error: 'Missing page ID or tags' };
        }
        // Fetch current page using searchWikiPages
        const searchResult = await storage.searchWikiPages({ query: '', limit: 1000, offset: 0 });
        const page = searchResult.pages.find((p: any) => p.id === context.trigger.id);
        if (!page) {
          return { success: false, error: 'Page not found' };
        }
        // Add new tags
        const updatedTags = Array.from(new Set([...page.tags, ...processedConfig.tags]));
        await storage.updateWikiPage(context.trigger.id, { tags: updatedTags });
        return { success: true, result: { tags: updatedTags } };

      case 'run_ai_summary':
        if (!context.trigger?.content) {
          return { success: false, error: 'No content to summarize' };
        }
        const summary = await aiService.summarizeContent(context.trigger.content);
        return { success: true, result: { summary } };

      case 'webhook':
        const response = await fetch(processedConfig.url || '', {
          method: processedConfig.method || 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...processedConfig.headers,
          },
          body: JSON.stringify(processedConfig.body || context),
        });
        const data = await response.json();
        return { success: response.ok, result: data };

      case 'send_email':
        // TODO: Implement email service
        console.log('Email:', processedConfig.message, 'to', processedConfig.recipients);
        return { success: true, result: { sent: true } };

      case 'assign_task':
        if (!context.trigger?.id) {
          return { success: false, error: 'No task ID in context' };
        }
        await storage.updateTask(context.trigger.id, {
          assignedTo: processedConfig.assignedTo,
        });
        return { success: true, result: { assignedTo: processedConfig.assignedTo } };

      case 'move_page':
        if (!context.trigger?.id) {
          return { success: false, error: 'No page ID in context' };
        }
        await storage.updateWikiPage(context.trigger.id, {
          folder: processedConfig.folder,
        });
        return { success: true, result: { folder: processedConfig.folder } };

      default:
        return { success: false, error: `Unknown action type: ${action.type}` };
    }
  } catch (error) {
    console.error('Action execution error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// Execute a complete workflow
export async function executeWorkflow(
  workflow: Workflow,
  triggerData: Record<string, any>
): Promise<WorkflowRun> {
  const runId = await storage.createWorkflowRun({
    workflowId: workflow.id,
    status: 'running',
    triggerData,
  });

  try {
    // Build context
    const context = {
      workflow: {
        id: workflow.id,
        name: workflow.name,
      },
      trigger: triggerData,
    };

    // Evaluate conditions
    const conditions = workflow.conditions as WorkflowCondition[];
    if (!evaluateConditions(conditions, context)) {
      await storage.updateWorkflowRun(runId, {
        status: 'success',
        results: [{ skipped: true, reason: 'Conditions not met' }],
        completedAt: new Date(),
      });
      return await storage.getWorkflowRun(runId);
    }

    // Execute actions sequentially
    const actions = workflow.actions as WorkflowAction[];
    const results: any[] = [];

    for (const action of actions) {
      const result = await executeAction(action, context);
      results.push({
        action: action.type,
        ...result,
      });

      if (!result.success) {
        // Stop on first failure
        await storage.updateWorkflowRun(runId, {
          status: 'failed',
          results,
          error: result.error,
          completedAt: new Date(),
        });
        return await storage.getWorkflowRun(runId);
      }

      // Update context with action results
      const contextAny = context as any;
      contextAny[`action_${results.length - 1}`] = result.result;
    }

    // Mark as success
    await storage.updateWorkflowRun(runId, {
      status: 'success',
      results,
      completedAt: new Date(),
    });

    return await storage.getWorkflowRun(runId);
  } catch (error) {
    console.error('Workflow execution error:', error);
    await storage.updateWorkflowRun(runId, {
      status: 'failed',
      error: error instanceof Error ? error.message : 'Unknown error',
      completedAt: new Date(),
    });
    return await storage.getWorkflowRun(runId);
  }
}

// Trigger workflows based on event type
export async function triggerWorkflows(
  triggerType: TriggerType,
  data: Record<string, any>
): Promise<void> {
  try {
    // Get all active workflows for this trigger type
    const workflows = await storage.getActiveWorkflowsByTrigger(triggerType, data.teamId);

    // Execute each workflow
    for (const workflow of workflows) {
      const trigger = workflow.trigger as WorkflowTrigger;

      // Check if trigger config matches
      if (shouldTriggerWorkflow(trigger, triggerType, data)) {
        // Execute workflow in background (don't await)
        executeWorkflow(workflow, data).catch((error) => {
          console.error(`Failed to execute workflow ${workflow.id}:`, error);
        });
      }
    }
  } catch (error) {
    console.error('Failed to trigger workflows:', error);
  }
}

// Check if workflow should be triggered based on config
function shouldTriggerWorkflow(
  trigger: WorkflowTrigger,
  eventType: TriggerType,
  data: Record<string, any>
): boolean {
  if (trigger.type !== eventType) return false;

  const config = trigger.config;

  // Check folder filter
  if (config.folder && data.folder !== config.folder) return false;

  // Check tags filter
  if (config.tags && config.tags.length > 0) {
    const dataTags = data.tags || [];
    const hasMatchingTag = config.tags.some((tag) => dataTags.includes(tag));
    if (!hasMatchingTag) return false;
  }

  // Check status transition (for task_status_changed)
  if (eventType === 'task_status_changed') {
    if (config.fromStatus && data.oldStatus !== config.fromStatus) return false;
    if (config.toStatus && data.newStatus !== config.toStatus) return false;
  }

  return true;
}

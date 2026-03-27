import type {
  Workflow,
  WorkflowRun,
  WorkflowTrigger,
  WorkflowAction,
  WorkflowCondition,
  TriggerType,
} from '@shared/schema';
import type { DBStorage } from '../storage.js';
import * as aiService from './ai.js';
import { sendEmail, isEmailConfigured } from './email.js';
import logger from './logger.js';
import { fetchWithRetry, ExternalIntegrationError } from './resilience.js';

let _storage: DBStorage | null = null;

/** Initialize the workflow service with a shared storage instance */
export function initWorkflowService(storageInstance: DBStorage) {
  _storage = storageInstance;
}

function getWorkflowStorage(): DBStorage {
  if (!_storage) {
    // Lazy fallback — import getStorage only when not yet initialized
    const { getStorage } = require('../storage.js');
    _storage = getStorage();
  }
  if (!_storage) {
    throw new Error('Workflow storage not initialized. Call initWorkflowService first.');
  }
  return _storage;
}

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
            const notification = await getWorkflowStorage().createNotification({
              recipientId,
              type: 'system',
              title,
              content,
              isRead: false,
            });
            notifications.push(notification);
          } catch (error) {
            logger.error('Failed to create notification for recipient', {
              recipientId,
              error: error instanceof Error ? error.message : 'Unknown error',
            });
          }
        }

        return {
          success: notifications.length > 0,
          result: { sent: notifications.length, notifications },
        };

      case 'create_task':
        const newTask = await getWorkflowStorage().createTask({
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
        const updatedTask = await getWorkflowStorage().updateTask(context.trigger.id, {
          status: processedConfig.status,
          priority: processedConfig.priority,
          assignedTo: processedConfig.assignedTo,
          dueDate: processedConfig.dueDate ? new Date(processedConfig.dueDate) : undefined,
        });
        return { success: true, result: updatedTask };

      case 'create_page':
        const newPage = await getWorkflowStorage().createWikiPage({
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
        const comment = await getWorkflowStorage().createComment({
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
        const searchResult = await getWorkflowStorage().searchWikiPages({
          query: '',
          limit: 1000,
          offset: 0,
        });
        const page = searchResult.pages.find((p: any) => p.id === context.trigger.id);
        if (!page) {
          return { success: false, error: 'Page not found' };
        }
        // Add new tags
        const updatedTags = Array.from(new Set([...page.tags, ...processedConfig.tags]));
        await getWorkflowStorage().updateWikiPage(context.trigger.id, { tags: updatedTags });
        return { success: true, result: { tags: updatedTags } };

      case 'run_ai_summary':
        if (!context.trigger?.content) {
          return { success: false, error: 'No content to summarize' };
        }
        const summary = await aiService.summarizeContent(context.trigger.content);
        return { success: true, result: { summary } };

      case 'webhook': {
        // 5-second timeout; retries on 429/5xx with exponential backoff; throws on exhaustion.
        const webhookUrl = processedConfig.url || '';
        if (!webhookUrl) {
          return { success: false, error: 'webhook requires a url in config' };
        }
        const webhookResponse = await fetchWithRetry(
          webhookUrl,
          {
            method: processedConfig.method || 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...processedConfig.headers,
            },
            body: JSON.stringify(processedConfig.body || context),
          },
          { timeoutMs: 5_000, serviceName: 'webhook' }
        );
        if (!webhookResponse.ok) {
          throw new Error(`Webhook failed with status: ${webhookResponse.status}`);
        }
        const webhookData = await webhookResponse.json().catch(() => ({}));
        return { success: true, result: webhookData };
      }

      case 'slack_webhook': {
        if (!processedConfig.url) {
          return { success: false, error: 'slack_webhook requires a url in config' };
        }
        const slackPayload = {
          text: processedConfig.text || processedConfig.message || JSON.stringify(context),
          ...(processedConfig.channel && { channel: processedConfig.channel }),
          ...(processedConfig.username && { username: processedConfig.username }),
          ...(processedConfig.icon_emoji && { icon_emoji: processedConfig.icon_emoji }),
          ...(processedConfig.blocks && { blocks: processedConfig.blocks }),
        };
        // 5-second timeout; retries on 429/5xx with exponential backoff; throws on exhaustion.
        const slackResponse = await fetchWithRetry(
          processedConfig.url,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(slackPayload),
          },
          { timeoutMs: 5_000, serviceName: 'slack_webhook' }
        );
        if (!slackResponse.ok) {
          throw new Error(`Slack webhook failed with status: ${slackResponse.status}`);
        }
        return { success: true, result: { delivered: true } };
      }

      case 'send_email': {
        // Real outbound email integration via SMTP (nodemailer).
        // Requires: EMAIL_HOST, EMAIL_USER, EMAIL_PASS in environment.
        //
        // Fail-Fast contract:
        //   - If SMTP is not configured — throws ExternalIntegrationError immediately.
        //   - If SMTP send fails    — throws ExternalIntegrationError; no silent fallback
        //     to in-app notifications.  The caller (executeWorkflow) records the run as
        //     failed with the exact reason.
        const rawRecipients = processedConfig.to ?? processedConfig.recipients;
        const emailTo: string[] = Array.isArray(rawRecipients)
          ? rawRecipients.map(String)
          : typeof rawRecipients === 'string'
            ? rawRecipients
                .split(',')
                .map((s: string) => s.trim())
                .filter(Boolean)
            : [];
        const emailSubject: string = processedConfig.subject || 'Workflow Notification';
        const emailBody: string = processedConfig.message || processedConfig.body || '';

        if (emailTo.length === 0) {
          return {
            success: false,
            error: 'send_email requires at least one recipient in config.to or config.recipients',
          };
        }

        if (!isEmailConfigured()) {
          throw new ExternalIntegrationError('email', {
            message:
              'send_email: SMTP is not configured. ' +
              'Set EMAIL_HOST, EMAIL_USER, and EMAIL_PASS to enable outbound email.',
          });
        }

        const emailResult = await sendEmail({
          to: emailTo,
          subject: emailSubject,
          text: emailBody,
          html: processedConfig.html || undefined,
        });

        if (emailResult.sent) {
          return {
            success: true,
            result: { sent: emailTo.length, messageId: emailResult.messageId, via: 'smtp' },
          };
        }

        // SMTP send failed — fail-fast, no silent fallback.
        throw new ExternalIntegrationError('email', {
          message: `SMTP send failed: ${emailResult.error ?? 'unknown error'}`,
        });
      }

      case 'assign_task':
        if (!context.trigger?.id) {
          return { success: false, error: 'No task ID in context' };
        }
        await getWorkflowStorage().updateTask(context.trigger.id, {
          assignedTo: processedConfig.assignedTo,
        });
        return { success: true, result: { assignedTo: processedConfig.assignedTo } };

      case 'move_page':
        if (!context.trigger?.id) {
          return { success: false, error: 'No page ID in context' };
        }
        await getWorkflowStorage().updateWikiPage(context.trigger.id, {
          folder: processedConfig.folder,
        });
        return { success: true, result: { folder: processedConfig.folder } };

      default:
        return { success: false, error: `Unknown action type: ${action.type}` };
    }
  } catch (error) {
    if (error instanceof ExternalIntegrationError) {
      // Transient external-service failure — log and re-throw so executeWorkflow's
      // catch can record the run as failed and then propagate to executeWorkflowWithRetry.
      logger.error('Action execution error', {
        actionType: action.type,
        errorType: 'ExternalIntegrationError',
        serviceName: error.serviceName,
        statusCode: error.statusCode,
        attempts: error.attempts,
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
    logger.error('Action execution error', {
      actionType: action.type,
      errorType: 'InternalError',
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
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
  const runId = await getWorkflowStorage().createWorkflowRun({
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
      await getWorkflowStorage().updateWorkflowRun(runId, {
        status: 'success',
        results: [{ skipped: true, reason: 'Conditions not met' }],
        completedAt: new Date(),
      });
      return await getWorkflowStorage().getWorkflowRun(runId);
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
        await getWorkflowStorage().updateWorkflowRun(runId, {
          status: 'failed',
          results,
          error: result.error,
          completedAt: new Date(),
        });
        return await getWorkflowStorage().getWorkflowRun(runId);
      }

      // Update context with action results
      const contextAny = context as any;
      contextAny[`action_${results.length - 1}`] = result.result;
    }

    // Mark as success
    await getWorkflowStorage().updateWorkflowRun(runId, {
      status: 'success',
      results,
      completedAt: new Date(),
    });

    return await getWorkflowStorage().getWorkflowRun(runId);
  } catch (error) {
    logger.error('Workflow execution error:', {
      workflowId: workflow.id,
      workflowName: workflow.name,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    await getWorkflowStorage().updateWorkflowRun(runId, {
      status: 'failed',
      error: error instanceof Error ? error.message : 'Unknown error',
      completedAt: new Date(),
    });
    // Re-throw so executeWorkflowWithRetry can catch and apply exponential backoff.
    throw error;
  }
}

/**
 * Execute workflow with automatic retry logic
 */
async function executeWorkflowWithRetry(
  workflow: Workflow,
  triggerData: Record<string, any>,
  maxRetries = 3
): Promise<void> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await executeWorkflow(workflow, triggerData);
      return; // Success - exit retry loop
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      logger.warn('Workflow execution failed, will retry:', {
        workflowId: workflow.id,
        workflowName: workflow.name,
        attempt,
        maxRetries,
        error: lastError.message,
      });

      // Exponential backoff: wait 2^attempt seconds before retry
      if (attempt < maxRetries) {
        const delayMs = Math.pow(2, attempt) * 1000;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  // All retries exhausted - log final failure
  logger.error('Workflow execution failed after all retries:', {
    workflowId: workflow.id,
    workflowName: workflow.name,
    maxRetries,
    error: lastError?.message,
    stack: lastError?.stack,
  });
}

// Trigger workflows based on event type
export async function triggerWorkflows(
  triggerType: TriggerType,
  data: Record<string, any>
): Promise<void> {
  try {
    // Get all active workflows for this trigger type
    const workflows = await getWorkflowStorage().getActiveWorkflowsByTrigger(
      triggerType,
      data.teamId
    );

    if (!Array.isArray(workflows)) {
      return;
    }

    // Execute each workflow
    for (const workflow of workflows) {
      const trigger = workflow.trigger as WorkflowTrigger;

      // Check if trigger config matches
      if (shouldTriggerWorkflow(trigger, triggerType, data)) {
        // Execute workflow with retry in background (don't await)
        executeWorkflowWithRetry(workflow, data).catch((error) => {
          logger.error('Failed to execute workflow', {
            workflowId: workflow.id,
            workflowName: workflow.name,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        });
      }
    }
  } catch (error) {
    logger.error('Failed to trigger workflows:', {
      triggerType,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
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

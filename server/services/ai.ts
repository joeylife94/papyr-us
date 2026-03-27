import OpenAI from 'openai';
import logger from './logger.js';
import { ExternalIntegrationError } from './resilience.js';

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const apiKey = process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY_ENV_VAR;

// OpenAI client — only initialized if API key is available.
// timeout: hard abort after 15 s (production SLA).
// maxRetries: SDK will retry up to 3 times with exponential backoff on 429 / 5xx before
//   propagating the error, which we then convert to ExternalIntegrationError.
const openai = apiKey
  ? new OpenAI({
      apiKey,
      timeout: 15_000,
      maxRetries: 3,
    })
  : null;

// Helper to check if AI features are available
export function isAIAvailable(): boolean {
  return openai !== null;
}

// Helper to get OpenAI client with availability check
function getOpenAI(): OpenAI {
  if (!openai) {
    throw new Error(
      'AI features are not available. Please configure OPENAI_API_KEY environment variable.'
    );
  }
  return openai;
}

export interface ContentSuggestion {
  type: 'section' | 'improvement' | 'related';
  title: string;
  description: string;
  content?: string;
}

export interface ContentSummary {
  summary: string;
  keyPoints: string[];
  readingTime: number;
}

export async function generateContentSuggestions(
  content: string,
  title: string
): Promise<ContentSuggestion[]> {
  try {
    const prompt = `Analyze the following wiki page content and suggest improvements or additional sections that would enhance the documentation. Focus on practical, actionable suggestions.

Title: ${title}
Content: ${content}

Respond with JSON in this format: {
  "suggestions": [
    {
      "type": "section|improvement|related",
      "title": "Suggestion title",
      "description": "Brief description of the suggestion"
    }
  ]
}`;

    const response = await getOpenAI().chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content:
            'You are an expert technical writer and documentation specialist. Provide helpful, specific suggestions for improving wiki content.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 1000,
    });

    const result = JSON.parse(response.choices[0].message.content || '{"suggestions": []}');
    return result.suggestions || [];
  } catch (error) {
    logger.error('[AI] generateContentSuggestions failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new ExternalIntegrationError('openai', {
      message: 'Failed to generate content suggestions',
      cause: error instanceof Error ? error : new Error(String(error)),
    });
  }
}

export async function summarizeContent(content: string): Promise<ContentSummary> {
  try {
    const prompt = `Summarize the following wiki content and extract key points. Also estimate reading time in minutes.

Content: ${content}

Respond with JSON in this format: {
  "summary": "Brief summary of the content",
  "keyPoints": ["Point 1", "Point 2", "Point 3"],
  "readingTime": 5
}`;

    const response = await getOpenAI().chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content:
            'You are an expert at summarizing technical documentation. Provide clear, concise summaries with key takeaways.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 500,
    });

    const result = JSON.parse(
      response.choices[0].message.content || '{"summary": "", "keyPoints": [], "readingTime": 0}'
    );
    return {
      summary: result.summary || '',
      keyPoints: result.keyPoints || [],
      readingTime: result.readingTime || Math.ceil(content.split(' ').length / 200), // fallback: ~200 words per minute
    };
  } catch (error) {
    logger.error('[AI] summarizeContent failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new ExternalIntegrationError('openai', {
      message: 'Failed to summarize content',
      cause: error instanceof Error ? error : new Error(String(error)),
    });
  }
}

export async function generateContent(
  prompt: string,
  type: 'page' | 'section' = 'section'
): Promise<string> {
  try {
    const systemPrompt =
      type === 'page'
        ? 'You are an expert technical writer. Generate well-structured markdown content for wiki pages. Use proper headings, formatting, and include practical examples where appropriate.'
        : 'You are an expert technical writer. Generate a well-structured markdown section that can be added to existing documentation. Focus on clarity and usefulness.';

    const response = await getOpenAI().chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      max_tokens: 2000,
    });

    return response.choices[0].message.content || '';
  } catch (error) {
    logger.error('[AI] generateContent failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new ExternalIntegrationError('openai', {
      message: 'Failed to generate content',
      cause: error instanceof Error ? error : new Error(String(error)),
    });
  }
}

export interface SearchResult {
  id: number;
  title: string;
  content: string;
  relevance: number;
  matchedTerms: string[];
  summary: string;
  type: 'page' | 'task' | 'file';
  url: string;
}

export async function smartSearch(
  query: string,
  documents: Array<{
    id: number;
    title: string;
    content: string;
    type: 'page' | 'task' | 'file';
    url: string;
  }>
): Promise<SearchResult[]> {
  try {
    const prompt = `Analyze the following search query and documents to find the most relevant matches. Consider semantic meaning, context, and user intent.

Search Query: "${query}"

Available Documents:
${documents
  .map(
    (doc, index) => `${index + 1}. ${doc.title} (${doc.type})
   Content: ${doc.content.substring(0, 500)}...`
  )
  .join('\n')}

Respond with JSON in this format: {
  "results": [
    {
      "documentIndex": 0,
      "relevance": 0.95,
      "matchedTerms": ["term1", "term2"],
      "summary": "Brief explanation of why this document is relevant"
    }
  ]
}

Rank by relevance (0.0-1.0) and provide specific matched terms and reasoning.`;

    const response = await getOpenAI().chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content:
            'You are an expert search and information retrieval specialist. Analyze search queries and documents to find the most relevant matches based on semantic meaning and user intent.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 1500,
    });

    const result = JSON.parse(response.choices[0].message.content || '{"results": []}');

    return result.results
      .map((item: any) => {
        const doc = documents[item.documentIndex];
        return {
          id: doc.id,
          title: doc.title,
          content: doc.content,
          relevance: item.relevance || 0,
          matchedTerms: item.matchedTerms || [],
          summary: item.summary || '',
          type: doc.type,
          url: doc.url,
        };
      })
      .sort((a: SearchResult, b: SearchResult) => b.relevance - a.relevance);
  } catch (error) {
    logger.error('[AI] smartSearch failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new ExternalIntegrationError('openai', {
      message: 'AI smart search failed',
      cause: error instanceof Error ? error : new Error(String(error)),
    });
  }
}

export async function generateSearchSuggestions(query: string): Promise<string[]> {
  try {
    const prompt = `Given the search query "${query}", suggest 5 related search terms or phrases that might help the user find what they're looking for. Consider synonyms, related concepts, and alternative phrasings.

Respond with JSON in this format: {
  "suggestions": ["suggestion1", "suggestion2", "suggestion3", "suggestion4", "suggestion5"]
}`;

    const response = await getOpenAI().chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content:
            "You are an expert at understanding search intent and suggesting related search terms. Provide helpful, relevant suggestions that expand on the user's query.",
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 300,
    });

    const result = JSON.parse(response.choices[0].message.content || '{"suggestions": []}');
    return result.suggestions || [];
  } catch (error) {
    logger.error('[AI] generateSearchSuggestions failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new ExternalIntegrationError('openai', {
      message: 'Failed to generate search suggestions',
      cause: error instanceof Error ? error : new Error(String(error)),
    });
  }
}

// AI Copilot - Chat with context
export interface CopilotMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

export interface CopilotContext {
  pageId?: number;
  pageTitle?: string;
  pageContent?: string;
  selectedText?: string;
  recentPages?: Array<{ title: string; content: string }>;
}

export async function chatWithCopilot(
  messages: CopilotMessage[],
  context: CopilotContext
): Promise<string> {
  try {
    // Build context-aware system prompt
    let systemPrompt = `You are an intelligent AI assistant integrated into a collaborative wiki platform. You help users with:
- Summarizing and explaining content
- Suggesting improvements and related topics
- Extracting action items and tasks
- Answering questions about the workspace
- Generating new content based on context

Current Context:`;

    if (context.pageTitle) {
      systemPrompt += `\n- Current Page: "${context.pageTitle}"`;
    }
    if (context.pageContent) {
      systemPrompt += `\n- Page Content: ${context.pageContent.substring(0, 1000)}...`;
    }
    if (context.selectedText) {
      systemPrompt += `\n- Selected Text: "${context.selectedText}"`;
    }
    if (context.recentPages && context.recentPages.length > 0) {
      systemPrompt += `\n- Recent Pages: ${context.recentPages.map((p) => p.title).join(', ')}`;
    }

    const response = await getOpenAI().chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        ...messages.map((msg) => ({
          role: msg.role,
          content: msg.content,
        })),
      ],
      max_tokens: 2000,
      temperature: 0.7,
    });

    return response.choices[0].message.content || '';
  } catch (error) {
    logger.error('[AI] chatWithCopilot failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new ExternalIntegrationError('openai', {
      message: 'AI Copilot is currently unavailable',
      cause: error instanceof Error ? error : new Error(String(error)),
    });
  }
}

// Extract tasks from text
export interface ExtractedTask {
  title: string;
  description?: string;
  priority: number;
  estimatedHours?: number;
}

export async function extractTasks(content: string): Promise<ExtractedTask[]> {
  try {
    const prompt = `Analyze the following content and extract any tasks, action items, or TODO items mentioned. Look for patterns like:
- "?�야 ?�다", "?�요?�다", "구현?�야", "?�성?�야"
- TODO, FIXME, etc.
- Action items in meeting notes
- Tasks mentioned in discussions

Content: ${content}

Respond with JSON in this format: {
  "tasks": [
    {
      "title": "Task title",
      "description": "Optional description",
      "priority": 1-5 (1=highest),
      "estimatedHours": estimated hours if mentioned
    }
  ]
}`;

    const response = await getOpenAI().chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content:
            'You are an expert at analyzing text and extracting actionable tasks. Be specific and practical.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 1500,
    });

    const result = JSON.parse(response.choices[0].message.content || '{"tasks": []}');
    return result.tasks || [];
  } catch (error) {
    logger.error('[AI] extractTasks failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new ExternalIntegrationError('openai', {
      message: 'Failed to extract tasks from content',
      cause: error instanceof Error ? error : new Error(String(error)),
    });
  }
}

// Find related pages based on content
export interface RelatedPage {
  pageId: number;
  title: string;
  relevance: number;
  reason: string;
}

export async function findRelatedPages(
  currentContent: string,
  currentTitle: string,
  availablePages: Array<{ id: number; title: string; content: string; tags: string[] }>
): Promise<RelatedPage[]> {
  try {
    const prompt = `Given the current page, find the most related pages from the available pages list.

Current Page: "${currentTitle}"
Content: ${currentContent.substring(0, 1000)}...

Available Pages:
${availablePages
  .map(
    (p, i) => `${i + 1}. "${p.title}" - Tags: ${p.tags.join(', ')}
   ${p.content.substring(0, 200)}...`
  )
  .join('\n')}

Respond with JSON in this format: {
  "relatedPages": [
    {
      "pageIndex": 0,
      "relevance": 0.95,
      "reason": "Brief explanation of the relationship"
    }
  ]
}

Find up to 5 most related pages, ranked by relevance (0.0-1.0).`;

    const response = await getOpenAI().chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content:
            'You are an expert at finding semantic relationships between documents. Consider topic similarity, complementary information, and practical connections.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 1000,
    });

    const result = JSON.parse(response.choices[0].message.content || '{"relatedPages": []}');

    return result.relatedPages
      .map((item: any) => {
        const page = availablePages[item.pageIndex];
        return {
          pageId: page.id,
          title: page.title,
          relevance: item.relevance || 0,
          reason: item.reason || '',
        };
      })
      .sort((a: RelatedPage, b: RelatedPage) => b.relevance - a.relevance)
      .slice(0, 5);
  } catch (error) {
    logger.error('[AI] findRelatedPages failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new ExternalIntegrationError('openai', {
      message: 'Failed to find related pages',
      cause: error instanceof Error ? error : new Error(String(error)),
    });
  }
}

export type InlineAIAction = 'summarize' | 'rewrite' | 'taskify';

export interface InlineAIResult {
  action: InlineAIAction;
  result: string;
}

export async function inlineAIAction(
  action: InlineAIAction,
  text: string
): Promise<InlineAIResult> {
  const prompts: Record<InlineAIAction, string> = {
    summarize: `Summarize the following text concisely in 1-3 sentences:\n\n${text}`,
    rewrite: `Rewrite the following text to be clearer and more professional, preserving meaning:\n\n${text}`,
    taskify: `Convert the following text into a concise, actionable task list. Return only the task lines, each starting with "- ":\n\n${text}`,
  };

  try {
    const response = await getOpenAI().chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are a precise writing assistant. Follow the instruction exactly.',
        },
        { role: 'user', content: prompts[action] },
      ],
      max_tokens: 512,
    });

    const result = response.choices[0].message.content?.trim() || '';
    return { action, result };
  } catch (error) {
    logger.error('[AI] inlineAIAction failed', {
      action,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new ExternalIntegrationError('openai', {
      message: `Inline AI action '${action}' failed`,
      cause: error instanceof Error ? error : new Error(String(error)),
    });
  }
}

import OpenAI from 'openai';
import logger from './logger.js';

// Initialize OpenAI client
const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })
  : null;

export type AICommand =
  | 'continue'
  | 'improve'
  | 'summarize'
  | 'translate'
  | 'fixGrammar'
  | 'makeItShorter'
  | 'makeItLonger'
  | 'changeCase';

export interface AIAssistRequest {
  command: AICommand;
  text: string;
  language?: string; // For translation
  targetCase?: 'sentence' | 'title' | 'upper' | 'lower'; // For changeCase
}

export interface AIAssistResponse {
  success: boolean;
  result?: string;
  error?: string;
}

/**
 * AI Writing Assistant Service
 * Provides intelligent text completion and suggestions
 */
export class AIAssistantService {
  private isEnabled: boolean;

  constructor() {
    this.isEnabled = !!openai;
    if (!this.isEnabled) {
      logger.warn('OpenAI API key not found. AI assistant features disabled.');
    }
  }

  /**
   * Check if AI assistant is available
   */
  isAvailable(): boolean {
    return this.isEnabled;
  }

  /**
   * Process AI command
   */
  async assist(request: AIAssistRequest): Promise<AIAssistResponse> {
    if (!this.isEnabled || !openai) {
      return {
        success: false,
        error: 'AI assistant is not available. Please configure OPENAI_API_KEY.',
      };
    }

    try {
      const prompt = this.buildPrompt(request);

      logger.info(
        `AI Assistant - Command: ${request.command}, Text length: ${request.text.length}`
      );

      const completion = await openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content:
              'You are a helpful writing assistant. Provide concise, high-quality responses.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 1000,
      });

      const result = completion.choices[0]?.message?.content?.trim();

      if (!result) {
        return {
          success: false,
          error: 'Failed to generate response',
        };
      }

      logger.info(`AI Assistant - Success, Result length: ${result.length}`);

      return {
        success: true,
        result,
      };
    } catch (error: any) {
      logger.error('AI Assistant error:', error);
      return {
        success: false,
        error: error.message || 'Failed to process AI request',
      };
    }
  }

  /**
   * Generate AI prompt based on command
   */
  private buildPrompt(request: AIAssistRequest): string {
    const { command, text, language, targetCase } = request;

    switch (command) {
      case 'continue':
        return `Continue writing the following text naturally and coherently. Add 2-3 sentences that flow well with the existing content:\n\n${text}`;

      case 'improve':
        return `Improve the following text. Make it more clear, concise, and engaging while preserving the original meaning:\n\n${text}`;

      case 'summarize':
        return `Summarize the following text in 2-3 sentences. Capture the key points:\n\n${text}`;

      case 'translate':
        const targetLang = language || 'Korean';
        return `Translate the following text to ${targetLang}. Preserve the tone and meaning:\n\n${text}`;

      case 'fixGrammar':
        return `Fix any grammar, spelling, or punctuation errors in the following text. Keep the original meaning:\n\n${text}`;

      case 'makeItShorter':
        return `Rewrite the following text to be more concise while keeping the key information:\n\n${text}`;

      case 'makeItLonger':
        return `Expand the following text with more details and examples. Make it more comprehensive:\n\n${text}`;

      case 'changeCase':
        const caseType = targetCase || 'sentence';
        let instruction = '';
        switch (caseType) {
          case 'sentence':
            instruction = 'Convert to sentence case (capitalize first letter of sentences)';
            break;
          case 'title':
            instruction = 'Convert to title case (capitalize first letter of each major word)';
            break;
          case 'upper':
            instruction = 'Convert to uppercase';
            break;
          case 'lower':
            instruction = 'Convert to lowercase';
            break;
        }
        return `${instruction}:\n\n${text}`;

      default:
        return `Process the following text:\n\n${text}`;
    }
  }

  /**
   * Generate block content from prompt
   */
  async generateBlock(
    prompt: string,
    blockType: 'table' | 'list' | 'code'
  ): Promise<AIAssistResponse> {
    if (!this.isEnabled || !openai) {
      return {
        success: false,
        error: 'AI assistant is not available.',
      };
    }

    try {
      let systemPrompt = '';
      let userPrompt = '';

      switch (blockType) {
        case 'table':
          systemPrompt =
            'You are a table generator. Generate a markdown table based on the user request.';
          userPrompt = `Generate a markdown table for: ${prompt}\n\nProvide ONLY the markdown table, no explanations.`;
          break;

        case 'list':
          systemPrompt =
            'You are a list generator. Generate a structured list based on the user request.';
          userPrompt = `Generate a bulleted list for: ${prompt}\n\nProvide ONLY the list items, one per line, no explanations.`;
          break;

        case 'code':
          systemPrompt = 'You are a code generator. Generate code based on the user request.';
          userPrompt = `Generate code for: ${prompt}\n\nProvide ONLY the code, no explanations. Specify the language in a comment.`;
          break;
      }

      logger.info(`AI Block Generation - Type: ${blockType}, Prompt: ${prompt}`);

      const completion = await openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 1500,
      });

      const result = completion.choices[0]?.message?.content?.trim();

      if (!result) {
        return {
          success: false,
          error: 'Failed to generate block content',
        };
      }

      logger.info(`AI Block Generation - Success, Type: ${blockType}`);

      return {
        success: true,
        result,
      };
    } catch (error: any) {
      logger.error('AI Block Generation error:', error);
      return {
        success: false,
        error: error.message || 'Failed to generate block',
      };
    }
  }

  /**
   * Smart suggestions based on context
   */
  async getSuggestions(text: string, cursorPosition: number): Promise<string[]> {
    if (!this.isEnabled || !openai) {
      return [];
    }

    try {
      // Get text around cursor
      const contextBefore = text.substring(Math.max(0, cursorPosition - 200), cursorPosition);
      const contextAfter = text.substring(
        cursorPosition,
        Math.min(text.length, cursorPosition + 50)
      );

      const prompt = `Given this text context:
Before cursor: "${contextBefore}"
After cursor: "${contextAfter}"

Suggest 3 short, relevant continuations (each 3-7 words). Return ONLY the suggestions, one per line, no numbers or bullets.`;

      const completion = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'You are a smart writing assistant. Provide brief, contextual suggestions.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.8,
        max_tokens: 100,
      });

      const result = completion.choices[0]?.message?.content?.trim();
      if (!result) return [];

      const suggestions = result
        .split('\n')
        .filter((s) => s.trim().length > 0)
        .slice(0, 3);

      return suggestions;
    } catch (error: any) {
      logger.error('AI Suggestions error:', error);
      return [];
    }
  }

  /**
   * Auto-format text based on detected issues
   */
  async autoFormat(text: string): Promise<AIAssistResponse> {
    if (!this.isEnabled || !openai) {
      return {
        success: false,
        error: 'AI assistant is not available.',
      };
    }

    try {
      const prompt = `Automatically format and improve the following text:
- Fix grammar and spelling
- Improve sentence structure
- Add proper punctuation
- Make it more readable

Text:
${text}

Return ONLY the formatted text, no explanations.`;

      const completion = await openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are an expert editor. Format text professionally.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 1500,
      });

      const result = completion.choices[0]?.message?.content?.trim();

      if (!result) {
        return {
          success: false,
          error: 'Failed to format text',
        };
      }

      return {
        success: true,
        result,
      };
    } catch (error: any) {
      logger.error('AI Auto-format error:', error);
      return {
        success: false,
        error: error.message || 'Failed to format text',
      };
    }
  }
}

// Export singleton instance
export const aiAssistant = new AIAssistantService();

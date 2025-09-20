import OpenAI from "openai";

// Lazily create OpenAI client so module import doesn't throw when API key is missing
function getOpenAIClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY_ENV_VAR;
  if (!apiKey) return null;
  return new OpenAI({ apiKey });
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

export async function generateContentSuggestions(content: string, title: string): Promise<ContentSuggestion[]> {
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

  const client = getOpenAIClient();
  if (!client) throw new Error('OPENAI_API_KEY not set');

  const response = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are an expert technical writer and documentation specialist. Provide helpful, specific suggestions for improving wiki content."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: { type: "json_object" },
      max_tokens: 1000
    });

    const result = JSON.parse(response.choices[0].message.content || '{"suggestions": []}');
    return result.suggestions || [];
  } catch (error) {
    console.error("Failed to generate content suggestions:", error);
    return [];
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

  const client = getOpenAIClient();
  if (!client) throw new Error('OPENAI_API_KEY not set');

  const response = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are an expert at summarizing technical documentation. Provide clear, concise summaries with key takeaways."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: { type: "json_object" },
      max_tokens: 500
    });

    const result = JSON.parse(response.choices[0].message.content || '{"summary": "", "keyPoints": [], "readingTime": 0}');
    return {
      summary: result.summary || "",
      keyPoints: result.keyPoints || [],
      readingTime: result.readingTime || Math.ceil(content.split(' ').length / 200) // fallback: ~200 words per minute
    };
  } catch (error) {
    console.error("Failed to summarize content:", error);
    return {
      summary: "Summary unavailable",
      keyPoints: [],
      readingTime: Math.ceil(content.split(' ').length / 200)
    };
  }
}

export async function generateContent(prompt: string, type: 'page' | 'section' = 'section'): Promise<string> {
  try {
    const systemPrompt = type === 'page' 
      ? "You are an expert technical writer. Generate well-structured markdown content for wiki pages. Use proper headings, formatting, and include practical examples where appropriate."
      : "You are an expert technical writer. Generate a well-structured markdown section that can be added to existing documentation. Focus on clarity and usefulness.";

  const client = getOpenAIClient();
  if (!client) throw new Error('OPENAI_API_KEY not set');

  const response = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: systemPrompt
        },
        {
          role: "user",
          content: prompt
        }
      ],
      max_tokens: 2000
    });

    return response.choices[0].message.content || "";
  } catch (error) {
    console.error("Failed to generate content:", error);
    throw new Error("Failed to generate content: " + (error as Error).message);
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

export async function smartSearch(query: string, documents: Array<{id: number, title: string, content: string, type: 'page' | 'task' | 'file', url: string}>): Promise<SearchResult[]> {
  try {
    const prompt = `Analyze the following search query and documents to find the most relevant matches. Consider semantic meaning, context, and user intent.

Search Query: "${query}"

Available Documents:
${documents.map((doc, index) => `${index + 1}. ${doc.title} (${doc.type})
   Content: ${doc.content.substring(0, 500)}...`).join('\n')}

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

  const client = getOpenAIClient();
  if (!client) throw new Error('OPENAI_API_KEY not set');
    const response = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are an expert search and information retrieval specialist. Analyze search queries and documents to find the most relevant matches based on semantic meaning and user intent."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: { type: "json_object" },
      max_tokens: 1500
    });

    const result = JSON.parse(response.choices[0].message.content || '{"results": []}');
    
    return result.results.map((item: any) => {
      const doc = documents[item.documentIndex];
      return {
        id: doc.id,
        title: doc.title,
        content: doc.content,
        relevance: item.relevance || 0,
        matchedTerms: item.matchedTerms || [],
        summary: item.summary || "",
        type: doc.type,
        url: doc.url
      };
    }).sort((a: SearchResult, b: SearchResult) => b.relevance - a.relevance);
  } catch (error) {
    console.error("Failed to perform smart search:", error);
    // Fallback to simple text search
    return documents
      .map(doc => ({
        id: doc.id,
        title: doc.title,
        content: doc.content,
        relevance: doc.title.toLowerCase().includes(query.toLowerCase()) ? 0.8 : 
                   doc.content.toLowerCase().includes(query.toLowerCase()) ? 0.6 : 0.3,
        matchedTerms: [query],
        summary: `Found "${query}" in ${doc.type}`,
        type: doc.type,
        url: doc.url
      }))
      .filter(result => result.relevance > 0.3)
      .sort((a, b) => b.relevance - a.relevance);
  }
}

export async function generateSearchSuggestions(query: string): Promise<string[]> {
  try {
    const prompt = `Given the search query "${query}", suggest 5 related search terms or phrases that might help the user find what they're looking for. Consider synonyms, related concepts, and alternative phrasings.

Respond with JSON in this format: {
  "suggestions": ["suggestion1", "suggestion2", "suggestion3", "suggestion4", "suggestion5"]
}`;

    const client = getOpenAIClient();
    if (!client) throw new Error('OPENAI_API_KEY not set');

    const response = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are an expert at understanding search intent and suggesting related search terms. Provide helpful, relevant suggestions that expand on the user's query."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: { type: "json_object" },
      max_tokens: 300
    });

    const result = JSON.parse(response.choices[0].message.content || '{"suggestions": []}');
    return result.suggestions || [];
  } catch (error) {
    console.error("Failed to generate search suggestions:", error);
    return [];
  }
}

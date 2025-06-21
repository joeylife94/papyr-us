import OpenAI from "openai";

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY_ENV_VAR || "default_key"
});

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

    const response = await openai.chat.completions.create({
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

    const response = await openai.chat.completions.create({
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

    const response = await openai.chat.completions.create({
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

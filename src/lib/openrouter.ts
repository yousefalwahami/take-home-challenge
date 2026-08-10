import OpenAI from "openai";

export function getOpenRouterModel(): string {
  return process.env.OPENROUTER_MODEL ?? "anthropic/claude-sonnet-5";
}

export function getOpenRouterClient(): OpenAI {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not set");
  }

  return new OpenAI({
    apiKey,
    baseURL: "https://openrouter.ai/api/v1",
    defaultHeaders: {
      "HTTP-Referer": process.env.AUTH_URL ?? "http://localhost:3000",
      "X-Title": "Inbox Agent",
    },
  });
}

export async function chatJson<T>(params: {
  system: string;
  user: string;
  schemaName: string;
  schema: Record<string, unknown>;
}): Promise<T> {
  const client = getOpenRouterClient();
  const model = getOpenRouterModel();

  const completion = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: params.system },
      { role: "user", content: params.user },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: params.schemaName,
        strict: true,
        schema: params.schema,
      },
    },
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error("OpenRouter returned empty content");
  }

  return JSON.parse(content) as T;
}

export async function chatText(params: {
  system: string;
  user: string;
}): Promise<string> {
  const client = getOpenRouterClient();
  const model = getOpenRouterModel();

  const completion = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: params.system },
      { role: "user", content: params.user },
    ],
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error("OpenRouter returned empty content");
  }

  return content.trim();
}

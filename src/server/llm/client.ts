import { z, type ZodSchema } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

export interface GenerateStructuredOpts {
  temperature?: number;
  model?: string;
}

function stripMarkdownFences(text: string): string {
  let cleaned = text.trim();
  // Remove markdown code block fences: ```json ... ``` or ``` ... ```
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```[a-zA-Z]*\r?\n/, '').replace(/\r?\n```$/, '').trim();
  }
  return cleaned;
}

async function callProvider(
  provider: string,
  systemPrompt: string,
  userPrompt: string,
  opts?: GenerateStructuredOpts
): Promise<string> {
  if (provider === 'gemini') {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY environment variable is missing');
    }
    const model = opts?.model || process.env.LLM_MODEL || 'gemini-2.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: systemPrompt }],
        },
        contents: [
          {
            role: 'user',
            parts: [{ text: userPrompt }],
          },
        ],
        generationConfig: {
          response_mime_type: 'application/json',
          temperature: opts?.temperature ?? 0.7,
        },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Gemini API error (${res.status} ${res.statusText}): ${errText}`);
    }

    const data: any = await res.json();
    const candidate = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!candidate) {
      throw new Error(`Gemini returned empty candidate: ${JSON.stringify(data)}`);
    }
    return candidate;
  }

  if (provider === 'openai') {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is missing');
    }
    const model = opts?.model || process.env.LLM_MODEL || 'gpt-4o-mini';
    const url = 'https://api.openai.com/v1/chat/completions';

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
        temperature: opts?.temperature ?? 0.7,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`OpenAI API error (${res.status} ${res.statusText}): ${errText}`);
    }

    const data: any = await res.json();
    const candidate = data.choices?.[0]?.message?.content;
    if (!candidate) {
      throw new Error(`OpenAI returned empty message: ${JSON.stringify(data)}`);
    }
    return candidate;
  }

  if (provider === 'ollama') {
    const baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
    const model = opts?.model || process.env.LLM_MODEL || 'llama3.2';
    const url = `${baseUrl}/api/chat`;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        format: 'json',
        stream: false,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Ollama API error (${res.status} ${res.statusText}): ${errText}`);
    }

    const data: any = await res.json();
    const candidate = data.message?.content;
    if (!candidate) {
      throw new Error(`Ollama returned empty response: ${JSON.stringify(data)}`);
    }
    return candidate;
  }

  if (provider === 'mock') {
    // Generate valid structured fallback JSON based on prompt hints
    const isQuality = userPrompt.includes('"mode": "quality"') || userPrompt.includes('Quality Mode');
    if (isQuality) {
      return JSON.stringify({
        mode: 'quality',
        aspectRatio: '16:9',
        title: 'Explainer Deep Dive',
        hookLine: 'The fundamental architecture behind high-performance video pipelines.',
        beats: [
          {
            index: 0,
            voiceover: 'Most video generation pipelines fail because they treat rendering as an after-thought.',
            archetype: 'TitleCard',
            energy: 6,
            preferredAssetIds: [],
            transitionIn: 'cut',
            estimatedDurationSec: 5.0,
          },
          {
            index: 1,
            voiceover: 'By separating narrative planning from deterministic synthesis, every frame is reproducible.',
            archetype: 'DiagramStep',
            energy: 7,
            preferredAssetIds: [],
            transitionIn: 'whoosh',
            estimatedDurationSec: 5.5,
          },
          {
            index: 2,
            voiceover: 'Here is how you can implement this architecture in your own systems today.',
            archetype: 'Outro',
            energy: 7,
            preferredAssetIds: [],
            transitionIn: 'fade',
            estimatedDurationSec: 4.5,
          },
        ],
      });
    }

    // Default Fast Mode mock (vertical short, 9:16, <=45s total, 1.2-2.5s per beat, hook beat)
    return JSON.stringify({
      mode: 'fast',
      aspectRatio: '9:16',
      title: 'Fast Short',
      hookLine: 'Ninety-nine percent of developers misunderstand reactive performance.',
      beats: [
        {
          index: 0,
          voiceover: 'Ninety-nine percent of developers get this wrong.',
          archetype: 'TitleCard',
          energy: 9,
          preferredAssetIds: [],
          transitionIn: 'impact',
          estimatedDurationSec: 2.1,
        },
        {
          index: 1,
          voiceover: 'Component re-renders are cheap.',
          archetype: 'KineticText',
          energy: 8,
          preferredAssetIds: [],
          transitionIn: 'whoosh',
          estimatedDurationSec: 1.8,
        },
        {
          index: 2,
          voiceover: 'It is heavy DOM updates that cause lag.',
          archetype: 'SplitCompare',
          energy: 7,
          preferredAssetIds: [],
          transitionIn: 'cut',
          estimatedDurationSec: 2.2,
        },
        {
          index: 3,
          voiceover: 'Batch state changes together.',
          archetype: 'DiagramStep',
          energy: 8,
          preferredAssetIds: [],
          transitionIn: 'whoosh',
          estimatedDurationSec: 1.9,
        },
        {
          index: 4,
          voiceover: 'Stop guessing and profile first.',
          archetype: 'Outro',
          energy: 9,
          preferredAssetIds: [],
          transitionIn: 'impact',
          estimatedDurationSec: 2.0,
        },
      ],
    });
  }

  throw new Error(`Unsupported LLM_PROVIDER: ${provider}`);
}

/**
 * Generates structured data validated against a Zod schema.
 * Provider is selected via LLM_PROVIDER env var.
 * Retries up to 2 additional times (3 total) feeding validation errors back.
 * Throws with attached validation errors after 3 failed attempts.
 */
export async function generateStructured<T>(
  systemPrompt: string,
  userPrompt: string,
  schema: ZodSchema<T>,
  opts?: GenerateStructuredOpts
): Promise<T> {
  const provider = (process.env.LLM_PROVIDER || (process.env.GEMINI_API_KEY ? 'gemini' : 'mock')).toLowerCase();

  let currentPrompt = userPrompt;
  const allValidationErrors: string[] = [];

  for (let attempt = 1; attempt <= 3; attempt++) {
    let rawResponse = '';
    try {
      rawResponse = await callProvider(provider, systemPrompt, currentPrompt, opts);
    } catch (apiErr: any) {
      if (attempt === 3) {
        throw new Error(`LLM provider '${provider}' call failed on final attempt: ${apiErr.message}`);
      }
      currentPrompt = `${userPrompt}\n\n[Previous attempt failed with error: ${apiErr.message}. Please retry with valid JSON.]`;
      continue;
    }

    const cleaned = stripMarkdownFences(rawResponse);
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(cleaned);
    } catch (jsonErr: any) {
      const errMessage = `Attempt ${attempt}: JSON parse error: ${jsonErr.message}`;
      allValidationErrors.push(errMessage);

      if (attempt === 3) {
        const finalError = new Error(`Failed to parse structured LLM response as JSON after 3 attempts:\n${allValidationErrors.join('\n')}\nRaw output:\n${rawResponse}`);
        (finalError as any).validationErrors = allValidationErrors;
        throw finalError;
      }

      currentPrompt = `${userPrompt}\n\n[CORRECTION REQUIRED: Attempt ${attempt} failed]\nYour response was not valid JSON: ${jsonErr.message}.\nRaw text was:\n${cleaned.slice(0, 500)}\n\nPlease output ONLY valid JSON without markdown fences or additional commentary.`;
      continue;
    }

    const parseResult = schema.safeParse(parsedJson);
    if (parseResult.success) {
      return parseResult.data;
    }

    // Format Zod issues
    const formattedIssues = parseResult.error.issues
      .map((issue) => ` - Path '${issue.path.join('.')}': ${issue.message}`)
      .join('\n');

    const errorSummary = `Attempt ${attempt} schema validation failed:\n${formattedIssues}`;
    allValidationErrors.push(errorSummary);

    if (attempt === 3) {
      const finalError = new Error(`Failed to generate valid structured data matching schema after 3 attempts:\n${allValidationErrors.join('\n')}`);
      (finalError as any).validationErrors = parseResult.error.issues;
      throw finalError;
    }

    // Feed validation errors back to prompt for next attempt
    currentPrompt = `${userPrompt}\n\n[CORRECTION REQUIRED: Attempt ${attempt} failed validation]\nYour output did not match the required schema. Fix the following validation issues:\n${formattedIssues}\n\nPrevious invalid JSON:\n${cleaned.slice(0, 1000)}\n\nPlease return only corrected JSON strictly satisfying all constraints and schemas.`;
  }

  const finalError = new Error(`Failed structured generation after 3 attempts:\n${allValidationErrors.join('\n')}`);
  (finalError as any).validationErrors = allValidationErrors;
  throw finalError;
}

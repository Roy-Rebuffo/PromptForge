import * as vscode from 'vscode';
import { DiagnosisResult, ImprovementResult, PromptChange } from '../types';
import { SelectedModel } from './modelSelector';

const IMPROVEMENT_SYSTEM_PROMPT = `You are an expert prompt engineer specialised in surgical improvements.
Your only job is to improve prompts by fixing specific weak dimensions.

STRICT RULES:
1. Only modify the dimensions listed in weak_dims. Do NOT touch what is already working.
2. For each change, document which dimension it addresses and why it improves it.
3. Preserve all template variables like {variable} exactly as they are.
4. Add no more than 2-3 changes per weak dimension.
5. Return ONLY valid JSON — no markdown, no backticks, no preamble.

REQUIRED JSON FORMAT:
{
  "improved_prompt": "<the full rewritten prompt>",
  "changes": [
    {
      "line_before": "<original fragment>",
      "line_after": "<improved fragment>",
      "dimension": "<which weak dimension this fixes>",
      "explanation": "<why this change improves that dimension>"
    }
  ],
  "expected_score_delta": <estimated overall score improvement as float>
}`;

function buildImprovementUserMessage(diagnosis: DiagnosisResult): string {
  const weakDimsDetail = diagnosis.weak_dims.map(dim => {
    const d = diagnosis.dimensions[dim as keyof typeof diagnosis.dimensions];
    return `- ${dim} (score ${d.score}/10): ${d.improvement_hint}`;
  }).join('\n');

  const strongDims = Object.keys(diagnosis.dimensions)
    .filter(dim => !diagnosis.weak_dims.includes(dim))
    .join(', ') || 'none';

  return `Original prompt:
${diagnosis.prompt_content}

Dimensions to improve (score < 7):
${weakDimsDetail}

Do NOT modify these dimensions (already scoring well):
${strongDims}`;
}

function parseImprovementResponse(
  raw: string,
  diagnosis: DiagnosisResult
): ImprovementResult {
  let cleaned = raw.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.split('```').filter(s => s.trim() && !s.startsWith('json'))[0] ?? cleaned;
  }
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}') + 1;
  if (start !== -1 && end > start) {
    cleaned = cleaned.slice(start, end);
  }

  const data = JSON.parse(cleaned);

  const changes: PromptChange[] = (data.changes ?? []).map((c: any) => ({
    line_before: String(c.line_before ?? ''),
    line_after: String(c.line_after ?? ''),
    dimension: String(c.dimension ?? ''),
    explanation: String(c.explanation ?? ''),
  }));

  return {
    improved_prompt: String(data.improved_prompt ?? ''),
    changes,
    expected_score_delta: parseFloat(data.expected_score_delta ?? 0),
    parent_version_id: diagnosis.version_id,
  };
}

// Call improvement agent using vscode.lm
async function improveWithVscodeLm(
  model: vscode.LanguageModelChat,
  diagnosis: DiagnosisResult,
  token: vscode.CancellationToken
): Promise<ImprovementResult> {

  const messages = [
    vscode.LanguageModelChatMessage.User(IMPROVEMENT_SYSTEM_PROMPT),
    vscode.LanguageModelChatMessage.User(buildImprovementUserMessage(diagnosis)),
  ];

  const response = await model.sendRequest(messages, {}, token);

  let raw = '';
  for await (const chunk of response.text) {
    raw += chunk;
  }

  return parseImprovementResponse(raw, diagnosis);
}

// Call improvement agent using Groq API directly
async function improveWithGroq(
  apiKey: string,
  diagnosis: DiagnosisResult,
  token: vscode.CancellationToken
): Promise<ImprovementResult> {

  const controller = new AbortController();
  token.onCancellationRequested(() => controller.abort());

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      temperature: 0.3,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: IMPROVEMENT_SYSTEM_PROMPT },
        { role: 'user', content: buildImprovementUserMessage(diagnosis) },
      ],
    }),
    signal: controller.signal,
  });

  if (!response.ok) {
    throw new Error(`Groq API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as any;
  const raw = data.choices?.[0]?.message?.content ?? '';

  return parseImprovementResponse(raw, diagnosis);
}

// Main export — routes to the right implementation
export async function improvePrompt(
  selectedModel: SelectedModel,
  diagnosis: DiagnosisResult,
  token: vscode.CancellationToken
): Promise<ImprovementResult> {

  if (selectedModel.source === 'vscode-lm' && selectedModel.model) {
    return improveWithVscodeLm(selectedModel.model, diagnosis, token);
  }

  if (selectedModel.source === 'groq' && selectedModel.apiKey) {
    return improveWithGroq(selectedModel.apiKey, diagnosis, token);
  }

  throw new Error('No valid model source available');
}
import * as vscode from 'vscode';
import { DiagnosisResult, DimensionDiagnosis } from '../types';
import { SelectedModel } from './modelSelector';

const JUDGE_SYSTEM_PROMPT = `You are a strict expert LLM prompt evaluator.
You will receive a prompt and must evaluate it across 5 dimensions.

STRICT INSTRUCTIONS:
1. Reason through each dimension separately before scoring.
2. Be HARSH and PRECISE — a vague or incomplete prompt must score low.
3. A prompt with no clear task, no context, or no actionable instruction scores 0-2 in coherence and precision.
4. Do NOT give benefit of the doubt — evaluate what is written, not what could be intended.
5. Return ONLY valid JSON — no markdown, no backticks, no preamble.

DIMENSIONS:
- coherence: Does the prompt contain a clear, actionable instruction that an LLM could execute without guessing? Vague phrases, incomplete sentences, or content without a clear task score 0-2.
- precision: Is the prompt specific enough to produce consistent, predictable outputs? Generic or ambiguous prompts score 0-3.
- tone: Is the tone appropriate and consistent for the declared context? Mismatched or undefined tone scores 3-5.
- safety: Is the prompt free from harmful, biased, or dangerous instructions? (10 = fully safe, 0 = explicitly harmful)
- completeness: Does the prompt include the three basic elements: (1) a clear task, (2) sufficient context, (3) expected output format? Missing all three scores 0-1. Each present element adds ~3 points.

SCORING GUIDE:
- 0-2: Completely inadequate
- 3-4: Poor — vague, incomplete, or missing key elements
- 5-6: Below average — some intent visible but major gaps
- 7-8: Good — clear intent with minor improvements possible
- 9-10: Excellent — specific, actionable, well-structured

REQUIRED JSON FORMAT:
{
  "coherence": { "score": <0-10>, "reasoning": "<your reasoning>", "improvement_hint": "<concrete suggestion>" },
  "precision": { "score": <0-10>, "reasoning": "<your reasoning>", "improvement_hint": "<concrete suggestion>" },
  "tone": { "score": <0-10>, "reasoning": "<your reasoning>", "improvement_hint": "<concrete suggestion>" },
  "safety": { "score": <0-10>, "reasoning": "<your reasoning>", "improvement_hint": "<concrete suggestion>" },
  "completeness": { "score": <0-10>, "reasoning": "<your reasoning>", "improvement_hint": "<concrete suggestion>" }
}`;

const JUDGE_SYSTEM_PROMPT_DEVELOPER = `You are a strict expert LLM prompt evaluator specialised in production-grade prompts.
You will receive a structured prompt with sections ([SYSTEM], [USER], [CONTEXT]) and must evaluate it across 5 dimensions.

STRICT INSTRUCTIONS:
1. Evaluate the prompt AS A WHOLE considering how sections work together.
2. Be HARSH and PRECISE — production prompts must meet high standards.
3. Return ONLY valid JSON — no markdown, no backticks, no preamble.

DIMENSIONS FOR STRUCTURED PROMPTS:
- coherence: Do the sections work together coherently? Does [SYSTEM] define a clear role? Does [USER] have a clear task? Score 0-2 if sections contradict each other or lack clear purpose.
- precision: Are instructions specific enough to produce consistent outputs? Are template variables {like_this} used correctly? Are constraints explicit?
- tone: Is the tone consistent across sections and appropriate for the declared role?
- safety: Is the prompt free from harmful instructions across all sections? (10 = fully safe)
- completeness: Does [SYSTEM] define the role? Does [USER] specify the task AND output format? Are edge cases handled? Missing output format scores max 6.

SCORING GUIDE:
- 0-2: Completely inadequate
- 3-4: Poor — missing critical elements
- 5-6: Below average — structure present but gaps remain
- 7-8: Good — production-ready with minor improvements possible
- 9-10: Excellent — robust, specific, handles edge cases

REQUIRED JSON FORMAT:
{
  "coherence": { "score": <0-10>, "reasoning": "<your reasoning>", "improvement_hint": "<concrete suggestion>" },
  "precision": { "score": <0-10>, "reasoning": "<your reasoning>", "improvement_hint": "<concrete suggestion>" },
  "tone": { "score": <0-10>, "reasoning": "<your reasoning>", "improvement_hint": "<concrete suggestion>" },
  "safety": { "score": <0-10>, "reasoning": "<your reasoning>", "improvement_hint": "<concrete suggestion>" },
  "completeness": { "score": <0-10>, "reasoning": "<your reasoning>", "improvement_hint": "<concrete suggestion>" }
}`;

function parseJudgeResponse(raw: string, promptContent: string, contextLabel: string, versionId: number): DiagnosisResult {
  // Clean up response
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

  const dimensions: Record<string, DimensionDiagnosis> = {};
  const dimNames = ['coherence', 'precision', 'tone', 'safety', 'completeness'];

  for (const dim of dimNames) {
    dimensions[dim] = {
      score: parseFloat(data[dim]?.score ?? 0),
      reasoning: String(data[dim]?.reasoning ?? ''),
      improvement_hint: String(data[dim]?.improvement_hint ?? ''),
    };
  }

  const overall = parseFloat(
    (Object.values(dimensions).reduce((sum, d) => sum + d.score, 0) / dimNames.length).toFixed(2)
  );

  const weak_dims = Object.entries(dimensions)
    .filter(([_, d]) => d.score < 7)
    .map(([name]) => name);

  return {
    version_id: versionId,
    prompt_content: promptContent,
    file_name: contextLabel,
    dimensions: dimensions as DiagnosisResult['dimensions'],
    weak_dims,
    overall,
    evaluated_at: Math.floor(Date.now() / 1000),
  };
}

// Call judge using vscode.lm
async function evaluateWithVscodeLm(
  model: vscode.LanguageModelChat,
  promptContent: string,
  contextLabel: string,
  versionId: number,
  token: vscode.CancellationToken,
  systemPrompt: string  // añade este parámetro
): Promise<DiagnosisResult> {

  const messages = [
    vscode.LanguageModelChatMessage.User(systemPrompt),
    vscode.LanguageModelChatMessage.User(
      `Context: ${contextLabel}\n\nPrompt to evaluate:\n${promptContent}`
    ),
  ];

  const response = await model.sendRequest(messages, {}, token);

  let raw = '';
  for await (const chunk of response.text) {
    raw += chunk;
  }

  return parseJudgeResponse(raw, promptContent, contextLabel, versionId);
}

// Call judge using Groq API directly
async function evaluateWithGroq(
  apiKey: string,
  promptContent: string,
  contextLabel: string,
  versionId: number,
  token: vscode.CancellationToken,
  systemPrompt: string  // añade este parámetro
): Promise<DiagnosisResult> {

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
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Context: ${contextLabel}\n\nPrompt to evaluate:\n${promptContent}` },
      ],
    }),
    signal: controller.signal,
  });

  if (!response.ok) {
    throw new Error(`Groq API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as any;
  const raw = data.choices?.[0]?.message?.content ?? '';

  return parseJudgeResponse(raw, promptContent, contextLabel, versionId);
}

// Main export — routes to the right implementation
export async function evaluatePrompt(
  selectedModel: SelectedModel,
  promptContent: string,
  contextLabel: string,
  versionId: number,
  token: vscode.CancellationToken,
  isDeveloperPrompt: boolean = false  // añade este parámetro
): Promise<DiagnosisResult> {

  // Choose the right system prompt
  const systemPrompt = isDeveloperPrompt
    ? JUDGE_SYSTEM_PROMPT_DEVELOPER
    : JUDGE_SYSTEM_PROMPT;

  if (selectedModel.source === 'vscode-lm' && selectedModel.model) {
    return evaluateWithVscodeLm(
      selectedModel.model,
      promptContent,
      contextLabel,
      versionId,
      token,
      systemPrompt
    );
  }

  if (selectedModel.source === 'groq' && selectedModel.apiKey) {
    return evaluateWithGroq(
      selectedModel.apiKey,
      promptContent,
      contextLabel,
      versionId,
      token,
      systemPrompt
    );
  }

  throw new Error('No valid model source available');
}
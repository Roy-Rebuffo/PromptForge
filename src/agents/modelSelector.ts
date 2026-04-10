import * as vscode from 'vscode';

export type ModelSource = 'vscode-lm' | 'groq';

export interface SelectedModel {
  source: ModelSource;
  model?: vscode.LanguageModelChat;  // vscode.lm model
  apiKey?: string;                    // Groq API key
  modelName: string;                  // human-readable name
}

// Priority order — best models first
const PREFERRED_MODELS = [
  { vendor: 'copilot', family: 'claude-sonnet-4-5' },
  { vendor: 'copilot', family: 'claude-sonnet-4' },
  { vendor: 'copilot', family: 'gpt-4o' },
  { vendor: 'copilot', family: 'gpt-4.1' },
  { vendor: 'copilot', family: 'gpt-4-turbo' },
  { vendor: 'copilot', family: 'gemini-2.0-flash' },
  { vendor: 'copilot', family: 'o3-mini' },
];

const MODEL_LABELS: Record<string, string> = {
  // Keys as VS Code returns them (may use dots or hyphens depending on model)
  'copilot/claude-haiku-4-5': 'Claude Haiku 4.5',
  'copilot/claude-haiku-4.5': 'Claude Haiku 4.5',
  'copilot/claude-sonnet-4-5': 'Claude Sonnet 4.5',
  'copilot/claude-sonnet-4.5': 'Claude Sonnet 4.5',
  'copilot/claude-sonnet-4': 'Claude Sonnet 4',
  'copilot/gpt-4o': 'GPT-4o',
  'copilot/gpt-4.1': 'GPT-4.1',
  'copilot/gpt-4-1': 'GPT-4.1',
  'copilot/gpt-5-mini': 'GPT-5 mini',
  'copilot/o3-mini': 'o3 mini',
  'copilot/gemini-2.0-flash': 'Gemini 2.0 Flash',
  'copilot/gemini-2-0-flash': 'Gemini 2.0 Flash',
  'groq/llama-3.3-70b-versatile': 'Groq Llama 3.3 70B',
};

let _sessionModel: SelectedModel | null = null;

export async function selectBestModel(
  token: vscode.CancellationToken,
  preferredModelName?: string
): Promise<SelectedModel | null> {

  // If user selected from panel dropdown, use that
  if (preferredModelName) {
    const model = await selectModelByName(preferredModelName, token);
    if (model) {
      _sessionModel = model;
      return model;
    }
  }

  // If we have a session model already, reuse it
  if (_sessionModel) {
    return _sessionModel;
  }

  // First time — ask the user
  return askUserToSelectModel(token);
}

async function askUserToSelectModel(
  token: vscode.CancellationToken
): Promise<SelectedModel | null> {

  // Get all available vscode.lm models
  let availableItems: vscode.QuickPickItem[] = [];

  try {
    const models = await vscode.lm.selectChatModels({});
    const seen = new Set<string>();

    for (const m of models) {
      const key = `${m.vendor}/${m.family}`;
      // Normalize only for deduplication comparison
      const normalizedForDedup = key.toLowerCase().replace(/\./g, '-');
      if (!seen.has(normalizedForDedup)) {
        seen.add(normalizedForDedup);
        availableItems.push({
          label: MODEL_LABELS[key] ?? m.family,
          description: key, // keep original key so selectModelByName receives exact family
          detail: 'Available via VS Code language models',
        });
      }
    }
  } catch {
    // vscode.lm not available
  }

  // Add Groq option if API key is set
  const config = vscode.workspace.getConfiguration('promptforge');
  const groqKey = config.get<string>('groqApiKey');
  if (groqKey) {
    availableItems.push({
      label: 'Groq — Llama 3.3 70B',
      description: 'groq/llama-3.3-70b-versatile',
      detail: 'Using your Groq API key',
    });
  }

  if (availableItems.length === 0) {
    // No models — show setup message
    const selection = await vscode.window.showErrorMessage(
      'PromptForge needs a language model. Choose an option:',
      'Install GitHub Copilot',
      'Install Claude for VS Code',
      'Set Groq API key'
    );

    if (selection === 'Install GitHub Copilot') {
      vscode.env.openExternal(vscode.Uri.parse('https://marketplace.visualstudio.com/items?itemName=GitHub.copilot'));
    } else if (selection === 'Install Claude for VS Code') {
      vscode.env.openExternal(vscode.Uri.parse('https://marketplace.visualstudio.com/items?itemName=Anthropic.claude-code'));
    } else if (selection === 'Set Groq API key') {
      vscode.commands.executeCommand('workbench.action.openSettings', 'promptforge.groqApiKey');
    }
    return null;
  }

  // Show QuickPick
  const selected = await vscode.window.showQuickPick(availableItems, {
    title: 'PromptForge — Select a model',
    placeHolder: 'Choose which model to use for evaluation',
    ignoreFocusOut: true,
  });

  if (!selected || !selected.description) { return null; }

  const modelName = selected.description;

  if (modelName === 'groq/llama-3.3-70b-versatile') {
    _sessionModel = {
      source: 'groq',
      apiKey: groqKey!,
      modelName,
    };
    return _sessionModel;
  }

  const model = await selectModelByName(modelName, token);
  if (model) {
    _sessionModel = model;
  }
  return model;
}

// Call this when user changes model from the panel dropdown
export function clearSessionModel(): void {
  _sessionModel = null;
}

export function showModelInStatusBar(
  modelName: string,
  context: vscode.ExtensionContext
): vscode.StatusBarItem {
  const item = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  item.text = `$(beaker) PF: ${modelName}`;
  item.tooltip = `PromptForge is using ${modelName}`;
  item.show();
  context.subscriptions.push(item);
  return item;
}

export async function listAvailableModels(): Promise<string[]> {
  try {
    const models = await vscode.lm.selectChatModels({});

    // Deduplicate using a normalized key for comparison (lowercase, dots→hyphens)
    // to avoid near-duplicates like "claude-haiku-4.5" and "claude-haiku-4-5" both appearing.
    // The original key (as VS Code returns it) is kept so selectChatModels can find the model.
    const seen = new Set<string>();
    const unique: string[] = [];

    for (const m of models) {
      const key = `${m.vendor}/${m.family}`;
      const normalizedForDedup = key.toLowerCase().replace(/\./g, '-');
      if (!seen.has(normalizedForDedup)) {
        seen.add(normalizedForDedup);
        unique.push(key); // keep original so selectChatModels receives the exact family name
      }
    }

    return unique;
  } catch {
    return [];
  }
}

export async function selectModelByName(
  modelName: string,
  token: vscode.CancellationToken
): Promise<SelectedModel | null> {

  // Groq models are identified by their prefix and use the API key directly
  if (modelName.startsWith('groq/')) {
    const config = vscode.workspace.getConfiguration('promptforge');
    const groqKey = config.get<string>('groqApiKey');
    if (groqKey) {
      return { source: 'groq', apiKey: groqKey, modelName };
    }
    return null;
  }

  // Parse vendor/family from modelName for vscode.lm models
  const [vendor, ...familyParts] = modelName.split('/');
  const family = familyParts.join('/');

  try {
    const models = await vscode.lm.selectChatModels({ vendor, family });
    if (models.length > 0) {
      return {
        source: 'vscode-lm',
        model: models[0],
        modelName,
      };
    }
  } catch {
    console.error(`PromptForge: Could not select model ${modelName}`);
  }

  return null;
}
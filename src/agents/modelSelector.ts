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

export async function selectBestModel(
  token: vscode.CancellationToken
): Promise<SelectedModel | null> {

  // 1. Try vscode.lm first
  try {
    // Try preferred models in order
    for (const selector of PREFERRED_MODELS) {
      const models = await vscode.lm.selectChatModels(selector);
      if (models.length > 0) {
        const model = models[0];
        return {
          source: 'vscode-lm',
          model,
          modelName: `${model.vendor}/${model.family}`,
        };
      }
    }

    // No preferred model found — try any available model
    const allModels = await vscode.lm.selectChatModels({});
    if (allModels.length > 0) {
      const model = allModels[0];
      return {
        source: 'vscode-lm',
        model,
        modelName: `${model.vendor}/${model.family}`,
      };
    }
  } catch (error) {
    console.log('PromptForge: vscode.lm not available, trying Groq fallback');
  }

  // 2. Fallback to Groq API key from settings
  const config = vscode.workspace.getConfiguration('promptforge');
  const groqApiKey = config.get<string>('groqApiKey');

  if (groqApiKey && groqApiKey.trim().length > 0) {
    return {
      source: 'groq',
      apiKey: groqApiKey,
      modelName: 'groq/llama-3.3-70b-versatile',
    };
  }

  // 3. No model available — show setup message
  const selection = await vscode.window.showErrorMessage(
    'PromptForge needs a language model. Choose an option:',
    'Install GitHub Copilot',
    'Install Claude for VS Code',
    'Set Groq API key'
  );

  if (selection === 'Install GitHub Copilot') {
    vscode.env.openExternal(
      vscode.Uri.parse('https://marketplace.visualstudio.com/items?itemName=GitHub.copilot')
    );
  } else if (selection === 'Install Claude for VS Code') {
    vscode.env.openExternal(
      vscode.Uri.parse('https://marketplace.visualstudio.com/items?itemName=Anthropic.claude-code')
    );
  } else if (selection === 'Set Groq API key') {
    vscode.commands.executeCommand(
      'workbench.action.openSettings',
      'promptforge.groqApiKey'
    );
  }

  return null;
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
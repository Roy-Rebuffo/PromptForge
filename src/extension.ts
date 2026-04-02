import * as vscode from 'vscode';
import { VersionRepository } from './db/versionRepository';
import { runEvalCommand } from './commands/runEval';

async function checkServerOnStartup(): Promise<void> {
  try {
    const response = await fetch('http://localhost:5678/health');
    if (response.ok) {
      console.log('PromptForge: Python server detected on port 5678.');
    } else {
      showServerWarning();
    }
  } catch {
    showServerWarning();
  }
}

function showServerWarning(): void {
  vscode.window.showWarningMessage(
    'PromptForge: The agent server is not running.',
    'How to start it'
  ).then(selection => {
    if (selection === 'How to start it') {
      vscode.env.openExternal(
        vscode.Uri.parse('https://github.com/Roy-Rebuffo/PromptForge#server')
      );
    }
  });
}

function startPythonServer(context: vscode.ExtensionContext): void {
  const terminal = vscode.window.createTerminal('PromptForge — Agents');
  terminal.show();
  terminal.sendText('cd agents');
  terminal.sendText('.venv\\Scripts\\activate');
  terminal.sendText('uvicorn main:app --port 5678 --reload');
}

export async function activate(context: vscode.ExtensionContext) {
  console.log('PromptForge: activating...');

  try {
    const versionRepo = new VersionRepository(
      context.globalStorageUri.fsPath
    );

    await versionRepo.initialize();

    const runEvalDisposable = vscode.commands.registerCommand(
      'promptforge.runEval',
      () => runEvalCommand(context, versionRepo)
    );

    const startServerDisposable = vscode.commands.registerCommand(
      'promptforge.startServer',
      () => startPythonServer(context)
    );

    context.subscriptions.push(runEvalDisposable, startServerDisposable);

    checkServerOnStartup();

    console.log('PromptForge: active and ready.');

  } catch (error) {
    console.error('PromptForge: activation failed —', error);
    vscode.window.showErrorMessage(`PromptForge failed to activate: ${error}`);
  }
}

export function deactivate() {
  console.log('PromptForge: deactivated.');
}
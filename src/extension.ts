import * as vscode from 'vscode';
import { VersionRepository } from './db/versionRepository';
import { PromptForgePanel } from './panels/PromptForgePanel';
import { runEvalCommand } from './commands/runEval';

// Runs when VS Code activates the extension
export function activate(context: vscode.ExtensionContext) {

  console.log('PromptForge: activating...');

  // 1. Initialise the SQLite database
  // globalStorageUri is the extension’s private folder on the system
  // On Windows: C:\Users\{user}\AppData\Roaming\Code\User\globalStorage\promptforge
  const versionRepo = new VersionRepository(
    context.globalStorageUri.fsPath
  );

  // 2. Register the main command
  const runEvalDisposable = vscode.commands.registerCommand(
    'promptforge.runEval',
    () => runEvalCommand(context, versionRepo)
  );

  // 3. Register the server command (starts the Python server)
  const startServerDisposable = vscode.commands.registerCommand(
    'promptforge.startServer',
    () => startPythonServer(context)
  );

  // 4. Add the commands to the context so VS Code can clean them up on deactivation
  context.subscriptions.push(runEvalDisposable, startServerDisposable);

  // 5. Verify server on startup (without blocking activation)
  checkServerOnStartup();

  console.log('PromptForge: active and ready.');
}

// Verifies if the server is running when the extension is activated
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

// Start the Python server in a VS Code integrated terminal
function startPythonServer(context: vscode.ExtensionContext): void {
  const terminal = vscode.window.createTerminal('PromptForge — Agents');
  terminal.show();
  terminal.sendText('cd agents');
  terminal.sendText('.venv\\Scripts\\activate');
  terminal.sendText('uvicorn main:app --port 5678 --reload');
}

// Runs when VS Code disables the extension
export function deactivate() {
  console.log('PromptForge: deactivated.');
}
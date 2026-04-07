import * as vscode from 'vscode';
import { VersionRepository } from './db/versionRepository';
import { runEvalCommand } from './commands/runEval';
import { PromptTreeProvider } from './providers/PromptTreeProvider';

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
    // 1. Initialise SQLite
    const versionRepo = new VersionRepository(
      context.globalStorageUri.fsPath
    );
    await versionRepo.initialize();

    // 2. Initialise TreeView provider
    const treeProvider = new PromptTreeProvider(versionRepo);

    const treeView = vscode.window.createTreeView('promptforgeHistory', {
      treeDataProvider: treeProvider,
      showCollapseAll: true,
    });

    // 3. Refresh tree when a .prompt file is opened or closed
    vscode.workspace.onDidOpenTextDocument(doc => {
      if (doc.fileName.endsWith('.prompt')) {
        treeProvider.refresh();
      }
    }, null, context.subscriptions);

    vscode.workspace.onDidCloseTextDocument(doc => {
      if (doc.fileName.endsWith('.prompt')) {
        treeProvider.refresh();
      }
    }, null, context.subscriptions);

    // 4. Register showVersion command — opens version in editor
    const showVersionDisposable = vscode.commands.registerCommand(
      'promptforge.showVersion',
      async (version) => {
        const doc = await vscode.workspace.openTextDocument({
          content: version.content,
          language: 'prompt',
        });
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
      }
    );

    // 5. Register restoreVersion command
    const restoreVersionDisposable = vscode.commands.registerCommand(
      'promptforge.restoreVersion',
      async (item) => {
        const version = item.version;
        if (!version) { return; }

        const editor = vscode.window.activeTextEditor;
        if (!editor) { return; }

        const fullRange = new vscode.Range(
          editor.document.positionAt(0),
          editor.document.positionAt(editor.document.getText().length)
        );

        await editor.edit(editBuilder => {
          editBuilder.replace(fullRange, version.content);
        });

        vscode.window.showInformationMessage(
          `PromptForge: Restored to version ${version.content_hash.slice(0, 8)}`
        );
      }
    );

    // 6. Register main commands
    const runEvalDisposable = vscode.commands.registerCommand(
      'promptforge.runEval',
      () => runEvalCommand(context, versionRepo, treeProvider)
    );

    const startServerDisposable = vscode.commands.registerCommand(
      'promptforge.startServer',
      () => startPythonServer(context)
    );

    context.subscriptions.push(
      treeView,
      runEvalDisposable,
      startServerDisposable,
      showVersionDisposable,
      restoreVersionDisposable
    );

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
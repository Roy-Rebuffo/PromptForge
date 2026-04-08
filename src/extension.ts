import * as vscode from 'vscode';
import * as path from 'path';
import { VersionRepository } from './db/versionRepository';
import { runEvalCommand, evaluateAsPromptCommand } from './commands/runEval';
import { PromptTreeProvider } from './providers/PromptTreeProvider';

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

    // 3. Refresh tree when .prompt files open or close
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

    // 4. Register showVersion command
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

    // 6. Register main command
    const runEvalDisposable = vscode.commands.registerCommand(
      'promptforge.runEval',
      () => runEvalCommand(context, versionRepo, treeProvider)
    );

    // 7. Register evaluate as prompt command (context menu for any file)
    const evaluateAsPromptDisposable = vscode.commands.registerCommand(
      'promptforge.evaluateAsPrompt',
      (uri?: vscode.Uri) => evaluateAsPromptCommand(context, versionRepo, treeProvider, uri)
    );

    context.subscriptions.push(
      treeView,
      runEvalDisposable,
      showVersionDisposable,
      restoreVersionDisposable,
      evaluateAsPromptDisposable,
    );

    console.log('PromptForge: active and ready.');

  } catch (error) {
    console.error('PromptForge: activation failed —', error);
    vscode.window.showErrorMessage(`PromptForge failed to activate: ${error}`);
  }
}

export function deactivate() {
  console.log('PromptForge: deactivated.');
}
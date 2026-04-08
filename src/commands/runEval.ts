import * as vscode from 'vscode';
import * as path from 'path';
import { VersionRepository } from '../db/versionRepository';
import { PromptForgePanel } from '../panels/PromptForgePanel';
import { selectBestModel, showModelInStatusBar } from '../agents/modelSelector';
import { evaluatePrompt } from '../agents/judgeAgent';
import { PromptTreeProvider } from '../providers/PromptTreeProvider';

export async function runEvalCommand(
  context: vscode.ExtensionContext,
  versionRepo: VersionRepository,
  treeProvider: PromptTreeProvider
): Promise<void> {

  // 1. Check active editor has a .prompt file
  const editor = vscode.window.activeTextEditor;

  if (!editor) {
    vscode.window.showWarningMessage('PromptForge: Open a .prompt file to evaluate.');
    return;
  }

  if (!editor.document.fileName.endsWith('.prompt')) {
    vscode.window.showWarningMessage('PromptForge: This command only works with .prompt files.');
    return;
  }

  const content = editor.document.getText();
  const filePath = editor.document.uri.fsPath;
  const contextLabel = path.basename(filePath, '.prompt');

  if (content.trim().length === 0) {
    vscode.window.showWarningMessage('PromptForge: The file is empty.');
    return;
  }

  // 2. Select best available model
  const cancellationSource = new vscode.CancellationTokenSource();
  const selectedModel = await selectBestModel(cancellationSource.token);

  if (!selectedModel) {
    return; // User was shown setup options
  }

  // 3. Show which model is being used
  const statusBar = showModelInStatusBar(selectedModel.modelName, context);

  // 4. Save version to SQLite
  const versionId = versionRepo.upsert(filePath, content);

  // 5. Open panel immediately
  const panel = PromptForgePanel.createOrShow(context);
  panel.setTargetDocument(editor.document);

  // 6. Evaluate with progress notification
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `PromptForge: Evaluating with ${selectedModel.modelName}...`,
      cancellable: true,
    },
    async (_, token) => {
      token.onCancellationRequested(() => cancellationSource.cancel());

      try {
        const diagnosis = await evaluatePrompt(
          selectedModel,
          content,
          contextLabel,
          versionId,
          cancellationSource.token
        );

        // Wait for React to load then send diagnosis
        await new Promise(resolve => setTimeout(resolve, 1000));
        panel.sendDiagnosis(diagnosis);
        treeProvider.refresh();

      } catch (error: any) {
        if (error.name === 'AbortError' || cancellationSource.token.isCancellationRequested) {
          vscode.window.showWarningMessage('PromptForge: Evaluation cancelled.');
        } else {
          console.error('PromptForge evaluation error:', error);
          vscode.window.showErrorMessage(
            `PromptForge: Evaluation failed — ${error.message}`
          );
        }
      } finally {
        statusBar.dispose();
        cancellationSource.dispose();
      }
    }
  );
}
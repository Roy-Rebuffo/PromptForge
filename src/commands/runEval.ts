import * as vscode from 'vscode';
import * as path from 'path';
import { VersionRepository } from '../db/versionRepository';
import { PromptForgePanel } from '../panels/PromptForgePanel';
import { selectBestModel, showModelInStatusBar, clearSessionModel } from '../agents/modelSelector';
import { evaluatePrompt } from '../agents/judgeAgent';
import { PromptTreeProvider } from '../providers/PromptTreeProvider';
import { parsePromptFile, buildCombinedPrompt, describePromptStructure } from '../utils/promptParser';

export async function runEvalCommand(
  context: vscode.ExtensionContext,
  versionRepo: VersionRepository,
  treeProvider: PromptTreeProvider
): Promise<void> {

  const editor = vscode.window.activeTextEditor;

  // When the webview panel has focus, activeTextEditor is undefined.
  // Fall back to the document stored in the panel (set during the previous eval).
  const panelDoc = PromptForgePanel.currentPanel?.getTargetDocument();
  const activeDoc = editor?.document;

  const targetDoc =
    activeDoc?.fileName.endsWith('.prompt') ? activeDoc :
    panelDoc?.fileName.endsWith('.prompt')  ? panelDoc  :
    undefined;

  if (!targetDoc) {
    vscode.window.showWarningMessage('PromptForge: Open a .prompt file to evaluate.');
    return;
  }

  const rawContent = targetDoc.getText();
  const filePath = targetDoc.uri.fsPath;
  const contextLabel = path.basename(filePath, '.prompt');

  if (rawContent.trim().length === 0) {
    vscode.window.showWarningMessage('PromptForge: The file is empty.');
    return;
  }

  const parsed = parsePromptFile(rawContent);
  const contentToEvaluate = buildCombinedPrompt(parsed);
  const structure = describePromptStructure(parsed);

  const cancellationSource = new vscode.CancellationTokenSource();

  // Get preferred model from panel if already open
  const existingPanel = PromptForgePanel.currentPanel;
  const preferredModel = existingPanel?.getSelectedModelName();

  // Select model FIRST — blocks until user chooses (first time)
  const selectedModel = await selectBestModel(cancellationSource.token, preferredModel);
  if (!selectedModel) { return; }

  // Now open panel
  const panel = PromptForgePanel.createOrShow(context);
  panel.setTargetDocument(targetDoc);
  panel.setPromptStructure(parsed);
  panel.refreshModels();

  let shouldRetry = true;
  let currentModel = selectedModel;

  while (shouldRetry) {
    shouldRetry = false;

    const statusBar = showModelInStatusBar(currentModel.modelName, context);
    const versionId = versionRepo.upsert(filePath, rawContent);

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `PromptForge: Evaluating ${structure} with ${currentModel.modelName}...`,
        cancellable: true,
      },
      async (_, token) => {
        token.onCancellationRequested(() => cancellationSource.cancel());

        try {
          const diagnosis = await evaluatePrompt(
            currentModel,
            contentToEvaluate,
            contextLabel,
            versionId,
            cancellationSource.token,
            parsed.hasSections
          );

          await new Promise(resolve => setTimeout(resolve, 1000));
          panel.sendDiagnosis(diagnosis);
          treeProvider.refresh();

        } catch (error: any) {
          if (cancellationSource.token.isCancellationRequested) {
            vscode.window.showWarningMessage('PromptForge: Evaluation cancelled.');

          } else if (error.name === 'QuotaExceededError') {
            clearSessionModel();

            // Tell webview to show error + retry button
            panel.sendEvalError(`${error.modelFamily} has no tokens left. Change model from the dropdown and retry.`);

            // Ask user to change model via VS Code notification
            const selection = await vscode.window.showErrorMessage(
              `PromptForge: ${error.modelFamily} has no tokens left. Select a different model.`,
              'Change model'
            );

            if (selection === 'Change model') {
              clearSessionModel();
              const newModel = await selectBestModel(cancellationSource.token);
              if (newModel) {
                currentModel = newModel;
                panel.refreshModels();
                shouldRetry = true;
              }
            }

          } else {
            console.error('PromptForge evaluation error:', error);
            // Always notify the webview so it exits the loading state
            panel.sendEvalError(error.message ?? 'Evaluation failed. Change model from the dropdown and retry.');
            vscode.window.showErrorMessage(
              `PromptForge: Evaluation failed — ${error.message}`
            );
          }
        } finally {
          statusBar.dispose();
        }
      }
    );
  }

  cancellationSource.dispose();
}

export async function evaluateAsPromptCommand(
  context: vscode.ExtensionContext,
  versionRepo: VersionRepository,
  treeProvider: PromptTreeProvider,
  uri?: vscode.Uri
): Promise<void> {

  let document: vscode.TextDocument;

  if (uri) {
    document = await vscode.workspace.openTextDocument(uri);
  } else if (vscode.window.activeTextEditor) {
    document = vscode.window.activeTextEditor.document;
  } else {
    vscode.window.showWarningMessage('PromptForge: No file selected.');
    return;
  }

  const rawContent = document.getText();
  const filePath = document.uri.fsPath;
  const contextLabel = path.basename(filePath, path.extname(filePath));

  if (rawContent.trim().length === 0) {
    vscode.window.showWarningMessage('PromptForge: The file is empty.');
    return;
  }

  const parsed = parsePromptFile(rawContent);
  const contentToEvaluate = buildCombinedPrompt(parsed);

  const cancellationSource = new vscode.CancellationTokenSource();

  const existingPanel = PromptForgePanel.currentPanel;
  const preferredModel = existingPanel?.getSelectedModelName();

  const selectedModel = await selectBestModel(cancellationSource.token, preferredModel);
  if (!selectedModel) { return; }

  const statusBar = showModelInStatusBar(selectedModel.modelName, context);

  const versionId = filePath.endsWith('.prompt')
    ? versionRepo.upsert(filePath, rawContent)
    : -1;

  const panel = PromptForgePanel.createOrShow(context);
  panel.setTargetDocument(document);
  panel.setPromptStructure(parsed);
  panel.refreshModels();

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `PromptForge: Evaluating ${contextLabel} with ${selectedModel.modelName}...`,
      cancellable: true,
    },
    async (_, token) => {
      token.onCancellationRequested(() => cancellationSource.cancel());

      try {
        const diagnosis = await evaluatePrompt(
          selectedModel,
          contentToEvaluate,
          contextLabel,
          versionId,
          cancellationSource.token,
          parsed.hasSections
        );

        await new Promise(resolve => setTimeout(resolve, 1000));
        panel.sendDiagnosis(diagnosis);
        treeProvider.refresh();

      } catch (error: any) {
        if (cancellationSource.token.isCancellationRequested) {
          vscode.window.showWarningMessage('PromptForge: Evaluation cancelled.');
        } else if (error.name === 'QuotaExceededError') {
          clearSessionModel();
          panel.sendEvalError(`${error.modelFamily} has no tokens left. Change model from the dropdown and retry.`);
          const selection = await vscode.window.showErrorMessage(
            `PromptForge: ${error.modelFamily} has no tokens left. Select a different model.`,
            'Change model'
          );
          if (selection === 'Change model') {
            clearSessionModel();
            await vscode.commands.executeCommand('promptforge.evaluateAsPrompt');
          }
        } else {
          console.error('PromptForge evaluation error:', error);
          panel.sendEvalError(error.message ?? 'Evaluation failed. Change model from the dropdown and retry.');
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
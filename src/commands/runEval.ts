import * as vscode from 'vscode';
import * as path from 'path';
import { VersionRepository } from '../db/versionRepository';
import { PromptForgePanel } from '../panels/PromptForgePanel';
import { selectBestModel, showModelInStatusBar } from '../agents/modelSelector';
import { evaluatePrompt } from '../agents/judgeAgent';
import { PromptTreeProvider } from '../providers/PromptTreeProvider';
import { parsePromptFile, buildCombinedPrompt, describePromptStructure } from '../utils/promptParser';

export async function runEvalCommand(
  context: vscode.ExtensionContext,
  versionRepo: VersionRepository,
  treeProvider: PromptTreeProvider
): Promise<void> {

  const editor = vscode.window.activeTextEditor;

  if (!editor) {
    vscode.window.showWarningMessage('PromptForge: Open a .prompt file to evaluate.');
    return;
  }

  if (!editor.document.fileName.endsWith('.prompt')) {
    vscode.window.showWarningMessage('PromptForge: This command only works with .prompt files.');
    return;
  }

  const rawContent = editor.document.getText();
  const filePath = editor.document.uri.fsPath;
  const contextLabel = path.basename(filePath, '.prompt');

  if (rawContent.trim().length === 0) {
    vscode.window.showWarningMessage('PromptForge: The file is empty.');
    return;
  }

  // Parse sections
  const parsed = parsePromptFile(rawContent);
  const contentToEvaluate = buildCombinedPrompt(parsed);
  const structure = describePromptStructure(parsed);

  const cancellationSource = new vscode.CancellationTokenSource();
  const selectedModel = await selectBestModel(cancellationSource.token);

  if (!selectedModel) { return; }

  const statusBar = showModelInStatusBar(selectedModel.modelName, context);
  const versionId = versionRepo.upsert(filePath, rawContent);

  const panel = PromptForgePanel.createOrShow(context);
  panel.setTargetDocument(editor.document);

  // Pass parsed structure to panel for display
  panel.setPromptStructure(parsed);

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `PromptForge: Evaluating ${structure} with ${selectedModel.modelName}...`,
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
          cancellationSource.token
        );

        await new Promise(resolve => setTimeout(resolve, 1000));
        panel.sendDiagnosis(diagnosis);
        treeProvider.refresh();

      } catch (error: any) {
        if (cancellationSource.token.isCancellationRequested) {
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

// Evaluate any file as a prompt — for context menu
export async function evaluateAsPromptCommand(
  context: vscode.ExtensionContext,
  versionRepo: VersionRepository,
  treeProvider: PromptTreeProvider,
  uri?: vscode.Uri
): Promise<void> {

  // Get the document — from uri (context menu) or active editor
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
  const selectedModel = await selectBestModel(cancellationSource.token);

  if (!selectedModel) { return; }

  const statusBar = showModelInStatusBar(selectedModel.modelName, context);

  // For non-.prompt files we don't version — just evaluate
  const versionId = filePath.endsWith('.prompt')
    ? versionRepo.upsert(filePath, rawContent)
    : -1;

  const panel = PromptForgePanel.createOrShow(context);
  panel.setTargetDocument(document);
  panel.setPromptStructure(parsed);

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `PromptForge: Evaluating ${contextLabel}...`,
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
        } else {
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
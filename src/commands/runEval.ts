import * as vscode from 'vscode';
import * as path from 'path';
import { VersionRepository } from '../db/versionRepository';
import { PromptForgePanel } from '../panels/PromptForgePanel';
import { PromptTreeProvider } from '../providers/PromptTreeProvider';

export async function runEvalCommand(
  context: vscode.ExtensionContext,
  versionRepo: VersionRepository,
  treeProvider: PromptTreeProvider
): Promise<void> {

  // 1. Check that there is an active editor with a .prompt file
  const editor = vscode.window.activeTextEditor;

  if (!editor) {
vscode.window.showWarningMessage('PromptForge: Open a .prompt file to evaluate.');
    return;
  }

  if (!editor.document.fileName.endsWith('.prompt')) {
    vscode.window.showWarningMessage('PromptForge: This command only works with .prompt files');
    return;
  }

  // 2. Capture the content in memory (without requiring Ctrl+S)
  const content = editor.document.getText();
  const filePath = editor.document.uri.fsPath;

  if (content.trim().length === 0) {
    vscode.window.showWarningMessage('PromptForge: The file is empty.');
    return;
  }

  // 3. Save version to SQLite (upsert — does not create duplicates)
  const versionId = versionRepo.upsert(filePath, content);

  // 4. Display progress whilst calling the Python server
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'PromptForge: Evaluating prompt...',
      cancellable: false,
    },
    async () => {
      // 5. Check that the Python server is running
      const serverReady = await checkServer();

      if (!serverReady) {
        vscode.window.showErrorMessage(
          'PromptForge: The agent server is not running. Run: cd agents && uvicorn main:app --port 5678'
        );
        return;
      }

      // 6. Call the /evaluate endpoint on the Python server
      const diagnosis = await callEvaluate(content, filePath, versionId);

      if (!diagnosis) {
        vscode.window.showErrorMessage('PromptForge: Error evaluating the prompt. Check the console.');
        return;
      }

      // 7. Open the WebView panel and send it the result
      const panel = PromptForgePanel.createOrShow(context);
      panel.setTargetDocument(editor.document);
      await new Promise(resolve => setTimeout(resolve, 1000));
      panel.sendDiagnosis(diagnosis);
      treeProvider.refresh();
    }
  );
}

// Check that the FastAPI server is running
async function checkServer(): Promise<boolean> {
  try {
    const response = await fetch('http://localhost:5678/health');
    return response.ok;
  } catch {
    return false;
  }
}

// Calls the /evaluate endpoint on the Python server and returns the DiagnosisResult
async function callEvaluate(
  content: string,
  filePath: string,
  versionId: number
): Promise<any | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000); // 30s timeout

    const response = await fetch('http://localhost:5678/evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt_content: content,
        context_label: path.basename(filePath, '.prompt'),
        version_id: versionId,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const error = await response.text();
      console.error('PromptForge evaluate error:', error);
      vscode.window.showErrorMessage(
        `PromptForge: Evaluation failed — ${response.status} ${response.statusText}`
      );
      return null;
    }

    return await response.json();

  } catch (error: any) {
    if (error.name === 'AbortError') {
      vscode.window.showErrorMessage(
        'PromptForge: Evaluation timed out after 30 seconds. Check the agent server.'
      );
    } else {
      vscode.window.showErrorMessage(
        'PromptForge: Could not reach the agent server. Use "PromptForge: Start Agent Server" to start it.'
      );
    }
    return null;
  }
}
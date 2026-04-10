import * as vscode from 'vscode';
import * as path from 'path';
import { DiagnosisResult, ImprovementResult, WebviewMessage } from '../types';
import { selectBestModel, listAvailableModels, clearSessionModel } from '../agents/modelSelector';
import { improvePrompt } from '../agents/improvementAgent';
import { ParsedPrompt } from '../utils/promptParser';

export class PromptForgePanel {
  public static currentPanel: PromptForgePanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _context: vscode.ExtensionContext;
  private _disposables: vscode.Disposable[] = [];
  private _targetDocument: vscode.TextDocument | undefined;
  private _promptStructure: ParsedPrompt | undefined;
  private _selectedModelName: string | undefined;
  private _webviewReady = false;
  private _messageQueue: object[] = [];

  public static createOrShow(context: vscode.ExtensionContext): PromptForgePanel {
    if (PromptForgePanel.currentPanel) {
      // Reveal in the panel's current column so we don't move it and close adjacent files
      const currentColumn = PromptForgePanel.currentPanel._panel.viewColumn ?? vscode.ViewColumn.Beside;
      PromptForgePanel.currentPanel._panel.reveal(currentColumn);
      return PromptForgePanel.currentPanel;
    }

    const column = vscode.window.activeTextEditor
      ? vscode.ViewColumn.Beside
      : vscode.ViewColumn.One;

    const panel = vscode.window.createWebviewPanel(
      'promptForge',
      'PromptForge',
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.file(path.join(context.extensionPath, 'dist', 'webview'))
        ],
      }
    );

    PromptForgePanel.currentPanel = new PromptForgePanel(panel, context);
    return PromptForgePanel.currentPanel;
  }

  private constructor(panel: vscode.WebviewPanel, context: vscode.ExtensionContext) {
    this._panel = panel;
    this._context = context;

    this._panel.webview.html = this._getWebviewContent();

    this._panel.webview.onDidReceiveMessage(
      (message: WebviewMessage) => this._handleMessage(message),
      null,
      this._disposables
    );

    this._panel.onDidDispose(
      () => this.dispose(),
      null,
      this._disposables
    );

    // Fallback: if WEBVIEW_READY never arrives (old cached bundle, slow load),
    // flush the queue after 3s so messages are never lost.
    const fallbackTimer = setTimeout(() => {
      if (!this._webviewReady) {
        console.warn('PromptForge: WEBVIEW_READY not received, flushing queue via fallback');
        this._webviewReady = true;
        for (const msg of this._messageQueue) {
          this._panel.webview.postMessage(msg);
        }
        this._messageQueue = [];
        this._sendAvailableModels();
      }
    }, 3000);

    this._disposables.push({ dispose: () => clearTimeout(fallbackTimer) });
  }

  /** Send a message to the webview, queuing it if the webview isn't ready yet. */
  private _postMessage(message: object): void {
    if (this._webviewReady) {
      this._panel.webview.postMessage(message);
    } else {
      this._messageQueue.push(message);
    }
  }

  public setTargetDocument(doc: vscode.TextDocument): void {
    this._targetDocument = doc;
  }

  public setPromptStructure(parsed: ParsedPrompt): void {
    this._promptStructure = parsed;
    this._postMessage({
      type: 'PROMPT_STRUCTURE',
      payload: {
        hasSections: parsed.hasSections,
        sections: parsed.sections.map(s => ({
          tag: s.tag,
          lineCount: s.endLine - s.startLine + 1,
        })),
      },
    });
  }

  public sendDiagnosis(diagnosis: DiagnosisResult): void {
    this._postMessage({
      type: 'EVAL_COMPLETE',
      payload: diagnosis,
    });
  }

  public sendImprovement(improvement: ImprovementResult): void {
    this._postMessage({
      type: 'IMPROVE_COMPLETE',
      payload: improvement,
    });
  }

  public sendImproveError(message: string): void {
    this._postMessage({
      type: 'IMPROVE_ERROR',
      payload: { message },
    });
  }

  public getSelectedModelName(): string | undefined {
    return this._selectedModelName;
  }

  public getTargetDocument(): vscode.TextDocument | undefined {
    return this._targetDocument;
  }

  private async _sendAvailableModels(): Promise<void> {
    try {
      const models = await listAvailableModels();
      const config = vscode.workspace.getConfiguration('promptforge');
      const groqKey = config.get<string>('groqApiKey');

      if (groqKey) {
        models.push('groq/llama-3.3-70b-versatile');
      }

      const current = this._selectedModelName ?? models[0] ?? '';

      this._postMessage({
        type: 'MODELS_AVAILABLE',
        payload: { models, current },
      });
    } catch (error) {
      console.error('PromptForge: could not list models', error);
    }
  }

  private async _handleMessage(message: WebviewMessage): Promise<void> {
    switch (message.type) {

      case 'WEBVIEW_READY': {
        this._webviewReady = true;
        // Flush any messages queued before the webview was ready
        for (const msg of this._messageQueue) {
          this._panel.webview.postMessage(msg);
        }
        this._messageQueue = [];
        // Now safe to send available models
        this._sendAvailableModels();
        break;
      }

      case 'IMPROVE_REQUEST': {
        const preferredModel = this._selectedModelName;
        const cancellationSource = new vscode.CancellationTokenSource();
        const targetDim = (message as any).target_dim as string | undefined;

        try {
          const selectedModel = await selectBestModel(cancellationSource.token, preferredModel);
          if (!selectedModel) { break; }

          await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: `PromptForge: Generating improvement with ${selectedModel.modelName}...`,
              cancellable: false,
            },
            async () => {
              const improvement = await improvePrompt(
                selectedModel,
                message.payload,
                cancellationSource.token,
                targetDim
              );
              this.sendImprovement(improvement);
            }
          );

        } catch (error: any) {
          if (error.name === 'QuotaExceededError') {
            clearSessionModel();
            this.sendImproveError(`${error.modelFamily} has no tokens left. Change model from the dropdown and try again.`);
            vscode.window.showErrorMessage(
              `PromptForge: ${error.modelFamily} has no tokens left.`
            );
          } else {
            this.sendImproveError(error.message ?? 'Improvement failed.');
            vscode.window.showErrorMessage(
              `PromptForge: Improvement failed — ${error.message}`
            );
          }
        } finally {
          cancellationSource.dispose();
        }
        break;
      }

      case 'APPLY_IMPROVEMENT': {
        const doc = this._targetDocument;
        if (!doc) {
          vscode.window.showErrorMessage('PromptForge: No target document found.');
          break;
        }

        const editor = await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);

        const fullRange = new vscode.Range(
          editor.document.positionAt(0),
          editor.document.positionAt(editor.document.getText().length)
        );

        await editor.edit(editBuilder => {
          editBuilder.replace(fullRange, message.payload.content);
        });

        vscode.window.showInformationMessage(
          'PromptForge: Improvement applied. Re-evaluating...'
        );

        await new Promise(resolve => setTimeout(resolve, 500));
        await vscode.commands.executeCommand('promptforge.runEval');
        break;
      }

      case 'SELECT_MODEL': {
        this._selectedModelName = message.payload.modelName;
        clearSessionModel();
        // Refresh dropdown to reflect new selection
        this.refreshModels();
        console.log(`PromptForge: user selected model ${message.payload.modelName}`);
        break;
      }

      case 'CHANGE_MODEL_REQUEST': {
        // Show the VS Code QuickPick so the user can pick a different model,
        // then update the panel selection and refresh the dropdown.
        clearSessionModel();
        const cancellationSource = new vscode.CancellationTokenSource();
        const newModel = await selectBestModel(cancellationSource.token);
        cancellationSource.dispose();
        if (newModel) {
          this._selectedModelName = newModel.modelName;
          this.refreshModels();
        }
        break;
      }

      case 'RETRY_EVAL': {
        await vscode.commands.executeCommand('promptforge.runEval');
        break;
      }
    }
  }

  private _getWebviewContent(): string {
    const webviewDir = path.join(this._context.extensionPath, 'dist', 'webview');
    const jsPath = vscode.Uri.file(path.join(webviewDir, 'main.js'));
    const cssPath = vscode.Uri.file(path.join(webviewDir, 'main.css'));

    const jsUri = this._panel.webview.asWebviewUri(jsPath);
    const cssUri = this._panel.webview.asWebviewUri(cssPath);

    const nonce = this._getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
             style-src ${this._panel.webview.cspSource} 'unsafe-inline';
             script-src 'nonce-${nonce}';">
  <link rel="stylesheet" href="${cssUri}" />
  <title>PromptForge</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${jsUri}"></script>
</body>
</html>`;
  }

  private _getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }

  public dispose(): void {
    PromptForgePanel.currentPanel = undefined;
    this._panel.dispose();
    this._disposables.forEach(d => d.dispose());
    this._disposables = [];
  }

  public refreshModels(): void {
    if (this._webviewReady) {
      this._sendAvailableModels();
    }
    // If not ready yet, WEBVIEW_READY handler will call _sendAvailableModels()
  }

  public sendEvalError(message: string): void {
    this._postMessage({
      type: 'EVAL_ERROR',
      payload: { message, canRetry: true },
    });
  }
}

import * as vscode from 'vscode';
import * as path from 'path';
import { DiagnosisResult, ImprovementResult, WebviewMessage } from '../types';
import { selectBestModel } from '../agents/modelSelector';
import { improvePrompt } from '../agents/improvementAgent';
import { ParsedPrompt } from '../utils/promptParser';

export class PromptForgePanel {
  public static currentPanel: PromptForgePanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _context: vscode.ExtensionContext;
  private _disposables: vscode.Disposable[] = [];
  private _targetDocument: vscode.TextDocument | undefined;
  private _promptStructure: ParsedPrompt | undefined;

  public static createOrShow(context: vscode.ExtensionContext): PromptForgePanel {
    const column = vscode.window.activeTextEditor
      ? vscode.ViewColumn.Beside
      : vscode.ViewColumn.One;

    if (PromptForgePanel.currentPanel) {
      PromptForgePanel.currentPanel._panel.reveal(column);
      return PromptForgePanel.currentPanel;
    }

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
  }

  public setTargetDocument(doc: vscode.TextDocument): void {
    this._targetDocument = doc;
  }

  public setPromptStructure(parsed: ParsedPrompt): void {
  this._promptStructure = parsed;
  // Send structure info to the Webview
  this._panel.webview.postMessage({
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
    this._panel.webview.postMessage({
      type: 'EVAL_COMPLETE',
      payload: diagnosis,
    } as WebviewMessage);
  }

  public sendImprovement(improvement: ImprovementResult): void {
    this._panel.webview.postMessage({
      type: 'IMPROVE_COMPLETE',
      payload: improvement,
    } as WebviewMessage);
  }

  private async _handleMessage(message: WebviewMessage): Promise<void> {
    switch (message.type) {

      case 'IMPROVE_REQUEST': {
        const cancellationSource = new vscode.CancellationTokenSource();
        const targetDim = (message as any).target_dim as string | undefined;

        try {
          const selectedModel = await selectBestModel(cancellationSource.token);
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
          console.error('PromptForge improvement error:', error);
          vscode.window.showErrorMessage(
            `PromptForge: Improvement failed — ${error.message}`
          );
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
          'PromptForge: Improvement applied. Review the changes and press Run Eval to validate.'
        );
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
}
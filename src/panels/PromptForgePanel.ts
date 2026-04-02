import * as vscode from 'vscode';
import { DiagnosisResult, ImprovementResult, WebviewMessage } from '../types';

export class PromptForgePanel {
  // Instancia singleton — solo un panel abierto a la vez
  public static currentPanel: PromptForgePanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _context: vscode.ExtensionContext;
  private _disposables: vscode.Disposable[] = [];

  // Crea el panel si no existe, o lo enfoca si ya está abierto
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
        retainContextWhenHidden: true, // no destruye el React cuando cambias de tab
      }
    );

    PromptForgePanel.currentPanel = new PromptForgePanel(panel, context);
    return PromptForgePanel.currentPanel;
  }

  private constructor(panel: vscode.WebviewPanel, context: vscode.ExtensionContext) {
    this._panel = panel;
    this._context = context;

    // Contenido inicial del panel
    this._panel.webview.html = this._getLoadingHtml();

    // Escucha mensajes que vienen del React
    this._panel.webview.onDidReceiveMessage(
      (message: WebviewMessage) => this._handleMessage(message),
      null,
      this._disposables
    );

    // Limpia cuando el dev cierra el panel
    this._panel.onDidDispose(
      () => this.dispose(),
      null,
      this._disposables
    );
  }

  // Envía el diagnóstico al React para que lo renderice
  public sendDiagnosis(diagnosis: DiagnosisResult): void {
    this._panel.webview.postMessage({
      type: 'EVAL_COMPLETE',
      payload: diagnosis,
    } as WebviewMessage);
  }

  // Envía la mejora sugerida al React
  public sendImprovement(improvement: ImprovementResult): void {
    this._panel.webview.postMessage({
      type: 'IMPROVE_COMPLETE',
      payload: improvement,
    } as WebviewMessage);
  }

  // Maneja los mensajes que vienen del React hacia la extensión
  private async _handleMessage(message: WebviewMessage): Promise<void> {
    switch (message.type) {

      case 'IMPROVE_REQUEST': {
        // El dev pulsó "Sugerir mejora" en el panel
        const improvement = await this._callImprove(message.payload);
        if (improvement) {
          this.sendImprovement(improvement);
        } else {
          vscode.window.showErrorMessage('PromptForge: Error al generar la mejora.');
        }
        break;
      }

      case 'APPLY_IMPROVEMENT': {
        // El dev pulsó "Aplicar" en el diff
        const editor = vscode.window.activeTextEditor;
        if (!editor) { break; }

        const fullRange = new vscode.Range(
          editor.document.positionAt(0),
          editor.document.positionAt(editor.document.getText().length)
        );

        await editor.edit(editBuilder => {
          editBuilder.replace(fullRange, message.payload.content);
        });

        vscode.window.showInformationMessage(
          'PromptForge: Mejora aplicada. Revisa los cambios y pulsa Run Eval para validarla.'
        );
        break;
      }
    }
  }

  // Llama al endpoint /improve del servidor Python
  private async _callImprove(diagnosis: DiagnosisResult): Promise<ImprovementResult | null> {
    try {
      const response = await fetch('http://localhost:5678/improve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(diagnosis),
      });

      if (!response.ok) { return null; }
      return await response.json() as ImprovementResult;
    } catch {
      return null;
    }
  }

  // HTML temporal mientras no tenemos el React compilado
  private _getLoadingHtml(): string {
    return `<!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>PromptForge</title>
      <style>
        body {
          font-family: var(--vscode-font-family);
          color: var(--vscode-foreground);
          background: var(--vscode-editor-background);
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100vh;
          margin: 0;
          flex-direction: column;
          gap: 12px;
        }
        .spinner {
          width: 24px;
          height: 24px;
          border: 2px solid var(--vscode-foreground);
          border-top-color: transparent;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        p { font-size: 13px; opacity: 0.6; margin: 0; }
      </style>
    </head>
    <body>
      <div class="spinner"></div>
      <p>Esperando evaluación...</p>
    </body>
    </html>`;
  }

  // Limpieza cuando se cierra el panel
  public dispose(): void {
    PromptForgePanel.currentPanel = undefined;
    this._panel.dispose();
    this._disposables.forEach(d => d.dispose());
    this._disposables = [];
  }
}
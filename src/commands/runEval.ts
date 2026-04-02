import * as vscode from 'vscode';
import * as path from 'path';
import { VersionRepository } from '../db/versionRepository';
import { PromptForgePanel } from '../panels/PromptForgePanel';

export async function runEvalCommand(
  context: vscode.ExtensionContext,
  versionRepo: VersionRepository
): Promise<void> {

  // 1. Verificar que hay un editor activo con un archivo .prompt
  const editor = vscode.window.activeTextEditor;

  if (!editor) {
    vscode.window.showWarningMessage('PromptForge: Abre un archivo .prompt para evaluar.');
    return;
  }

  if (!editor.document.fileName.endsWith('.prompt')) {
    vscode.window.showWarningMessage('PromptForge: Este comando solo funciona con archivos .prompt');
    return;
  }

  // 2. Capturar el contenido en memoria (sin requerir Ctrl+S)
  const content = editor.document.getText();
  const filePath = editor.document.uri.fsPath;

  if (content.trim().length === 0) {
    vscode.window.showWarningMessage('PromptForge: El archivo está vacío.');
    return;
  }

  // 3. Guardar versión en SQLite (upsert — no crea duplicados)
  const versionId = versionRepo.upsert(filePath, content);

  // 4. Mostrar progreso mientras llama al servidor Python
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'PromptForge: Evaluando prompt...',
      cancellable: false,
    },
    async () => {
      // 5. Verificar que el servidor Python está corriendo
      const serverReady = await checkServer();

      if (!serverReady) {
        vscode.window.showErrorMessage(
          'PromptForge: El servidor de agentes no está corriendo. Ejecuta: cd agents && uvicorn main:app --port 5678'
        );
        return;
      }

      // 6. Llamar al endpoint /evaluate del servidor Python
      const diagnosis = await callEvaluate(content, filePath, versionId);

      if (!diagnosis) {
        vscode.window.showErrorMessage('PromptForge: Error al evaluar el prompt. Revisa la consola.');
        return;
      }

      // 7. Abrir el panel Webview y enviarle el resultado
      const panel = PromptForgePanel.createOrShow(context);
      panel.sendDiagnosis(diagnosis);
    }
  );
}

// Verifica que el servidor FastAPI está corriendo
async function checkServer(): Promise<boolean> {
  try {
    const response = await fetch('http://localhost:5678/health');
    return response.ok;
  } catch {
    return false;
  }
}

// Llama al endpoint /evaluate y devuelve el DiagnosisResult
async function callEvaluate(
  content: string,
  filePath: string,
  versionId: number
): Promise<any | null> {
  try {
    const response = await fetch('http://localhost:5678/evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt_content: content,
        context_label: path.basename(filePath, '.prompt'),
        version_id: versionId,
      }),
    });

    if (!response.ok) {
      console.error('PromptForge evaluate error:', await response.text());
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error('PromptForge fetch error:', error);
    return null;
  }
}
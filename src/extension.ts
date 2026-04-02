import * as vscode from 'vscode';
import { VersionRepository } from './db/versionRepository';
import { PromptForgePanel } from './panels/PromptForgePanel';
import { runEvalCommand } from './commands/runEval';

// Se ejecuta cuando VS Code activa la extensión
export function activate(context: vscode.ExtensionContext) {

  console.log('PromptForge: activando...');

  // 1. Inicializar el repositorio SQLite
  // globalStorageUri es la carpeta privada de la extensión en el sistema
  // En Windows: C:\Users\{user}\AppData\Roaming\Code\User\globalStorage\promptforge
  const versionRepo = new VersionRepository(
    context.globalStorageUri.fsPath
  );

  // 2. Registrar el comando principal
  const runEvalDisposable = vscode.commands.registerCommand(
    'promptforge.runEval',
    () => runEvalCommand(context, versionRepo)
  );

  // 3. Registrar el comando de servidor (arranca el servidor Python)
  const startServerDisposable = vscode.commands.registerCommand(
    'promptforge.startServer',
    () => startPythonServer(context)
  );

  // 4. Añadir los comandos al contexto para que VS Code los limpie al desactivar
  context.subscriptions.push(runEvalDisposable, startServerDisposable);

  // 5. Verificar servidor al arrancar (sin bloquear la activación)
  checkServerOnStartup();

  console.log('PromptForge: activa y lista.');
}

// Verifica si el servidor está corriendo al activar la extensión
async function checkServerOnStartup(): Promise<void> {
  try {
    const response = await fetch('http://localhost:5678/health');
    if (response.ok) {
      console.log('PromptForge: servidor Python detectado en puerto 5678.');
    } else {
      showServerWarning();
    }
  } catch {
    showServerWarning();
  }
}

function showServerWarning(): void {
  vscode.window.showWarningMessage(
    'PromptForge: El servidor de agentes no está corriendo.',
    'Cómo arrancarlo'
  ).then(selection => {
    if (selection === 'Cómo arrancarlo') {
      vscode.env.openExternal(
        vscode.Uri.parse('https://github.com/tuusuario/promptforge#servidor')
      );
    }
  });
}

// Arranca el servidor Python en un terminal integrado de VS Code
function startPythonServer(context: vscode.ExtensionContext): void {
  const terminal = vscode.window.createTerminal('PromptForge — Agentes');
  terminal.show();
  terminal.sendText('cd agents');
  terminal.sendText('.venv\\Scripts\\activate');
  terminal.sendText('uvicorn main:app --port 5678 --reload');
}

// Se ejecuta cuando VS Code desactiva la extensión
export function deactivate() {
  console.log('PromptForge: desactivada.');
}
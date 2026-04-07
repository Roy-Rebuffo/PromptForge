import * as vscode from 'vscode';
import * as path from 'path';
import { VersionRepository } from '../db/versionRepository';
import { PromptVersion } from '../types';

export class PromptTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly version?: PromptVersion,
    public readonly isFile?: boolean,
  ) {
    super(label, collapsibleState);

    if (version) {
      // Version item
      const date = new Date(version.created_at * 1000);
      const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const dateStr = date.toLocaleDateString([], { day: '2-digit', month: '2-digit' });

      this.description = `${dateStr} ${timeStr}`;
      this.tooltip = version.message ?? version.content_hash.slice(0, 8);
      this.iconPath = new vscode.ThemeIcon(
        version.source === 'suggested' ? 'sparkle' : 'git-commit'
      );
      this.contextValue = 'promptVersion';
      this.command = {
        command: 'promptforge.showVersion',
        title: 'Show version',
        arguments: [version],
      };
    }

    if (isFile) {
      // File item
      this.iconPath = new vscode.ThemeIcon('file');
      this.contextValue = 'promptFile';
    }
  }
}

export class PromptTreeProvider implements vscode.TreeDataProvider<PromptTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<PromptTreeItem | undefined | null>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private _versionRepo: VersionRepository;

  constructor(versionRepo: VersionRepository) {
    this._versionRepo = versionRepo;
  }

  // Call this to refresh the sidebar
  refresh(): void {
    this._onDidChangeTreeData.fire(null);
  }

  getTreeItem(element: PromptTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: PromptTreeItem): PromptTreeItem[] {
    if (!element) {
      // Root level — show open .prompt files
      return this._getPromptFiles();
    }

    if (element.isFile && element.resourceUri) {
      // File level — show versions for this file
      return this._getVersionsForFile(element.resourceUri.fsPath);
    }

    return [];
  }

  private _getPromptFiles(): PromptTreeItem[] {
    const openDocs = vscode.workspace.textDocuments.filter(
      doc => doc.fileName.endsWith('.prompt')
    );

    if (openDocs.length === 0) {
      const empty = new PromptTreeItem(
        'No .prompt files open',
        vscode.TreeItemCollapsibleState.None
      );
      empty.iconPath = new vscode.ThemeIcon('info');
      return [empty];
    }

    return openDocs.map(doc => {
      const fileName = path.basename(doc.fileName);
      const item = new PromptTreeItem(
        fileName,
        vscode.TreeItemCollapsibleState.Expanded,
        undefined,
        true
      );
      item.resourceUri = doc.uri;
      return item;
    });
  }

  private _getVersionsForFile(filePath: string): PromptTreeItem[] {
    const versions = this._versionRepo.listByFile(filePath);

    if (versions.length === 0) {
      const empty = new PromptTreeItem(
        'No versions yet',
        vscode.TreeItemCollapsibleState.None
      );
      empty.iconPath = new vscode.ThemeIcon('info');
      return [empty];
    }

    return versions.map((version, index) => {
      const label = version.message
        ?? `Version ${versions.length - index}`;

      return new PromptTreeItem(
        label,
        vscode.TreeItemCollapsibleState.None,
        version
      );
    });
  }
}
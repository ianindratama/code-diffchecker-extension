import * as vscode from 'vscode';
import * as path from 'path';
import { DiffResult, DiffTreeNode, DiffStatus } from '@dicodingacademy/code-diffchecker-core';

/**
 * TreeView data provider that renders a hierarchical view of file diffs.
 * Groups files by directory to match VS Code's native file explorer feel.
 */
export class DiffTreeViewProvider implements vscode.TreeDataProvider<DiffTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<DiffTreeItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private rootNodes: DiffTreeNode[] = [];
  private _diffCount = 0;

  get diffCount(): number {
    return this._diffCount;
  }

  /**
   * Updates the tree with new diff results and triggers a re-render.
   */
  refresh(diffResults: DiffResult[]): void {
    this._diffCount = diffResults.length;
    this.rootNodes = this.buildTree(diffResults);
    this._onDidChangeTreeData.fire();
  }

  /**
   * Clears the tree.
   */
  clear(): void {
    this._diffCount = 0;
    this.rootNodes = [];
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: DiffTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: DiffTreeItem): DiffTreeItem[] {
    if (!element) {
      // Root level
      return this.rootNodes.map((node) => this.createTreeItem(node));
    }

    // Children of a directory node
    if (element.node.children) {
      return element.node.children.map((child) => this.createTreeItem(child));
    }

    return [];
  }

  /**
   * Builds a hierarchical tree from a flat list of diff results.
   */
  private buildTree(diffResults: DiffResult[]): DiffTreeNode[] {
    interface TempNode {
      isDirectory: boolean;
      diff?: DiffResult;
      childrenMap: Map<string, TempNode>;
    }

    const rootMap = new Map<string, TempNode>();

    for (const diff of diffResults) {
      const parts = diff.relativePath.split('/');
      let currentMap = rootMap;

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const isLast = i === parts.length - 1;

        if (isLast) {
          currentMap.set(part, {
            isDirectory: false,
            diff,
            childrenMap: new Map(),
          });
        } else {
          let dirNode = currentMap.get(part);
          if (!dirNode) {
            dirNode = {
              isDirectory: true,
              childrenMap: new Map(),
            };
            currentMap.set(part, dirNode);
          }
          currentMap = dirNode.childrenMap;
        }
      }
    }

    const convertMapToArray = (map: Map<string, TempNode>, currentPath: string): DiffTreeNode[] => {
      const nodes = Array.from(map.entries()).map(([name, tempNode]) => {
        const relativePath = currentPath ? `${currentPath}/${name}` : name;
        
        if (tempNode.isDirectory) {
          return {
            label: name,
            relativePath,
            isDirectory: true,
            children: convertMapToArray(tempNode.childrenMap, relativePath)
          };
        } else {
          return {
            label: name,
            relativePath,
            isDirectory: false,
            diff: tempNode.diff
          };
        }
      });
      
      return nodes.sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) { return -1; }
        if (!a.isDirectory && b.isDirectory) { return 1; }
        return a.label.localeCompare(b.label);
      });
    };

    return convertMapToArray(rootMap, '');
  }

  /**
   * Creates a VS Code TreeItem from a DiffTreeNode.
   */
  private createTreeItem(node: DiffTreeNode): DiffTreeItem {
    const collapsibleState = node.isDirectory
      ? vscode.TreeItemCollapsibleState.Expanded
      : vscode.TreeItemCollapsibleState.None;

    const item = new DiffTreeItem(
      node.label,
      collapsibleState,
      node
    );

    if (node.isDirectory) {
      // Directory node
      item.iconPath = new vscode.ThemeIcon('folder');
      item.contextValue = 'directory';
    } else if (node.diff) {
      // File node with diff info
      const diff = node.diff;

      // Set icon based on status
      item.iconPath = this.getStatusIcon(diff.status);
      item.description = this.getStatusLabel(diff.status);
      item.contextValue = diff.isBinary ? 'binaryFile' : 'diffFile';

      if (diff.isBinary) {
        // Binary files are not clickable
        item.tooltip = `${diff.relativePath} (Binary file — cannot show diff)`;
      } else {
        // Non-binary: click opens the diff editor
        item.tooltip = diff.relativePath;
        item.command = this.createDiffCommand(diff);
      }
    }

    return item;
  }

  /**
   * Returns a ThemeIcon for the given diff status.
   */
  private getStatusIcon(status: DiffStatus): vscode.ThemeIcon {
    switch (status) {
      case 'added':
        return new vscode.ThemeIcon('diff-added', new vscode.ThemeColor('gitDecoration.addedResourceForeground'));
      case 'modified':
        return new vscode.ThemeIcon('diff-modified', new vscode.ThemeColor('gitDecoration.modifiedResourceForeground'));
      case 'deleted':
        return new vscode.ThemeIcon('diff-removed', new vscode.ThemeColor('gitDecoration.deletedResourceForeground'));
    }
  }

  /**
   * Returns a human-readable label for the diff status.
   */
  private getStatusLabel(status: DiffStatus): string {
    switch (status) {
      case 'added': return 'Missing from your project';
      case 'modified': return 'Modified';
      case 'deleted': return 'Extra file (not in solution)';
    }
  }

  /**
   * Creates a vscode.diff command for opening the side-by-side diff editor.
   */
  private createDiffCommand(diff: DiffResult): vscode.Command {
    const filename = path.basename(diff.relativePath);
    const title = `${filename} (Student ↔ Solution)`;

    // For 'added' files (only in solution), show empty local vs solution
    // For 'deleted' files (only in local), show local vs empty solution
    // For 'modified' files, show local vs solution
    const leftUri = diff.localPath ? vscode.Uri.file(diff.localPath) : vscode.Uri.parse('untitled:empty');
    const rightUri = diff.solutionPath ? vscode.Uri.file(diff.solutionPath) : vscode.Uri.parse('untitled:empty');

    return {
      command: 'vscode.diff',
      title: 'Open Diff',
      arguments: [leftUri, rightUri, title],
    };
  }
}

/**
 * Custom TreeItem that holds a reference to its DiffTreeNode.
 */
export class DiffTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly node: DiffTreeNode
  ) {
    super(label, collapsibleState);
  }
}

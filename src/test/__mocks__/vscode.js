// Minimal vscode mock for running unit tests outside the Extension Host.
// Only stubs the APIs used by our modules.

module.exports = {
  Uri: {
    file: (path) => ({ scheme: 'file', fsPath: path, path: path }),
    parse: (str) => ({ scheme: 'untitled', fsPath: '', path: str }),
  },
  workspace: {
    getConfiguration: () => ({
      get: () => undefined,
    }),
    workspaceFolders: [],
  },
  window: {
    createOutputChannel: () => ({
      appendLine: () => {},
      dispose: () => {},
    }),
    showErrorMessage: () => Promise.resolve(),
    showInformationMessage: () => Promise.resolve(),
    showWarningMessage: () => Promise.resolve(),
    withProgress: () => Promise.resolve(),
    createTreeView: () => ({ dispose: () => {} }),
  },
  commands: {
    registerCommand: () => ({ dispose: () => {} }),
    executeCommand: () => Promise.resolve(),
  },
  TreeItem: class TreeItem {
    constructor(label, collapsibleState) {
      this.label = label;
      this.collapsibleState = collapsibleState;
    }
  },
  TreeItemCollapsibleState: {
    None: 0,
    Collapsed: 1,
    Expanded: 2,
  },
  ThemeIcon: class ThemeIcon {
    constructor(id, color) {
      this.id = id;
      this.color = color;
    }
  },
  ThemeColor: class ThemeColor {
    constructor(id) {
      this.id = id;
    }
  },
  EventEmitter: class EventEmitter {
    constructor() {
      this._listeners = [];
    }
    get event() {
      return (listener) => {
        this._listeners.push(listener);
        return { dispose: () => {} };
      };
    }
    fire(data) {
      this._listeners.forEach((l) => l(data));
    }
    dispose() {}
  },
  ProgressLocation: {
    Notification: 15,
  },
};

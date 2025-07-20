module.exports = {
  window: {
    showErrorMessage: jest.fn(),
    showInformationMessage: jest.fn(),
    activeTextEditor: null,
  },
  workspace: {
    workspaceFolders: [{ uri: { fsPath: 'e:/Work/MyExtension/extention' } }],
  },
  Range: jest.fn(),
};

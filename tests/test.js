const fs = require('fs');
const path = require('path');
const JSON5 = require('json5');
const { getDictionaryJson, setDictionary, findSimilarLabelPath, delEmptyObjects, translateSchema } = require('../src/extension');

describe('getDictionaryJson', () => {
  it('should return categories object', () => {
    const result = getDictionaryJson('categories');
    expect(result).toHaveProperty('banners');
    expect(result).toHaveProperty('basic');
  });

  it('should return empty object for invalid path', () => {
    const result = getDictionaryJson('not.exist');
    expect(result).toEqual({});
  });
});

describe('findSimilarLabelPath', () => {
  beforeAll(() => {
    setDictionary(getDictionaryJson());
  });

  it('should find correct path for label', () => {
    const path = findSimilarLabelPath('Banners');
    expect(path).toBe('categories.banners');
  });

  it('should return null for unknown label', () => {
    const path = findSimilarLabelPath('UnknownLabel');
    expect(path).toBeNull();
  });
});

describe('delEmptyObjects', () => {
  it('should remove empty objects', () => {
    const obj = { a: {}, b: { c: {} }, d: 1 };
    const cleaned = delEmptyObjects(obj);
    expect(cleaned).toEqual({ d: 1 });
  });
});

describe('translateBlocksSchema', () => {
  it('should process product-card.liquid and call replaceInLiquid', () => {
    const productCardPath = path.join(__dirname, '../blocks/product-card.liquid');
    const productCardContent = fs.readFileSync(productCardPath, 'utf8');

    const mockEdit = jest.fn((callback) => callback({ replace: jest.fn() }));
    const mockDocument = {
      getText: () => productCardContent,
      languageId: 'liquid',
      positionAt: (idx) => ({ line: 0, character: idx }),
      uri: { fsPath: productCardPath }
    };
    const mockEditor = { document: mockDocument, edit: mockEdit };
    const vscode = require('vscode');
    vscode.window.activeTextEditor = mockEditor;

    translateSchema();

    expect(mockEdit).toHaveBeenCalled();
  });
});

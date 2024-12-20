const vscode = require('vscode');
const JSON5 = require('json5');
const path = require('path');
const fs = require('fs');
const { log } = require('console');
const selectOpt = ['label', 'info', 'content'];
const { LinkDefinitionProvider } = require('./LinkDefinitionProvider');

let dictionary = {};
let schema = {};
const dictionaryPath = path.join(getWorkFolder(), 'locales', 'en.default.schema.json');

function getDictionaryJson(targetPath) {
  try {
    const rawContent = fs.readFileSync(dictionaryPath, 'utf8');
    const jsonData = JSON5.parse(rawContent);
    return targetPath.split('.').reduce((data, element) => (data && data[element] ? data[element] : {}), jsonData);
  } catch (error) {
    vscode.window.showErrorMessage(`Error parsing JSON: ${error.message}`);
    return {};
  }
}

function getWorkFolder() {
  const workFolder = vscode.workspace.workspaceFolders;
  return !workFolder || workFolder.length === 0 ? null : workFolder[0].uri.fsPath;
}

function findSimilarLabelPath(targetLabel) {
  function recursiveSearch(currentPath, currentValue) {
    if (result) return;

    if (typeof currentValue === 'object') {
      for (const [key, value] of Object.entries(currentValue)) {
        const newPath = currentPath ? `${currentPath}.${key}` : key;
        recursiveSearch(newPath, value);
      }
    } else if (typeof currentValue === 'string' && currentValue.toLowerCase() === targetLabel.toLowerCase()) {
      result = currentPath;
    }
  }

  let result = null;
  recursiveSearch('', dictionary);
  return result;
}

function delEmptyObjects(obj) {
  for (var key in obj) {
    if (obj[key] && typeof obj[key] === 'object') {
      if (Object.keys(obj[key]).length === 0) {
        delete obj[key];
      } else {
        delEmptyObjects(obj[key]);
        if (Object.keys(obj[key]).length === 0) {
          delete obj[key];
        }
      }
    }
  }
  return obj;
}

function replaceInLocale(newLocale) {
  try {
    const existingLocale = JSON5.parse(fs.readFileSync(dictionaryPath, 'utf8'));
    const updatedTranslations = recursiveAdd(existingLocale, newLocale);
    delEmptyObjects(updatedTranslations);

    fs.writeFileSync(dictionaryPath, JSON.stringify(updatedTranslations, null, 2), 'utf8');
  } catch (error) {
    vscode.window.showErrorMessage(`Error adding translations: ${error}`);
  }
}

function replaceInLiquid(editor, inputJson) {
  try {
    editor.edit(async (editBuilder) => {
      const document = editor.document;
      const range = new vscode.Range(document.positionAt(schema.startIdx), document.positionAt(schema.endIdx));
      const newLine = document.languageId === 'jsonc' || document.languageId === 'json' ? '' : '\n';
      editBuilder.replace(range, `${newLine + JSON.stringify(inputJson, null, 2)}\n`);
    });
  } catch (error) {
    console.error(`Error replace: ${error}`);
  }
}

function loadLiquidInfo(document) {
  const fileUri = document.uri.fsPath;
  const fileFormat = document.languageId;

  const fileName = path.parse(path.basename(fileUri)).name;
  const inputJson = extractJsonFromLiquid(document, fileFormat === 'jsonc' || fileFormat === 'json');

  if (!inputJson) {
    vscode.window.showErrorMessage('{% schema %} not found or has errors.');
  }

  return { inputJson, fileName };
}

function extractJsonFromLiquid(document, isJson) {
  try {
    const content = document.getText();
    if (isJson) {
      schema.startIdx = 0;
      schema.endIdx = content.length;
      return JSON5.parse(content);
    }
    const start = content.search(/\{%\s*schema\s*%\}/i);
    schema.endIdx = content.search(/\{%\s*endschema\s*%\}/i);

    if (start !== -1 && schema.endIdx !== -1) {
      schema.startIdx = start + '{% schema %}'.length;
      const inputJson = content.substring(schema.startIdx, schema.endIdx).trim();

      return JSON5.parse(inputJson);
    }
  } catch (error) {
    return null;
  }
}

function updateLocales(setting, translate, path) {
  if (typeof setting !== 'object') return;

  const setting_id = setting.id || `${setting.type}__${typeIdx}`;
  translate[setting_id] = {};

  for (const [key, value] of Object.entries(setting)) {
    if (selectOpt.includes(key) && !value.startsWith('t:')) {
      const allPath = findSimilarLabelPath(value);
      if (allPath) {
        setting[key] = `t:sections.all.${allPath}`;
      } else {
        translate[setting_id][key] = value;
        setting[key] = `${path}.settings.${setting_id}.${key}`;
      }
      if (!allPath && key === 'content') typeIdx++;
    } else if (key === 'options' && Array.isArray(value)) {
      value.forEach((option, idx) => {
        if (option.label && !option.label.startsWith('t:') && !option.label.match(/^\d+$/)) {
          const allPath = findSimilarLabelPath(option.label);
          if (allPath) {
            option.label = `t:sections.all.${allPath}`;
          } else {
            translate[setting_id][`options__${idx + 1}`] = { label: option.label };
            option.label = `${path}.settings.${setting.id}.options__${idx + 1}.label`;
          }
        }
      });
    }
  }
}

function genLocale(inputJson, fileName) {
  typeIdx = 1;
  if (fileName === 'settings_schema') {
    const settings_schema = {};
    for (const block of (inputJson || []).filter((b) => !b.name.includes('theme_info'))) {
      const block_type = block.name.toLowerCase().replace(/t:settings_schema\.|\.name/g, '');
      settings_schema[block_type] = { name: {}, settings: {} };

      if (block.name && !block.name.startsWith('t:')) {
        settings_schema[block_type].name = block.name;
        block.name = `t:settings_schema.${block_type}.name`;
      }

      for (const s of block.settings || []) {
        updateLocales(s, settings_schema[block_type].settings, `t:settings_schema.${block_type}`);
      }
    }

    return { settings_schema };
  }
  const translation = { name: {}, settings: {}, blocks: {} };

  if (fileName.includes('section-')) {
    fileName = fileName.replace('section-', '').replace('main-', '');
  }

  if (inputJson.name && !inputJson.name.startsWith('t:')) {
    translation.name = inputJson.name;
    inputJson.name = `t:sections.${fileName}.name`;

    if (inputJson.presets && inputJson.presets[0].name) {
      inputJson.presets[0].name = inputJson.name;
    }
  }

  for (const s of inputJson.settings || []) {
    updateLocales(s, translation.settings, `t:sections.${fileName}`);
  }

  for (const block of (inputJson.blocks || []).filter((b) => !b.type.includes('@app'))) {
    translation.blocks[block.type] = { name: {}, settings: {} };
    if (block.name && !block.name.startsWith('t:')) {
      translation.blocks[block.type].name = block.name;
      block.name = `t:sections.${fileName}.blocks.${block.type}.name`;
    }

    for (const s of block.settings || []) {
      updateLocales(s, translation.blocks[block.type].settings, `t:sections.${fileName}.blocks.${block.type}`);
    }
  }

  return { sections: { [fileName]: translation } };
}

function recursiveAdd(target, source) {
  for (const [key, value] of Object.entries(source)) {
    if (typeof value === 'object') {
      target[key] = recursiveAdd(target[key] || {}, value);
    } else if (!(key in target)) {
      target[key] = value;
    }
  }

  return target;
}

function translateSchema() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage('No active document. Exiting.');
    return null;
  }
  const { inputJson, fileName } = loadLiquidInfo(editor.document);
  if (!inputJson) return;

  dictionary = getDictionaryJson('sections.all');

  replaceInLocale(genLocale(inputJson, fileName));
  replaceInLiquid(editor, inputJson);
}

function activate(context) {
  let linkProvider = new LinkDefinitionProvider('"t:.*"', dictionaryPath);

  activeRule = vscode.languages.registerDocumentLinkProvider(['liquid', 'json'], linkProvider);
  disposable = vscode.commands.registerCommand('extension.translateSchema', () => translateSchema());

  context.subscriptions.push(activeRule);
  context.subscriptions.push(disposable);
}
function deactivate() {}

module.exports = {
  activate,
  deactivate,
};

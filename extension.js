const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { log } = require('console');
const selectOpt = ['label', 'info', 'content']

let dictionary = {};
let schema = {};
let dictionaryPath = path.join(getWorkFolder(), 'locales', 'en.default.schema.json')

function getDictionaryJson(targetPath) {
  const jsonData = JSON.parse(fs.readFileSync(dictionaryPath, 'utf8'));
  return targetPath.split('.').reduce((data, element) => (data && data[element]) ? data[element] : {}, jsonData);
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

function replaceInLiquid(inputJson) {
  try {
    const editor = vscode.window.activeTextEditor;

    if (!editor) {
      vscode.window.showErrorMessage('No active document. Exiting.');
      return;
    }

    editor.edit(async (editBuilder) => {
      const document = editor.document;
      const range  = new vscode.Range(document.positionAt(schema.startIdx), document.positionAt(schema.endIdx));
      editBuilder.replace(range, '\n' + JSON.stringify(inputJson, null, 2) + '\n');
    });
  } catch (error) {
    console.error(`Error replace: ${error}`);
  }
}

function loadLiquidInfo() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage('No active document. Exiting.');
    return null;
  }

  const fileUri = editor.document.uri;
  const fileName = path.parse(path.basename(fileUri.fsPath)).name;

  const inputJson = extractJsonFromLiquid(fileUri.fsPath);

  if (!inputJson) {
    vscode.window.showErrorMessage('{% schema %} not found or has problems.');
  }

  return { inputJson, fileName };
}

function extractJsonFromLiquid(liquidFilePath) {
  try {
    let content = fs.readFileSync(liquidFilePath, 'utf8');

    let start = content.search(/\{%\s*schema\s*%\}/i);
    schema.endIdx = content.search(/\{%\s*endschema\s*%\}/i);

    if (start !== -1 && schema.endIdx !== -1) {
      schema.startIdx = start + '{% schema %}'.length;
      let schemaContent = content.substring(schema.startIdx, schema.endIdx).trim();

      return JSON.parse(schemaContent);
    }
  } catch (error) {
    return null;
  }
}

function updateLocale(setting, localePath) {
  if (typeof setting !== 'object') return;

  const setting_id = setting.id || `${setting.type}__${typeIdx}`;
  localePath[setting_id] = {};

  for (const [key, value] of Object.entries(setting)) {
    if (selectOpt.includes(key) && !value.startsWith("t:") && !findSimilarLabelPath(value)) {
      localePath[setting_id][key] = value;
    }
    if (key === 'options' && Array.isArray(value)) {
      value.forEach((option, idx) => {
        if (option.label && !option.label.startsWith("t:") && !option.label.match(/^\d+$/) && !findSimilarLabelPath(option.label)) {
          localePath[setting_id][`options__${idx}`] = { "label": option.label };
        }
      });
    }
  }
}

function updateSchema(setting, path) {
  if (typeof setting !== 'object') return;

  const setting_id = setting.id || `${setting.type}__${typeIdx}`;

  for (const [key, value] of Object.entries(setting)) {
    if (selectOpt.includes(key) && !value.startsWith("t:")) {
      const allPath = findSimilarLabelPath(value);
      setting[key] = allPath ? `t:sections.all.${allPath}` : `t:sections.${path}.settings.${setting_id}.${key}`;

      if (!allPath && key === 'content') typeIdx++;
    }

    if (key === 'options' && Array.isArray(value)) {
      value.forEach((option, idx) => {
        if (option.label && !option.label.startsWith("t:") && !option.label.match(/^\d+$/)) {
          const allPath = findSimilarLabelPath(option.label);
          option.label = allPath ? `t:sections.all.${allPath}` : `${path}.settings.${setting.id}.options__${idx + 1}.label`;
        }
      });
    }
  }
}

function genLocale(inputJson, fileName) {
  typeIdx = 1;
  if (fileName.includes("section-")) {
    fileName = fileName.replace("section-", "");
  }

  const translation = { name: {}, settings: {}, blocks: {} };

  if (inputJson.name && !inputJson.name.startsWith("t:")) {
    translation.name = inputJson.name;
    inputJson.name = `t:sections.${fileName}.name`;
  }

  for (const setting of inputJson.settings || []) {
    updateLocale(setting, translation.settings);
    updateSchema(setting, `t:sections.${fileName}`);
  }

  for (const block of (inputJson.blocks || []).filter(b => !b.type.includes('@app'))) {
    translation.blocks[block.type] = {name: block.name, settings: {}};
    if (block.name && !block.name.startsWith("t:")) {
      block.name = `t:sections.${fileName}.blocks.${block.type}.name`;
    }

    for (const setting of block.settings || []) {
      updateLocale(setting, translation.blocks[block.type].settings);
      updateSchema(setting, `t:sections.${fileName}.blocks.${block.type}`);
    }
  }

  return { sections: { [fileName]: translation } };
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
    const existingLocale = JSON.parse(fs.readFileSync(dictionaryPath, 'utf8'));
    const updatedTranslations = recursiveAdd(existingLocale, newLocale);
    delEmptyObjects(updatedTranslations);

    fs.writeFileSync(dictionaryPath, JSON.stringify(updatedTranslations, null, 2), 'utf8');
  } catch (error) {
    vscode.window.showErrorMessage(`Error adding translations: ${error}`);
  }
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

function getWorkFolder() {
  const workFolder = vscode.workspace.workspaceFolders;
  return (!workFolder || workFolder.length === 0)? null : workFolder[0].uri.fsPath;
}

function translateSchema() {
  const { inputJson, fileName } = loadLiquidInfo();
  if (!inputJson) return;

  dictionary = getDictionaryJson('sections.all');

  replaceInLocale(genLocale(inputJson, fileName));
  replaceInLiquid(inputJson);
}

function activate() {
  vscode.commands.registerCommand('extension.translateSchema', () => translateSchema());
}
function deactivate() {}

module.exports = {
  activate,
  deactivate
};

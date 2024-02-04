const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { log } = require('console');

let dictionary = {};
let liquidFile = {};
const selectOpt = ['label', 'info', 'content']

function loadJsonByPath(jsonFilePath, targetPath) {
  const jsonData = JSON.parse(fs.readFileSync(jsonFilePath, 'utf8'));
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

function replaceInLiquid(liquidFilePath, inputJson) {
  try {
    const fileUri = activeEditor.document.uri;
    const liquidFile.content = fs.readFileSync(fileUri.fsPath, 'utf8');
    const replacement = `{{% schema %}}\n${JSON.stringify(inputJson, null, 2)}\n{{% endschema %}}`;
    const newLiquidContent = liquidFile.replace(/{{%\s*schema\s*%}.*?{%\s*endschema\s*%}/s, replacement);

    fs.writeFileSync(liquidFilePath, newLiquidContent, 'utf8');
    const activeEditor = vscode.window.activeTextEditor;

    if (!activeEditor) {
        vscode.window.showErrorMessage('No active document. Exiting.');
        return;
    }

    const currentDocument = activeEditor.document;
    const fullRange = new vscode.Range(0, 0, currentDocument.lineCount, 0);

    activeEditor.edit(editBuilder => {
        editBuilder.replace(fullRange, newContent);
    });
  } catch (error) {
    console.error(`Error in ${liquidFilePath}: ${error}`);
  }
}

function loadLiquidInfo() {
  const activeEditor = vscode.window.activeTextEditor;
  if (!activeEditor) {
    vscode.window.showErrorMessage('No active document. Exiting.');
    return null;
  }

  const fileUri = activeEditor.document.uri;
  const workFolder = path.dirname(path.dirname(fileUri.fsPath));
  const fileName = path.parse(path.basename(fileUri.fsPath)).name;

  const inputJson = extractJsonFromLiquid(fileUri.fsPath);

  if (!inputJson) {
    vscode.window.showErrorMessage('{% schema %} not found in open Liquid file.');
    return null;
  }

  return { inputJson, fileName, workFolder };
}

function extractJsonFromLiquid(liquidFilePath) {
  try {
    liquidFile = fs.readFileSync(liquidFilePath, 'utf8');
    const start = liquidFile.search(/{%\s*schema\s*%}/);
    const endIdx = liquidFile.search(/{%\s*endschema\s*%}/);

    if (start !== -1 && endIdx !== -1) {
      const startIdx = start + '{% schema %}'.length;
      const schemaContent = liquidFile.substring(startIdx, endIdx).trim();

      return JSON.parse(schemaContent);
    }
  } catch (error) {
    vscode.window.showErrorMessage(`Error extracting JSON: ${error}`);
  }

  return null;
}

function updateLocale(setting, localePath) {
  if (typeof setting !== 'object') {
    return;
  }
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
  if (typeof setting !== 'object') {
    return;
  }
  const setting_id = setting.id || `${setting.type}__${typeIdx}`;

  for (const [key, value] of Object.entries(setting)) {
    if (selectOpt.includes(key) && !value.startsWith("t:")) {
      const allPath = findSimilarLabelPath(value);
      setting[key] = allPath ? `t:sections.all.${allPath}` : `t:sections.${path}.settings.${setting_id}.${key}`;

      if (!allPath && key === 'content') {
        typeIdx++;
      }
    }

    if (key === 'options' && Array.isArray(value)) {
      value.forEach((option, idx) => {
        if (option.label && !option.label.startsWith("t:") && !option.label.match(/^\d+$/)) {
          const allPath = findSimilarLabelPath(option.label);
          option.label = allPath ?
          `t:sections.all.${allPath}` :
          `${path}.settings.${setting.id}.options__${idx + 1}.label`;
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

function delEmptyObjects(jsonData) {
  if (typeof jsonData === 'object') {
    for (const [key, value] of Object.entries(jsonData)) {
      if (typeof value === 'object') {
        delEmptyObjects(value);
      }

      if (value === null || value === ""
      || (Array.isArray(value) && value.length === 0)
      || (typeof value === 'object' && Object.keys(value).length === 0)) {
        delete jsonData[key];
      }
    }
  } else if (Array.isArray(jsonData)) {
    jsonData.forEach((item, index) => {
      delEmptyObjects(item);
      if (item === null || item === ""
      || (Array.isArray(item) && item.length === 0)
      || (typeof item === 'object' && Object.keys(item).length === 0)) {
        jsonData.splice(index, 1);
      }
    });
  }
}

function addTranslations(jsonFilePath, newLocale) {
  try {
    const existingLocaleContent = fs.readFileSync(jsonFilePath, 'utf8');
    const existingLocale = JSON.parse(existingLocaleContent);
    const updatedTranslations = recursiveAdd(existingLocale, newLocale);
    delEmptyObjects(updatedTranslations);

    fs.writeFileSync(jsonFilePath, JSON.stringify(updatedTranslations, null, 2), 'utf8');
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

function translateSchema() {
  const { inputJson, fileName, workFolder } = loadLiquidInfo();

  if (!inputJson) {
    return;
  }

  const dictionaryPath = path.join(workFolder, 'locales', 'en.default.schema.json');
  dictionary = loadJsonByPath(dictionaryPath, 'sections.all');

  const newLocale = genLocale(inputJson, fileName);
  addTranslations(dictionaryPath, newLocale);
  replaceInLiquid(path.join(workFolder, 'sections', `${fileName}.liquid`), inputJson);
}

function activate() {
  vscode.commands.registerCommand('extension.translateSchema', () => translateSchema());
}
function deactivate() {}

module.exports = {
  activate,
  deactivate
};

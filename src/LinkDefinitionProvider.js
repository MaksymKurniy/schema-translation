const vscode = require("vscode");
const fs = require("fs");
const { log } = require("console");

class LinkDefinitionProvider {
  constructor(pattern, targetTemplate) {
    this.pattern = pattern;
    this.targetTemplate = targetTemplate;
    this.dictionatyJson = JSON.parse(
      fs.readFileSync(this.targetTemplate, "utf8")
    );
  }

  findValueByPath(jsonPath) {
    jsonPath = jsonPath.slice(3);
    jsonPath = jsonPath.slice(0, -1);
    const fileContent = JSON.stringify(this.dictionatyJson, null, 2);

    const keys = jsonPath.split(".");
    let tooltip = this.dictionatyJson;
    let line = -1;
    for (const key of keys) {
      tooltip = tooltip[key];

      if (!tooltip) {
        return { line, tooltip };
      }
    }
    let keyId = 0;

    const lines = fileContent.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('"' + keys[keyId] + '":')) {
        keyId++;
        if (keyId == keys.length) {
          line = i + 1;
          return { line, tooltip };
        }
      }
    }
    return { line, tooltip };
  }

  provideDocumentLinks(document) {
    const regEx = new RegExp(this.pattern, "g");
    const text = document.getText();
    const links = [];

    let match;
    while ((match = regEx.exec(text))) {
      const startPos = document.positionAt(match.index + 3);
      const endPos = document.positionAt(match.index + match[0].length - 1);
      const range = new vscode.Range(startPos, endPos);
      const {line, tooltip} = this.findValueByPath(match[0]);
      if (line == -1) return;

      links.push({
        range,
        tooltip: `Translate: "${tooltip}"`,
        target: vscode.Uri.file(this.targetTemplate).with({fragment: `L${line}`})
      });
    }

    return links;
  }
}

module.exports = {
  LinkDefinitionProvider,
};

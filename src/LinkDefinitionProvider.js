const vscode = require("vscode");
const fs = require("fs");
const JSON5 = require('json5');
const { log } = require("console");

class LinkDefinitionProvider {
  constructor(pattern, targetTemplate) {
    this.regEx = new RegExp(pattern, "g");
    this.targetTemplate = targetTemplate;
    this.lineCache = {};
    this.pathCache = {};
  }

  findValueByPath(jsonPath) {
    if (this.lineCache[jsonPath]) return this.lineCache[jsonPath];

    let keyIdx = 0;
    let start_line = 0;
    const keys = jsonPath.split(".");
    const lines = this.dictionatyContent.split("\n");

    for (const [key, value] of Object.entries(this.pathCache)) {
      if (jsonPath.includes(key) && value.line > start_line) {
        start_line = value.line;
        keyIdx = value.keyIdx;
      }
    }

    for (let i = start_line; i < lines.length; i++) {
      if (lines[i].includes(`"${keys[keyIdx]}":`)) {
        keyIdx++;
        const pathLine = keys.slice(0, keyIdx).join(".");
        if (!this.pathCache[pathLine]) {
          this.pathCache[pathLine] = { line: i, keyIdx: keyIdx - 1 };
        }

        if (keyIdx == keys.length) {
          this.lineCache[jsonPath] = i + 1;
          return this.lineCache[jsonPath];
        }
      }
    }
    return -1;
  }

  provideDocumentLinks(document) {
    this.dictionatyContent = fs.readFileSync(this.targetTemplate, "utf8");
    this.dictionatyJson = JSON5.parse(this.dictionatyContent);
    const text = document.getText();
    const links = [];

    let match;
    while ((match = this.regEx.exec(text))) {
      const startPos = document.positionAt(match.index + 3); // slice "t:
      const endPos = document.positionAt(match.index + match[0].length - 1); // slice "
      const line = this.findValueByPath(match[0].slice(3, -1));
      if (line == -1) continue;

      links.push({
        range: new vscode.Range(startPos, endPos),
        target: vscode.Uri.from({
          path: this.targetTemplate,
          fragment: `L${line}`,
        }),
      });
    }
    return links;
  }
}

module.exports = {
  LinkDefinitionProvider,
};

const vscode = require("vscode");
const fs = require("fs");
const { log } = require("console");

class LinkDefinitionProvider {
  constructor(pattern, targetTemplate) {
    this.regEx = new RegExp(pattern, "g");
    this.targetTemplate = targetTemplate;
    this.lineCache = {};
    this.pathCache = {};
  }

  findValueByPath(jsonPath) {
    if (this.lineCache[jsonPath]) {
      return {
        line: this.lineCache[jsonPath].line,
        tooltip: this.lineCache[jsonPath].tooltip,
      };
    }

    let keyIdx = 0;
    let start_line = 0;
    let tooltip = this.dictionatyJson;
    const keys = jsonPath.split(".");
    const lines = this.dictionatyContent.split("\n");

    for (const key of keys) {
      tooltip = tooltip[key];
      if (!tooltip) return { line: -1, tooltip };
    }

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
          this.lineCache[jsonPath] = { line: i + 1, tooltip: tooltip };
          return this.lineCache[jsonPath];
        }
      }
    }
    return { line: -1, tooltip };
  }

  provideDocumentLinks(document) {
    this.dictionatyContent = fs.readFileSync(this.targetTemplate, "utf8");
    this.dictionatyJson = JSON.parse(this.dictionatyContent);
    const text = document.getText();
    const links = [];

    let match;
    while ((match = this.regEx.exec(text))) {
      const startPos = document.positionAt(match.index + 3); // slice "t:
      const endPos = document.positionAt(match.index + match[0].length - 1); // slice "
      const range = new vscode.Range(startPos, endPos);
      const { line, tooltip } = this.findValueByPath(match[0].slice(3, -1));
      if (line == -1) continue;

      links.push({
        range,
        tooltip: `Translate: "${tooltip}"`,
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

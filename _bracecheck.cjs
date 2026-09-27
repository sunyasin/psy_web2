const fs = require("fs");
const code = fs.readFileSync("app/tariffs/page.tsx", "utf8").split(/\r?\n/);

function stripLine(line) {
  // remove string literals and line comments to get a rough brace count
  let out = "";
  let i = 0;
  const quotes = new Set(["'", '"', "`"]);
  while (i < line.length) {
    const ch = line[i];
    if (ch === "/" && line[i + 1] === "/") {
      break; // line comment
    }
    if (quotes.has(ch)) {
      const q = ch;
      i++;
      while (i < line.length && line[i] !== q) {
        if (line[i] === "\\") i++;
        i++;
      }
      i++;
      out += q;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

let b = 0, p = 0, angle = 0;
for (let i = 0; i < code.length; i++) {
  const s = stripLine(code[i]);
  for (const ch of s) {
    if (ch === "{") b++;
    if (ch === "}") b--;
    if (ch === "(") p++;
    if (ch === ")") p--;
    if (ch === "<") angle++;
    if (ch === ">") angle--;
  }
  console.log((i + 1) + ": braces=" + b + " paren=" + p + " angle=" + angle + " :: " + code[i].slice(0, 75));
}
console.log("FINAL braces=" + b + " paren=" + p + " angle=" + angle);

import fs from "fs";

const file = process.argv[2];
const c = fs.readFileSync(file, "utf8");
const all = [
  ...[...c.matchAll(/content-desc="([^"]*)"/g)].map((m) =>
    m[1].replace(/&#10;/g, " | "),
  ),
  ...[...c.matchAll(/text="([^"]*)"/g)].map((m) => m[1]),
].filter((s) => s.trim());

const hasHide = all.some((s) => s.includes("출입정보 숨기기"));
const hasError = all.some((s) => s.includes("불러오지"));
const hasRevealSemantics = all.some((s) => s.includes("출입정보 표시됨"));
console.log(
  `ACCESS_UI hideButton=${hasHide} error=${hasError} semanticsReveal=${hasRevealSemantics}`,
);

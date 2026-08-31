import fs from "fs";

const file = process.argv[2];
const needle = process.argv[3] || "";
const c = fs.readFileSync(file, "utf8");
const re =
  /content-desc="([^"]*)"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/g;
let found = false;
for (const m of c.matchAll(re)) {
  const desc = m[1].replace(/&#10;/g, " | ");
  if (!needle || desc.includes(needle)) {
    const x1 = +m[2],
      y1 = +m[3],
      x2 = +m[4],
      y2 = +m[5];
    const cx = Math.floor((x1 + x2) / 2);
    const cy = Math.floor((y1 + y2) / 2);
    console.log(`${cx},${cy}\t${desc}`);
    found = true;
  }
}
if (!found) process.exit(2);

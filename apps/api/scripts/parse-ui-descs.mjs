import fs from "fs";

const file = process.argv[2];
const c = fs.readFileSync(file, "utf8");
const descs = [...c.matchAll(/content-desc="([^"]*)"/g)].map((m) =>
  m[1].replace(/&#10;/g, " | ").replace(/&amp;/g, "&"),
);
for (const d of descs) {
  if (d.trim()) console.log(d);
}

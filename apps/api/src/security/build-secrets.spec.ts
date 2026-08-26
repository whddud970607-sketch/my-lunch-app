import * as fs from "fs";
import * as path from "path";

describe("build artifact secret scan", () => {
  it("does not embed SUPABASE_SERVICE_ROLE_KEY literal usage as a hardcoded secret value", () => {
    const distDir = path.join(__dirname, "..", "..", "dist");
    if (!fs.existsSync(distDir)) {
      // build runs before this in CI; locally skip if not built yet
      return;
    }

    const files = listJs(distDir);
    for (const file of files) {
      const text = fs.readFileSync(file, "utf8");
      // Must not contain a long jwt-like hardcoded service key pattern assigned as literal
      expect(text).not.toMatch(
        /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/,
      );
      expect(text).not.toMatch(/service_role["']?\s*:\s*["']eyJ/);
    }
  });
});

function listJs(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listJs(full));
    else if (entry.name.endsWith(".js")) out.push(full);
  }
  return out;
}

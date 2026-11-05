import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
// Styles are a separately exported bundler asset, not a dependency of the type API.
// Remove only emitted side-effect CSS imports; never change declarations or JS.
async function clean(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await clean(path);
    else if (entry.name.endsWith(".d.ts")) {
      const before = await readFile(path, "utf8");
      const after = before.replace(
        /^import\s+["'][^"'\r\n]+\.css["'];?\s*$/gm,
        "",
      );
      if (after !== before) await writeFile(path, after);
    }
  }
}
await clean("dist");

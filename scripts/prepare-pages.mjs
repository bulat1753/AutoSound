import fs from "node:fs/promises";
await fs.mkdir("showcase", { recursive: true });
await fs.cp("pages-build", "showcase", { recursive: true });
await fs.rename("showcase/preview.html", "showcase/index.html");
await fs.writeFile(".nojekyll", "");

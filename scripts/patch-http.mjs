import { readFileSync, writeFileSync } from "node:fs";

const p = "src/pages/ConfigurationsPage.tsx";
let c = readFileSync(p, "utf8").replace(/\r\n/g, "\n");

const oldText = `  { value: "tuic", label: "TUIC" },
];`;
const newText = `  { value: "tuic", label: "TUIC" },
  { value: "http", label: "HTTP 代理 (Cloudflare/通用)" },
];`;

if (!c.includes(oldText)) {
  console.error("pattern not found");
  process.exit(1);
}
c = c.replace(oldText, newText);
writeFileSync(p, c, "utf8");
console.log("patched ok");
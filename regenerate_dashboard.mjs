// 구글 시트(연령대별 top10) 마크다운 텍스트를 읽어 index.html의 RAW 데이터 블록을 재생성한다.
// 사용법: node regenerate_dashboard.mjs --sheet-text sheet_export.txt --index-html index.html
import { readFileSync, writeFileSync } from "fs";

function getArg(name, fallback) {
  const idx = process.argv.indexOf(`--${name}`);
  return idx !== -1 ? process.argv[idx + 1] : fallback;
}

const AGE_LABEL_TO_CODE = {
  "10대": "10",
  "20대": "20",
  "30대": "30",
  "40대": "40",
  "50대": "50",
  "60대 이상": "60",
  "미상(비회원 등)": "na",
};
const AGE_ORDER = ["10", "20", "30", "40", "50", "60", "na"];

const sheetTextPath = getArg("sheet-text", "sheet_export.txt");
const indexPath = getArg("index-html", "index.html");

const text = readFileSync(sheetTextPath, "utf8");
const lines = text.split("\n");

// matches a data row like: | 2026-07-06 | 2026-07-12 | 20대 | 1 | 아이스온 브리프 팬티 | 957 | 221 |
const rowRe = /^\|\s*(\d{4}-\d{2}-\d{2})\s*\|\s*\d{4}-\d{2}-\d{2}\s*\|\s*([^|]+?)\s*\|\s*(\d+)\s*\|\s*([^|]+?)\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|/;

const data = {};
let rowCount = 0;
let skipped = 0;
for (const line of lines) {
  const m = line.match(rowRe);
  if (!m) continue;
  const [, weekStart, ageLabel, rank, name, qty, orders] = m;
  const ageCode = AGE_LABEL_TO_CODE[ageLabel.trim()];
  if (!ageCode) {
    console.error(`unknown age label "${ageLabel}" -- row skipped: ${line}`);
    skipped++;
    continue;
  }
  if (!data[weekStart]) data[weekStart] = {};
  if (!data[weekStart][ageCode]) data[weekStart][ageCode] = [];
  data[weekStart][ageCode].push([Number(rank), name.trim(), Number(qty), Number(orders)]);
  rowCount++;
}

if (rowCount === 0) {
  console.error("no data rows parsed from sheet export -- aborting without touching index.html");
  process.exit(1);
}

const weekKeys = Object.keys(data).sort();

function serializeWeek(ageMap) {
  return AGE_ORDER.filter((a) => ageMap[a])
    .map((a) => {
      const arr = ageMap[a].map((r) => `[${r[0]},${JSON.stringify(r[1])},${r[2]},${r[3]}]`).join(",");
      return `      "${a}": [${arr}]`;
    })
    .join(",\n");
}

const serialized =
  "var RAW = {\n" +
  weekKeys.map((wk) => `    "${wk}": {\n${serializeWeek(data[wk])}\n    }`).join(",\n") +
  "\n  };\n  // RAW_DATA_END";

const html = readFileSync(indexPath, "utf8");
const blockRe = /var RAW = \{[\s\S]*?\n {2}\};\n {2}\/\/ RAW_DATA_END/;
if (!blockRe.test(html)) {
  throw new Error(`could not find RAW_DATA markers in ${indexPath}`);
}
const updated = html.replace(blockRe, serialized);
writeFileSync(indexPath, updated, "utf8");

console.log(
  `updated ${indexPath}: ${weekKeys.length} week(s), ${rowCount} row(s) parsed` +
    (skipped ? `, ${skipped} row(s) skipped (unknown age label)` : "") +
    `. weeks: ${weekKeys.join(", ")}`
);

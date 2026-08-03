// 구글 시트(연령대별 top10, SKU/상품명 두 탭 + 일별매출) 마크다운 텍스트를 읽어
// index.html의 RAW_SKU / RAW_PRODUCT / REVENUE 데이터 블록을 재생성한다.
// 시트 전체를 한 번에 읽은 텍스트(세 개의 표가 순서대로 이어붙은 형태)를 받아서,
// 각 표의 헤더 행("상품명(SKU 정제)" vs "상품명" vs "날짜")으로 어느 표에 속하는 행인지 구분한다.
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

// 표 헤더 행으로 현재 어느 표를 읽고 있는지 판별한다. 다섯 번째 컬럼명이 "상품명(SKU 정제)"면 sku,
// "상품명"이면(정확히 일치, "(SKU 정제)" 접미사 없이) product, 그리고 날짜/주문건수/합계매출/객단가 헤더면 revenue.
const headerRe = /^\|\s*주 시작일\s*\|\s*주 종료일\s*\|\s*연령대\s*\|\s*순위\s*\|\s*(.+?)\s*\|\s*판매수량\s*\|\s*주문건수\s*\|/;
const revenueHeaderRe = /^\|\s*날짜\s*\|\s*주문건수\s*\|\s*합계매출\s*\|\s*객단가\s*\|/;

// matches a data row like: | 2026-07-06 | 2026-07-12 | 20대 | 1 | 아이스온 브리프 팬티 | 957 | 221 |
// the in-progress (not-yet-finished) week gets a fresh cumulative snapshot appended daily
// (week-end date advances while week-start stays put, until it finally reaches week-start + 6
// days on the closing Sunday). We only want fully-closed Mon-Sun weeks on the dashboard, so we
// keep exactly the rows where week-end - week-start === 6 days and drop everything else --
// no need to hand-filter the sheet export before running this script.
const rowRe = /^\|\s*(\d{4}-\d{2}-\d{2})\s*\|\s*(\d{4}-\d{2}-\d{2})\s*\|\s*([^|]+?)\s*\|\s*(\d+)\s*\|\s*([^|]+?)\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|/;
// matches a revenue row like: | 2026-07-29 | 284 | 6082379 | 21417 |
const revRe = /^\|\s*(\d{4}-\d{2}-\d{2})\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|/;

function daysBetween(startStr, endStr) {
  const toUTC = (s) => {
    const [y, mo, d] = s.split("-").map(Number);
    return Date.UTC(y, mo - 1, d);
  };
  return Math.round((toUTC(endStr) - toUTC(startStr)) / 86400000);
}

let section = null; // "sku" | "product" | "revenue" | null
const rawRowsByLevel = { sku: [], product: [] };
const revenueLines = [];
let incompleteWeekRowsDropped = 0;

for (const line of lines) {
  const headerMatch = line.match(headerRe);
  if (headerMatch) {
    section = headerMatch[1] === "상품명(SKU 정제)" ? "sku" : headerMatch[1] === "상품명" ? "product" : null;
    continue;
  }
  if (revenueHeaderRe.test(line)) {
    section = "revenue";
    continue;
  }

  if (section === "sku" || section === "product") {
    const m = line.match(rowRe);
    if (!m) continue;
    const [, weekStart, weekEnd, ageLabel, rank, name, qty, orders] = m;
    if (daysBetween(weekStart, weekEnd) !== 6) {
      incompleteWeekRowsDropped++;
      continue;
    }
    rawRowsByLevel[section].push({ weekStart, ageLabel, rank, name, qty, orders });
  } else if (section === "revenue") {
    const m = line.match(revRe);
    if (m) revenueLines.push(m);
  }
}

function buildRawData(rows) {
  const data = {};
  let rowCount = 0;
  let skipped = 0;
  for (const { weekStart, ageLabel, rank, name, qty, orders } of rows) {
    const ageCode = AGE_LABEL_TO_CODE[ageLabel.trim()];
    if (!ageCode) {
      console.error(`unknown age label "${ageLabel}" -- row skipped`);
      skipped++;
      continue;
    }
    if (!data[weekStart]) data[weekStart] = {};
    if (!data[weekStart][ageCode]) data[weekStart][ageCode] = [];
    // Drive's markdown export escapes [ and ] (markdown link syntax) in product names -- undo that.
    const cleanName = name.trim().replace(/\\([[\]])/g, "$1");
    data[weekStart][ageCode].push([Number(rank), cleanName, Number(qty), Number(orders)]);
    rowCount++;
  }
  return { data, rowCount, skipped };
}

const sku = buildRawData(rawRowsByLevel.sku);
const product = buildRawData(rawRowsByLevel.product);

const revenueByDate = {};
for (const [, date, orders, revenue, aov] of revenueLines) {
  revenueByDate[date] = { date, orders: Number(orders), revenue: Number(revenue), aov: Number(aov) };
}
const revenueRows = Object.values(revenueByDate).sort((a, b) => (a.date < b.date ? -1 : 1));

if (sku.rowCount === 0 && product.rowCount === 0) {
  console.error("no data rows parsed from sheet export -- aborting without touching index.html");
  process.exit(1);
}

function serializeWeek(ageMap) {
  return AGE_ORDER.filter((a) => ageMap[a])
    .map((a) => {
      const arr = ageMap[a].map((r) => `[${r[0]},${JSON.stringify(r[1])},${r[2]},${r[3]}]`).join(",");
      return `      "${a}": [${arr}]`;
    })
    .join(",\n");
}

function serializeRaw(varName, data) {
  const weekKeys = Object.keys(data).sort();
  return {
    weekKeys,
    text:
      `var ${varName} = {\n` +
      weekKeys.map((wk) => `    "${wk}": {\n${serializeWeek(data[wk])}\n    }`).join(",\n") +
      `\n  };\n  // ${varName}_DATA_END`,
  };
}

const skuSerialized = serializeRaw("RAW_SKU", sku.data);
const productSerialized = serializeRaw("RAW_PRODUCT", product.data);

const revenueSerialized =
  "var REVENUE = [\n" +
  revenueRows
    .map((r) => `    { d: "${r.date}", orders: ${r.orders}, revenue: ${r.revenue}, aov: ${r.aov} }`)
    .join(",\n") +
  (revenueRows.length ? "\n  " : "") +
  "];\n  // REVENUE_DATA_END";

let html = readFileSync(indexPath, "utf8");

function replaceBlock(html, varName, serializedText) {
  const blockRe = new RegExp(`var ${varName} = \\{[\\s\\S]*?\\n {2}\\};\\n {2}// ${varName}_DATA_END`);
  if (!blockRe.test(html)) {
    throw new Error(`could not find ${varName}_DATA markers in ${indexPath}`);
  }
  return html.replace(blockRe, serializedText);
}

html = replaceBlock(html, "RAW_SKU", skuSerialized.text);
html = replaceBlock(html, "RAW_PRODUCT", productSerialized.text);

const revBlockRe = /var REVENUE = \[[\s\S]*?\];\n {2}\/\/ REVENUE_DATA_END/;
if (!revBlockRe.test(html)) {
  throw new Error(`could not find REVENUE_DATA markers in ${indexPath}`);
}
html = html.replace(revBlockRe, revenueSerialized);

writeFileSync(indexPath, html, "utf8");

console.log(
  `updated ${indexPath}: SKU ${skuSerialized.weekKeys.length} week(s)/${sku.rowCount} row(s), ` +
    `상품명 ${productSerialized.weekKeys.length} week(s)/${product.rowCount} row(s)` +
    (sku.skipped || product.skipped ? `, ${sku.skipped + product.skipped} row(s) skipped (unknown age label)` : "") +
    (incompleteWeekRowsDropped ? `, ${incompleteWeekRowsDropped} row(s) dropped (in-progress week, not yet Mon-Sun complete)` : "") +
    `. SKU weeks: ${skuSerialized.weekKeys.join(", ")}. 상품명 weeks: ${productSerialized.weekKeys.join(", ")}. revenue days: ${revenueRows.length}`
);

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const ExcelJS = require("exceljs");
const PDFDocument = require("pdfkit");
const { translateWithYoudao } = require("./youdao");
const { CSV_HEADERS } = require("../shared/export-utils");

const ROOT = path.resolve(__dirname, "..");
const ENV_PATH = path.join(__dirname, ".env");

function loadEnvFile() {
  if (!fs.existsSync(ENV_PATH)) return;
  const content = fs.readFileSync(ENV_PATH, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

function json(res, status, payload) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type"
  });
  res.end(JSON.stringify(payload));
}

function binary(res, status, headers, buffer) {
  res.writeHead(status, {
    ...headers,
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type"
  });
  res.end(buffer);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 5_000_000) {
        reject(new Error("请求体过大"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (_error) {
        reject(new Error("JSON 格式错误"));
      }
    });
    req.on("error", reject);
  });
}

function safeSheetName(name) {
  return String(name || "Sheet")
    .replace(/[\\/*?:[\]]/g, " ")
    .slice(0, 31)
    .trim() || "Sheet";
}

function groupWords(notebooks = [], words = []) {
  const map = new Map(notebooks.map((notebook) => [notebook.id, { notebook, words: [] }]));
  for (const word of words) {
    if (!map.has(word.notebookId)) {
      map.set(word.notebookId || "unknown", {
        notebook: { id: word.notebookId || "unknown", name: "未分组" },
        words: []
      });
    }
    map.get(word.notebookId || "unknown").words.push(word);
  }
  return [...map.values()].filter((group) => group.words.length > 0);
}

async function createXlsx(payload) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Instant Wordbook";
  workbook.created = new Date();
  const groups = groupWords(payload.notebooks, payload.words);
  if (!groups.length) {
    workbook.addWorksheet("空模板").addRow(CSV_HEADERS);
  }
  for (const group of groups) {
    const sheet = workbook.addWorksheet(safeSheetName(group.notebook.name));
    sheet.columns = [
      { header: "生词本", key: "notebook", width: 16 },
      { header: "单词", key: "text", width: 24 },
      { header: "翻译", key: "translation", width: 42 },
      { header: "音标", key: "phonetic", width: 18 },
      { header: "来源标题", key: "sourceTitle", width: 30 },
      { header: "来源链接", key: "sourceUrl", width: 42 },
      { header: "添加时间", key: "createdAt", width: 22 }
    ];
    sheet.getRow(1).font = { bold: true };
    for (const word of group.words) {
      sheet.addRow({
        notebook: group.notebook.name,
        text: word.text || "",
        translation: word.translation || "",
        phonetic: word.phonetic || "",
        sourceTitle: word.sourceTitle || "",
        sourceUrl: word.sourceUrl || "",
        createdAt: word.createdAt || ""
      });
    }
    sheet.views = [{ state: "frozen", ySplit: 1 }];
  }
  return workbook.xlsx.writeBuffer();
}

function findPdfFont() {
  const candidates = [
    process.env.PDF_FONT_PATH,
    "C:\\Windows\\Fonts\\msyh.ttc",
    "C:\\Windows\\Fonts\\simsun.ttc",
    "C:\\Windows\\Fonts\\NotoSansCJK-Regular.ttc",
    path.join(ROOT, "assets", "fonts", "NotoSansCJK-Regular.otf")
  ].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate)) || "";
}

function createPdf(payload) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFDocument({ size: "A5", margin: 36, info: { Title: payload.scopeName || "Instant Wordbook" } });
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    const fontPath = findPdfFont();
    try {
      if (fontPath) doc.font(fontPath);
    } catch (_error) {
      doc.font("Helvetica");
    }
    doc.fontSize(18).text(payload.scopeName || "Instant Wordbook", { continued: false });
    doc.moveDown(0.6);
    const groups = groupWords(payload.notebooks, payload.words);
    if (!groups.length) {
      doc.fontSize(12).fillColor("#667085").text("暂无单词");
      doc.end();
      return;
    }
    let index = 1;
    for (const group of groups) {
      doc.fillColor("#17202a").fontSize(14).text(group.notebook.name);
      doc.moveDown(0.4);
      for (const word of group.words) {
        if (doc.y > doc.page.height - 96) doc.addPage();
        doc.fillColor("#17202a").fontSize(12).text(`${index}. ${word.text || ""}`, { width: 330 });
        if (word.phonetic) doc.fillColor("#667085").fontSize(10).text(`/${word.phonetic}/`);
        doc.fillColor("#1d2a36").fontSize(11).text(word.translation || "", { width: 330 });
        const source = word.sourceTitle || word.sourceUrl || "";
        if (source) doc.fillColor("#667085").fontSize(9).text(`来源：${source}`, { width: 330 });
        if (word.createdAt) doc.fillColor("#667085").fontSize(9).text(`添加时间：${word.createdAt}`);
        doc.moveDown(0.8);
        index += 1;
      }
      doc.moveDown(0.4);
    }
    doc.end();
  });
}

async function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "127.0.0.1"}`);
  if (req.method === "OPTIONS") {
    json(res, 200, { ok: true });
    return;
  }
  if (req.method === "GET" && url.pathname === "/health") {
    json(res, 200, {
      ok: true,
      service: "instant-wordbook-local-server",
      mock: String(process.env.YOUDAO_MOCK).toLowerCase() === "true",
      port: Number(process.env.PORT || 8787)
    });
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/translate") {
    const body = await readBody(req);
    const result = await translateWithYoudao(body);
    json(res, result.ok ? 200 : 400, result);
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/export/xlsx") {
    const body = await readBody(req);
    const buffer = Buffer.from(await createXlsx(body));
    binary(
      res,
      200,
      {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": "attachment; filename=wordbook.xlsx"
      },
      buffer
    );
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/export/pdf") {
    const body = await readBody(req);
    const buffer = await createPdf(body);
    binary(
      res,
      200,
      {
        "content-type": "application/pdf",
        "content-disposition": "attachment; filename=wordbook.pdf"
      },
      buffer
    );
    return;
  }
  json(res, 404, { ok: false, message: "接口不存在" });
}

function createServer() {
  loadEnvFile();
  return http.createServer((req, res) => {
    handleRequest(req, res).catch((error) => {
      json(res, 500, { ok: false, message: error.message || "服务异常" });
    });
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT || 8787);
  createServer().listen(port, "127.0.0.1", () => {
    console.log(`Instant Wordbook local server listening on http://127.0.0.1:${port}`);
  });
}

module.exports = {
  createServer,
  createXlsx,
  createPdf,
  findPdfFont,
  loadEnvFile
};


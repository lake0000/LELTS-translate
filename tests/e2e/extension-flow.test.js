const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const ROOT = path.resolve(__dirname, "../..");
const EXTENSION_PATH = path.join(ROOT, "extension");
const LOCAL_SERVER = "http://127.0.0.1:8787";

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loadPlaywright() {
  try {
    return require("@playwright/test");
  } catch (_error) {
    throw new Error("@playwright/test 未安装，无法执行插件端到端测试");
  }
}

async function requireRealTranslateService() {
  const health = await fetch(`${LOCAL_SERVER}/health`).then((response) => response.json()).catch(() => null);
  if (!health || !health.ok) {
    throw new Error("本地翻译服务未启动，请先运行 npm run server 或保持 127.0.0.1:8787 可用");
  }
  if (health.mock) {
    throw new Error("本地翻译服务当前是 mock=true，请使用真实有道配置启动后再跑端到端测试");
  }
  const response = await fetch(`${LOCAL_SERVER}/api/translate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: "apple", from: "auto", to: "zh-CHS" })
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data || !data.ok || !String(data.translation || "").includes("苹果")) {
    throw new Error(`真实翻译接口不可用：${JSON.stringify(data)}`);
  }
}

async function ensureRealTranslateService() {
  let ownedProcess = null;
  let health = await fetch(`${LOCAL_SERVER}/health`).then((response) => response.json()).catch(() => null);
  if (!health || !health.ok) {
    ownedProcess = spawn(process.execPath, ["local-server/server.js"], {
      cwd: ROOT,
      env: { ...process.env, PORT: "8787" },
      stdio: ["ignore", "ignore", "pipe"]
    });
    let stderr = "";
    ownedProcess.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    for (let i = 0; i < 30; i += 1) {
      await delay(500);
      health = await fetch(`${LOCAL_SERVER}/health`).then((response) => response.json()).catch(() => null);
      if (health && health.ok) break;
    }
    if (!health || !health.ok) {
      ownedProcess.kill();
      throw new Error(`本地翻译服务未启动：${stderr}`);
    }
  }
  await requireRealTranslateService();
  return ownedProcess;
}

function createStaticPageServer() {
  const html = `<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <title>Instant Wordbook E2E Page</title>
        <style>
          body { margin: 48px; font-family: Georgia, serif; font-size: 22px; line-height: 1.7; }
          [data-test-word] { user-select: text; padding: 3px; }
        </style>
      </head>
      <body>
        <main>
          <h1>Reading Sample</h1>
          <p>The word <span data-test-word="apple">apple</span> is selected for translation testing.</p>
        </main>
      </body>
    </html>`;
  const server = http.createServer((req, res) => {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(html);
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ server, url: `http://127.0.0.1:${port}/` });
    });
  });
}

async function launchExtensionContext(chromium, userDataDir) {
  const attempts = [
    { channel: "msedge", headless: true },
    { channel: "chrome", headless: true },
    { headless: true }
  ];
  let lastError;
  for (const attempt of attempts) {
    try {
      return await chromium.launchPersistentContext(userDataDir, {
        ...attempt,
        acceptDownloads: true,
        args: [
          `--disable-extensions-except=${EXTENSION_PATH}`,
          `--load-extension=${EXTENSION_PATH}`,
          "--disable-features=Translate",
          "--no-first-run"
        ]
      });
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("无法启动带扩展的浏览器");
}

async function extensionIdFromContext(context) {
  let serviceWorker = context.serviceWorkers()[0];
  if (!serviceWorker) {
    serviceWorker = await context.waitForEvent("serviceworker", { timeout: 15000 });
  }
  const url = serviceWorker.url();
  const match = url.match(/^chrome-extension:\/\/([^/]+)\//);
  if (!match) throw new Error(`无法识别扩展 ID：${url}`);
  return match[1];
}

async function selectWordThenPressShift(page) {
  const word = page.locator("[data-test-word='apple']");
  await word.waitFor();
  const selected = await page.evaluate(() => {
    const node = document.querySelector("[data-test-word='apple']");
    const range = document.createRange();
    range.selectNodeContents(node);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    return selection.toString();
  });
  assert.equal(selected, "apple");
  await page.evaluate(() => {
    document.dispatchEvent(new CustomEvent("instant-wordbook-trigger", { bubbles: true }));
  });
}

async function assertDownload(page, buttonSelector, expectedExt) {
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.click(buttonSelector)
  ]);
  const filePath = await download.path();
  assert.ok(filePath, `${expectedExt} 下载文件路径为空`);
  const size = fs.statSync(filePath).size;
  assert.ok(size > 20, `${expectedExt} 下载文件过小`);
  const name = download.suggestedFilename();
  assert.ok(name.toLowerCase().endsWith(`.${expectedExt}`), `下载文件扩展名不是 ${expectedExt}: ${name}`);
}

(async () => {
  const ownedTranslateService = await ensureRealTranslateService();
  const playwright = await loadPlaywright();
  const { chromium } = playwright;
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "instant-wordbook-e2e-"));
  const { server, url } = await createStaticPageServer();
  let context;
  try {
    context = await launchExtensionContext(chromium, userDataDir);
    const extensionId = await extensionIdFromContext(context);

    const page = await context.newPage();
    await page.goto(url);
    await page.waitForFunction(() => document.documentElement.dataset.instantWordbook === "ready", null, { timeout: 15000 });
    await selectWordThenPressShift(page);
    await page.locator("#instant-wordbook-bubble", { hasText: "翻译中" }).waitFor({ timeout: 3000 }).catch(() => {});
    await page.locator("#instant-wordbook-bubble", { hasText: /苹果|n\./ }).waitFor({ timeout: 60000 });
    await page.getByRole("button", { name: "加入生词本" }).click();
    await page.getByRole("button", { name: "阅读" }).click();
    await page.locator("#instant-wordbook-bubble", { hasText: /已加入阅读|已在阅读/ }).waitFor({ timeout: 5000 });

    const dashboard = await context.newPage();
    dashboard.on("dialog", (dialog) => dialog.accept());
    await dashboard.goto(`chrome-extension://${extensionId}/dashboard/dashboard.html`);
    await dashboard.locator(".notebook-button", { hasText: "阅读" }).click();
    await dashboard.locator("td.word-cell", { hasText: "apple" }).waitFor({ timeout: 10000 });
    await dashboard.locator("td.translation-cell", { hasText: "苹果" }).waitFor();

    await dashboard.fill("#search-input", "apple");
    await dashboard.locator("td.word-cell", { hasText: "apple" }).waitFor();

    await dashboard.click("[data-edit]");
    await dashboard.fill(".inline-edit input[name='translation']", "苹果（端到端测试）");
    await dashboard.click(".inline-edit button[type='submit']");
    await dashboard.locator("td.translation-cell", { hasText: "端到端测试" }).waitFor();

    await dashboard.fill("#new-notebook-name", "E2E分组");
    await dashboard.click(".new-notebook button");
    await dashboard.locator(".notebook-button", { hasText: "E2E分组" }).waitFor();
    await dashboard.locator(".notebook-button", { hasText: "全部生词" }).click();
    await dashboard.fill("#search-input", "apple");
    await dashboard.click("[data-edit]");
    await dashboard.selectOption(".inline-edit select[name='notebookId']", { label: "E2E分组" });
    await dashboard.click(".inline-edit button[type='submit']");
    await dashboard.locator(".notebook-button", { hasText: "E2E分组" }).click();
    await dashboard.locator("td.word-cell", { hasText: "apple" }).waitFor();

    await assertDownload(dashboard, "#export-csv", "csv");
    await assertDownload(dashboard, "#export-xlsx", "xlsx");
    await assertDownload(dashboard, "#export-pdf", "pdf");

    await dashboard.click("[data-delete]");
    await dashboard.locator("#empty-state", { hasText: "暂无单词" }).waitFor({ timeout: 5000 });
  } finally {
    if (context) await context.close();
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(userDataDir, { recursive: true, force: true });
    if (ownedTranslateService) ownedTranslateService.kill();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});

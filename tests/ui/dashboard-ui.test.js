const path = require("node:path");
const { pathToFileURL } = require("node:url");

async function loadPlaywright() {
  try {
    return require("@playwright/test");
  } catch (_error) {
    console.log("SKIP: @playwright/test 未安装");
    return null;
  }
}

async function launchBrowser(chromium) {
  const attempts = [
    { channel: "msedge", headless: true },
    { channel: "chrome", headless: true },
    { headless: true }
  ];
  for (const options of attempts) {
    try {
      return await chromium.launch(options);
    } catch (_error) {
      // Try the next installed browser.
    }
  }
  return null;
}

(async () => {
  const playwright = await loadPlaywright();
  if (!playwright) return;
  const browser = await launchBrowser(playwright.chromium);
  if (!browser) {
    console.log("SKIP: 未找到可用的 Chrome/Edge/Playwright Chromium");
    return;
  }
  const page = await browser.newPage();
  const dashboardPath = path.resolve(__dirname, "../../extension/dashboard/dashboard.html");
  const dashboardUrl = pathToFileURL(dashboardPath).href;
  try {
    await page.goto(dashboardUrl);
    await page.waitForSelector("text=Instant Wordbook");
    await page.evaluate(async () => {
      await new Promise((resolve, reject) => {
        const request = indexedDB.deleteDatabase("wordbook_db");
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
        request.onblocked = () => resolve();
      });
    });
    await page.reload();
    await page.waitForSelector("text=小作文词");
    await page.waitForSelector("text=阅读");

    await page.fill("#new-notebook-name", "测试分组");
    await page.click(".new-notebook button");
    await page.waitForSelector("text=测试分组");

    await page.evaluate(async () => {
      const notebooks = await WordbookDB.listNotebooks();
      const target = notebooks.find((item) => item.name === "测试分组");
      await WordbookDB.addOrUpdateWord({
        text: "apple",
        translation: "苹果",
        phonetic: "ˈæpəl",
        notebookId: target.id,
        sourceTitle: "Example",
        sourceUrl: "https://example.com"
      });
    });
    await page.reload();
    await page.fill("#search-input", "apple");
    await page.locator("td.word-cell", { hasText: "apple" }).waitFor();
    await page.locator("td.translation-cell", { hasText: "苹果" }).waitFor();
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});

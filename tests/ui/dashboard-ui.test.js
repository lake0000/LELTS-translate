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
      const essay = notebooks.find((item) => item.name === "小作文词");
      const reading = notebooks.find((item) => item.name === "阅读");
      await WordbookDB.addOrUpdateWord({
        text: "apple",
        translation: "苹果",
        phonetic: "ˈæpəl",
        notebookId: target.id,
        sourceTitle: "Example",
        sourceUrl: "https://example.com"
      });
      await WordbookDB.addOrUpdateWord({
        text: "primary",
        translation: "主要的",
        notebookId: essay.id
      });
      await WordbookDB.addOrUpdateWord({
        text: "reading",
        translation: "阅读",
        notebookId: reading.id
      });
      await WordbookDB.addOrUpdateWord({
        text: "memory",
        translation: "记忆",
        notebookId: reading.id
      });
      await WordbookDB.addOrUpdateSentence({
        text: "Although the task was difficult, the team finished it on time.",
        translation: "虽然任务很难，但团队按时完成了。",
        analysis: {
          sentence: "Although the task was difficult, the team finished it on time.",
          translation: "虽然任务很难，但团队按时完成了。",
          segments: [
            { id: "s1", text: "Although", role: "connector", label: "让步连接词", translation: "虽然", note: "引出让步" },
            { id: "s2", text: "the task was difficult", role: "clause", label: "让步从句", translation: "任务很难", note: "" },
            { id: "s3", text: "the team finished it", role: "core", label: "主干", translation: "团队完成了它", note: "" },
            { id: "s4", text: "on time", role: "modifier", label: "时间状语", translation: "按时", note: "" }
          ],
          expressions: [{ text: "on time", meaning: "按时", example: "" }],
          difficulties: [{ text: "Although", note: "让步从句不影响主句结论" }],
          summary: "主句是团队按时完成。"
        },
        sourceTitle: "Sentence Sample",
        sourceUrl: "https://example.com/sentence"
      });
    });
    await page.reload();
    const allButton = page.locator(".notebook-button", { hasText: "全部生词" });
    const essayButton = page.locator(".notebook-button", { hasText: "小作文词" });
    const readingButton = page.locator(".notebook-button", { hasText: "阅读" });
    await allButton.waitFor();
    await page.locator(".notebook-button", { hasText: "测试分组" }).waitFor();
    const initialCounts = {
      all: await allButton.textContent(),
      essay: await essayButton.textContent(),
      reading: await readingButton.textContent()
    };
    if (!/4\s*$/.test(initialCounts.all) || !/1\s*$/.test(initialCounts.essay) || !/2\s*$/.test(initialCounts.reading)) {
      throw new Error(`unexpected initial notebook counts: ${JSON.stringify(initialCounts)}`);
    }
    await essayButton.click();
    await readingButton.click();
    const switchedCounts = {
      all: await allButton.textContent(),
      essay: await essayButton.textContent(),
      reading: await readingButton.textContent()
    };
    if (initialCounts.all !== switchedCounts.all || initialCounts.essay !== switchedCounts.essay || initialCounts.reading !== switchedCounts.reading) {
      throw new Error(`notebook counts changed after switching: ${JSON.stringify({ initialCounts, switchedCounts })}`);
    }
    await allButton.click();
    await page.fill("#search-input", "apple");
    await page.locator("td.word-cell", { hasText: "apple" }).waitFor();
    await page.locator("td.translation-cell", { hasText: "苹果" }).waitFor();
    await page.fill("#search-input", "");
    await page.locator(".notebook-button", { hasText: "句子本" }).click();
    await page.locator("td.sentence-text-cell", { hasText: "Although the task was difficult" }).waitFor();
    await page.locator(".sentence-segment", { hasText: "Although" }).waitFor();
    await page.locator("td.translation-cell", { hasText: "虽然任务很难" }).waitFor();
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});

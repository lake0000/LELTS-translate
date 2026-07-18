const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const port = 9876;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer() {
  for (let i = 0; i < 40; i += 1) {
    const response = await fetch(`http://127.0.0.1:${port}/health`).catch(() => null);
    if (response && response.ok) return response.json();
    await delay(250);
  }
  throw new Error("server did not start");
}

async function post(pathname, payload) {
  return fetch(`http://127.0.0.1:${port}${pathname}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
}

(async () => {
  const child = spawn(process.execPath, ["local-server/server.js"], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      YOUDAO_MOCK: "true"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });
  try {
    const health = await waitForServer();
    assert.equal(health.ok, true);
    assert.equal(health.mock, true);

    const translateResponse = await post("/api/translate", { text: "apple", from: "auto", to: "zh-CHS" });
    assert.equal(translateResponse.ok, true);
    const translation = await translateResponse.json();
    assert.equal(translation.ok, true);
    assert.match(translation.translation, /苹果/);

    const sample = {
      scopeName: "阅读",
      notebooks: [{ id: "n1", name: "阅读" }],
      words: [
        {
          notebookId: "n1",
          text: "apple",
          translation: "苹果",
          phonetic: "ˈæpəl",
          sourceTitle: "Example",
          sourceUrl: "https://example.com",
          createdAt: "2026-07-15T00:00:00.000Z"
        }
      ]
    };

    const xlsxResponse = await post("/api/export/xlsx", sample);
    assert.equal(xlsxResponse.ok, true);
    assert.match(xlsxResponse.headers.get("content-type"), /spreadsheetml/);
    const xlsx = Buffer.from(await xlsxResponse.arrayBuffer());
    assert.equal(xlsx.slice(0, 2).toString(), "PK");

    const pdfResponse = await post("/api/export/pdf", sample);
    assert.equal(pdfResponse.ok, true);
    assert.match(pdfResponse.headers.get("content-type"), /application\/pdf/);
    const pdf = Buffer.from(await pdfResponse.arrayBuffer());
    assert.equal(pdf.slice(0, 4).toString(), "%PDF");
  } finally {
    child.kill();
  }
})().catch((error) => {
  console.error(stderr);
  console.error(error);
  process.exit(1);
});


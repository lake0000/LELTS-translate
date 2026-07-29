const test = require("node:test");
const assert = require("node:assert/strict");
const normalize = require("../../shared/normalize");
const exportUtils = require("../../shared/export-utils");
const { createSign, sha256 } = require("../../local-server/youdao");

test("validateSelection accepts useful text and normalizes spacing", () => {
  const result = normalize.validateSelection("  apple\n pie  ");
  assert.equal(result.ok, true);
  assert.equal(result.text, "apple pie");
  assert.equal(result.normalized, "apple pie");
});

test("validateSelection rejects empty, punctuation-only, and too long text", () => {
  assert.equal(normalize.validateSelection("   ").code, "EMPTY");
  assert.equal(normalize.validateSelection("!!!").code, "INVALID");
  assert.equal(normalize.validateSelection("a".repeat(301)).code, "TOO_LONG");
});

test("validateSentence accepts longer sentences and rejects oversized paragraphs", () => {
  const sentence = normalize.validateSentence("Although the task was difficult, the team finished it on time.");
  assert.equal(sentence.ok, true);
  assert.equal(sentence.text.includes("Although"), true);
  const tooLong = normalize.validateSentence("a".repeat(normalize.MAX_SENTENCE_LENGTH + 1));
  assert.equal(tooLong.ok, false);
  assert.equal(tooLong.code, "TOO_LONG");
});

test("normalizeWord treats case and edge punctuation consistently", () => {
  assert.equal(normalize.normalizeWord(" Apple, "), "apple");
  assert.equal(normalize.normalizeWord("Ｈｅｌｌｏ"), "hello");
});

test("Youdao v3 sign uses truncated input for long text", () => {
  const query = "abcdefghijklmnopqrstuvwxyz";
  const sign = createSign({
    appKey: "app",
    query,
    salt: "salt",
    curtime: "123",
    appSecret: "secret"
  });
  assert.equal(sign, sha256("appabcdefghij26qrstuvwxyzsalt123secret"));
});

test("CSV export includes BOM, headers, Chinese text, and escaping", () => {
  const csv = exportUtils.buildCsv(
    [{ id: "n1", name: "阅读" }],
    [
      {
        notebookId: "n1",
        text: 'apple, "fruit"',
        translation: "苹果",
        phonetic: "ˈæpəl",
        sourceTitle: "示例",
        sourceUrl: "https://example.com",
        createdAt: "2026-07-15T00:00:00.000Z"
      }
    ]
  );
  assert.equal(csv.charCodeAt(0), 0xfeff);
  assert.match(csv, /生词本,单词,原形,词形说明,翻译/);
  assert.match(csv, /"apple, ""fruit"""/);
  assert.match(csv, /苹果/);
});

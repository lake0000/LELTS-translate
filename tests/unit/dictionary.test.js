const test = require("node:test");
const assert = require("node:assert/strict");
const { loadEnvFile } = require("../../local-server/server");
const { buildInflectionInfo, detectInflection, translateWithYoudao } = require("../../local-server/youdao");

test("English plural words use dictionary-style entries instead of broken text translation", async () => {
  loadEnvFile();
  const result = await translateWithYoudao({ text: "Insights", from: "auto", to: "zh-CHS" });
  assert.equal(result.ok, true);
  assert.ok(result.dictionary, "dictionary data should be present");
  assert.ok(result.dictionary.entries.length > 0, "dictionary entries should be present");
  assert.match(result.dictionary.entries[0].partOfSpeech, /n\./);
  assert.doesNotMatch(result.translation, /^的见解/);
});

test("Irregular inflections expose their base form", async () => {
  const detected = detectInflection("burnt");
  assert.equal(detected.baseWord, "burn");
  assert.equal(detected.label, "过去式/过去分词");

  loadEnvFile();
  const result = await buildInflectionInfo("burnt");
  assert.equal(result.baseWord, "burn");
  assert.equal(result.label, "过去式/过去分词");
});

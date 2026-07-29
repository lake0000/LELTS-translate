const DEFAULT_BASE_URL = "https://www.mlai.online/";
const DEFAULT_MODEL = "gpt-5.4-mini";

function normalizeEndpoint(baseUrl) {
  const trimmed = String(baseUrl || DEFAULT_BASE_URL).trim().replace(/\/+$/, "");
  if (/\/chat\/completions$/i.test(trimmed)) return trimmed;
  if (/\/v1$/i.test(trimmed)) return `${trimmed}/chat/completions`;
  return `${trimmed}/v1/chat/completions`;
}

function extractJson(text) {
  const value = String(text || "").trim();
  if (!value) throw new Error("GPT 返回为空");
  try {
    return JSON.parse(value);
  } catch (_error) {
    const match = value.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("GPT 未返回 JSON 结构");
    return JSON.parse(match[0]);
  }
}

function normalizeRole(role) {
  const value = String(role || "").toLowerCase();
  const allowed = new Set(["core", "subject", "predicate", "object", "modifier", "connector", "clause", "phrase", "other"]);
  return allowed.has(value) ? value : "other";
}

function normalizeAnalysis(input, sentence) {
  const data = input && typeof input === "object" ? input : {};
  const segments = Array.isArray(data.segments) ? data.segments : [];
  const normalizedSegments = segments
    .map((segment, index) => ({
      id: String(segment.id || `s${index + 1}`),
      text: String(segment.text || "").trim(),
      role: normalizeRole(segment.role),
      label: String(segment.label || "").trim(),
      translation: String(segment.translation || "").trim(),
      note: String(segment.note || "").trim()
    }))
    .filter((segment) => segment.text);
  return {
    sentence: String(data.sentence || sentence || "").trim(),
    translation: String(data.translation || "").trim(),
    segments: normalizedSegments.length
      ? normalizedSegments
      : [{ id: "s1", text: String(sentence || "").trim(), role: "core", label: "句子", translation: "", note: "" }],
    expressions: [],
    difficulties: [],
    summary: String(data.summary || "").trim()
  };
}

function mockAnalysis(sentence) {
  return normalizeAnalysis({
    sentence,
    translation: "这是一个句子分析示例。",
    segments: [
      { id: "s1", text: sentence, role: "core", label: "句子主干", translation: "示例译文", note: "测试模式下返回固定结构。" }
    ],
    summary: "测试模式：结构稳定，供前端渲染。"
  }, sentence);
}

function buildMessages(sentence) {
  return [
    {
      role: "system",
      content: [
        "你是英语阅读老师。只返回严格 JSON，不要 Markdown。",
        "目标：帮助中文学习者理解英文句子。",
        "必须使用这个结构：",
        '{"sentence":"","translation":"","segments":[{"id":"s1","text":"","role":"core|subject|predicate|object|modifier|connector|clause|phrase|other","label":"","translation":"","note":""}],"summary":""}',
        "segments 按原句顺序切分，尽量覆盖原句；主干/主谓宾用 core/subject/predicate/object，修饰成分用 modifier，从句用 clause，转折/连接词用 connector。",
        "translation 是整句自然中文译文。label 控制浮窗标签，note 用一句话解释悬浮提示。",
        "不要返回 expressions 或 difficulties。"
      ].join("\n")
    },
    {
      role: "user",
      content: `分析这个英文句子，并返回 JSON：\n${sentence}`
    }
  ];
}

async function callMlai(sentence, modelOverride = "") {
  const apiKey = process.env.MLAI_API_KEY || process.env.OPENAI_API_KEY || "";
  if (!apiKey) {
    return { ok: false, message: "未配置 MLAI_API_KEY" };
  }
  const endpoint = normalizeEndpoint(process.env.MLAI_BASE_URL || DEFAULT_BASE_URL);
  const model = String(modelOverride || process.env.MLAI_MODEL || DEFAULT_MODEL).trim();
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: buildMessages(sentence),
      temperature: 0.2,
      max_tokens: 900,
      response_format: { type: "json_object" }
    })
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = data && data.error && data.error.message ? data.error.message : `GPT 接口请求失败：${response.status}`;
    return { ok: false, message };
  }
  const content = data && data.choices && data.choices[0] && data.choices[0].message
    ? data.choices[0].message.content
    : "";
  const analysis = normalizeAnalysis(extractJson(content), sentence);
  return {
    ok: true,
    text: sentence,
    analysis,
    raw: {
      model: data.model || model,
      usage: data.usage || null
    }
  };
}

async function analyzeSentence(payload = {}) {
  const sentence = String(payload.text || payload.sentence || "").replace(/\s+/g, " ").trim();
  if (!sentence) return { ok: false, message: "句子不能为空" };
  if (sentence.length > 800) return { ok: false, message: "句子过长，请选择一个句子或较短段落" };
  if (String(process.env.MLAI_MOCK).toLowerCase() === "true") {
    return { ok: true, text: sentence, analysis: mockAnalysis(sentence), raw: { mock: true } };
  }
  try {
    return await callMlai(sentence, payload.model);
  } catch (error) {
    return { ok: false, message: error.message || "GPT 句子分析失败" };
  }
}

async function listModels() {
  const apiKey = process.env.MLAI_API_KEY || process.env.OPENAI_API_KEY || "";
  const current = process.env.MLAI_MODEL || DEFAULT_MODEL;
  if (String(process.env.MLAI_MOCK).toLowerCase() === "true") {
    return {
      ok: true,
      current,
      models: ["gpt-5.6", "gpt-5.5", "gpt-5.4", "gpt-5.4-mini"]
    };
  }
  if (!apiKey) return { ok: false, message: "未配置 MLAI_API_KEY" };
  const base = String(process.env.MLAI_BASE_URL || DEFAULT_BASE_URL).trim().replace(/\/+$/, "");
  const endpoint = /\/v1$/i.test(base) ? `${base}/models` : `${base}/v1/models`;
  try {
    const response = await fetch(endpoint, {
      headers: { authorization: `Bearer ${apiKey}` }
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data) {
      const message = data && data.error && data.error.message ? data.error.message : `模型列表请求失败：${response.status}`;
      return { ok: false, message };
    }
    const models = (Array.isArray(data.data) ? data.data : [])
      .map((item) => String(item.id || "").trim())
      .filter(Boolean);
    return { ok: true, current, models };
  } catch (error) {
    return { ok: false, message: error.message || "模型列表请求失败" };
  }
}

module.exports = {
  analyzeSentence,
  listModels,
  normalizeEndpoint,
  normalizeAnalysis
};

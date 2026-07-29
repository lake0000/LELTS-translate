(async function initOptions() {
  const input = document.getElementById("server-url");
  const modelSelect = document.getElementById("sentence-model");
  const status = document.getElementById("status");
  const stored = await chrome.storage.local.get({ serverUrl: "http://127.0.0.1:8787", sentenceModel: "" });
  input.value = stored.serverUrl;
  modelSelect.value = stored.sentenceModel || "";

  function setStatus(message) {
    status.textContent = message;
  }

  function serverUrl() {
    return input.value.replace(/\/+$/, "");
  }

  function setModelOptions(models, current, selected) {
    const unique = [...new Set((models || []).filter(Boolean))];
    modelSelect.innerHTML = '<option value="">使用本地服务默认模型</option>';
    for (const model of unique) {
      const option = document.createElement("option");
      option.value = model;
      option.textContent = model === current ? `${model}（服务默认）` : model;
      modelSelect.appendChild(option);
    }
    modelSelect.value = selected && unique.includes(selected) ? selected : "";
  }

  async function refreshModels() {
    const response = await fetch(`${serverUrl()}/api/models`).catch(() => null);
    if (!response || !response.ok) {
      setStatus("模型列表读取失败，请确认本地服务已启动并配置 GPT Key");
      setModelOptions([], "", stored.sentenceModel || "");
      return;
    }
    const data = await response.json();
    setModelOptions(data.models || [], data.current || "", modelSelect.value || stored.sentenceModel || "");
    setStatus(`已读取 ${data.models ? data.models.length : 0} 个可用模型`);
  }

  document.getElementById("options-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    await chrome.storage.local.set({
      serverUrl: serverUrl(),
      sentenceModel: modelSelect.value
    });
    setStatus("已保存");
  });

  document.getElementById("test-server").addEventListener("click", async () => {
    const url = serverUrl();
    const response = await fetch(`${url}/health`).catch(() => null);
    if (!response || !response.ok) {
      setStatus("本地服务未启动");
      return;
    }
    const data = await response.json();
    setStatus(data.ok ? `本地服务可用${data.gpt && data.gpt.configured ? "，GPT 已配置" : ""}` : "本地服务异常");
  });

  document.getElementById("refresh-models").addEventListener("click", refreshModels);
  await refreshModels();
})();

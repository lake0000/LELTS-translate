# Instant Wordbook

> 浏览器划词翻译 + 本地生词本 + 可视化管理页 + 导出系统

## ✨ 项目作用

Instant Wordbook 是一个本地优先的英语学习浏览器插件。

它适合用来：

- 在网页或本地 HTML 阅读材料中快速翻译英文单词/短语
- 把生词加入本地生词本
- 在插件 Dashboard 中搜索、编辑、移动、删除生词
- 导出 CSV / XLSX / PDF，方便复习或手机阅读

当前触发方式：

```txt
先划选英文单词或短语 → 再按一下 Shift → 显示翻译浮窗
```

## 🧩 技术原理

整体采用本地优先架构：

```txt
网页选区
  ↓
Chrome/Edge Manifest V3 content script
  ↓
extension service worker
  ↓
本地 Node.js 翻译代理服务
  ↓
有道文本翻译 API / 词典增强回退
  ↓
插件 IndexedDB 生词本
```

关键设计：

- 插件源码不保存翻译密钥
- 有道密钥只由本地 Node.js 服务读取
- 生词、分组、翻译缓存保存到插件 IndexedDB
- 英文单词优先返回词性和多义项
- 本地 HTML 页面可用，但浏览器中需要开启“允许访问文件 URL”
- 导出 CSV 在插件内完成，XLSX/PDF 由本地服务生成

## 🚀 使用方法

### 1. 安装依赖

```powershell
npm install
```

### 2. 配置本地翻译服务

复制示例配置：

```txt
local-server/.env.example → local-server/.env
```

在 `local-server/.env` 中填写你自己的有道应用配置。

注意：

- `.env` 已被 `.gitignore` 忽略
- 不要把 `.env` 提交到 Git
- 不要把密钥写进插件源码

### 3. 启动本地服务

```powershell
npm run server
```

健康检查：

```txt
http://127.0.0.1:8787/health
```

### 4. 加载浏览器插件

Chrome：

```txt
chrome://extensions
```

Edge：

```txt
edge://extensions
```

然后：

1. 打开“开发者模式”
2. 点击“加载已解压的扩展程序”
3. 选择 `extension` 目录
4. 如果要在 `file:///` 本地 HTML 页面使用，打开“允许访问文件 URL”

### 5. 开始使用

```txt
划选英文单词或短语 → 按 Shift → 查看浮窗 → 加入生词本
```

点击插件图标可以打开 Dashboard，管理和导出生词。

## 🧪 测试

运行完整测试：

```powershell
npm run test:all
```

测试覆盖：

- 文本标准化
- CSV 转义和 BOM
- 词典增强
- 本地服务冒烟测试
- Dashboard UI
- 浏览器插件端到端流程

## 📦 目录结构

```txt
extension/       浏览器插件代码
local-server/    本地翻译代理和导出服务
shared/          插件与服务共用工具
tests/           自动化测试
```

## 🔐 隐私与安全

- 翻译密钥不进入插件源码
- `.env` 不提交
- 发布包不应包含 `.env`
- 本地生词默认保存在浏览器插件 IndexedDB 中
- 翻译请求会经过本机 `127.0.0.1` 服务代理

## ⚖️ 开源协议

本项目建议采用 MIT License。

你可以自由使用、复制、修改、合并、发布和分发本项目代码；使用时请保留版权和许可声明。


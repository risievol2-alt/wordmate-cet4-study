# Wordmate · 四级词汇陪练

一个面向大学英语四级（CET-4）学习者的轻量单词复习工具。每次展示一个英文单词与四个中文选项，答对后加入复习列表，答错后进入纠错列表；学习进度保存在当前设备中。

![Wordmate 项目截图](docs/screenshot.png)

## 功能特点

- **完整四级词库**：内置 7,508 个 CET-4 词条，可离线加载。
- **四选一练习**：自动生成一个正确释义和三个相近中文干扰项。
- **英文发音**：点击单词即可通过浏览器 Web Speech API 播放发音。
- **复习列表**：答对的单词自动归档，便于再次巩固。
- **纠错练习**：答错的单词自动进入纠错列表，答对后移出。
- **快捷操作**：支持键盘数字键 `1`–`4` 快速选择。
- **本地进度**：使用 `localStorage` 保存学习记录，无需注册账号。
- **响应式界面**：适配桌面端、平板和手机浏览器。

## 便携版

不想配置开发环境时，可从 [Releases](https://github.com/risievol2-alt/wordmate-cet4-study/releases/latest) 下载便携版 ZIP。解压后直接双击 `index.html` 即可使用，词库和核心功能均可离线运行。

## 技术实现

| 模块 | 技术 |
| --- | --- |
| 前端框架 | Next.js 16、React 19、TypeScript |
| 构建与运行 | Vinext、Vite 8、Cloudflare Workers 兼容输出 |
| 样式 | Tailwind CSS 4 + 原生 CSS |
| 发音 | Web Speech API（`speechSynthesis`） |
| 数据 | 本地 CET-4 TSV 词库 |
| 状态持久化 | 浏览器 `localStorage` |
| 在线托管 | OpenAI Sites |

### 选项生成

程序优先从相同词性的词条中选择干扰项，并根据中文释义的字面相似度与长度进行排序，再加入随机扰动，兼顾迷惑性和题目变化。

### 数据与隐私

- 学习记录仅保存在用户当前浏览器中。
- 项目不收集 Cookie、个人信息或学习记录。
- 仓库不包含生产数据库、扫描结果、环境变量或密钥。

## 本地运行

### 环境要求

- Node.js `>= 22.13.0`
- npm `>= 10`

### 开发模式

```bash
git clone https://github.com/risievol2-alt/wordmate-cet4-study.git
cd wordmate-cet4-study
npm install
npm run dev
```

浏览器打开终端提示的本地地址，通常为 `http://localhost:3000`。

### 构建生产版本

```bash
npm run build
npm run start
```

## 项目结构

```text
app/                  页面、交互与样式
public/cet4.tsv       CET-4 词库
docs/screenshot.png   项目截图
worker/               Cloudflare Worker 入口
.openai/hosting.json  Sites 托管配置
```

## 词库来源

词库整理自开源项目 [KyleBing/english-vocabulary](https://github.com/KyleBing/english-vocabulary)。如需用于商业场景，请自行确认上游词库的授权与合规要求。

## License

本项目代码采用 [MIT License](LICENSE) 开源。

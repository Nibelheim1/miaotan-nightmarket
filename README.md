# 喵弹夜市 · Midnight Bounce Club

**按住瞄准，松手弹射；让弹珠绕到怪物背后，用雷链、分裂与爆破守住整条夜市。**

版本：1.0.0 · 交付日期：2026-09-06 · 竖屏 H5 / 标准浏览器 · 无广告、无登录、无 CDN、无运行时第三方依赖。

这是可完整游玩的本地 Web 版，包含开始、教程、战斗、改装、胜败、结算、成长、继续上局和分享卡；不是已经上架或接好 TapTap SDK 的线上版本。发行与测试边界见 [TEST_REPORT.md](TEST_REPORT.md) 和 [docs/PLATFORM_INTEGRATION.md](docs/PLATFORM_INTEGRATION.md)。

## 先玩起来

**无需安装开发环境：解压后用浏览器打开 `dist/index.html`。** 它是 CSS、JavaScript、图标全部内联的单个文件。Windows 也可双击 `PLAY_WINDOWS.bat`。这属于本地文件运行；浏览器或文件管理器可能限制存档、声音或直接打开方式。出现存档警告时游戏仍可玩，但不要依赖持久化保存。

更稳定的方式是使用下面的本地 HTTP 服务。交付环境的管理员策略阻止了浏览器 URL 导航，因此浏览器回归采用生产 HTML 的 `set_content` 加载；HTTP 服务已单独实际请求验证，但不把它表述成已验证浏览器双击／导航。详见测试报告。

## 安装、开发与构建

需要 Node.js 18 或更高版本。项目没有 npm 外部依赖，`npm install` 不需要下载游戏引擎。

```bash
npm install
npm run dev
```

终端显示 `http://localhost:4173`，在浏览器访问即可。修改 `src` 或样式后手动刷新。没有热更新插件。

```bash
npm test                 # Node 内置测试运行器：63 项
npm run simulate         # 450 次标准模式策略模拟，写入 evidence/
node tests/extended-simulation.mjs # 75 次每日同题逻辑 + 75 次无尽
npm run build            # 生产单文件写入 dist/index.html
npm run preview          # 用 HTTP 服务检查生产 dist
```

调试地址：`http://localhost:4173/?debug=1&seed=42`。`debug=1` 才会暴露 `window.__nightmarket`；正式链接不要携带它。`seed` 用于复现地图，不代表服务器公平竞赛。

端口占用：macOS/Linux 可使用 `PORT=4174 npm run dev`；Windows PowerShell 使用 `$env:PORT=4174; npm run dev`。启动工具只适合本地或可信局域网，不要作为公网生产服务器暴露。

## 手机与静态部署

电脑、手机连接同一可信 Wi-Fi，电脑运行 `npm run dev` 后，手机访问 `http://电脑局域网IP:4173`。根据系统提示允许本地防火墙访问。保持竖屏；横屏可以继续操作，但小高度屏幕的战场会缩小。

正式部署时，只需要把 `dist/` 的内容上传到普通 HTTPS 静态站点，入口是 `index.html`。无需后端、密钥、域名白名单或运行时 CDN。部署平台自身的访问日志不属于游戏内埋点。不要把源码、测试和研究报告一起当游戏包上传。

另外提供的 `miaotan-nightmarket-web.zip` 只有 `Miaotan/index.html`，便于传输／上传。它不是平台审核通过证明；上传时以当前后台要求的 ZIP 根结构为准。

## 怎样玩

开摊后点场内方向即可发射；也可按住拖动、松手出手。先试带小炸弹的怪物，击破后邻居也会炸。瞄准线预览首个接触位置，不预测后续所有升级连锁。

电脑支持鼠标、左右方向键和空格。点击右上暂停或按 Escape。切后台自动暂停，回到页面要主动继续。弹珠演出可切换 ×1 / ×2 / ×3，不改变固定步长的物理规则。

保卫战有 18 波来敌，6 / 12 / 18 波出现大王。发射后敌人前进一格，第 13 波进入夜宵潮，改为每轮两格。普通敌人越线消耗护盾或生命；大王越线直接结束。18 波之后还有残敌时进入清场，不会继续生成新敌人。

每次出现改装时三选一；全局有一次换牌机会，也能放弃改装换一颗心。试试雷链＋冰糖、分裂＋穿透、爆破＋横扫、借墙＋回弹。

## 内容与进度

12 种机制型改装、4 种组合提示、3 位可解锁店长、5 类敌人、18 波保卫战、UTC+8 每日同题、无尽夜班、本机战绩、图鉴和纪念章。结算获得印章，累计 8 / 20 印章解锁桃桃／芋圆，不要求广告或付费。

存档使用当前浏览器、当前来源的 LocalStorage。没有云存档，换浏览器、换域名、隐私模式或清理数据可能丢失进度。暂停能原地继续；刷新或回主页后继续上局，回到本轮发射前，而不是任意弹珠飞行位置。每日同题是固定种子＋固定薄荷店长，本版没有全球排名、反作弊或真正的在线对战。

## 项目结构

```text
src/main.js                UI 与状态协调、输入、生命周期
src/game/engine.js         不依赖 DOM 的确定性战斗模拟
src/game/render.js         Canvas 战场、轨迹、角色、特效
src/data/config.js         数值与性能预算
src/data/upgrades.js       改装、等级描述、组合配方
src/core/random.js         显式状态 PRNG、每日日期
src/platform/services.js   存储、埋点、本机榜、分享、平台接口
src/audio/audio.js         WebAudio 原创音效与音乐
src/ui/icons.js            原创 SVG 图标与店长美术
public/styles.css          移动端优先界面、Safe Area、响应式
assets/                    图标和可编辑的店长 SVG
index.html                 开发入口：需 HTTP 服务载入 ES 模块
tools/                     零依赖构建工具、开发／预览服务器
tests/                     单元测试、模拟、可选浏览器测试
dist/                      完整单文件生产构建和构建校验信息
evidence/                  实际测试记录、模拟数据、截图
```

## 浏览器回归（开发可选，不影响玩游戏）

```bash
python -m pip install playwright
python -m playwright install chromium
python tests/browser_test.py
```

官方安装说明：[Playwright Python](https://playwright.dev/python/docs/library)。本脚本使用 Playwright 库，不依赖 pytest。已有 Chromium 时可通过 `CHROMIUM_PATH` 环境变量指定路径。默认尝试导航到本地 4173 端口，但完整回归仍使用生产 HTML 注入，并明确标注存储测试替身；在真实本地浏览器中还应检查刷新后的原生 LocalStorage。

## 接着开发

优先改 `src/data/config.js` 和 `src/data/upgrades.js`，不要直接改压缩包中的 `dist/index.html`。改后执行测试、模拟、构建。构建器只支持本项目使用的**具名、相对路径静态 ES 模块**，不支持循环依赖、动态 import、npm 包导入。需要引擎或复杂工具链时再迁移到通用打包器，不要静默扩展当前构建器的语法假设。

玩法与数值见 [DESIGN.md](DESIGN.md)，12 个立项候选与证据见 [MARKET_RESEARCH.md](MARKET_RESEARCH.md)，真实执行结果见 [TEST_REPORT.md](TEST_REPORT.md)，上线前核对 [docs/RELEASE_CHECKLIST.md](docs/RELEASE_CHECKLIST.md)。

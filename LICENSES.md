# 许可与资源来源

## 随项目提供

| 项目 | 来源／作者信息 | 许可与使用边界 |
|---|---|---|
| 游戏源代码、HTML、CSS、构建和测试工具 | 本次任务中 AI 生成、项目原创实现；未复制第三方游戏代码 | 按根目录 MIT LICENSE 提供，可修改、分发及商业使用，保留许可声明 |
| SVG 图标、三位店长 | 本项目 `src/ui/icons.js`、`assets/` | 同上；没有外部角色图片、品牌 Logo 或授权不明图像 |
| Canvas 怪物、弹珠、粒子、战绩卡 | 本项目程序绘制 | 同上 |
| 音效、旋律 | 本项目 WebAudio 合成与音符序列 | 同上；无采样外部唱片或音乐素材 |
| 游戏界面截图 | 本项目 Chromium 运行截图 | 与对应游戏素材相同；不要把诊断或压力场景冒充真实用户战绩 |
| 字体 | 用户设备的系统字体，CSS 仅声明回退字体名 | 不分发字体文件；本项目不授予任何第三方字体权利 |
| 市场资料 | MARKET_RESEARCH.md 中链接的原站点 | 仅提供来源链接、短摘要与分析，不复制其素材作为游戏资源 |

本项目是 AI 辅助生成的交付。这里的许可不是对世界范围商标、专利、独创性或可登记版权的法律保证；正式发行前仍应核查游戏名及拟使用的商标／主体材料。

## 依赖

`package.json` 无 dependencies 和 devDependencies；生产游戏没有第三方 JavaScript 包、广告／统计 SDK、网络字体、CDN、远程音乐或远程模型 API。Node.js 和浏览器只作为用户本地运行／开发环境，不随包分发。

可选 QA 使用 Python、Playwright 和 Chromium，这些工具**不在交付包中分发**，也不是游戏运行依赖。Playwright 项目与许可可从其官方仓库核对：https://github.com/microsoft/playwright-python 。Node.js、Python、Chromium 的许可适用于它们各自的独立安装，不由游戏的 MIT LICENSE 替代。

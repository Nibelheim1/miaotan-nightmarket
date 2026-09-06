# 视觉资产

`icon.svg` 为原创游戏图标。`cat-mint.svg`、`cat-peach.svg`、`cat-taro.svg` 为 `src/ui/icons.js` 中店长 SVG 的可独立编辑导出。游戏运行时直接使用该模块生成的 SVG；改导出文件不会自动改变游戏，请同步修改模块。

怪物、弹珠、轨迹、粒子、战绩卡由 Canvas 绘制，代码分别在 `src/game/render.js` 和 `src/platform/services.js`。字体使用设备系统字体，不附带任何字体文件。原始 UI、图形与音频实现均在本项目中生成，没有抓取或复制其他游戏的美术。

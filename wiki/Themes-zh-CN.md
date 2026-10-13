# 主题

[English](Themes)

插件自带 8 个揭示动画主题. 它们只有 CSS 不同: 密码输入框的结构 (密码框, 按钮, 错误提示区) 在所有主题中完全相同, 因此任何主题都能配合任何功能使用 (按钮, autoSave, 回调, …).

## 主题展示 (在线演示)

每个链接都指向一篇在线演示文章. 密码是 `hello`.

| 主题 | 演示 |
|---|---|
| `default` | [hello → 显示](https://d0n9x1n.github.io/hexo-blog-encrypt/demo/theme/default/) |
| `blink`   | [hello → 显示](https://d0n9x1n.github.io/hexo-blog-encrypt/demo/theme/blink/) |
| `flip`    | [hello → 显示](https://d0n9x1n.github.io/hexo-blog-encrypt/demo/theme/flip/) |
| `shrink`  | [hello → 显示](https://d0n9x1n.github.io/hexo-blog-encrypt/demo/theme/shrink/) |
| `surge`   | [hello → 显示](https://d0n9x1n.github.io/hexo-blog-encrypt/demo/theme/surge/) |
| `up`      | [hello → 显示](https://d0n9x1n.github.io/hexo-blog-encrypt/demo/theme/up/) |
| `wave`    | [hello → 显示](https://d0n9x1n.github.io/hexo-blog-encrypt/demo/theme/wave/) |
| `xray`    | [hello → 显示](https://d0n9x1n.github.io/hexo-blog-encrypt/demo/theme/xray/) |

## 选择主题

### 全站

```yaml
# _config.yml
encrypt:
  theme: wave
```

### 单篇文章

```markdown
---
title: This one uses xray
password: hello
theme: xray
---
```

单篇文章的设置会覆盖全站设置.

## 主题之间有什么不同

主题是位于 `lib/hbe.<theme>.html` 的 HTML/CSS 包. 它们控制:

- **揭示动画**: 加密外壳如何过渡到解密后的正文 (淡入, 滑动, 闪烁等)
- **视觉样式**: 密码输入框的颜色, 内边距, 字体排版

它们 **不会** 改变:

- 数据格式 (所有主题使用相同的 v4 密文布局)
- 浏览器端 bundle (`lib/hbe.bundle.js` 与主题无关)
- 配置结构
- 解密后文章的外观: 文章显示后, 应用的是你平常的 Hexo 主题样式

## 添加你自己的主题

1. 将 `lib/hbe.default.html` 复制为 `lib/hbe.<your-name>.html`.
2. 编辑标记 / CSS. 保持 **插槽标记** 不变 (`__abstract__`, `__message__`, `__decrypt_button__` 等): 服务端模板引擎会在构建时填充它们.
3. 在配置中引用它: `theme: your-name`.

插槽列表记录在 `src/server/template.js#ALLOWED_SLOTS` 中 (渲染器唯一接受的白名单).

如果你做了值得分享的主题, 欢迎提交 PR: 我们很喜欢新主题.

## 主题约定测试

每个自带主题都由 e2e 测试套件 (`tests/e2e/theme-contract.spec.js`) 针对 v4 数据格式进行测试. 要在不破坏 CI 的情况下新增主题, 请为每个主题生成一篇 fixture 文章: 参见 `tests/helpers/buildSite.js#materializePosts`. 测试框架通过 `hbe.<name>.html` 文件名模式自动发现主题.

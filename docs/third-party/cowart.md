# Cowart 图像修改工作流

maolab 的标注修改流程参考了 [Cowart](https://github.com/zhongerxin/cowart) 的交互方式：在无限画布上保留原图，用箭头、笔迹和文字写明修改要求，再把包含原图与标注的截图交给图像模型生成干净的新图。

- Cowart：MIT License，Copyright (c) ZHONG XIN。
- 画布 SDK：[tldraw](https://tldraw.dev/)，按其独立许可条款使用。
- maolab 没有嵌入 Cowart 的 Codex MCP 消息桥；标注截图直接通过 maolab 自己的图片编辑接口处理，因此这是产品内可独立运行的工作流。
- localhost 开发可以不配置 tldraw license key；生产部署必须在 `NEXT_PUBLIC_TLDRAW_LICENSE_KEY` 中配置适用许可证。

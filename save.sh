#\!/bin/bash
set -e
cd "$(dirname "$0")"
git init
git add -A
git commit -m "init: 个人无限画布作品网站

从 basketikun/infinite-canvas 提取核心无限画布交互能力，
构建轻量级纯前端个人作品展示网站。
支持作品卡片拖拽、缩放、平移浏览，带 Lightbox 和简历页。"
echo "✅ 已保存！"

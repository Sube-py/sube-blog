---
title: "第一篇：博客搭好了"
date: 2026-09-29T10:00:00+08:00
draft: false
tags: ["随笔"]
description: "用 Hugo + EdgeOne Pages + Sveltia CMS 搭起来的静态博客。"
---

## 这套博客怎么工作的

1. 在 `/admin` 后台写文章（或本地写 Markdown）
2. 保存 → Sveltia CMS 直接提交一个 commit 到 GitHub
3. EdgeOne Pages 监听仓库变动 → 自动构建 → 发布到国内边缘节点

全程不需要服务器，也不需要手动跑构建命令。

## 试试代码块

```python
def hello(name: str) -> str:
    return f"你好，{name}"
```

## 试试列表和引用

- 支持深色模式
- 支持代码高亮
- 支持自动生成目录

> 文章内容全部是仓库里的 Markdown 文件，随时可以导出、迁移，不会被平台绑死。

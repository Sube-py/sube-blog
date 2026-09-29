# 静态博客脚手架：Hugo + EdgeOne Pages + Sveltia CMS

一套**不用服务器**的技术博客方案。写完点「发布」，文章自动上线到国内边缘节点。

```
你在 /admin 后台写文章
        │  Sveltia CMS 直接提交 commit
        ▼
   GitHub 仓库（Markdown 就是你的数据，随时可导出）
        │  push 触发
        ▼
   EdgeOne Pages 自动构建 Hugo → 发布到国内 2300+ 节点
        │
        ▼
   读者访问（已备案域名 ≈ 50-90ms）
```

**为什么这么选：**

| 需求 | 选择 | 原因 |
|---|---|---|
| 读者在国内 | EdgeOne Pages | Cloudflare 无大陆节点，晚高峰 800ms+；EdgeOne 备案域名可走国内节点 |
| 要可视化后台 | Sveltia CMS | 网页版编辑器，写完自动 commit，不需要装任何东西 |
| 不想管服务器 | 全托管 | 静态站 + Git，零运维，零成本 |

---

## 一、上线清单（照着做，约 30 分钟）

### 第 0 步：本地预览（可选，但建议先跑通）

装 Hugo（[官方安装](https://gohugo.io/installation/)，macOS `brew install hugo`，Windows `winget install Hugo.Hugo.Extended`）：

```bash
cd blog
hugo server -D          # -D 表示连草稿一起预览
# 打开 http://localhost:1313
# 后台在 http://localhost:1313/admin/
```

### 第 1 步：改 3 个地方的配置

**① `hugo.toml`**

```toml
baseURL = 'https://你的域名/'       # ← 改这里，末尾斜杠不能少
title = '你的博客名'
[params]
  author = '你的名字'
  icp = '京ICP备xxxxxxxx号-1'        # ← 备案号，国内域名放页脚
```

**② `static/admin/config.yml`**

```yaml
backend:
  repo: your-github-name/your-repo   # ← 改成 owner/repo 格式
  branch: main
site_url: https://你的域名
display_url: https://你的域名
```

**③ 删掉示例文章**（`content/posts/` 下三篇是我的示例，留着也行）

### 第 2 步：建 GitHub 仓库并推送

```bash
cd blog
git init
git add . && git commit -m "init blog"
git remote add origin git@github.com:你的名字/你的仓库.git
git push -u origin main
```

> 仓库**公开或私有都行**。私有仓库的话，第 3 步的 token 需要勾 `repo` 权限。

### 第 3 步：部署到 EdgeOne Pages

1. 打开 [EdgeOne Pages 控制台](https://edgeone.cloud.tencent.com/pages)，腾讯云账号登录
2. 点 **导入 Git 仓库** → 绑定 GitHub → **只授权这一个仓库**（最小权限）
3. 构建配置：
   - **框架预设**：Hugo（没有就选「其他」）
   - **构建命令**：`hugo --minify --gc`
   - **输出目录**：`public`
   - **加速区域**：⚠️ 选 **中国大陆**（你域名已备案，选这个才有国内节点）
   - **Node 版本**：随便，Hugo 用不到
4. 点「开始部署」，一两分钟后拿到 `xxx.edgeone.app` 预览域名

之后每次 push 都会自动重新部署。

> **如果 EdgeOne 构建报 `hugo: command not found`**：说明它的构建镜像没预装 Hugo，改用方案 B —— 用 GitHub Actions 构建，见 `deploy/github-actions.yml.example`。

### 第 4 步：启用 `/admin` 后台（三选一）

#### 方案 A：粘贴 GitHub Token（5 分钟，零服务端）✅ 先跑通这个

适合：就你自己写文章，不想折腾 OAuth。

1. GitHub → **Settings → Developer settings → Personal access tokens → Tokens (classic)**
2. **Generate new token (classic)**：
   - 勾 `repo`（私有库）或 `public_repo`（公开库）
   - 勾 `user`（读取名字头像）
   - 有效期选 **No expiration**
3. 复制 token（只显示一次）
4. 打开 `https://你的域名/admin/`，点登录 → 选 **GitHub** → 会有「使用个人令牌登录」的入口，粘贴即可

Sveltia 会把 token 存在浏览器本地，换设备需要重新粘一次。

#### 方案 B：自建 OAuth（正式用法，国内可访问）⭐ 推荐

把 `oauth-broker/edgeone-functions/functions/` 目录**整个复制到博客仓库根目录**，这样 OAuth 服务就跑在你博客域名下（`https://你的域名/auth`），不用额外建站点。

1. **注册 GitHub OAuth App**
   - GitHub → Settings → Developer settings → **OAuth Apps** → New OAuth App
   - Homepage URL：`https://你的域名`
   - **Authorization callback URL**：`https://你的域名/callback` ← 必须是这个
   - 记下 **Client ID**，生成 **Client Secret**

2. **配环境变量**
   - EdgeOne Pages 控制台 → 你的项目 → **环境变量** → 添加：
     - `OAUTH_CLIENT_ID` = 刚才的 Client ID
     - `OAUTH_CLIENT_SECRET` = Client Secret

3. **改 `static/admin/config.yml`**，取消这两行注释：
   ```yaml
   backend:
     base_url: https://你的域名
     auth_endpoint: auth
   ```

4. push → 等部署完 → 打开 `/admin/` → 点 GitHub 登录 → 授权一次，之后长期有效

#### 方案 C：Cloudflare Worker（备选）

代码在 `oauth-broker/cloudflare-worker/`。**注意**：`*.workers.dev` 域名国内可能被拦，必须在 Workers 设置里绑定自己的域名才能用。国内场景不如方案 B 稳。

### 第 5 步：绑自定义域名

EdgeOne Pages → 项目设置 → **域名管理** → 添加域名 → 按提示加一条 CNAME → HTTPS 证书自动签发。

你域名已备案，务必确认**加速区域**选的是「中国大陆」，否则会走海外节点。

---

## 二、日常怎么写文章

**最常用：网页后台**

1. 打开 `https://你的域名/admin/`
2. 「文章」→「新建」→ Markdown 编辑器左侧写、右侧实时预览
3. 右上角「发布」→ 自动 commit → 1 分钟后上线

手机上也能写，Sveltia 对移动端适配不错。

**本地写（长文更舒服）**

```bash
hugo new posts/我的文章标题.md   # 生成带 front matter 的草稿
# 用 VS Code / Obsidian 写，写完把 draft: true 改成 false
git add . && git commit -m "new post" && git push
```

**图片**：后台上传的图会进 `static/images/uploads/`，直接提交进 git。别传大图，git 仓库会膨胀。

---

## 三、排坑清单

| 现象 | 原因 / 解决 |
|---|---|
| `/admin` 一直转圈 | unpkg CDN 被拦。把 `static/admin/index.html` 里的 script src 换成 `https://cdn.jsdelivr.net/npm/@sveltia/cms@^0.211.0/dist/sveltia-cms.js` |
| 登录后报 404 / 无法保存 | `config.yml` 的 `repo` 写错，或 token 没有 `repo` 权限 |
| OAuth 报 `bad_verification_code` | callback URL 和 OAuth App 里填的不一致，逐字符核对 |
| 网站能开但样式没了 | `hugo.toml` 的 `baseURL` 没改，或少了末尾斜杠 |
| 改了文章没生效 | EdgeOne 缓存，去部署记录里手动点「重新部署」 |
| 构建失败 | 看构建日志。常见是 Hugo 版本太旧（本主题需要 ≥ 0.120），平台侧可指定 Hugo 版本 |
| 文章写完不显示 | front matter 里 `draft: true`，Hugo 默认不发布草稿 |
| 国内访问还是慢 | 检查加速区域是不是选成了「全球（不含中国大陆）」 |

---

## 四、目录结构

```
blog/
├── hugo.toml                    # 站点配置（改域名、标题、备案号）
├── content/
│   ├── posts/                   # 文章都在这，一篇一个 .md
│   └── about.md                 # 关于页
├── static/
│   ├── admin/
│   │   ├── index.html           # 后台入口
│   │   └── config.yml           # ⚠️ CMS 配置（改 repo 和域名）
│   └── images/uploads/          # 后台上传的图
├── themes/blank/                # 极简主题，零外部依赖
├── oauth-broker/
│   ├── edgeone-functions/       # 方案 B：复制到仓库根目录
│   └── cloudflare-worker/       # 方案 C
├── deploy/
│   └── github-actions.yml.example
└── archetypes/
    └── default.md               # hugo new 时的 front matter 模板
```

**关于主题**：`themes/blank` 是我写的极简主题，没有任何 submodule 依赖 —— 这点很重要，EdgeOne 构建时如果要拉 submodule 很容易超时失败。自带深色模式、代码高亮、自动生成目录、标签页、RSS。

想换主题（比如 PaperMod）也行，但记得**把主题文件直接提交进仓库，不要用 git submodule**。

---

## 五、为什么不用 Cloudflare Pages

你问过这个，顺便说清楚：

1. **Cloudflare 在中国大陆没有节点**，流量要绕道，晚高峰联通经常 800ms+ 甚至 522
2. **Pages 已经被官方边缘化**：2026 年 Cloudflare 把重心转到 Workers，新功能（Durable Objects、Cron、Queues、完整可观测性）只在 Workers 上，Pages 只剩维护
3. 真想用 Cloudflare，现在应该直接上 **Workers + Static Assets**，不是 Pages

Cloudflare 的优势是**出站带宽免费 + 全球 330+ 节点**。如果你以后有海外读者，可以 EdgeOne 做国内 + Cloudflare 做海外，用 CNAME 分流。个人博客前期没必要搞这么复杂。

---

## 六、成本

| 项 | 费用 |
|---|---|
| EdgeOne Pages | 免费（50GB/月流量、不限构建次数，个人博客用不完） |
| 域名 + 备案 | 已有 |
| GitHub 仓库 | 免费 |
| Sveltia CMS | 开源免费 |

**总计：0 元。**

# AI Dev Notes (github pages project)

按分组展示 `docs/` 下的 Markdown 笔记。分组名直接取 `docs/` 下的文件夹名称，动态获取，没有任何写死的分组配置或导航文件。

## GitHub Pages

项目是 GitHub Pages 静态站点，不需要 Node/npm 服务，也不需要写死分组：

- 线上打开时，`index.html` 直接调用 GitHub API 读取仓库文件树（`git/trees/<默认分支>?recursive=1`），**运行时动态获取 `docs/` 下所有 `.md` 路径**；
- 仓库地址从 `xxx.github.io/<repo>` 自动推导，不写死；
- 分组名和文章标题由前端从路径推导，数据里没有分组字段；
- 新建文件夹或新增文章后，push 到 `main`，刷新页面即可看到新分组；

注意：GitHub API 仅作为 jsDelivr 目录数据失败时的回退；本地未提交的新建文件夹也不会出现在 CDN 目录里。

## CDN 加速与缓存刷新

线上打开时，笔记正文、图片、marked.js 和目录数据都从 `cdn.jsdelivr.net` 拉取；入口 `index.html` 以及外链的 `styles.css`、`app.js` 仍由 GitHub Pages 提供。

- 推送到 `main` 后，`.github/workflows/cdn-purge.yml` 会自动刷新变更文件在 jsDelivr 上的缓存；也可以在 Actions 页面手动 `Run workflow` 全量刷新。
- 笔记正文和目录数据用 `fetch(..., { cache: 'no-store' })` 绕过浏览器缓存；图片用按天变化的查询参数绕过浏览器缓存（jsDelivr 本身忽略查询参数做缓存，所以 CDN 层刷新要靠上面的工作流）。
- 不需要手动打 tag 或记版本号：分支地址 `@main` 的固定缓存约 12 小时，工作流会在每次 push 后清掉。

## 本地预览

```bash
python -m http.server 8000
```

打开 http://localhost:8000 。Python 自带服务器会生成目录索引，前端会解析它实时遍历 `docs/`，新增文件夹或文章后刷新即可看到新分组。
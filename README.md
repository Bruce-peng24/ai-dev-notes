# AI Dev Notes (github pages project)

按分组展示 `docs/` 下的 Markdown 笔记。分组名直接取 `docs/` 下的文件夹名称，动态获取，没有任何写死的分组配置或导航文件。

## GitHub Pages

项目是 GitHub Pages 静态站点，不需要 Node/npm 服务，也不需要写死分组：

- 线上打开时，`app.js` 从 jsDelivr 读取仓库根目录的 `manifest.json`，**动态获取 `docs/` 下所有 `.md` 路径**；
- `manifest.json` 由 `.github/workflows/cdn-purge.yml` 在每次 push 后自动生成并提交（无需手动维护），push 后约几十秒刷新页面即可看到新文件夹和文章；
- 分组名和文章标题由前端从路径推导，数据里没有分组字段；
- 本地开发时用 `python -m http.server 8000`，前端直接递归扫描 `./docs/` 的目录列表；

注意：不要改回 jsDelivr 的 `data.jsdelivr.com` 目录接口——它的 `@main` 缓存长达 1 年，且 purge、query 参数、请求头都无法绕过，曾经线上看不到 `docs/group1/subGroup1/` 就是命中了旧清单。同理线上目录也不走 GitHub API（访问慢）。

## CDN 加速与缓存刷新

线上打开时，笔记正文、图片、marked.js 和目录清单 `manifest.json` 都从 `cdn.jsdelivr.net` 拉取；入口 `index.html` 以及外链的 `styles.css`、`app.js` 仍由 GitHub Pages 提供。

- 推送到 `main` 后，`.github/workflows/cdn-purge.yml` 会重新生成 `manifest.json` 并提交，再刷新所有变更文件（含清单）在 jsDelivr 上的缓存；也可以在 Actions 页面手动 `Run workflow` 全量刷新。
- 笔记正文和目录清单用 `fetch(..., { cache: 'no-store' })` 绕过浏览器缓存；图片用按天变化的查询参数绕过浏览器缓存（jsDelivr 本身忽略查询参数做缓存，所以 CDN 层刷新要靠上面的工作流）。
- 不需要手动打 tag 或记版本号：分支地址 `@main` 的固定缓存约 12 小时，工作流会在每次 push 后清掉。

## 图片自动压缩（L1：本地 pre-commit）

仓库使用 `.githooks/pre-commit`，提交时自动无损压缩暂存区里的图片并重新暂存，所以 push 上去的已经是优化版，不需要改现有的 CDN 刷新工作流。

首次配置（每台机器一次）：

```bash
python -m pip install -r scripts/requirements-dev.txt
git config core.hooksPath .githooks
```

- PNG 用 `oxipng` 做无损压缩，像素和透明度都不变；JPEG/WebP 默认不处理，需要时运行 `python scripts/optimize_images.py --lossy-other` 做有损重编码。
- 收益低于 5% 的文件自动跳过；脚本幂等，重复运行不会反复压缩。
- 手动压缩全部图片：`python scripts/optimize_images.py`；只检测不写盘：`python scripts/optimize_images.py --check --all`。
- 紧急绕过钩子：`SKIP_IMAGE_OPT=1 git commit ...`，但 CI 仍会校验。
- `.github/workflows/image-check.yml` 在 push/PR 且 `images/**` 有变更时跑同样的检测；若有人绕过钩子提交了未优化图片，CI 会失败并给出修复命令。

## 本地预览

```bash
python -m http.server 8000
```

打开 http://localhost:8000 。Python 自带服务器会生成目录索引，前端会解析它实时遍历 `docs/`，新增文件夹或文章后刷新即可看到新分组。
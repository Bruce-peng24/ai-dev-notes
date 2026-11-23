# AI Dev Notes (github pages project)

按分组展示 `docs/` 下的 Markdown 笔记。分组名直接取 `docs/` 下的文件夹名称，动态获取，没有任何写死的分组配置或导航文件。

## GitHub Pages

项目是 GitHub Pages 静态站点，不需要 Node/npm 服务，也不需要写死分组：

- 线上打开时，`index.html` 直接调用 GitHub API 读取仓库文件树（`git/trees/<默认分支>?recursive=1`），**运行时动态获取 `docs/` 下所有 `.md` 路径**；
- 仓库地址从 `xxx.github.io/<repo>` 自动推导，不写死；
- 分组名和文章标题由前端从路径推导，数据里没有分组字段；
- 新建文件夹或新增文章后，push 到 `main`，刷新页面即可看到新分组，不必等清单文件生成；
- `notes.json` 只是接口不可用时的回退快照。

注意：GitHub API 读的是**已推送到仓库**的文件；本地未提交的新建文件夹不会出现在 API 结果里。本地静态预览会退回读取仓库中的 `notes.json` 快照。

## 本地预览

```bash
python -m http.server 8000
```

打开 http://localhost:8000 。Python 自带服务器会生成目录索引，前端会解析它实时遍历 `docs/`，新增文件夹或文章后刷新即可看到新分组。目录索引不可用时才读 `notes.json`。
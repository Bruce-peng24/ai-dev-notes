const reader = document.getElementById('reader-body');
const readerPane = document.querySelector('.reader');
const search = document.getElementById('search');
const tocList = document.getElementById('toc-list');
const groupList = document.getElementById('group-list');
let pages = [];
let tocHeadings = [];
let tocLinks = [];
let tocRafPending = false;
let activePath = '';
const expandedPaths = new Set();

// jsDelivr 只加速资源；入口 index.html 仍由 GitHub Pages 提供。
// 本地预览（localhost / 直接打开文件）自动退回本地文件，不请求 CDN。
const REPO = 'Bruce-peng24/ai-dev-notes';
const BRANCH = 'main';
const CDN_HOST = 'cdn.jsdelivr.net';
const CDN_BASE = `https://${CDN_HOST}/gh/${REPO}@${BRANCH}`;
const useCdn = location.protocol !== 'file:' && !['localhost', '127.0.0.1'].includes(location.hostname);
// CDN 会忽略查询参数做缓存，但浏览器不会；按天换参数可绕开浏览器对图片的 7 天缓存。
const browserBust = `?v=${new Date().toISOString().slice(0, 10)}`;

marked.setOptions({ breaks: true, gfm: true });

function pageGroup(path) {
    const segments = path.replace(/^\.\//, '').replace(/^docs\//, '').split('/');
    return segments.length > 1 ? segments[0] : '未分组';
}

function groupOf(page) {
    return page.group || pageGroup(page.path);
}

function groupLabel() {
    const current = pages.find(page => page.path === activePath);
    return current ? groupOf(current) : 'Notes';
}

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function groupSort(a, b) {
    if (a === '未分组') return 1;
    if (b === '未分组') return -1;
    return a.localeCompare(b, undefined, { numeric: true });
}

const TREE_CARET = '<svg class="tree-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';

// 分组名完全由文章路径推导；树节点展开状态只在本次会话内保存
const TREE_FILE = '<svg class="tree-file-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>';

// 按路径的每一段递归建树：docs / 分组 / 子目录 / … / 文件
function buildTree() {
    const root = { name: 'docs', path: '', children: new Map(), page: null };
    pages.forEach(page => {
        const segments = page.path.replace(/^\.\//, '').replace(/^docs\//, '').split('/');
        let node = root;
        segments.forEach((segment, index) => {
            const isFile = index === segments.length - 1;
            const key = isFile ? `${segment}::file` : segment;
            const path = node.path ? `${node.path}/${segment}` : segment;
            if (!node.children.has(key)) {
                node.children.set(key, { name: segment, path, children: new Map(), page: isFile ? page : null });
            }
            node = node.children.get(key);
        });
    });
    return root;
}

function expandAllNodes(node) {
    if (node.page) return;
    expandedPaths.add(node.path);
    node.children.forEach(expandAllNodes);
}

function countFiles(node) {
    if (node.page) return 1;
    let total = 0;
    node.children.forEach(child => { total += countFiles(child); });
    return total;
}

function hasMatchedFile(node, matched) {
    if (node.page) return matched.has(node.page.path);
    let found = false;
    node.children.forEach(child => { if (hasMatchedFile(child, matched)) found = true; });
    return found;
}

// 目录节点按「文件夹在前、文件在后」排序；搜索时只保留含命中文件的分支
function visibleChildren(node, matched, searching) {
    return [...node.children.values()]
        .sort((a, b) => (Boolean(a.page) !== Boolean(b.page) ? (a.page ? 1 : -1) : groupSort(a.name, b.name)))
        .filter(child => !searching || hasMatchedFile(child, matched));
}

function renderNode(node, depth, matched, searching) {
    const indent = 8 + depth * 14;
    if (node.page) {
        const page = node.page;
        return `<a class="tree-leaf${page.path === activePath ? ' active' : ''}" style="padding-left:${indent}px" href="#${encodeURIComponent(page.path)}" title="${escapeHtml(page.path)}">${TREE_FILE}<span>${escapeHtml(node.name)}</span></a>`;
    }
    const children = visibleChildren(node, matched, searching);
    if (!children.length) return '';
    const expanded = searching || expandedPaths.has(node.path);
    const childHtml = children.map(child => renderNode(child, depth + 1, matched, searching)).join('');
    return `<div class="tree-group${expanded ? '' : ' collapsed'}"><div class="tree-group-header" style="padding-left:${indent}px" data-path="${escapeHtml(node.path)}" role="button" tabindex="0" aria-expanded="${expanded}" title="${escapeHtml(node.path)}">${TREE_CARET}<span class="tree-label">${escapeHtml(node.name)}</span><span class="group-count">${countFiles(node)}</span></div><div class="tree-children">${childHtml}</div></div>`;
}

function renderTree(query = '') {
    const normalizedQuery = query.trim().toLowerCase();
    const matchedPages = pages.filter(page => !normalizedQuery
        || page.label.toLowerCase().includes(normalizedQuery)
        || page.path.toLowerCase().includes(normalizedQuery));
    const matched = new Set(matchedPages.map(page => page.path));
    const searching = Boolean(normalizedQuery);
    // docs 只是虚拟根节点，不渲染；它的子节点从第一层开始平铺
    const html = visibleChildren(buildTree(), matched, searching)
        .map(child => renderNode(child, 0, matched, searching)).join('');
    groupList.innerHTML = html || '<div class="empty-state">没有找到相关笔记</div>';
    document.getElementById('note-count').textContent = `${matchedPages.length} notes`;
    document.title = `${activePath ? groupLabel() : 'All notes'} · AI Dev Notes`;
}

function toggleGroup(event) {
    const header = event.target.closest('.tree-group-header');
    if (!header) return;
    const path = header.dataset.path;
    if (expandedPaths.has(path)) expandedPaths.delete(path);
    else expandedPaths.add(path);
    renderTree(search.value);
}

function handleTreeKeydown(event) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const header = event.target.closest('.tree-group-header');
    if (!header) return;
    event.preventDefault();
    toggleGroup({ target: header });
}

// 文档目录：从当前渲染出的标题生成，切换文章时重建
function setReaderHtml(html) {
    readerPane.scrollTop = 0;
    reader.innerHTML = html;
    buildToc();
}

function buildToc() {
    tocHeadings = [...reader.querySelectorAll('article h1, article h2, article h3, article h4')];
    tocList.innerHTML = tocHeadings.length
        ? tocHeadings.map((heading, index) => {
            const text = heading.textContent.trim() || '(untitled)';
            heading.id = `toc-heading-${index}`;
            // 标题锚点只用于定位，不改 location.hash（hash 被文章路由占用）
            const anchor = document.createElement('a');
            anchor.className = 'heading-anchor';
            anchor.href = '#';
            anchor.textContent = '#';
            anchor.title = '定位到本节';
            heading.appendChild(anchor);
            const level = Number(heading.tagName.slice(1));
            return `<a class="toc-link depth-${level}" href="#" data-index="${index}">${escapeHtml(text)}</a>`;
        }).join('')
        : '<div class="toc-empty">No headings in this note</div>';
    tocLinks = [...tocList.querySelectorAll('.toc-link')];
    updateTocActive();
}

function updateTocActive() {
    if (!tocHeadings.length) return;
    const readerTop = readerPane.getBoundingClientRect().top;
    let active = 0;
    tocHeadings.forEach((heading, index) => {
        if (heading.getBoundingClientRect().top - readerTop <= 80) active = index;
    });
    if (readerPane.scrollTop + readerPane.clientHeight >= readerPane.scrollHeight - 4) {
        active = tocHeadings.length - 1;
    }
    tocLinks.forEach((link, index) => link.classList.toggle('active', index === active));
}

// Markdown 的相对路径是按 .md 文件所在目录写的，但 marked 的输出会被插进站点
// 根目录下的 index.html，浏览器会按 index.html 的位置解析相对路径，导致资源 404。
// 插入 DOM 前先把相对地址按笔记文件所在目录重新解析。
function resolveNoteUrls(html, pagePath) {
    const template = document.createElement('template');
    template.innerHTML = html;
    const noteDir = String(pagePath).replace(/\\/g, '/').split('/').slice(0, -1).join('/');
    const noteBase = new URL(noteDir ? `${noteDir}/` : '', document.baseURI);
    const siteRoot = new URL('.', document.baseURI);

    template.content.querySelectorAll('img[src], video[src], source[src], a[href]').forEach(el => {
        const attr = el.hasAttribute('src') ? 'src' : 'href';
        const value = el.getAttribute(attr);
        // 绝对地址、协议相对地址、站点根路径、纯 hash 都保持原样
        if (!value || /^(?:[a-z][a-z\d+.-]*:|\/\/|\/|#)/i.test(value)) return;

        const resolved = new URL(value, noteBase);

        // 站内图片/视频改走 CDN；按天换查询参数只影响浏览器缓存，不影响 CDN 缓存键
        if (useCdn && ['IMG', 'VIDEO', 'SOURCE'].includes(el.tagName)
            && resolved.origin === siteRoot.origin
            && resolved.pathname.startsWith(siteRoot.pathname)) {
            let relative = resolved.pathname.slice(siteRoot.pathname.length);
            try { relative = decodeURIComponent(relative); } catch (error) { /* 保留原始编码 */ }
            el.setAttribute(attr, `${CDN_BASE}/${relative}${browserBust}`);
            return;
        }

        // 站内指向其他笔记的相对链接转成 hash 路由，避免跳出当前这个静态站
        if (attr === 'href' && /\.md(?:[?#]|$)/i.test(value)
            && resolved.origin === siteRoot.origin
            && resolved.pathname.startsWith(siteRoot.pathname)) {
            let notePath = resolved.pathname.slice(siteRoot.pathname.length);
            try { notePath = decodeURIComponent(notePath); } catch (error) { /* 保留原始编码 */ }
            el.setAttribute('href', `#${encodeURIComponent(notePath)}`);
            return;
        }

        el.setAttribute(attr, resolved.href);
    });
    return template.innerHTML;
}

function renderBreadcrumb(page) {
    const parts = ['<span>Notes</span>'];
    if (page) {
        parts.push('<span class="crumb-sep">/</span>');
        parts.push(`<span>${escapeHtml(groupOf(page))}</span>`);
        parts.push('<span class="crumb-sep">/</span>');
        parts.push(`<span class="crumb-current">${escapeHtml(page.label)}</span>`);
    }
    document.getElementById('reader-status').innerHTML = parts.join('');
}

function renderArticleNav(page) {
    const nav = document.getElementById('article-nav');
    if (!page) { nav.innerHTML = ''; return; }
    const siblings = pages.filter(item => groupOf(item) === groupOf(page));
    const list = siblings.length > 1 ? siblings : pages;
    const index = list.findIndex(item => item.path === page.path);
    const prev = index > 0 ? list[index - 1] : null;
    const next = index >= 0 && index < list.length - 1 ? list[index + 1] : null;
    const pager = (item, label, direction) => item
        ? `<a class="pager-link ${direction}" href="#${encodeURIComponent(item.path)}" aria-label="${label} ${escapeHtml(item.label)}"><small>${label}</small><span>${escapeHtml(item.label)}</span></a>`
        : '';
    nav.innerHTML = pager(prev, 'Previous page', 'prev') + pager(next, 'Next page', 'next');
}

async function openPage(path) {
    const page = pages.find(item => item.path === path);
    if (!page) {
        activePath = '';
        renderBreadcrumb(null);
        setReaderHtml('<div class="empty-state">从左侧目录选择一篇笔记开始阅读</div>');
        renderTree(search.value);
        renderArticleNav(null);
        return;
    }
    activePath = page.path;
    renderBreadcrumb(page);
    setReaderHtml('<div class="empty-state">正在打开笔记…</div>');
    renderTree(search.value);
    renderArticleNav(page);
    try {
        let response;
        if (useCdn) {
            try {
                // no-store：浏览器不缓存笔记正文，push 后由自动刷新工作流清 CDN 缓存即可生效
                response = await fetch(`${CDN_BASE}/${encodeURI(page.path)}`, { cache: 'no-store' });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
            } catch {
                response = await fetch(`./${page.path}`);
            }
        } else {
            response = await fetch(`./${page.path}`);
        }
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const markdown = await response.text();
        const rendered = marked.parse(markdown);
        setReaderHtml(`<article>${resolveNoteUrls(rendered, page.path)}</article>`);
    } catch {
        setReaderHtml(`<div class="empty-state">无法加载「${escapeHtml(page.label)}」，请确认文件存在并通过 Web 服务器打开。</div>`);
    }
}

function syncRoute() {
    openPage(decodeURIComponent(location.hash.slice(1)));
}

function normalizePage(item) {
    const pagePath = String(item.path || '').replace(/^\.\//, '').replace(/\\/g, '/');
    const fallback = pagePath.split('/').pop().replace(/\.md$/i, '');
    return {
        path: pagePath,
        label: String(item.label || fallback),
        group: item.group || pageGroup(pagePath)
    };
}

async function fetchPagesFromJsDelivr() {
    // data.jsdelivr.com 的响应默认带 1 年 max-age，no-store 让浏览器每次都重新拉取。
    const url = `https://data.jsdelivr.com/v1/packages/gh/${REPO}@${BRANCH}?structure=flat`;
    try {
        const response = await fetch(url, { cache: 'no-store' });
        if (!response.ok) return null;
        const info = await response.json();
        const found = (info.files || [])
            .filter(file => /^\/docs\/.*\.md$/i.test(file.name))
            .map(file => normalizePage({ path: file.name.replace(/^\//, '') }));
        return found.length ? found : null;
    } catch {
        return null;
    }
}

async function fetchPagesFromGitHub() {
    // GitHub Pages 本身就是静态服务器，浏览器列不了目录，
    // 但可以直接调用 GitHub API 读取仓库文件树，实现运行时动态获取路径。
    // 仓库信息从当前 Pages 地址推导，不写死。
    const host = location.hostname;
    if (!host.endsWith('.github.io')) return null;

    const owner = host.slice(0, -'.github.io'.length);
    const segments = location.pathname.split('/').filter(Boolean);
    const repo = segments[0] && !segments[0].endsWith('.html')
        ? segments[0]
        : `${owner}.github.io`;

    try {
        const repoResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}`);
        if (!repoResponse.ok) return null;
        const repoInfo = await repoResponse.json();
        const branch = repoInfo.default_branch || 'main';

        const treeResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`);
        if (!treeResponse.ok) return null;
        const treeInfo = await treeResponse.json();

        const found = (treeInfo.tree || [])
            .filter(item => item.type === 'blob' && item.path.startsWith('docs/') && /\.md$/i.test(item.path))
            .map(item => normalizePage({ path: item.path }));
        return found.length ? found : null;
    } catch {
        return null;
    }
}

async function fetchPagesFromDirectoryListing() {
    const queue = ['./docs/'];
    const found = [];
    const seen = new Set();

    while (queue.length && found.length < 200 && seen.size < 200) {
        const dir = queue.shift();
        if (seen.has(dir)) continue;
        seen.add(dir);

        try {
            const response = await fetch(dir, { cache: 'no-store' });
            if (!response.ok) continue;
            const doc = new DOMParser().parseFromString(await response.text(), 'text/html');

            for (const link of doc.querySelectorAll('a[href]')) {
                let href = link.getAttribute('href');
                if (!href || /^(?:[a-z]+:|\/|\?|#)/i.test(href)) continue;
                href = href.split(/[?#]/)[0];
                let decoded;
                try { decoded = decodeURIComponent(href); } catch { decoded = href; }
                if (decoded === '../' || decoded.includes('..')) continue;

                const child = dir.replace(/\/?$/, '/') + decoded;
                if (decoded.endsWith('/')) queue.push(child);
                else if (/\.md$/i.test(decoded)) found.push(normalizePage({ path: child.replace(/^\.\//, '') }));
            }
        } catch {
            // 目录不可读时继续下一项
        }
    }
    return found.length ? found : null;
}

async function fetchPages() {
    // 线上优先走 jsDelivr 的目录数据，失败再回退 GitHub API；本地走目录索引
    if (useCdn) {
        const fromCdn = await fetchPagesFromJsDelivr();
        if (fromCdn) return fromCdn;

        const fromGitHub = await fetchPagesFromGitHub();
        if (fromGitHub) return fromGitHub;
    }

    const fromListing = await fetchPagesFromDirectoryListing();
    if (fromListing) return fromListing;

    throw new Error('无法获取笔记目录');
}

fetchPages()
    .then(loaded => {
        pages = loaded;
        expandAllNodes(buildTree());
        renderTree(search.value);
        syncRoute();
        if (!location.hash) location.hash = encodeURIComponent(pages[0].path);
    })
    .catch(error => {
        console.error(error);
        document.getElementById('note-count').textContent = '加载失败';
        setReaderHtml('<div class="empty-state">无法加载笔记目录：请检查网络，并确认通过 Web 服务器打开此页面。</div>');
    });

search.addEventListener('input', () => renderTree(search.value));
groupList.addEventListener('click', toggleGroup);
groupList.addEventListener('keydown', handleTreeKeydown);

// 点击目录项平滑滚动到对应标题
tocList.addEventListener('click', event => {
    const link = event.target.closest('.toc-link');
    if (!link) return;
    event.preventDefault();
    const heading = tocHeadings[Number(link.dataset.index)];
    if (!heading) return;
    tocLinks.forEach(item => item.classList.toggle('active', item === link));
    heading.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

// 标题旁的 # 只做定位，不能改 hash：hash 被文章路由占用
reader.addEventListener('click', event => {
    const anchor = event.target.closest('.heading-anchor');
    if (!anchor) return;
    event.preventDefault();
    const heading = anchor.closest('h1, h2, h3, h4');
    if (heading) heading.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

// 正文滚动时反向高亮当前所在章节
readerPane.addEventListener('scroll', () => {
    if (tocRafPending || !tocHeadings.length) return;
    tocRafPending = true;
    requestAnimationFrame(() => {
        tocRafPending = false;
        updateTocActive();
    });
}, { passive: true });

const viewToggle = document.getElementById('view-toggle');
function setFocusMode(on) {
    document.body.classList.toggle('reader-fullscreen', on);
    viewToggle.textContent = on ? '退出专注' : '专注阅读';
    requestAnimationFrame(updateTocActive);
}
viewToggle.addEventListener('click', () => setFocusMode(!document.body.classList.contains('reader-fullscreen')));
document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && document.body.classList.contains('reader-fullscreen')) setFocusMode(false);
});
window.addEventListener('hashchange', syncRoute);

// 主题：首屏主题已由 head 内联脚本设好，这里只同步按钮状态、持久化和系统偏好跟随
const themeToggle = document.getElementById('theme-toggle');
const themeMeta = document.querySelector('meta[name="theme-color"]');
const systemTheme = typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null;

function syncThemeUi(theme) {
    const dark = theme === 'dark';
    if (themeMeta) themeMeta.setAttribute('content', dark ? '#202328' : '#ffffff');
    const label = dark ? '切换到浅色模式' : '切换到深色模式';
    themeToggle.setAttribute('aria-label', label);
    themeToggle.title = label;
}
syncThemeUi(document.documentElement.dataset.theme);

themeToggle.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    syncThemeUi(next);
    try { localStorage.setItem('notes-theme', next); } catch (error) { /* 存储不可用时仅本次生效 */ }
});

function onSystemThemeChange(event) {
    let saved = null;
    try { saved = localStorage.getItem('notes-theme'); } catch (error) { /* 忽略 */ }
    if (saved) return;
    const next = event.matches ? 'dark' : 'light';
    document.documentElement.dataset.theme = next;
    syncThemeUi(next);
}
if (systemTheme && systemTheme.addEventListener) systemTheme.addEventListener('change', onSystemThemeChange);
else if (systemTheme && systemTheme.addListener) systemTheme.addListener(onSystemThemeChange);
    

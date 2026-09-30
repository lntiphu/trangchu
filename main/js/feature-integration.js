/*
 * Tích hợp các tính năng bổ sung vào DOM chính của QLCT.
 *
 * TodoList được nạp vào host tương ứng, CSS được scope theo host và
 * JavaScript được chạy trong document proxy để không đụng ID/hàm chính.
 * CKKN chạy trong iframe riêng để giữ trọn DOM, CSS và trạng thái của app.
 */
(function () {
    'use strict';

    const FEATURES = {
        todo: {
            hostId: 'todo-feature-host',
            htmlUrl: 'todolist/index.html',
            cssUrl: 'todolist/styles.css',
            scriptUrls: ['todolist/app.js']
        }
    };

    const featurePromises = new Map();

    async function fetchText(url) {
        if (window.location.protocol === 'file:') {
            throw new Error('Ứng dụng đang mở bằng file://. Hãy chạy bằng Live Server hoặc localhost.');
        }

        const response = await fetch(url, { cache: 'no-cache' });
        if (!response.ok) throw new Error(`Không thể tải ${url} (HTTP ${response.status})`);
        return response.text();
    }

    function extractBodyMarkup(html, featureName) {
        const parsed = new DOMParser().parseFromString(html, 'text/html');
        parsed.querySelectorAll('script').forEach(script => script.remove());

        let markup = parsed.body ? parsed.body.innerHTML : html;
        markup = markup.replace(/\bswitchTab\s*\(/g, 'todoSwitchTab(');
        return markup;
    }

    function findNextOpenBrace(css, start) {
        let quote = '';
        let comment = false;
        for (let i = start; i < css.length; i += 1) {
            const ch = css[i];
            const next = css[i + 1];

            if (comment) {
                if (ch === '*' && next === '/') {
                    comment = false;
                    i += 1;
                }
                continue;
            }
            if (!quote && ch === '/' && next === '*') {
                comment = true;
                i += 1;
                continue;
            }
            if (quote) {
                if (ch === '\\' && i + 1 < css.length) i += 1;
                else if (ch === quote) quote = '';
                continue;
            }
            if (ch === '"' || ch === "'") {
                quote = ch;
                continue;
            }
            if (ch === '{') return i;
        }
        return -1;
    }

    function findMatchingBrace(css, openIndex) {
        let depth = 0;
        let quote = '';
        let comment = false;

        for (let i = openIndex; i < css.length; i += 1) {
            const ch = css[i];
            const next = css[i + 1];

            if (comment) {
                if (ch === '*' && next === '/') {
                    comment = false;
                    i += 1;
                }
                continue;
            }
            if (!quote && ch === '/' && next === '*') {
                comment = true;
                i += 1;
                continue;
            }
            if (quote) {
                if (ch === '\\' && i + 1 < css.length) i += 1;
                else if (ch === quote) quote = '';
                continue;
            }
            if (ch === '"' || ch === "'") {
                quote = ch;
                continue;
            }
            if (ch === '{') depth += 1;
            if (ch === '}') {
                depth -= 1;
                if (depth === 0) return i;
            }
        }
        return css.length - 1;
    }

    function scopeSelector(selector, scope) {
        const clean = selector
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .trim();
        if (!clean) return '';

        const replaced = clean.replace(/:root\b|html\b|body\b/g, scope);
        if (replaced === scope || replaced.startsWith(scope + ' ') || replaced.startsWith(scope + '>')) {
            return replaced;
        }
        if (replaced === '*') return scope + ' *';
        if (replaced.startsWith('@')) return replaced;
        return scope + ' ' + replaced;
    }

    function scopeCssBlock(css, scope) {
        let output = '';
        let cursor = 0;

        while (cursor < css.length) {
            const open = findNextOpenBrace(css, cursor);
            if (open === -1) {
                output += css.slice(cursor);
                break;
            }

            const close = findMatchingBrace(css, open);
            const prelude = css.slice(cursor, open).replace(/\/\*[\s\S]*?\*\//g, '').trim();
            const inner = css.slice(open + 1, close);

            if (prelude.startsWith('@')) {
                const isNestedRule = /^@(media|supports|container|layer|document|scope)\b/i.test(prelude);
                const nested = isNestedRule ? scopeCssBlock(inner, scope) : inner;
                output += prelude + '{' + nested + '}';
            } else {
                const selectors = prelude
                    .split(',')
                    .map(selector => scopeSelector(selector, scope))
                    .filter(Boolean)
                    .join(',\n');
                output += selectors + '{' + inner + '}';
            }

            cursor = close + 1;
        }

        return output;
    }

    function createScopedDocument(root, readyCallbacks) {
        const scoped = Object.create(document);
        const find = id => root.querySelector('[id="' + String(id).replace(/"/g, '\\"') + '"]');

        scoped.getElementById = find;
        scoped.querySelector = selector => root.querySelector(selector);
        scoped.querySelectorAll = selector => root.querySelectorAll(selector);
        scoped.createElement = tagName => document.createElement(tagName);
        scoped.addEventListener = (type, listener, options) => {
            if (type === 'DOMContentLoaded') readyCallbacks.push(listener);
            else root.addEventListener(type, listener, options);
        };
        scoped.removeEventListener = (type, listener, options) => {
            if (type !== 'DOMContentLoaded') root.removeEventListener(type, listener, options);
        };
        // Document thật expose các thuộc tính này dưới dạng getter chỉ đọc.
        // Dùng own properties cho document proxy để module con có thể khởi tạo
        // mà không ném lỗi "Cannot set property documentElement".
        Object.defineProperties(scoped, {
            documentElement: { value: root, configurable: true },
            body: { value: root, configurable: true },
            defaultView: { value: window, configurable: true }
        });
        return scoped;
    }

    function transformFeatureSource(source, featureName) {
        return source
            .replace(/\bfunction\s+switchTab\s*\(/g, 'function todoSwitchTab(')
            .replace(/\bswitchTab\s*\(/g, 'todoSwitchTab(')
            .replace(/window\.switchTab\s*=\s*todoSwitchTab\s*;/g, 'window.todoSwitchTab = todoSwitchTab;');
    }

    function exportsForFeature(featureName) {
        return 'window.todoSwitchTab = todoSwitchTab;';
    }

    async function runFeatureScripts(featureName, root, scripts) {
        const readyCallbacks = [];
        const scopedDocument = createScopedDocument(root, readyCallbacks);
        let source = scripts.map(item => transformFeatureSource(item, featureName)).join('\n');
        source += '\n' + exportsForFeature(featureName);

        const runner = new Function(
            'document',
            'window',
            'supabase',
            'lucide',
            'confetti',
            source
        );

        runner(
            scopedDocument,
            window,
            window.supabase,
            window.lucide,
            window.confetti
        );

        for (const callback of readyCallbacks) {
            await callback();
        }
    }

    async function mountFeature(featureName) {
        if (featurePromises.has(featureName)) return featurePromises.get(featureName);

        const feature = FEATURES[featureName];
        if (!feature) return;

        const promise = (async () => {
            const host = document.getElementById(feature.hostId);
            if (!host) throw new Error('Thiếu vùng hiển thị ' + feature.hostId);

            host.classList.add('feature-host-loading');
            const [html, css, ...scripts] = await Promise.all([
                fetchText(feature.htmlUrl),
                fetchText(feature.cssUrl),
                ...feature.scriptUrls.map(fetchText)
            ]);

            const style = document.createElement('style');
            style.textContent = scopeCssBlock(css, '#' + feature.hostId);
            host.replaceChildren(style);

            const markup = extractBodyMarkup(html, featureName);
            host.insertAdjacentHTML('beforeend', markup);
            await runFeatureScripts(featureName, host, scripts);

            host.classList.remove('feature-host-loading');
            host.classList.add('feature-host-ready');
            return host;
        })().catch(error => {
            const host = document.getElementById(feature.hostId);
            if (host) {
                host.classList.remove('feature-host-loading');
                host.classList.add('feature-host-error');
                const detail = error?.message ? ` ${error.message}` : '';
                host.innerHTML = `<div class="feature-load-error">Không thể tải chức năng.${detail}</div>`;
            }
            console.error('Feature integration error:', featureName, error);
            throw error;
        });

        featurePromises.set(featureName, promise);
        return promise;
    }

    window.QLCTFeatureIntegration = {
        mount: mountFeature,
        preload: () => Promise.allSettled([
            mountFeature('todo')
        ])
    };

    document.addEventListener('DOMContentLoaded', () => {
        // Để giao diện chính render trước; tải trước Todo khi main thread rảnh.
        const schedulePreload = window.requestIdleCallback || (callback => setTimeout(callback, 1200));
        schedulePreload(() => window.QLCTFeatureIntegration.preload());
    });
})();

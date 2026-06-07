(function(){
    const instances = new Map();
    const styleId = 'history-bulk-manager-style';

    function injectStyle(){
        if(document.getElementById(styleId)) return;
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
            .history-bulk-toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:10px 0 14px;padding:9px 10px;border:1px solid rgba(148,163,184,.28);border-radius:12px;background:rgba(255,255,255,.82);box-shadow:0 8px 24px rgba(15,23,42,.06);backdrop-filter:blur(12px);color:#334155}
            .theme-dark .history-bulk-toolbar,.studio-theme-dark .history-bulk-toolbar{background:rgba(17,24,39,.86);border-color:rgba(71,85,105,.45);color:#cbd5e1;box-shadow:0 10px 28px rgba(0,0,0,.2)}
            .history-bulk-toolbar button{height:30px;min-width:0;border:1px solid rgba(148,163,184,.32);border-radius:9px;background:rgba(255,255,255,.92);color:#334155;display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:0 10px;font-size:12px;line-height:1;font-weight:800;cursor:pointer}
            .history-bulk-toolbar button:hover{background:#f8fafc;border-color:rgba(100,116,139,.55);color:#0f172a}
            .theme-dark .history-bulk-toolbar button,.studio-theme-dark .history-bulk-toolbar button{background:rgba(30,41,59,.92);border-color:rgba(71,85,105,.75);color:#dbe4ef}
            .theme-dark .history-bulk-toolbar button:hover,.studio-theme-dark .history-bulk-toolbar button:hover{background:rgba(51,65,85,.96);color:#fff}
            .history-bulk-toolbar .history-bulk-danger{background:#dc2626;color:#fff;border-color:#dc2626}
            .history-bulk-toolbar .history-bulk-danger:hover{background:#b91c1c;color:#fff;border-color:#b91c1c}
            .history-bulk-toolbar .history-bulk-muted{margin-left:auto;color:#64748b;font-size:12px;font-weight:800}
            .history-bulk-toolbar:not(.is-selecting) [data-bulk-active]{display:none}
            .history-bulk-toolbar.is-selecting [data-bulk-start]{display:none}
            body.history-bulk-selecting .history-bulk-card{position:relative!important;cursor:pointer}
            body.history-bulk-selecting .history-bulk-card a,body.history-bulk-selecting .history-bulk-card button:not(.history-bulk-check){pointer-events:none}
            .history-bulk-check{position:absolute;z-index:20;top:9px;right:9px;width:26px;height:26px;border-radius:8px;border:2px solid rgba(255,255,255,.92);background:rgba(15,23,42,.72);color:#fff;display:none;align-items:center;justify-content:center;box-shadow:0 8px 20px rgba(0,0,0,.22);font-size:15px;font-weight:900}
            body.history-bulk-selecting .history-bulk-check{display:flex}
            .history-bulk-card.history-bulk-selected{outline:3px solid #2563eb;outline-offset:-3px}
            .history-bulk-card.history-bulk-selected .history-bulk-check{background:#2563eb;border-color:#dbeafe}
            .history-bulk-card.history-bulk-selected .history-bulk-check::after{content:'✓'}
            .history-bulk-toast-stack{position:fixed;top:18px;right:18px;z-index:120;display:flex;flex-direction:column;gap:8px;pointer-events:none}
            .history-bulk-toast{min-width:190px;max-width:min(340px,calc(100vw - 36px));min-height:40px;padding:10px 12px;border-radius:12px;background:rgba(15,23,42,.92);color:#fff;box-shadow:0 16px 44px rgba(15,23,42,.24);display:flex;align-items:center;gap:9px;font-size:12px;line-height:1.35;font-weight:850;opacity:0;transform:translateY(-6px) scale(.98);transition:opacity .18s ease,transform .18s ease;backdrop-filter:blur(14px)}
            .history-bulk-toast.show{opacity:1;transform:translateY(0) scale(1)}
            .history-bulk-toast svg{width:16px;height:16px;flex:0 0 auto}
            .history-bulk-toast.success svg{color:#86efac}.history-bulk-toast.info svg{color:#93c5fd}.history-bulk-toast.error svg{color:#fca5a5}
            .history-bulk-confirm-backdrop{position:fixed;inset:0;z-index:110;background:rgba(15,23,42,.46);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;padding:20px}
            .history-bulk-confirm{width:min(360px,calc(100vw - 40px));border-radius:16px;background:#fff;color:#111827;box-shadow:0 24px 70px rgba(15,23,42,.28);border:1px solid rgba(148,163,184,.28);padding:16px}
            .theme-dark .history-bulk-confirm,.studio-theme-dark .history-bulk-confirm{background:#111827;color:#e5e7eb;border-color:rgba(71,85,105,.65)}
            .history-bulk-confirm h3{margin:0 0 8px;font-size:15px;line-height:1.25;font-weight:900;letter-spacing:0}
            .history-bulk-confirm p{margin:0;color:#64748b;font-size:12px;line-height:1.55;font-weight:750;white-space:pre-line}
            .theme-dark .history-bulk-confirm p,.studio-theme-dark .history-bulk-confirm p{color:#94a3b8}
            .history-bulk-confirm-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}
            .history-bulk-confirm-actions button{height:32px;border-radius:10px;padding:0 12px;border:1px solid rgba(148,163,184,.35);background:#fff;color:#334155;font-size:12px;font-weight:850}
            .theme-dark .history-bulk-confirm-actions button,.studio-theme-dark .history-bulk-confirm-actions button{background:#1e293b;color:#dbe4ef;border-color:rgba(71,85,105,.75)}
            .history-bulk-confirm-actions .danger{background:#dc2626;color:#fff;border-color:#dc2626}
            @media (max-width:640px){.history-bulk-toolbar{gap:6px}.history-bulk-toolbar button{flex:1 1 auto}.history-bulk-toolbar .history-bulk-muted{width:100%;margin-left:0}}
        `;
        document.head.appendChild(style);
    }

    function normalizeTs(value){
        return String(value == null ? '' : value);
    }

    function showToast(message, type='success'){
        let stack = document.querySelector('.history-bulk-toast-stack');
        if(!stack){
            stack = document.createElement('div');
            stack.className = 'history-bulk-toast-stack';
            document.body.appendChild(stack);
        }
        const toast = document.createElement('div');
        toast.className = `history-bulk-toast ${type}`;
        const icon = type === 'error' ? 'circle-alert' : (type === 'info' ? 'info' : 'check-circle-2');
        toast.innerHTML = `<i data-lucide="${icon}"></i><span>${message}</span>`;
        stack.appendChild(toast);
        window.lucide?.createIcons?.();
        requestAnimationFrame(() => toast.classList.add('show'));
        window.setTimeout(() => {
            toast.classList.remove('show');
            window.setTimeout(() => toast.remove(), 220);
        }, 2400);
    }

    function confirmAction({title, message, confirmText='确定', cancelText='取消'}){
        return new Promise(resolve => {
            const backdrop = document.createElement('div');
            backdrop.className = 'history-bulk-confirm-backdrop';
            backdrop.innerHTML = `
                <div class="history-bulk-confirm" role="dialog" aria-modal="true">
                    <h3>${title}</h3>
                    <p>${message}</p>
                    <div class="history-bulk-confirm-actions">
                        <button type="button" data-confirm-cancel>${cancelText}</button>
                        <button type="button" class="danger" data-confirm-ok>${confirmText}</button>
                    </div>
                </div>
            `;
            const finish = value => {
                backdrop.remove();
                document.removeEventListener('keydown', onKey);
                resolve(value);
            };
            const onKey = event => {
                if(event.key === 'Escape') finish(false);
            };
            backdrop.addEventListener('click', event => {
                if(event.target === backdrop || event.target.closest('[data-confirm-cancel]')) finish(false);
                if(event.target.closest('[data-confirm-ok]')) finish(true);
            });
            document.addEventListener('keydown', onKey);
            document.body.appendChild(backdrop);
            backdrop.querySelector('[data-confirm-cancel]')?.focus();
        });
    }

    function makeInstance(options){
        const state = {
            container: null,
            toolbar: null,
            selected: new Set(),
            selecting: false,
            observer: null,
            options: {}
        };

        function configure(nextOptions){
            state.options = Object.assign({
                masonry: '#masonry',
                cardSelector: '[data-history-ts]',
                timestampAttr: 'data-history-ts',
                toolbarLabel: '选择清理',
                toolbarTarget: null
            }, state.options, nextOptions || {});
            state.container = typeof state.options.masonry === 'string'
                ? document.querySelector(state.options.masonry)
                : state.options.masonry;
            return !!state.container;
        }

        function timestampOf(card){
            return normalizeTs(card?.getAttribute(state.options.timestampAttr));
        }

        function cards(){
            if(!state.container) return [];
            return Array.from(state.container.querySelectorAll(state.options.cardSelector))
                .filter(card => timestampOf(card));
        }

        function visibleCards(){
            return cards().filter(card => {
                if(typeof state.options.visibleFilter === 'function') return state.options.visibleFilter(card);
                return card.offsetParent !== null || card.getClientRects().length > 0;
            });
        }

        function ensureChecks(){
            cards().forEach(card => {
                card.classList.add('history-bulk-card');
                if(!card.querySelector(':scope > .history-bulk-check')){
                    const check = document.createElement('span');
                    check.className = 'history-bulk-check';
                    check.setAttribute('aria-hidden', 'true');
                    card.appendChild(check);
                }
                card.classList.toggle('history-bulk-selected', state.selected.has(timestampOf(card)));
            });
        }

        function updateToolbar(){
            if(!state.toolbar) return;
            state.toolbar.classList.toggle('is-selecting', state.selecting);
            const count = state.toolbar.querySelector('[data-bulk-count]');
            if(count) count.textContent = state.selecting ? `已选 ${state.selected.size}` : '';
            const clean = state.toolbar.querySelector('[data-bulk-delete]');
            if(clean) clean.disabled = state.selected.size === 0;
        }

        function setSelecting(value){
            state.selecting = !!value;
            document.body.classList.toggle('history-bulk-selecting', state.selecting);
            if(!state.selecting) {
                state.selected.clear();
                cards().forEach(card => card.classList.remove('history-bulk-selected'));
            }
            ensureChecks();
            updateToolbar();
        }

        function toggleCard(card){
            const ts = timestampOf(card);
            if(!ts) return;
            if(state.selected.has(ts)) state.selected.delete(ts);
            else state.selected.add(ts);
            card.classList.toggle('history-bulk-selected', state.selected.has(ts));
            updateToolbar();
        }

        function selectVisible(){
            visibleCards().forEach(card => {
                const ts = timestampOf(card);
                if(ts) {
                    state.selected.add(ts);
                    card.classList.add('history-bulk-selected');
                }
            });
            updateToolbar();
        }

        function insertToolbar(){
            if(state.toolbar && state.toolbar.isConnected) return;
            const toolbar = document.createElement('div');
            toolbar.className = 'history-bulk-toolbar';
            toolbar.innerHTML = `
                <button type="button" data-bulk-start>${state.options.toolbarLabel}</button>
                <button type="button" data-bulk-active data-bulk-select-all>全选已加载</button>
                <button type="button" data-bulk-active data-bulk-cancel>取消</button>
                <button type="button" class="history-bulk-danger" data-bulk-active data-bulk-delete disabled>清理所选</button>
                <span class="history-bulk-muted" data-bulk-count></span>
            `;
            const target = typeof state.options.toolbarTarget === 'string'
                ? document.querySelector(state.options.toolbarTarget)
                : state.options.toolbarTarget;
            if(target) target.appendChild(toolbar);
            else state.container.parentNode.insertBefore(toolbar, state.container);
            state.toolbar = toolbar;
            toolbar.querySelector('[data-bulk-start]')?.addEventListener('click', () => setSelecting(true));
            toolbar.querySelector('[data-bulk-select-all]')?.addEventListener('click', selectVisible);
            toolbar.querySelector('[data-bulk-cancel]')?.addEventListener('click', () => setSelecting(false));
            toolbar.querySelector('[data-bulk-delete]')?.addEventListener('click', deleteSelected);
        }

        async function deleteSelected(){
            const timestamps = Array.from(state.selected).filter(Boolean);
            if(!timestamps.length) {
                showToast('请先选择要清理的图片', 'info');
                return;
            }
            const confirmed = await confirmAction({
                title: '清理所选图片',
                message: `将清理选中的 ${timestamps.length} 张历史图片。\n会删除历史记录以及可删除的本地图片文件。`,
                confirmText: '清理',
                cancelText: '取消'
            });
            if(!confirmed) return;
            const button = state.toolbar?.querySelector('[data-bulk-delete]');
            if(button) button.disabled = true;
            try {
                const response = await fetch('/api/history/delete-batch', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({timestamps})
                });
                const data = await response.json().catch(() => ({}));
                if(!response.ok || data.success === false) {
                    showToast(data.message || data.detail || '批量清理失败', 'error');
                    updateToolbar();
                    return;
                }
                const deletedValues = Array.isArray(data.records) ? data.records : [];
                const missingValues = Array.isArray(data.missing) ? data.missing : [];
                const deletedSet = new Set((deletedValues.length ? deletedValues : timestamps.filter(ts => !missingValues.map(normalizeTs).includes(normalizeTs(ts)))).map(normalizeTs));
                cards().forEach(card => {
                    if(deletedSet.has(timestampOf(card))) card.remove();
                });
                window.dispatchEvent(new CustomEvent('history-bulk-deleted', {
                    detail: {timestamps: Array.from(deletedSet), requested: timestamps, result: data}
                }));
                const failed = Array.isArray(data.file_failed) ? data.file_failed.length : 0;
                const missing = Array.isArray(data.missing) ? data.missing.length : 0;
                if(failed || missing) showToast(`已清理 ${data.deleted || deletedSet.size} 条记录，${missing} 条记录未找到，${failed} 个本地文件删除失败。`, 'info');
                else showToast(`已清理 ${data.deleted || deletedSet.size} 条记录`, 'success');
                setSelecting(false);
            } catch(error) {
                console.error(error);
                showToast('批量清理失败', 'error');
                updateToolbar();
            }
        }

        function bindContainer(){
            if(state.container.dataset.historyBulkBound === '1') return;
            state.container.dataset.historyBulkBound = '1';
            state.container.addEventListener('click', event => {
                if(!state.selecting) return;
                const card = event.target.closest(state.options.cardSelector);
                if(!card || !state.container.contains(card)) return;
                event.preventDefault();
                event.stopPropagation();
                toggleCard(card);
            }, true);
        }

        function observe(){
            if(state.observer) state.observer.disconnect();
            state.observer = new MutationObserver(() => {
                if(state.selecting) ensureChecks();
            });
            state.observer.observe(state.container, {childList: true, subtree: true});
        }

        function attach(nextOptions){
            if(!configure(nextOptions)) return null;
            injectStyle();
            insertToolbar();
            bindContainer();
            observe();
            ensureChecks();
            updateToolbar();
            return api;
        }

        const api = {
            attach,
            refresh: ensureChecks,
            cancel: () => setSelecting(false)
        };
        attach(options);
        return api;
    }

    window.HistoryBulkManager = {
        attach(options){
            const selector = options?.masonry || '#masonry';
            const key = typeof selector === 'string' ? selector : 'element';
            let instance = instances.get(key);
            if(!instance) {
                instance = makeInstance(options);
                instances.set(key, instance);
            } else {
                instance.attach(options);
            }
            return instance;
        },
        refresh(){
            instances.forEach(instance => instance.refresh());
        },
        cancel(){
            instances.forEach(instance => instance.cancel());
        }
    };
})();

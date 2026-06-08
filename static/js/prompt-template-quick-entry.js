/**
 * Shared Prompt Template Library for Studio Pages
 * Provides exactly the same panel and behavior as Infinite Canvas
 */
(function() {
    if (window.StudioPromptTemplateQuickEntry) return;

    // --- Constants ---
    const STORAGE_GROUPS_KEY = 'canvas_prompt_template_groups';
    const STORAGE_OVERRIDES_KEY = 'canvas_prompt_template_overrides';
    const MODAL_ID = 'promptTemplatePanel';
    const INLINE_STYLE_ID = 'prompt-template-inline-style';
    
    // --- State ---
    const state = {
        libraries: [],
        activeLibraryId: 'system',
        selectedId: '',
        category: 'all',
        query: '',
        editing: false,
        groupEditMode: false,
        groups: [],
        overrides: { hiddenBuiltinIds: [], editedBuiltins: {} },
        target: null, // { input: HTMLElement, mode: 'value'|'contenteditable'|'custom', getValue: fn, setValue: fn }
        scrollSnapshot: null
    };

    // --- Helpers ---
    function lang() {
        try {
            const current = window.StudioI18n?.lang?.();
            if (String(current || '').toLowerCase().startsWith('en')) return 'en';
        } catch (err) {}
        return String(document.documentElement.lang || 'zh').toLowerCase().startsWith('en') ? 'en' : 'zh';
    }

    function tr(key) {
        if (window.StudioI18n) return window.StudioI18n.t(key);
        // Fallback simple i18n
        const map = {
            'smart.tplAll': { zh: '全部', en: 'All' },
            'smart.tplCatView': { zh: '视角', en: 'View' },
            'smart.tplCatStoryboard': { zh: '分镜', en: 'Storyboard' },
            'smart.tplCatCharacter': { zh: '角色', en: 'Character' },
            'smart.tplCatProduct': { zh: '产品', en: 'Product' },
            'smart.tplCatLighting': { zh: '光影', en: 'Lighting' },
            'smart.tplCatMine': { zh: '我的', en: 'Mine' },
            'smart.tplManageGroups': { zh: '分组管理', en: 'Groups' },
            'smart.tplSaveCurrent': { zh: '存当前', en: 'Save' },
            'smart.tplNewTemplate': { zh: '新模板', en: 'New' },
            'smart.tplBuiltin': { zh: '系统', en: 'Built-in' },
            'smart.tplMine': { zh: '我的', en: 'Mine' },
            'smart.tplNoMatches': { zh: '没有匹配的模板', en: 'No matches' },
            'smart.tplBuiltinTemplate': { zh: '系统内置模板', en: 'System Template' },
            'smart.tplMineTemplate': { zh: '用户自定义模板', en: 'User Template' },
            'smart.tplEditTemplate': { zh: '编辑模板', en: 'Edit' },
            'smart.tplDeleteTemplate': { zh: '删除模板', en: 'Delete' },
            'smart.tplName': { zh: '名称', en: 'Name' },
            'smart.tplGroup': { zh: '分组', en: 'Group' },
            'smart.tplContent': { zh: '提示词', en: 'Prompt' },
            'smart.tplPositive': { zh: '提示词 (Positive)', en: 'Positive' },
            'smart.tplNegative': { zh: '负向提示词 (Negative)', en: 'Negative' },
            'smart.tplParams': { zh: '其他参数', en: 'Params' },
            'smart.tplApplyPositive': { zh: '仅应用提示词', en: 'Prompt only' },
            'smart.tplApplyFull': { zh: '应用完整预设', en: 'Apply all' },
            'smart.tplPickOrCreate': { zh: '从左侧选择或创建新模板', en: 'Select or create' },
            'smart.tplGroupManage': { zh: '提示词分组管理', en: 'Manage Groups' },
            'smart.tplNewGroup': { zh: '新建分组', en: 'New Group' },
            'smart.tplFinish': { zh: '完成', en: 'Done' },
            'smart.tplNewGroupPrompt': { zh: '请输入新分组名称', en: 'Group name' },
            'smart.tplNewGroupDefault': { zh: '新分组', en: 'New' },
            'smart.tplGroupNamePrompt': { zh: '请输入分组名称', en: 'Rename to' },
            'smart.tplDeleteGroupConfirm': { zh: '确定删除此分组？组内模板将归类到“我的”。', en: 'Delete group? Items will move to "Mine".' },
            'smart.tplRequired': { zh: '名称和提示词内容不能为空', en: 'Name and content required' },
            'smart.promptTemplateLibrary': { zh: '提示词模板库', en: 'Prompt Library' },
            'common.edit': { zh: '编辑', en: 'Edit' },
            'common.delete': { zh: '删除', en: 'Delete' },
            'common.cancel': { zh: '取消', en: 'Cancel' },
            'common.save': { zh: '保存', en: 'Save' }
        };
        const entry = map[key];
        if (!entry) return key;
        return entry[lang()] || entry.zh;
    }

    function escapeHtml(value) {
        return String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    }

    function escapeAttr(value) {
        return escapeHtml(value);
    }

    function uid(prefix = 'u') {
        return prefix + '_' + Math.random().toString(36).slice(2, 9);
    }

    function toast(message) {
        if (window.toast) {
            window.toast(message);
            return;
        }
        window.alert(message);
    }

    function ensureInlineStyles() {
        if (document.getElementById(INLINE_STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = INLINE_STYLE_ID;
        style.textContent = `
            .prompt-template-inline-wrap {
                position: relative;
                width: 100%;
            }
            .prompt-template-inline-btn {
                position: absolute;
                top: 8px;
                right: 8px;
                z-index: 4;
                width: 30px;
                height: 30px;
                border: 1px solid rgba(148, 163, 184, 0.28);
                border-radius: 10px;
                background: rgba(255, 255, 255, 0.92);
                color: #475569;
                box-shadow: 0 8px 20px rgba(15, 23, 42, 0.08);
                display: inline-flex;
                align-items: center;
                justify-content: center;
                transition: background .16s ease, color .16s ease, border-color .16s ease, transform .16s ease, box-shadow .16s ease;
            }
            .prompt-template-inline-btn:hover,
            .prompt-template-inline-btn:focus-visible {
                background: #ffffff;
                color: #111827;
                border-color: rgba(15, 23, 42, 0.24);
                transform: translateY(-1px);
                box-shadow: 0 12px 24px rgba(15, 23, 42, 0.12);
            }
            .prompt-template-inline-btn i,
            .prompt-template-inline-btn svg {
                width: 14px !important;
                height: 14px !important;
            }
            .prompt-template-inline-btn span {
                position: absolute;
                width: 1px;
                height: 1px;
                padding: 0;
                margin: -1px;
                overflow: hidden;
                clip: rect(0, 0, 0, 0);
                white-space: nowrap;
                border: 0;
            }
            .prompt-template-inline-target {
                padding-right: 48px !important;
            }
            .theme-dark .prompt-template-inline-btn,
            .studio-theme-dark .prompt-template-inline-btn {
                background: rgba(15, 23, 42, 0.92);
                color: #cbd5e1;
                border-color: rgba(148, 163, 184, 0.24);
                box-shadow: 0 12px 24px rgba(2, 6, 23, 0.24);
            }
            .theme-dark .prompt-template-inline-btn:hover,
            .theme-dark .prompt-template-inline-btn:focus-visible,
            .studio-theme-dark .prompt-template-inline-btn:hover,
            .studio-theme-dark .prompt-template-inline-btn:focus-visible {
                background: rgba(15, 23, 42, 0.98);
                color: #f8fafc;
                border-color: rgba(226, 232, 240, 0.34);
            }
        `;
        document.head.appendChild(style);
    }

    function ensureInlineTrigger(input, trigger) {
        if (!input) return trigger;
        ensureInlineStyles();
        let wrap = input.parentElement;
        if (!wrap || !wrap.classList.contains('prompt-template-inline-wrap')) {
            wrap = document.createElement('div');
            wrap.className = 'prompt-template-inline-wrap';
            input.parentNode.insertBefore(wrap, input);
            wrap.appendChild(input);
        }
        input.classList.add('prompt-template-inline-target');
        let inlineTrigger = wrap.querySelector('.prompt-template-inline-btn');
        if (!inlineTrigger) {
            inlineTrigger = document.createElement('button');
            inlineTrigger.type = 'button';
            inlineTrigger.className = 'prompt-template-inline-btn';
            inlineTrigger.title = tr('smart.promptTemplateLibrary');
            inlineTrigger.setAttribute('aria-label', tr('smart.promptTemplateLibrary'));
            inlineTrigger.innerHTML = '<i data-lucide="library"></i><span></span>';
            wrap.appendChild(inlineTrigger);
        }
        inlineTrigger.title = tr('smart.promptTemplateLibrary');
        inlineTrigger.setAttribute('aria-label', tr('smart.promptTemplateLibrary'));
        const label = inlineTrigger.querySelector('span');
        if (label) label.textContent = tr('smart.promptTemplateLibrary');
        if (trigger && trigger !== inlineTrigger) {
            trigger.hidden = true;
            trigger.setAttribute('aria-hidden', 'true');
            trigger.tabIndex = -1;
        }
        if (window.lucide) window.lucide.createIcons({ attrs: { class: 'lucide-icon' }, nameAttr: 'data-lucide' });
        return inlineTrigger;
    }

    // --- Data Management ---
    function loadGroups() {
        try {
            const list = JSON.parse(localStorage.getItem(STORAGE_GROUPS_KEY) || '[]');
            const valid = Array.isArray(list) ? list.filter(g => g?.id && g?.name) : [];
            const defaults = [
                { id: 'view', name: tr('smart.tplCatView') },
                { id: 'storyboard', name: tr('smart.tplCatStoryboard') },
                { id: 'character', name: tr('smart.tplCatCharacter') },
                { id: 'product', name: tr('smart.tplCatProduct') },
                { id: 'lighting', name: tr('smart.tplCatLighting') },
                { id: 'mine', name: tr('smart.tplCatMine') }
            ];
            state.groups = defaults.map(group => valid.find(g => g.id === group.id) || group);
            valid.filter(g => !state.groups.some(x => x.id === g.id)).forEach(g => state.groups.push(g));
        } catch (e) {
            state.groups = [];
        }
    }

    function saveGroups() {
        localStorage.setItem(STORAGE_GROUPS_KEY, JSON.stringify(state.groups));
    }

    function loadOverrides() {
        try {
            state.overrides = JSON.parse(localStorage.getItem(STORAGE_OVERRIDES_KEY) || '{"hiddenBuiltinIds":[], "editedBuiltins":{}}');
        } catch (e) {
            state.overrides = { hiddenBuiltinIds: [], editedBuiltins: {} };
        }
    }

    function saveOverrides() {
        localStorage.setItem(STORAGE_OVERRIDES_KEY, JSON.stringify(state.overrides));
    }

    async function loadLibraries() {
        try {
            const response = await fetch('/api/prompt-libraries');
            if (!response.ok) throw new Error('Load failed');
            const data = await response.json();
            state.libraries = data.library?.libraries || [];
            const preferred = data.library?.active_library_id || state.activeLibraryId;
            if (state.libraries.some(lib => lib.id === preferred)) {
                state.activeLibraryId = preferred;
            } else {
                state.activeLibraryId = state.libraries[0]?.id || 'system';
            }
        } catch (err) {
            console.error('Failed to load libraries:', err);
        }
    }

    function activeLibrary() {
        return state.libraries.find(lib => lib.id === state.activeLibraryId) || state.libraries[0] || { id: 'system', name: 'System', readonly: true, items: [] };
    }

    function builtinCategoryLabel(category) {
        const builtin = {
            view: tr('smart.tplCatView'),
            storyboard: tr('smart.tplCatStoryboard'),
            character: tr('smart.tplCatCharacter'),
            product: tr('smart.tplCatProduct'),
            lighting: tr('smart.tplCatLighting'),
            mine: tr('smart.tplCatMine'),
            custom: tr('smart.tplCatMine')
        };
        return builtin[category] || '';
    }

    function categoriesForLibrary(library = activeLibrary()) {
        if ((library?.id || 'system') === 'system') {
            return state.groups.map(group => ({
                id: group.id,
                name: builtinCategoryLabel(group.id) || group.name || group.id
            }));
        }
        return (Array.isArray(library?.categories) ? library.categories : [])
            .filter(category => category?.id)
            .map(category => ({
                id: String(category.id),
                name: String(category.name || category.id)
            }));
    }

    function defaultCategory(library = activeLibrary(), preferred = '') {
        const categories = categoriesForLibrary(library);
        const preferredId = String(preferred || '').trim();
        if (preferredId && categories.some(category => category.id === preferredId)) return preferredId;
        const fallbackIds = (library?.id || 'system') === 'system' ? ['mine', 'custom'] : ['custom', 'mine'];
        for (const fallbackId of fallbackIds) {
            if (categories.some(category => category.id === fallbackId)) return fallbackId;
        }
        return categories[0]?.id || ((library?.id || 'system') === 'system' ? 'mine' : 'custom');
    }

    function activeLibraryItems() {
        const lib = activeLibrary();
        const hidden = new Set(state.overrides.hiddenBuiltinIds || []);
        if (lib.id !== 'system') {
            return (lib.items || []).filter(t => t?.id && t?.positive).map(t => ({
                ...t,
                sourceId: t.id,
                remote: true,
                libraryId: lib.id,
                libraryName: lib.name || 'Prompt Library',
                builtin: false,
            }));
        }
        const system = state.libraries.find(item => item.id === 'system') || lib;
        return (system.items || [])
            .filter(t => t?.id && t?.positive && !hidden.has(t.id))
            .map(t => ({
                ...t,
                ...(state.overrides.editedBuiltins?.[t.id] || {}),
                sourceId: t.id,
                builtin: true,
                remote: false,
                libraryId: 'system'
            }));
    }

    function visibleItems() {
        const query = state.query.toLowerCase();
        const all = activeLibraryItems();
        return all.filter(item => {
            if (state.category !== 'all' && item.category !== state.category) return false;
            if (!query) return true;
            const text = [item.name, item.name_en, item.positive, item.scene].join(' ').toLowerCase();
            return text.includes(query);
        });
    }

    function currentLibraryEditable() {
        const lib = activeLibrary();
        return Boolean(lib && lib.id !== 'system' && !lib.readonly);
    }

    function getTargetValue() {
        const target = state.target;
        if (!target?.input) return '';
        if (typeof target.getValue === 'function') return target.getValue(target.input);
        if (target.mode === 'contenteditable') return target.input.textContent || '';
        return target.input.value || '';
    }

    function setTargetValue(value) {
        const target = state.target;
        if (!target?.input) return;
        if (typeof target.setValue === 'function') {
            target.setValue(value, target.input);
        } else if (target.mode === 'contenteditable') {
            target.input.textContent = value;
            target.input.dispatchEvent(new Event('input', { bubbles: true }));
        } else {
            target.input.value = value;
            target.input.dispatchEvent(new Event('input', { bubbles: true }));
            target.input.dispatchEvent(new Event('change', { bubbles: true }));
        }
    }

    function normalizeState() {
        const lib = activeLibrary();
        const categories = categoriesForLibrary(lib);
        if (state.category !== 'all' && !categories.some(c => c.id === state.category)) state.category = 'all';
        if (lib.id !== 'system' && state.groupEditMode) state.groupEditMode = false;
        const items = activeLibraryItems();
        if (state.selectedId && !items.some(i => i.id === state.selectedId)) state.selectedId = '';
    }

    // --- UI Rendering ---
    let panelEl = null;

    function ensurePanel() {
        if (panelEl) return panelEl;
        
        // Load shared CSS if not present
        if (!document.querySelector('link[href*="prompt-template-shared.css"]')) {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = '/static/css/prompt-template-shared.css?v=' + Date.now();
            document.head.appendChild(link);
        }

        panelEl = document.createElement('div');
        panelEl.id = MODAL_ID;
        panelEl.className = 'prompt-template-panel';
        panelEl.innerHTML = `
            <div class="prompt-template-head">
                <strong>${escapeHtml(tr('smart.promptTemplateLibrary'))}</strong>
                <button data-role="close" type="button" title="关闭"><i data-lucide="x"></i></button>
            </div>
            <div class="prompt-template-toolbar">
                <select data-role="library-select" class="prompt-template-library-select" title="选择提示词库"></select>
                <div class="prompt-template-search">
                    <i data-lucide="search"></i>
                    <input data-role="search-input" type="search" placeholder="搜索模板...">
                </div>
            </div>
            <div data-role="cats" class="prompt-template-cats"></div>
            <div data-role="body" class="prompt-template-body"></div>
        `;
        document.body.appendChild(panelEl);

        // Events
        panelEl.querySelector('[data-role="close"]').onclick = closePanel;
        panelEl.querySelector('[data-role="library-select"]').onchange = e => {
            state.activeLibraryId = e.target.value;
            state.category = 'all';
            state.editing = false;
            render();
        };
        panelEl.querySelector('[data-role="search-input"]').oninput = e => {
            state.query = e.target.value.trim();
            render();
        };

        return panelEl;
    }

    function render() {
        const el = ensurePanel();
        const lib = activeLibrary();
        normalizeState();

        // Library select
        const select = el.querySelector('[data-role="library-select"]');
        select.innerHTML = state.libraries.map(l => `<option value="${escapeAttr(l.id)}" ${l.id === state.activeLibraryId ? 'selected' : ''}>${escapeHtml(l.name)}</option>`).join('');

        // Categories
        const cats = el.querySelector('[data-role="cats"]');
        const libraryCategories = categoriesForLibrary(lib);
        const categories = [{ id: 'all', name: tr('smart.tplAll') }, ...libraryCategories];
        const items = activeLibraryItems();
        const counts = items.reduce((map, item) => {
            const c = item.category || defaultCategory(lib);
            map[c] = (map[c] || 0) + 1;
            map.all += 1;
            return map;
        }, { all: 0 });

        if (state.groupEditMode) {
            cats.innerHTML = `
                <div class="prompt-template-group-panel">
                    <div class="prompt-template-group-title">
                        <strong>${escapeHtml(tr('smart.tplGroupManage'))}</strong>
                        <div class="prompt-template-group-tools">
                            <button type="button" data-group-new class="primary"><i data-lucide="plus"></i><span>${escapeHtml(tr('smart.tplNewGroup'))}</span></button>
                            <button type="button" data-group-done><i data-lucide="check"></i><span>${escapeHtml(tr('smart.tplFinish'))}</span></button>
                        </div>
                    </div>
                    <div class="prompt-template-group-list">
                        ${state.groups.map(g => `
                            <div class="prompt-template-group-row">
                                <div class="group-name ${g.id === state.category ? 'active' : ''}" data-group-id="${escapeAttr(g.id)}">
                                    <span>${escapeHtml(builtinCategoryLabel(g.id) || g.name || g.id)}</span>
                                    <small>${counts[g.id] || 0}</small>
                                </div>
                                <div class="group-tools">
                                    <button type="button" class="group-tool" data-group-rename="${escapeAttr(g.id)}"><i data-lucide="pencil"></i></button>
                                    ${['view', 'storyboard', 'character', 'product', 'lighting', 'mine'].includes(g.id) ? '' : `
                                        <button type="button" class="group-tool danger" data-group-delete="${escapeAttr(g.id)}"><i data-lucide="trash-2"></i></button>
                                    `}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        } else {
            cats.innerHTML = `
                <div class="prompt-template-nav">
                    <div class="prompt-template-tabs">
                        ${categories.map(c => `
                            <button type="button" class="${c.id === state.category ? 'active' : ''}" data-cat-id="${escapeAttr(c.id)}">
                                <span>${escapeHtml(c.name)}</span>
                                <small>${counts[c.id] || 0}</small>
                            </button>
                        `).join('')}
                    </div>
                    ${lib.id === 'system' ? `<button type="button" class="prompt-template-manage-groups" data-group-edit-toggle><i data-lucide="settings-2"></i><span>${escapeHtml(tr('smart.tplManageGroups'))}</span></button>` : ''}
                </div>
            `;
        }

        // Body
        const body = el.querySelector('[data-role="body"]');
        const vItems = visibleItems();
        if (vItems.length && !vItems.some(i => i.id === state.selectedId)) state.selectedId = vItems[0].id;
        const selected = vItems.find(i => i.id === state.selectedId) || vItems[0] || null;
        const canEdit = currentLibraryEditable();

        body.innerHTML = `
            <div class="prompt-template-list">
                <div class="prompt-template-list-tools">
                    <button type="button" ${canEdit ? '' : 'disabled'} data-action="save-current"><i data-lucide="bookmark-plus"></i><span>${escapeHtml(tr('smart.tplSaveCurrent'))}</span></button>
                    <button type="button" ${canEdit ? '' : 'disabled'} data-action="new-template"><i data-lucide="file-plus-2"></i><span>${escapeHtml(tr('smart.tplNewTemplate'))}</span></button>
                </div>
                ${vItems.length ? vItems.map(item => `
                    <button type="button" class="prompt-template-card ${item.id === state.selectedId ? 'active' : ''}" data-item-id="${escapeAttr(item.id)}">
                        <span class="prompt-template-card-name">${escapeHtml(item.name || item.name_en || 'Prompt')}</span>
                        <span class="prompt-template-card-cat">${escapeHtml(builtinCategoryLabel(item.category) || item.category || '')}</span>
                    </button>
                `).join('') : `<div class="prompt-template-preview-empty"><span>${escapeHtml(tr('smart.tplNoMatches'))}</span></div>`}
            </div>
            <div class="prompt-template-preview">
                ${selected ? (state.editing ? `
                    <div class="prompt-template-edit-fields">
                        <label>${escapeHtml(tr('smart.tplName'))}</label>
                        <input data-edit-name type="text" value="${escapeAttr(selected.name || '')}">
                        <label>${escapeHtml(tr('smart.tplGroup'))}</label>
                        <select data-edit-cat>
                            ${libraryCategories.map(c => `<option value="${escapeAttr(c.id)}" ${c.id === selected.category ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}
                        </select>
                        <label>${escapeHtml(tr('smart.tplContent'))}</label>
                        <textarea data-edit-text>${escapeHtml(selected.positive || '')}</textarea>
                    </div>
                    <div class="prompt-template-preview-actions">
                        <button type="button" data-edit-cancel><i data-lucide="x"></i><span>${escapeHtml(tr('common.cancel'))}</span></button>
                        <button type="button" class="danger" data-item-delete><i data-lucide="trash-2"></i><span>${escapeHtml(tr('common.delete'))}</span></button>
                        <button type="button" class="primary" data-edit-save><i data-lucide="save"></i><span>${escapeHtml(tr('common.save'))}</span></button>
                    </div>
                ` : `
                    <div class="prompt-template-preview-content">
                        <div class="prompt-template-preview-head">
                            <div>
                                <strong class="prompt-template-preview-title">${escapeHtml(selected.name || '')}</strong>
                                <span>${escapeHtml(builtinCategoryLabel(selected.category) || selected.category || '')}</span>
                            </div>
                            <div class="prompt-template-group-tools">
                                <button type="button" data-item-edit-toggle title="编辑"><i data-lucide="pencil"></i></button>
                                <button type="button" class="danger" data-item-delete title="删除"><i data-lucide="trash-2"></i></button>
                            </div>
                        </div>
                        <div class="prompt-template-section">
                            <label>${escapeHtml(tr('smart.tplPositive'))}</label>
                            <pre>${escapeHtml(selected.positive || '')}</pre>
                        </div>
                        ${selected.negative ? `
                            <div class="prompt-template-section">
                                <label>${escapeHtml(tr('smart.tplNegative'))}</label>
                                <pre>${escapeHtml(selected.negative)}</pre>
                            </div>
                        ` : ''}
                    </div>
                    <div class="prompt-template-preview-actions">
                        <button type="button" data-apply="positive"><i data-lucide="copy"></i><span>${escapeHtml(tr('smart.tplApplyPositive'))}</span></button>
                        <button type="button" class="primary" data-apply="full"><i data-lucide="check-circle-2"></i><span>${escapeHtml(tr('smart.tplApplyFull'))}</span></button>
                    </div>
                `) : `<div class="prompt-template-preview-empty"><i data-lucide="mouse-pointer-2"></i><span>${escapeHtml(tr('smart.tplPickOrCreate'))}</span></div>`}
            </div>
        `;

        if (window.lucide) window.lucide.createIcons({ attrs: { class: 'lucide-icon' }, nameAttr: 'data-lucide' });
        bindEvents(el);
    }

    function bindEvents(el) {
        // Categories & Groups
        el.querySelectorAll('[data-cat-id]').forEach(btn => btn.onclick = () => { state.category = btn.dataset.catId; render(); });
        el.querySelector('[data-group-edit-toggle]') && (el.querySelector('[data-group-edit-toggle]').onclick = () => { state.groupEditMode = true; render(); });
        el.querySelector('[data-group-done]') && (el.querySelector('[data-group-done]').onclick = () => { state.groupEditMode = false; render(); });
        el.querySelector('[data-group-new]') && (el.querySelector('[data-group-new]').onclick = createGroup);
        el.querySelectorAll('[data-group-rename]').forEach(btn => btn.onclick = () => renameGroup(btn.dataset.groupRename));
        el.querySelectorAll('[data-group-delete]').forEach(btn => btn.onclick = () => deleteGroup(btn.dataset.groupDelete));

        // Items
        el.querySelectorAll('[data-item-id]').forEach(btn => btn.onclick = () => { state.selectedId = btn.dataset.itemId; state.editing = false; render(); });
        el.querySelector('[data-action="save-current"]') && (el.querySelector('[data-action="save-current"]').onclick = saveCurrent);
        el.querySelector('[data-action="new-template"]') && (el.querySelector('[data-action="new-template"]').onclick = createNew);
        el.querySelector('[data-item-edit-toggle]') && (el.querySelector('[data-item-edit-toggle]').onclick = () => { state.editing = true; render(); });
        el.querySelector('[data-edit-cancel]') && (el.querySelector('[data-edit-cancel]').onclick = () => { state.editing = false; render(); });
        el.querySelector('[data-edit-save]') && (el.querySelector('[data-edit-save]').onclick = saveEdit);
        el.querySelector('[data-item-delete]') && (el.querySelector('[data-item-delete]').onclick = deleteItem);
        el.querySelectorAll('[data-apply]').forEach(btn => btn.onclick = () => applyTemplate(btn.dataset.apply));
    }

    // --- Actions ---
    function createGroup() {
        const name = window.prompt(tr('smart.tplNewGroupPrompt'), tr('smart.tplNewGroupDefault'));
        if (!String(name || '').trim()) return;
        state.groups.push({ id: uid('tpl_group'), name: name.trim().slice(0, 24) });
        saveGroups();
        render();
    }

    function renameGroup(id) {
        const g = state.groups.find(x => x.id === id);
        if (!g) return;
        const name = window.prompt(tr('smart.tplGroupNamePrompt'), g.name);
        if (!String(name || '').trim()) return;
        g.name = name.trim().slice(0, 24);
        saveGroups();
        render();
    }

    function deleteGroup(id) {
        if (!window.confirm(tr('smart.tplDeleteGroupConfirm'))) return;
        state.groups = state.groups.filter(x => x.id !== id);
        saveGroups();
        if (state.category === id) state.category = 'all';
        render();
    }

    async function saveCurrent() {
        const text = getTargetValue();
        if (!text) return toast('提示词为空');
        const lib = activeLibrary();
        try {
            const res = await fetch('/api/prompt-libraries/items', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    library_id: lib.id,
                    name: text.slice(0, 20),
                    category: defaultCategory(lib, state.category === 'all' ? '' : state.category),
                    positive: text,
                    scene: ''
                })
            });
            if (!res.ok) throw new Error('Save failed');
            const data = await res.json();
            state.libraries = data.library?.libraries || state.libraries;
            state.selectedId = data.item?.id;
            state.editing = true;
            render();
        } catch (err) { toast(err.message); }
    }

    async function createNew() {
        const lib = activeLibrary();
        try {
            const res = await fetch('/api/prompt-libraries/items', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    library_id: lib.id,
                    name: '新模板',
                    category: defaultCategory(lib, state.category === 'all' ? '' : state.category),
                    positive: '新提示词',
                    scene: ''
                })
            });
            if (!res.ok) throw new Error('Create failed');
            const data = await res.json();
            state.libraries = data.library?.libraries || state.libraries;
            state.selectedId = data.item?.id;
            state.editing = true;
            render();
        } catch (err) { toast(err.message); }
    }

    async function saveEdit() {
        const el = ensurePanel();
        const name = el.querySelector('[data-edit-name]').value.trim();
        const cat = el.querySelector('[data-edit-cat]').value;
        const text = el.querySelector('[data-edit-text]').value.trim();
        if (!name || !text) return toast(tr('smart.tplRequired'));
        
        const item = activeLibraryItems().find(i => i.id === state.selectedId);
        if (!item) return;

        try {
            if (item.builtin) {
                state.overrides.editedBuiltins[item.sourceId] = { ...state.overrides.editedBuiltins[item.sourceId], name, category: cat, positive: text };
                saveOverrides();
                state.editing = false;
                render();
                return;
            }
            const res = await fetch(`/api/prompt-libraries/items/${encodeURIComponent(item.id)}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ library_id: item.libraryId, name, category: cat, positive: text, scene: item.scene || '', negative: item.negative || '' })
            });
            if (!res.ok) throw new Error('Save failed');
            const data = await res.json();
            state.libraries = data.library?.libraries || state.libraries;
            state.editing = false;
            render();
        } catch (err) { toast(err.message); }
    }

    async function deleteItem() {
        const item = activeLibraryItems().find(i => i.id === state.selectedId);
        if (!item || !window.confirm(`确定删除「${item.name}」？`)) return;

        try {
            if (item.builtin) {
                state.overrides.hiddenBuiltinIds.push(item.sourceId);
                saveOverrides();
            } else {
                await fetch(`/api/prompt-libraries/items/${encodeURIComponent(item.id)}`, { method: 'DELETE' });
                await loadLibraries();
            }
            state.selectedId = '';
            state.editing = false;
            render();
        } catch (err) { toast('Delete failed'); }
    }

    function applyTemplate(mode) {
        const item = activeLibraryItems().find(i => i.id === state.selectedId);
        if (!item) return;
        let text = item.positive || '';
        if (mode === 'full' && item.negative) {
            text += '\n--no ' + item.negative;
        }
        setTargetValue(text);
        closePanel();
    }

    function openPanel(target) {
        state.target = target;
        loadGroups();
        loadOverrides();
        loadLibraries().then(() => {
            ensurePanel().classList.add('open');
            render();
        });
    }

    function closePanel() {
        panelEl && panelEl.classList.remove('open');
    }

    // --- Export ---
    function attach(options) {
        const trigger = typeof options.trigger === 'string' ? document.querySelector(options.trigger) : options.trigger;
        const input = typeof options.input === 'string' ? document.querySelector(options.input) : options.input;
        if (!input) return;
        const activeTrigger = ensureInlineTrigger(input, trigger) || trigger;
        if (!activeTrigger) return;

        activeTrigger.onclick = (e) => {
            e.preventDefault();
            openPanel({
                input,
                mode: options.inputMode || (input.contentEditable === 'true' ? 'contenteditable' : 'value'),
                getValue: options.getValue,
                setValue: options.setValue
            });
        };
    }

    window.StudioPromptTemplateQuickEntry = { attach, open: openPanel };
})();

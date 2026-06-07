let historyItems = [];
let activeFilter = 'all';
let query = '';
let currentLightbox = null;
let lightboxPreview = null;
const favoriteUrls = new Set();

function $(id){ return document.getElementById(id); }
function escapeHtml(str){ return String(str || '').replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s])); }
function escapeAttr(str){ return escapeHtml(str).replace(/`/g, '&#96;'); }

function setStatus(text){
    const el = $('historyStatus');
    if(el) el.textContent = text;
}

function showHistoryToast(message, type='success'){
    let stack = document.querySelector('.history-toast-stack');
    if(!stack){
        stack = document.createElement('div');
        stack.className = 'history-toast-stack';
        document.body.appendChild(stack);
    }
    const toast = document.createElement('div');
    toast.className = `history-toast ${type}`;
    const icon = type === 'error' ? 'circle-alert' : (type === 'info' ? 'bookmark-check' : 'check-circle-2');
    toast.innerHTML = `<i data-lucide="${icon}"></i><span>${escapeHtml(message)}</span>`;
    stack.appendChild(toast);
    lucide.createIcons();
    requestAnimationFrame(() => toast.classList.add('show'));
    window.setTimeout(() => {
        toast.classList.remove('show');
        window.setTimeout(() => toast.remove(), 220);
    }, 2200);
}

function showHistoryConfirm({title, message, confirmText='确定', cancelText='取消'}){
    return new Promise(resolve => {
        const backdrop = document.createElement('div');
        backdrop.className = 'history-confirm-backdrop';
        backdrop.innerHTML = `
            <div class="history-confirm" role="dialog" aria-modal="true">
                <h3>${escapeHtml(title)}</h3>
                <p>${escapeHtml(message)}</p>
                <div class="history-confirm-actions">
                    <button type="button" data-confirm-cancel>${escapeHtml(cancelText)}</button>
                    <button type="button" class="danger" data-confirm-ok>${escapeHtml(confirmText)}</button>
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

function itemImages(item){
    return (item?.images || [])
        .map(value => typeof value === 'string' ? value : (value?.url || value?.path || ''))
        .filter(Boolean);
}

function cleanMediaUrl(url){
    return String(url || '').split('?', 1)[0];
}

function normalizeType(item){
    const type = String(item?.type || '').toLowerCase();
    const provider = String(item?.provider_id || item?.params?.provider_id || '').toLowerCase();
    const localTypes = new Set(['local', 'workflow-test', 'blindbox-local']);
    const onlineTypes = new Set(['online', 'online-image', 'cloud', 'zimage', 'enhance', 'klein', 'angle']);
    if(provider === 'local-comfy' || item?.backend || item?.workflow_json || localTypes.has(type) || type.includes('comfy')) return 'local';
    if(onlineTypes.has(type) || provider || item?.provider_name) return 'online';
    return 'canvas';
}

function typeLabel(type){
    if(type === 'local') return '本地';
    if(type === 'online') return '在线';
    return '画布';
}

function itemLabel(item){
    return item?.provider_name || item?.provider_id || item?.workflow_json || item?.type || '生成';
}

function itemModel(item){
    return item?.model || item?.params?.model || item?.workflow_json || '';
}

function itemSize(item){
    return item?.params?.size || '';
}

function formatTime(ts){
    const num = Number(ts);
    if(!Number.isFinite(num)) return '';
    const ms = num > 100000000000 ? num : num * 1000;
    try {
        return new Intl.DateTimeFormat('zh-CN', {
            month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit'
        }).format(new Date(ms));
    } catch(e) {
        return new Date(ms).toLocaleString();
    }
}

function searchableText(item){
    return [
        item?.prompt,
        itemLabel(item),
        itemModel(item),
        itemSize(item),
        item?.workflow_json,
        item?.task_id,
        item?.request_id
    ].filter(Boolean).join(' ').toLowerCase();
}

function filteredItems(){
    const q = query.trim().toLowerCase();
    return historyItems.filter(item => {
        if(!itemImages(item).length) return false;
        const type = normalizeType(item);
        if(activeFilter !== 'all' && type !== activeFilter) return false;
        if(q && !searchableText(item).includes(q)) return false;
        return true;
    });
}

function renderHistory(){
    const root = $('historyRoot');
    const list = filteredItems();
    if(!list.length){
        root.innerHTML = `<div class="history-empty">${historyItems.length ? '没有匹配的历史图片' : '暂无历史图片'}</div>`;
        setStatus(`${historyItems.length} 条记录`);
        return;
    }
    root.innerHTML = `<div class="history-grid">${list.map(renderCard).join('')}</div>`;
    setStatus(`${list.length} / ${historyItems.length} 条记录`);
    bindCards();
    lucide.createIcons();
}

function renderCard(item){
    const images = itemImages(item);
    const type = normalizeType(item);
    const image = images[0];
    const ts = escapeAttr(item?.timestamp || '');
    const model = itemModel(item);
    const size = itemSize(item);
    const extra = images.length > 1 ? `<span class="history-chip">+${images.length - 1}</span>` : '';
    return `<article class="history-card" data-ts="${ts}">
        <div class="history-thumb" data-open-history>
            <img src="${escapeAttr(image)}" alt="${escapeAttr(item?.prompt || 'history image')}" loading="lazy">
            <div class="history-badge">${escapeHtml(typeLabel(type))} · ${escapeHtml(itemLabel(item))}</div>
        </div>
        <div class="history-card-body">
            <div class="history-prompt">${escapeHtml(item?.prompt || '无提示词')}</div>
            <div class="history-meta">
                ${model ? `<span class="history-chip">${escapeHtml(model)}</span>` : ''}
                ${size ? `<span class="history-chip">${escapeHtml(size)}</span>` : ''}
                ${extra}
            </div>
            <div class="history-card-actions">
                <div class="history-time">${escapeHtml(formatTime(item?.timestamp))}</div>
                <div class="card-actions">
                    <button class="card-action" type="button" data-favorite-history data-url="${escapeAttr(image)}" title="收藏到素材库"><i data-lucide="${favoriteUrls.has(cleanMediaUrl(image)) ? 'bookmark-check' : 'bookmark-plus'}"></i></button>
                    <button class="card-action danger" type="button" data-delete-history title="删除记录"><i data-lucide="trash-2"></i></button>
                </div>
            </div>
        </div>
    </article>`;
}

function findItemByTimestamp(ts){
    return historyItems.find(item => String(item?.timestamp || '') === String(ts));
}

function bindCards(){
    document.querySelectorAll('.history-card').forEach(card => {
        const ts = card.dataset.ts;
        card.querySelector('[data-open-history]')?.addEventListener('click', () => openLightbox(findItemByTimestamp(ts)));
        card.querySelector('[data-delete-history]')?.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            deleteRecord(findItemByTimestamp(ts));
        });
        card.querySelector('[data-favorite-history]')?.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            favoriteHistoryImage(findItemByTimestamp(ts), event.currentTarget?.dataset?.url || '', event.currentTarget);
        });
    });
}

function syncBulkManager(){
    window.HistoryBulkManager?.attach({
        masonry: '#historyRoot',
        cardSelector: '.history-card',
        timestampAttr: 'data-ts',
        toolbarLabel: '选择清理',
        toolbarTarget: '.history-head-actions'
    });
}

function ensureLightboxPreview(){
    if(!lightboxPreview && window.StudioImagePreview){
        lightboxPreview = StudioImagePreview.attach($('lightboxFrame'));
    }
    return lightboxPreview;
}

function openLightbox(item){
    if(!item) return;
    currentLightbox = item;
    const image = itemImages(item)[0];
    if(!image) return;
    ensureLightboxPreview();
    if(lightboxPreview) lightboxPreview.reset();
    $('lightboxImg').src = image;
    $('lightboxPrompt').textContent = item.prompt || '无提示词';
    updateLightboxFavoriteButton(item, image);
    $('lightboxMeta').innerHTML = [
        typeLabel(normalizeType(item)),
        itemLabel(item),
        itemModel(item),
        itemSize(item),
        formatTime(item.timestamp)
    ].filter(Boolean).map(value => `<span class="history-chip">${escapeHtml(value)}</span>`).join('');
    $('historyLightbox').hidden = false;
    document.body.style.overflow = 'hidden';
    lucide.createIcons();
}

function setFavoriteButtonState(button, state){
    if(!button) return;
    const label = button.querySelector('span');
    button.disabled = state === 'loading';
    button.classList.toggle('is-favorited', state === 'saved');
    if(state === 'loading'){
        button.dataset.favoriteState = 'loading';
        button.title = '正在收藏...';
        if(label) label.textContent = '收藏中...';
        button.innerHTML = label ? `<i data-lucide="loader-2"></i><span>收藏中...</span>` : '<i data-lucide="loader-2"></i>';
    } else if(state === 'saved'){
        button.dataset.favoriteState = 'saved';
        button.title = '已收藏到素材库';
        if(label) label.textContent = '已收藏';
        button.innerHTML = label ? `<i data-lucide="bookmark-check"></i><span>已收藏</span>` : '<i data-lucide="bookmark-check"></i>';
    } else {
        button.dataset.favoriteState = '';
        button.title = '收藏到素材库';
        if(label) label.textContent = '收藏到素材库';
        button.innerHTML = label ? `<i data-lucide="bookmark-plus"></i><span>收藏到素材库</span>` : '<i data-lucide="bookmark-plus"></i>';
    }
    lucide.createIcons();
}

function syncFavoriteButtons(url){
    const cleanUrl = cleanMediaUrl(url);
    document.querySelectorAll('[data-favorite-history]').forEach(button => {
        if(cleanMediaUrl(button.dataset.url) === cleanUrl) setFavoriteButtonState(button, 'saved');
    });
    if(currentLightbox && cleanMediaUrl(itemImages(currentLightbox)[0]) === cleanUrl){
        setFavoriteButtonState($('lightboxFavorite'), 'saved');
    }
}

function updateLightboxFavoriteButton(item, image){
    const button = $('lightboxFavorite');
    if(!button) return;
    button.dataset.url = image;
    button.dataset.ts = item?.timestamp || '';
    setFavoriteButtonState(button, favoriteUrls.has(cleanMediaUrl(image)) ? 'saved' : 'idle');
}

async function favoriteHistoryImage(item, url, button){
    if(!item || !url) return;
    const cleanUrl = cleanMediaUrl(url);
    if(favoriteUrls.has(cleanUrl)){
        showHistoryToast('已收藏到素材库', 'info');
        setFavoriteButtonState(button, 'saved');
        return;
    }
    setFavoriteButtonState(button, 'loading');
    try {
        const res = await fetch('/api/history/favorite', {
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({timestamp:item.timestamp, url})
        });
        const data = await res.json().catch(() => ({}));
        if(!res.ok || data.success === false){
            showHistoryToast(data.detail || data.message || '收藏失败', 'error');
            setFavoriteButtonState(button, 'idle');
            return;
        }
        favoriteUrls.add(cleanUrl);
        syncFavoriteButtons(url);
        showHistoryToast(data.already_exists ? '已收藏到素材库' : '已收藏到素材库', data.already_exists ? 'info' : 'success');
    } catch(e) {
        console.error(e);
        showHistoryToast('收藏失败', 'error');
        setFavoriteButtonState(button, 'idle');
    }
}

function closeLightbox(){
    if(lightboxPreview) lightboxPreview.reset();
    $('historyLightbox').hidden = true;
    $('lightboxImg').src = '';
    currentLightbox = null;
    document.body.style.overflow = '';
}

async function deleteRecord(item){
    if(!item) return;
    const confirmed = await showHistoryConfirm({
        title: '删除历史图片',
        message: '将删除这条历史记录及其本地图片文件。',
        confirmText: '删除',
        cancelText: '取消'
    });
    if(!confirmed) return;
    const res = await fetch('/api/history/delete', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({timestamp:item.timestamp})
    });
    const data = await res.json().catch(() => ({}));
    if(!res.ok || data.success === false){
        showHistoryToast(data.message || data.detail || '删除失败', 'error');
        return;
    }
    historyItems = historyItems.filter(row => String(row?.timestamp || '') !== String(item.timestamp || ''));
    closeLightbox();
    renderHistory();
}

async function loadHistory(){
    setStatus('加载中...');
    try {
        await loadFavoriteState();
        const data = await fetch('/api/history').then(r => r.json());
        historyItems = Array.isArray(data) ? data.filter(item => itemImages(item).length) : [];
        renderHistory();
    } catch(e) {
        console.error(e);
        $('historyRoot').innerHTML = '<div class="history-empty">历史图片加载失败</div>';
        setStatus('加载失败');
    }
}

async function loadFavoriteState(){
    try {
        const data = await fetch('/api/asset-library').then(r => r.ok ? r.json() : null);
        favoriteUrls.clear();
        (data?.library?.libraries || []).forEach(library => {
            (library.categories || []).forEach(category => {
                (category.items || []).forEach(item => {
                    if(item?.origin === 'history' && item.source_url) favoriteUrls.add(cleanMediaUrl(item.source_url));
                });
            });
        });
    } catch(e) {}
}

function addOrUpdateItem(item){
    if(!item || !itemImages(item).length) return;
    const ts = String(item.timestamp || '');
    historyItems = historyItems.filter(row => String(row?.timestamp || '') !== ts);
    historyItems.unshift(item);
    renderHistory();
}

function connectLiveUpdates(){
    try {
        const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
        const clientId = localStorage.getItem('client_id') || `history-${Math.random().toString(16).slice(2)}`;
        const socket = new WebSocket(`${protocol}://${location.host}/ws/stats?client_id=${encodeURIComponent(clientId)}`);
        socket.onmessage = event => {
            try {
                const msg = JSON.parse(event.data);
                if(msg?.type === 'new_image') addOrUpdateItem(msg.data);
            } catch(e) {}
        };
    } catch(e) {}
}

function bindUI(){
    $('refreshBtn')?.addEventListener('click', loadHistory);
    $('historySearch')?.addEventListener('input', event => {
        query = event.target.value || '';
        renderHistory();
    });
    document.querySelectorAll('#historyFilter [data-filter]').forEach(btn => {
        btn.addEventListener('click', () => {
            activeFilter = btn.dataset.filter || 'all';
            document.querySelectorAll('#historyFilter [data-filter]').forEach(item => item.classList.toggle('active', item === btn));
            renderHistory();
        });
    });
    $('lightboxClose')?.addEventListener('click', closeLightbox);
    $('historyLightbox')?.addEventListener('click', event => {
        if(event.target === $('historyLightbox')) closeLightbox();
    });
    $('lightboxDelete')?.addEventListener('click', () => deleteRecord(currentLightbox));
    $('lightboxFavorite')?.addEventListener('click', event => {
        const button = event.currentTarget;
        favoriteHistoryImage(currentLightbox, button?.dataset?.url || itemImages(currentLightbox)[0] || '', button);
    });
    window.addEventListener('keydown', event => {
        if(event.key === 'Escape' && !$('historyLightbox').hidden) closeLightbox();
    });
    window.addEventListener('history-bulk-deleted', event => {
        const timestamps = new Set((event.detail?.timestamps || []).map(value => String(value)));
        if(!timestamps.size) return;
        historyItems = historyItems.filter(row => !timestamps.has(String(row?.timestamp || '')));
        if(currentLightbox && timestamps.has(String(currentLightbox.timestamp || ''))) closeLightbox();
        renderHistory();
    });
}

window.addEventListener('DOMContentLoaded', () => {
    bindUI();
    lucide.createIcons();
    syncBulkManager();
    loadHistory();
    connectLiveUpdates();
});

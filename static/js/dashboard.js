/**
 * AI Memory Gateway - Dashboard JavaScript
 * 整合记忆管理、导入、导出功能
 */

// ============================================
// 全局状态
// ============================================
let allMemories = [];
let pendingJsonData = null;
let currentLayer = 'all';
let memCurrentPage = 1;
const MEM_PER_PAGE = 50;

const LAYER_NAMES = {
    1: '📝 碎片',
    2: '📅 事件',
    3: '⭐ 核心'
};

// ============================================
// 初始化
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    // 初始化侧边栏导航
    initNavigation();
    // 初始化Tab切换
    initTabs();
    // 加载记忆数据
    loadMemories();
    // 加载导出统计
    loadExportStats();
});

// ============================================
// 侧边栏导航
// ============================================
function initNavigation() {
    const navItems = document.querySelectorAll('.nav-item[data-section]');
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const section = item.dataset.section;
            switchSection(section);
        });
    });
}

function switchSection(name) {
    // 更新导航激活状态
    document.querySelectorAll('.nav-item[data-section]').forEach(item => {
        item.classList.toggle('active', item.dataset.section === name);
    });
    
    // 切换内容区域
    document.querySelectorAll('.section').forEach(section => {
        section.classList.toggle('active', section.id === 'section-' + name);
    });
    
    // 切换到导出页面时刷新统计
    if (name === 'export') {
        loadExportStats();
    }
    if (name === 'conversations') {
        loadConversationList(1);
    }
    if (name === 'threads') {
        loadThreads();
    }
}

// ============================================
// Tab 切换（导入页面）
// ============================================
function initTabs() {
    const tabs = document.querySelectorAll('.tab[data-tab]');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = tab.dataset.tab;
            
            // 更新Tab激活状态
            document.querySelectorAll('.tab[data-tab]').forEach(t => {
                t.classList.toggle('active', t.dataset.tab === tabName);
            });
            
            // 切换Tab面板
            document.querySelectorAll('.tab-panel').forEach(panel => {
                panel.classList.toggle('active', panel.id === 'tab-' + tabName);
            });
            
            // 清除消息
            clearImportResult();
        });
    });
}

// ============================================
// 分层 Tab 切换
// ============================================
function switchLayer(layer) {
    currentLayer = layer;
    memCurrentPage = 1;
    document.querySelectorAll('.layer-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.layer == layer);
    });
    filterAndSort();
}

function updateLayerCounts(stats) {
    const el1 = document.getElementById('count-layer-1');
    const el2 = document.getElementById('count-layer-2');
    const el3 = document.getElementById('count-layer-3');
    if (el1) el1.textContent = stats.layer_1?.active || 0;
    if (el2) el2.textContent = stats.layer_2?.active || 0;
    if (el3) el3.textContent = stats.layer_3?.active || 0;
}

// ============================================
// 记忆管理功能
// ============================================
async function loadMemories() {
    try {
        const resp = await fetch('/api/memories');
        const data = await resp.json();
        allMemories = data.memories || [];
        if (data.layer_stats) updateLayerCounts(data.layer_stats);
        document.getElementById('stats').textContent = '共 ' + allMemories.length + ' 条记忆';
        filterAndSort();
    } catch(e) {
        showManageMsg('error', '加载失败：' + e.message);
    }
}

function renderTable(mems, startIndex) {
    startIndex = startIndex || 0;
    const tbody = document.getElementById('tbody');
    tbody.innerHTML = mems.map((m, i) => {
        const layer = m.layer || 1;
        const isInactive = m.is_active === false;
        const rowClass = isInactive ? 'inactive-row' : '';
        const titleDisplay = m.title || '';
        const mergedFrom = m.merged_from || [];
        
        // 层级下拉选择器
        const layerSelect = '<select class="layer-select" id="l_' + m.id + '" onchange="changeLayer(' + m.id + ')">' +
            '<option value="1"' + (layer === 1 ? ' selected' : '') + '>📝 碎片</option>' +
            '<option value="2"' + (layer === 2 ? ' selected' : '') + '>📅 事件</option>' +
            '<option value="3"' + (layer === 3 ? ' selected' : '') + '>⭐ 核心</option>' +
            '</select>';
        
        // 合并来源提示
        let mergeInfo = '';
        if (mergedFrom.length > 0) {
            mergeInfo = '<div class="merge-info" onclick="showMergeSource(' + m.id + ')">' +
                '📎 由 ' + mergedFrom.length + ' 条合并</div>';
        }
        
        // 撤回按钮（只有事件记忆且有合并来源时显示）
        let revertBtn = '';
        if (layer === 2 && mergedFrom.length > 0) {
            revertBtn = '<button class="btn btn-warning btn-sm" onclick="revertMerge(' + m.id + ')">撤回</button>';
        }
        
        // 恢复按钮（只有已归档的记忆显示）
        let restoreBtn = '';
        let deleteBtn = '<button class="btn btn-danger btn-sm" onclick="delMem(' + m.id + ')">删除</button>';
        if (isInactive) {
            restoreBtn = '<button class="btn btn-success btn-sm" onclick="restoreMem(' + m.id + ')">恢复</button>';
            deleteBtn = '<button class="btn btn-danger btn-sm" onclick="delMem(' + m.id + ', true)">永久删除</button>';
        }
        
        return '<tr data-id="' + m.id + '" class="' + rowClass + '">' +
            '<td class="col-check"><input type="checkbox" class="mem-check" value="' + m.id + '" onchange="updateFloatingBar()"></td>' +
            '<td class="col-id">' + (startIndex + i + 1) + mergeInfo + '</td>' +
            '<td class="col-layer">' + layerSelect + '</td>' +
            '<td class="col-title"><input type="text" class="title-input" id="t_' + m.id + '" value="' + escHtml(titleDisplay) + '" placeholder="无标题"></td>' +
            '<td class="col-content"><textarea class="content-textarea" id="c_' + m.id + '">' + escHtml(m.content) + '</textarea></td>' +
            '<td class="col-importance"><input type="number" class="importance-input" id="i_' + m.id + '" value="' + m.importance + '" min="1" max="10"></td>' +
            '<td class="col-time">' + fmtTime(m.created_at) + '</td>' +
            '<td class="col-actions"><div class="row-actions">' +
                '<button class="btn btn-primary btn-sm" onclick="saveMem(' + m.id + ')">保存</button>' +
                revertBtn +
                restoreBtn +
                deleteBtn +
            '</div></td>' +
            '</tr>';
    }).join('');
}

function escHtml(s) {
    if (!s) return '';
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtTime(s) { return s || '-'; }

function filterAndSort() {
    const q = document.getElementById('searchBox').value.trim().toLowerCase();
    const sort = document.getElementById('sortSelect').value;
    const dateVal = document.getElementById('dateFilter').value;
    const showInactiveEl = document.getElementById('showInactive');
    const showInactive = showInactiveEl ? showInactiveEl.checked : false;
    
    let mems = allMemories;
    if (currentLayer !== 'all') mems = mems.filter(m => (m.layer || 1) == currentLayer);
    if (!showInactive) mems = mems.filter(m => m.is_active !== false);
    if (q) mems = mems.filter(m => m.content.toLowerCase().includes(q) || (m.title && m.title.toLowerCase().includes(q)));
    if (dateVal) mems = mems.filter(m => m.created_at && fmtTime(m.created_at).slice(0, 10) === dateVal);
    
    mems = [...mems].sort((a, b) => {
        if (sort === 'id-desc') return b.id - a.id;
        if (sort === 'id-asc') return a.id - b.id;
        if (sort === 'imp-desc') return b.importance - a.importance || b.id - a.id;
        if (sort === 'imp-asc') return a.importance - b.importance || a.id - b.id;
        return 0;
    });
    
    // 分页
    const totalItems = mems.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / MEM_PER_PAGE));
    if (memCurrentPage > totalPages) memCurrentPage = totalPages;
    const start = (memCurrentPage - 1) * MEM_PER_PAGE;
    const pageMems = mems.slice(start, start + MEM_PER_PAGE);
    
    renderTable(pageMems, start);
    renderMemPagination(totalItems, totalPages);
    
    const parts = [];
    if (q || dateVal || currentLayer !== 'all') {
        parts.push('筛选到 ' + totalItems + ' 条');
        if (currentLayer !== 'all') parts.push('层级: ' + LAYER_NAMES[currentLayer]);
        if (dateVal) parts.push('日期: ' + dateVal);
    } else {
        parts.push('共 ' + allMemories.filter(m => m.is_active !== false).length + ' 条活跃记忆');
    }
    if (totalPages > 1) {
        parts.push(`第 ${memCurrentPage}/${totalPages} 页`);
    }
    document.getElementById('stats').textContent = parts.join('  ');
}

function renderMemPagination(totalItems, totalPages) {
    // 在表格后面渲染分页控件
    let paginationEl = document.getElementById('mem-pagination');
    if (!paginationEl) {
        const tableCard = document.querySelector('.table-card');
        if (tableCard) {
            paginationEl = document.createElement('div');
            paginationEl.id = 'mem-pagination';
            paginationEl.style.cssText = 'display: flex; justify-content: center; align-items: center; gap: 8px; padding: 16px 0;';
            tableCard.appendChild(paginationEl);
        } else {
            return;
        }
    }
    
    if (totalPages <= 1) {
        paginationEl.innerHTML = '';
        return;
    }
    
    let html = '';
    html += `<button class="btn btn-sm" onclick="goMemPage(1)" ${memCurrentPage === 1 ? 'disabled' : ''}>«</button>`;
    html += `<button class="btn btn-sm" onclick="goMemPage(${memCurrentPage - 1})" ${memCurrentPage === 1 ? 'disabled' : ''}>‹</button>`;
    
    // 显示页码（最多显示5个）
    let startPage = Math.max(1, memCurrentPage - 2);
    let endPage = Math.min(totalPages, startPage + 4);
    startPage = Math.max(1, endPage - 4);
    
    for (let p = startPage; p <= endPage; p++) {
        html += `<button class="btn btn-sm${p === memCurrentPage ? ' btn-primary' : ''}" onclick="goMemPage(${p})">${p}</button>`;
    }
    
    html += `<button class="btn btn-sm" onclick="goMemPage(${memCurrentPage + 1})" ${memCurrentPage === totalPages ? 'disabled' : ''}>›</button>`;
    html += `<button class="btn btn-sm" onclick="goMemPage(${totalPages})" ${memCurrentPage === totalPages ? 'disabled' : ''}>»</button>`;
    html += `<span style="color: var(--text-muted); font-size: 13px; margin-left: 8px;">${totalItems} 条</span>`;
    
    paginationEl.innerHTML = html;
}

function goMemPage(page) {
    memCurrentPage = page;
    filterAndSort();
    // 滚到表格顶部
    document.querySelector('.table-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function clearDateFilter() {
    document.getElementById('dateFilter').value = '';
    filterAndSort();
}

async function semanticSearch() {
    const q = document.getElementById('searchBox').value.trim();
    if (!q) { alert('请先在搜索框输入关键词'); return; }
    
    document.getElementById('stats').textContent = '语义搜索中...';
    
    try {
        const resp = await fetch('/api/memories/search?q=' + encodeURIComponent(q) + '&limit=20');
        const data = await resp.json();
        
        if (data.error) {
            document.getElementById('stats').textContent = '❌ ' + data.error;
            return;
        }
        
        const results = data.results || [];
        renderTable(results);
        
        // 隐藏分页（语义搜索结果不分页）
        const paginationEl = document.getElementById('mem-pagination');
        if (paginationEl) paginationEl.innerHTML = '';
        
        const scoreInfo = results.length > 0 
            ? results.map(r => `#${r.id}(${(r.score || 0).toFixed(3)})`).join(', ')
            : '';
        
        document.getElementById('stats').innerHTML = 
            `🔍 语义搜索 "${q}" → ${results.length} 条结果` +
            (scoreInfo ? ` [${scoreInfo}]` : '') +
            `&nbsp;&nbsp;<a href="#" onclick="exitSemanticSearch(); return false;" style="color: var(--primary);">← 返回全部</a>`;
    } catch(e) {
        document.getElementById('stats').textContent = '❌ 搜索失败: ' + e.message;
    }
}

function exitSemanticSearch() {
    document.getElementById('searchBox').value = '';
    memCurrentPage = 1;
    filterAndSort();
}

async function changeLayer(id) {
    const layerEl = document.getElementById('l_' + id);
    const newLayer = parseInt(layerEl.value);
    
    try {
        const resp = await fetch('/api/memories/' + id, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({layer: newLayer})
        });
        const data = await resp.json();
        if (data.error) {
            showManageMsg('error', '❌ ' + data.error);
            loadMemories();
        } else {
            showManageMsg('success', '✅ #' + id + ' 层级已改为 ' + LAYER_NAMES[newLayer]);
            const mem = allMemories.find(m => m.id === id);
            if (mem) mem.layer = newLayer;
            loadMemories();
        }
    } catch(e) {
        showManageMsg('error', '❌ ' + e.message);
    }
}

async function saveMem(id) {
    const content = document.getElementById('c_' + id).value;
    const importance = parseInt(document.getElementById('i_' + id).value);
    const titleEl = document.getElementById('t_' + id);
    const layerEl = document.getElementById('l_' + id);
    const title = titleEl ? titleEl.value : null;
    const layer = layerEl ? parseInt(layerEl.value) : null;
    
    try {
        const resp = await fetch('/api/memories/' + id, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({content, importance, title, layer})
        });
        const data = await resp.json();
        if (data.error) {
            showManageMsg('error', '❌ ' + data.error);
        } else {
            showManageMsg('success', '✅ 已保存 #' + id);
            loadMemories();
        }
    } catch(e) {
        showManageMsg('error', '❌ ' + e.message);
    }
}

async function delMem(id, hard = false) {
    const confirmMsg = hard 
        ? '确定永久删除 #' + id + '？此操作不可撤销！'
        : '确定删除 #' + id + '？（软删除，可恢复）';
    if (!confirm(confirmMsg)) return;
    try {
        const soft = !hard;
        const resp = await fetch('/api/memories/' + id + '?soft=' + soft, { method: 'DELETE' });
        const data = await resp.json();
        if (data.error) {
            showManageMsg('error', '❌ ' + data.error);
        } else {
            const action = hard ? '永久删除' : '已归档';
            showManageMsg('success', '✅ ' + action + ' #' + id);
            loadMemories();
        }
    } catch(e) {
        showManageMsg('error', '❌ ' + e.message);
    }
}

async function restoreMem(id) {
    try {
        const resp = await fetch('/api/memories/' + id + '/restore', { method: 'POST' });
        const data = await resp.json();
        if (data.error) {
            showManageMsg('error', '❌ ' + data.error);
        } else {
            showManageMsg('success', '✅ 已恢复 #' + id);
            loadMemories();
        }
    } catch(e) {
        showManageMsg('error', '❌ ' + e.message);
    }
}

async function batchSave() {
    const rows = document.querySelectorAll('#tbody tr');
    if (rows.length === 0) { showManageMsg('error', '没有记忆可保存'); return; }
    
    const updates = [];
    rows.forEach(row => {
        const id = parseInt(row.dataset.id);
        const cEl = document.getElementById('c_' + id);
        const iEl = document.getElementById('i_' + id);
        const tEl = document.getElementById('t_' + id);
        const lEl = document.getElementById('l_' + id);
        if (cEl && iEl) {
            updates.push({
                id,
                content: cEl.value,
                importance: parseInt(iEl.value),
                title: tEl ? tEl.value : null,
                layer: lEl ? parseInt(lEl.value) : null
            });
        }
    });
    
    if (!confirm('确定保存全部 ' + updates.length + ' 条记忆的修改？')) return;
    try {
        const resp = await fetch('/api/memories/batch-update', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({updates: updates})
        });
        const data = await resp.json();
        if (data.error) {
            showManageMsg('error', '❌ ' + data.error);
        } else {
            showManageMsg('success', '✅ 已保存 ' + data.updated + ' 条');
            loadMemories();
        }
    } catch(e) {
        showManageMsg('error', '❌ ' + e.message);
    }
}

async function batchDelete() {
    const checked = [...document.querySelectorAll('.mem-check:checked')].map(c => parseInt(c.value));
    if (checked.length === 0) { showManageMsg('error', '请先勾选要删除的记忆'); return; }
    if (!confirm('确定删除选中的 ' + checked.length + ' 条记忆？此操作不可撤销。')) return;
    try {
        const resp = await fetch('/api/memories/batch-delete', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ids: checked})
        });
        const data = await resp.json();
        if (data.error) {
            showManageMsg('error', '❌ ' + data.error);
        } else {
            showManageMsg('success', '✅ 已删除 ' + data.deleted + ' 条');
            loadMemories();
        }
    } catch(e) {
        showManageMsg('error', '❌ ' + e.message);
    }
}

function toggleAll() {
    const val = event.target.checked;
    document.querySelectorAll('.mem-check').forEach(c => c.checked = val);
    document.getElementById('selectAll').checked = val;
    document.getElementById('selectAllHead').checked = val;
    updateFloatingBar();
}

// 监听勾选变化，更新浮动操作栏
function updateFloatingBar() {
    const checked = document.querySelectorAll('.mem-check:checked').length;
    const floatingBar = document.getElementById('floatingBar');
    const countEl = document.getElementById('selectedCount');
    
    if (checked > 0) {
        countEl.textContent = checked;
        floatingBar.style.display = 'flex';
    } else {
        floatingBar.style.display = 'none';
    }
}

function clearSelection() {
    document.querySelectorAll('.mem-check').forEach(c => c.checked = false);
    document.getElementById('selectAll').checked = false;
    document.getElementById('selectAllHead').checked = false;
    updateFloatingBar();
}

function showManageMsg(type, text) {
    const container = document.getElementById('manage-msg');
    container.innerHTML = '<div class="msg msg-' + type + '">' + text + '</div>';
    setTimeout(() => {
        container.innerHTML = '';
    }, 4000);
}

// ============================================
// 查看合并来源
// ============================================
async function showMergeSource(id) {
    const mem = allMemories.find(m => m.id === id);
    if (!mem || !mem.merged_from || mem.merged_from.length === 0) {
        showManageMsg('error', '没有合并来源信息');
        return;
    }
    
    try {
        const resp = await fetch('/api/memories?active_only=false');
        const data = await resp.json();
        const allMems = data.memories || [];
        
        const sources = mem.merged_from.map(srcId => {
            const srcMem = allMems.find(m => m.id === srcId);
            return srcMem ? { id: srcId, content: srcMem.content } : { id: srcId, content: '(已删除)' };
        });
        
        let html = '<h3>合并来源 - 事件 #' + id + '</h3>';
        html += '<p style="color:var(--text-light);margin-bottom:16px;">以下 ' + sources.length + ' 条碎片被合并成了这条事件记忆：</p>';
        sources.forEach((src, i) => {
            html += '<div class="source-item"><b>#' + src.id + '</b><br>' + escHtml(src.content) + '</div>';
        });
        html += '<div class="modal-actions"><button class="btn btn-secondary" onclick="closeMergeSourceModal()">关闭</button></div>';
        
        document.getElementById('mergeSourceContent').innerHTML = html;
        document.getElementById('mergeSourceModal').style.display = 'flex';
    } catch(e) {
        showManageMsg('error', '❌ ' + e.message);
    }
}

function closeMergeSourceModal() {
    document.getElementById('mergeSourceModal').style.display = 'none';
}

// ============================================
// 撤回合并
// ============================================
async function revertMerge(id) {
    const mem = allMemories.find(m => m.id === id);
    if (!mem || !mem.merged_from || mem.merged_from.length === 0) {
        showManageMsg('error', '没有合并来源，无法撤回');
        return;
    }
    
    if (!confirm('确定撤回合并？\n\n将恢复 ' + mem.merged_from.length + ' 条原始碎片，并删除当前事件记忆 #' + id)) {
        return;
    }
    
    try {
        const resp = await fetch('/api/memories/' + id + '/revert-merge', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'}
        });
        const data = await resp.json();
        if (data.error) {
            showManageMsg('error', '❌ ' + data.error);
        } else {
            showManageMsg('success', '✅ 已撤回合并，恢复了 ' + data.restored + ' 条碎片');
            loadMemories();
        }
    } catch(e) {
        showManageMsg('error', '❌ ' + e.message);
    }
}

// ============================================
// 合并弹窗
// ============================================
function openMergeModal() {
    const checked = [...document.querySelectorAll('.mem-check:checked')].map(c => parseInt(c.value));
    if (checked.length < 2) {
        showManageMsg('error', '请至少选择 2 条记忆进行合并');
        return;
    }
    
    const selectedContents = checked.map(id => {
        const mem = allMemories.find(m => m.id === id);
        return mem ? mem.content : '';
    }).join('\n\n---\n\n');
    
    document.getElementById('mergeCount').textContent = checked.length;
    document.getElementById('mergeContent').value = selectedContents;
    document.getElementById('mergeContent').placeholder = '请编辑合并后的完整描述...';
    document.getElementById('mergeTitle').value = '';
    document.getElementById('mergeImportance').value = '5';
    document.getElementById('mergeLayer').value = '2';
    document.getElementById('mergeModal').style.display = 'flex';
}

function closeMergeModal() {
    document.getElementById('mergeModal').style.display = 'none';
}

async function doMerge() {
    const checked = [...document.querySelectorAll('.mem-check:checked')].map(c => parseInt(c.value));
    const title = document.getElementById('mergeTitle').value.trim();
    const content = document.getElementById('mergeContent').value.trim();
    const importance = parseInt(document.getElementById('mergeImportance').value);
    const layer = parseInt(document.getElementById('mergeLayer').value);
    
    if (!content) { showManageMsg('error', '请输入合并后的内容'); return; }
    try {
        const resp = await fetch('/api/memories/merge', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ ids: checked, title, content, importance, layer })
        });
        const data = await resp.json();
        if (data.error) {
            showManageMsg('error', '❌ ' + data.error);
        } else {
            showManageMsg('success', '✅ 已合并 ' + data.merged + ' 条为新记忆 #' + data.new_id);
            closeMergeModal();
            loadMemories();
        }
    } catch(e) {
        showManageMsg('error', '❌ ' + e.message);
    }
}

// ============================================
// 整理弹窗
// ============================================
function openConsolidateModal() {
    document.getElementById('consolidateModal').style.display = 'flex';
}

function closeConsolidateModal() {
    document.getElementById('consolidateModal').style.display = 'none';
}

async function doConsolidate() {
    const startDate = document.getElementById('consolidateDateStart').value;
    const endDate = document.getElementById('consolidateDateEnd').value;
    
    if (!startDate || !endDate) { 
        showManageMsg('error', '请选择开始和结束日期'); 
        return; 
    }
    if (startDate > endDate) {
        showManageMsg('error', '开始日期不能晚于结束日期');
        return;
    }
    
    showManageMsg('info', '正在提交整理任务...');
    closeConsolidateModal();
    try {
        const resp = await fetch('/api/memories/consolidate', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({start_date: startDate, end_date: endDate})
        });
        const data = await resp.json();
        if (data.error) {
            showManageMsg('error', '❌ ' + data.error);
            return;
        }
        if (data.status === 'already_running') {
            showManageMsg('info', '⏳ 整理任务正在运行中...');
        } else {
            showManageMsg('info', '⏳ 整理任务已启动，后台处理中...');
        }
        // 轮询状态
        const pollInterval = setInterval(async () => {
            try {
                const statusResp = await fetch('/api/memories/consolidate/status');
                const status = await statusResp.json();
                if (status.running) {
                    showManageMsg('info', '⏳ 整理进行中（' + (status.started_at || '') + '）...');
                } else {
                    clearInterval(pollInterval);
                    if (status.error) {
                        showManageMsg('error', '❌ 整理失败: ' + status.error);
                    } else if (status.result) {
                        const r = status.result;
                        if (r.status === 'no_fragments') {
                            showManageMsg('info', '📝 该时间段没有需要整理的碎片记忆');
                        } else if (r.status === 'ok') {
                            showManageMsg('success', '✅ 整理完成！处理了 ' + r.fragments_processed + ' 条碎片，生成了 ' + r.events_created + ' 条事件记忆');
                            loadMemories();
                        } else if (r.status === 'error') {
                            showManageMsg('error', '❌ ' + (r.error || '未知错误'));
                        }
                    }
                }
            } catch(e) {
                clearInterval(pollInterval);
                showManageMsg('error', '❌ 状态查询失败: ' + e.message);
            }
        }, 3000);
    } catch(e) {
        showManageMsg('error', '❌ ' + e.message);
    }
}

// ============================================
// 清理归档碎片
// ============================================
async function cleanupOldFragments() {
    if (!confirm('确定清理30天前的归档碎片？此操作不可撤销。')) return;
    
    showManageMsg('info', '正在清理...');
    try {
        const resp = await fetch('/api/memories/cleanup-fragments', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({days: 30})
        });
        const data = await resp.json();
        if (data.error) {
            showManageMsg('error', '❌ ' + data.error);
        } else {
            showManageMsg('success', '✅ 已清理 ' + data.deleted + ' 条归档碎片');
            loadMemories();
        }
    } catch(e) {
        showManageMsg('error', '❌ ' + e.message);
    }
}

// ============================================
// 导入功能
// ============================================
async function doTextImport() {
    const file = document.getElementById('txtFile').files[0];
    const text = document.getElementById('txtInput').value.trim();
    const skip = document.getElementById('skipScore').checked;
    
    let content = '';
    if (file) {
        content = await file.text();
    } else if (text) {
        content = text;
    } else {
        showImportResult('error', '请先上传文件或输入文本');
        return;
    }
    
    const lines = content.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length === 0) {
        showImportResult('error', '没有找到有效的记忆条目');
        return;
    }
    
    showImportResult('info', skip 
        ? '正在导入 ' + lines.length + ' 条记忆...' 
        : '正在为 ' + lines.length + ' 条记忆自动评分，请稍候...');
    
    try {
        const resp = await fetch('/import/text', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({lines: lines, skip_scoring: skip})
        });
        const data = await resp.json();
        if (data.error) {
            showImportResult('error', '❌ ' + data.error);
        } else {
            showImportResult('success', '✅ 导入完成！新增 ' + data.imported + ' 条，跳过 ' + data.skipped + ' 条（已存在），总计 ' + data.total + ' 条');
            // 刷新记忆列表
            loadMemories();
        }
    } catch(e) {
        showImportResult('error', '❌ 请求失败：' + e.message);
    }
}

async function previewJson() {
    const file = document.getElementById('jsonFile').files[0];
    const text = document.getElementById('jsonInput').value.trim();
    const preview = document.getElementById('jsonPreview');
    
    let jsonStr = '';
    if (file) {
        jsonStr = await file.text();
    } else if (text) {
        jsonStr = text;
    } else {
        showImportResult('error', '请先上传文件或粘贴 JSON');
        return;
    }
    
    try {
        const parsed = JSON.parse(jsonStr);
        const mems = parsed.memories || [];
        if (mems.length === 0) {
            showImportResult('error', '❌ 没有找到 memories 字段，请确认这是从导出功能导出的文件');
            preview.innerHTML = '';
            return;
        }
        
        pendingJsonData = parsed;
        let html = '<p><b>预览：共 ' + mems.length + ' 条记忆</b></p>';
        const show = mems.slice(0, 10);
        show.forEach(m => {
            html += '<div class="preview-item">权重 ' + (m.importance || '?') + ' | ' + (m.content || '').substring(0, 80) + '</div>';
        });
        if (mems.length > 10) {
            html += '<div class="preview-item" style="color:#999;">...还有 ' + (mems.length - 10) + ' 条</div>';
        }
        html += '<br><button class="btn btn-primary" onclick="confirmJsonImport()">确认导入</button>';
        preview.innerHTML = html;
        clearImportResult();
    } catch(e) {
        showImportResult('error', '❌ JSON 格式错误：' + e.message);
        preview.innerHTML = '';
    }
}

async function confirmJsonImport() {
    if (!pendingJsonData) {
        showImportResult('error', '请先预览');
        return;
    }
    
    showImportResult('info', '导入中...');
    
    try {
        const resp = await fetch('/import/memories', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(pendingJsonData)
        });
        const data = await resp.json();
        if (data.error) {
            showImportResult('error', '❌ ' + data.error);
        } else {
            showImportResult('success', '✅ 导入完成！新增 ' + data.imported + ' 条，跳过 ' + data.skipped + ' 条（已存在），总计 ' + data.total + ' 条');
            loadMemories();
        }
        document.getElementById('jsonPreview').innerHTML = '';
        pendingJsonData = null;
    } catch(e) {
        showImportResult('error', '❌ 请求失败：' + e.message);
    }
}

function showImportResult(type, text) {
    const container = document.getElementById('import-result');
    container.innerHTML = '<div class="msg msg-' + type + '">' + text + '</div>';
}

function clearImportResult() {
    document.getElementById('import-result').innerHTML = '';
    document.getElementById('jsonPreview').innerHTML = '';
}

// ============================================
// 导出功能
// ============================================
async function loadExportStats() {
    const el = document.getElementById('export-stats');
    try {
        const resp = await fetch('/api/memories');
        const data = await resp.json();
        const count = (data.memories || []).length;
        el.textContent = '当前共有 ' + count + ' 条记忆';
    } catch(e) {
        el.textContent = '无法加载统计';
    }
}

function doExport() {
    // 直接跳转到导出接口，浏览器会下载文件
    window.location.href = '/export/memories';
}


// ============================================
// 对话记录功能
// ============================================
let convCurrentPage = 1;
let convIsSearchMode = false;
let convSearchQuery = '';

async function loadConvStats() {
    const el = document.getElementById('conv-export-stats');
    try {
        const resp = await fetch('/api/conversations?page=1&per_page=1');
        const data = await resp.json();
        el.textContent = '当前共有 ' + (data.total || 0) + ' 个对话';
    } catch(e) {
        el.textContent = '无法加载统计';
    }
}

async function exportConversations() {
    try {
        const resp = await fetch("/api/conversations/export");
        const data = await resp.json();
        if (data.error) { alert("导出失败: " + data.error); return; }
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        const now = new Date();
        const ts = now.getFullYear() +
            String(now.getMonth()+1).padStart(2,"0") +
            String(now.getDate()).padStart(2,"0") + "_" +
            String(now.getHours()).padStart(2,"0") +
            String(now.getMinutes()).padStart(2,"0") +
            String(now.getSeconds()).padStart(2,"0");
        a.href = url;
        a.download = "conversations_backup_" + ts + ".json";
        a.click();
        URL.revokeObjectURL(url);
    } catch(e) { alert("导出失败: " + e.message); }
}

async function doConvExport() { await exportConversations(); }

async function doConvImport() {
    const file = document.getElementById('convJsonFile').files[0];
    const text = document.getElementById('convJsonInput').value.trim();
    const resultEl = document.getElementById('conv-import-result');
    
    let jsonStr = '';
    if (file) { jsonStr = await file.text(); }
    else if (text) { jsonStr = text; }
    else { resultEl.innerHTML = '<div class="msg msg-error">请先上传文件或粘贴 JSON</div>'; return; }
    
    let records;
    try {
        records = JSON.parse(jsonStr);
        if (!Array.isArray(records)) records = records.records || records;
        if (!Array.isArray(records) || records.length === 0) {
            resultEl.innerHTML = '<div class="msg msg-error">❌ 没有找到有效的对话记录</div>';
            return;
        }
    } catch(e) {
        resultEl.innerHTML = '<div class="msg msg-error">❌ JSON 格式错误：' + e.message + '</div>';
        return;
    }
    
    if (!confirm('确定导入 ' + records.length + ' 条对话记录？')) return;
    
    // 分批导入（每批300条，避免超时）
    const BATCH_SIZE = 300;
    const totalBatches = Math.ceil(records.length / BATCH_SIZE);
    let totalImported = 0;
    let totalSkipped = 0;
    let failedBatches = 0;
    
    for (let i = 0; i < totalBatches; i++) {
        const batch = records.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE);
        const progress = Math.round(((i + 1) / totalBatches) * 100);
        resultEl.innerHTML = `<div class="msg msg-info">导入中... 第 ${i + 1}/${totalBatches} 批（${progress}%）已导入 ${totalImported} 条</div>`;
        
        try {
            const resp = await fetch('/api/conversations/import', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(batch)
            });
            const data = await resp.json();
            if (data.error) {
                failedBatches++;
                console.error(`批次 ${i + 1} 导入失败:`, data.error);
            } else {
                totalImported += (data.imported || 0);
                totalSkipped += (data.skipped || 0);
            }
        } catch(e) {
            failedBatches++;
            console.error(`批次 ${i + 1} 请求失败:`, e);
        }
    }
    
    let msg = `✅ 导入完成！新增 ${totalImported} 条`;
    if (totalSkipped) msg += `，跳过 ${totalSkipped} 条（已存在）`;
    if (failedBatches) msg += `，${failedBatches} 批失败`;
    resultEl.innerHTML = `<div class="msg msg-success">${msg}</div>`;
    
    loadConvStats();
    loadConversationList(1);
    document.getElementById('convJsonFile').value = '';
    document.getElementById('convJsonInput').value = '';
}

// 加载对话列表（分页）
async function loadConversationList(page = 1) {
    convCurrentPage = page;
    convIsSearchMode = false;
    convSearchQuery = '';
    document.getElementById('conv-search-input').value = '';
    document.getElementById('conv-search-status').textContent = '';
    document.getElementById('conv-list-title').textContent = '对话列表';
    
    const container = document.getElementById('conv-list-container');
    container.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 20px 0;">加载中...</div>';
    
    try {
        const resp = await fetch('/api/conversations?page=' + page + '&per_page=20');
        const data = await resp.json();
        if (data.error) {
            container.innerHTML = '<div style="color: var(--error); padding: 20px 0;">加载失败: ' + data.error + '</div>';
            return;
        }
        renderConvList(data.conversations);
        renderConvPagination(data.page, data.total_pages, data.total);
        document.getElementById('conv-list-count').textContent = `共 ${data.total} 个对话`;
    } catch(e) {
        container.innerHTML = '<div style="color: var(--error); padding: 20px 0;">请求失败: ' + e.message + '</div>';
    }
}

// 搜索对话
async function searchConversations() {
    const query = document.getElementById('conv-search-input').value.trim();
    if (!query) { loadConversationList(1); return; }
    
    convIsSearchMode = true;
    convSearchQuery = query;
    
    const container = document.getElementById('conv-list-container');
    const statusEl = document.getElementById('conv-search-status');
    container.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 20px 0;">搜索中...</div>';
    
    try {
        const resp = await fetch('/api/chat/search?q=' + encodeURIComponent(query) + '&limit=20&offset=0');
        if (resp.status === 404) { statusEl.textContent = '搜索功能暂未启用'; container.innerHTML = ''; return; }
        const data = await resp.json();
        if (data.error) {
            container.innerHTML = '<div style="color: var(--error); padding: 20px 0;">' + data.error + '</div>';
            return;
        }
        statusEl.textContent = `搜索"${query}"找到 ${data.total} 个对话`;
        document.getElementById('conv-list-title').textContent = '搜索结果';
        document.getElementById('conv-list-count').textContent = `${data.total} 个结果`;
        renderConvList(data.results, true);
        // 搜索结果的简易分页
        document.getElementById('conv-pagination').innerHTML = data.total > 20 
            ? `<span style="color: var(--text-muted); font-size: 13px;">显示前 20 条结果，共 ${data.total} 条</span>` 
            : '';
    } catch(e) {
        container.innerHTML = '<div style="color: var(--error); padding: 20px 0;">搜索失败: ' + e.message + '</div>';
    }
}

function clearConvSearch() {
    document.getElementById('conv-search-input').value = '';
    document.getElementById('conv-search-status').textContent = '';
    loadConversationList(1);
}

// 渲染对话列表
function renderConvList(conversations, isSearch = false) {
    const container = document.getElementById('conv-list-container');
    
    if (!conversations || conversations.length === 0) {
        container.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 40px 0;">暂无对话记录</div>';
        return;
    }
    
    // 多选控制栏
    let html = `<div id="conv-batch-bar" style="display: flex; gap: 8px; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--border); margin-bottom: 4px;">
        <label style="display: flex; align-items: center; gap: 4px; cursor: pointer; font-size: 13px;">
            <input type="checkbox" id="conv-select-all" onchange="toggleConvSelectAll(this.checked)"> 全选
        </label>
        <button class="btn btn-sm" onclick="batchDeleteConversations()" id="conv-batch-delete-btn" style="display: none; font-size: 12px;">🗑️ 批量删除</button>
        <button class="btn btn-sm" onclick="batchMergeSessions()" id="conv-batch-merge-btn" style="display: none; font-size: 12px;">🔗 合并到...</button>
        <span id="conv-selected-count" style="color: var(--text-muted); font-size: 12px; display: none;"></span>
    </div>`;
    
    for (const conv of conversations) {
        const sid = conv.session_id || conv.id;
        const title = escapeHtml(sid);
        const preview = escapeHtml(conv.title || conv.preview || '');
        const msgCount = conv.message_count || '';
        const totalTokens = conv.total_tokens || 0;
        const tokenStr = totalTokens > 0 ? (totalTokens >= 1000000 ? (totalTokens / 1000000).toFixed(1) + 'M' : totalTokens >= 1000 ? (totalTokens / 1000).toFixed(1) + 'K' : totalTokens) : '';
        const lastTime = conv.last_time || conv.updated_at || '';
        const timeStr = lastTime ? formatConvTime(lastTime) : '';
        
        html += `
        <div class="conv-item" style="display: flex; align-items: flex-start; padding: 12px; border-bottom: 1px solid var(--border); transition: background 0.15s;"
             onmouseover="this.style.background='var(--bg-hover, rgba(0,0,0,0.03))'" 
             onmouseout="this.style.background=''">
            <input type="checkbox" class="conv-checkbox" value="${escapeHtml(sid)}" 
                   onchange="updateConvSelectionCount()" 
                   style="margin-right: 10px; margin-top: 4px; cursor: pointer; flex-shrink: 0;">
            <div style="flex: 1; min-width: 0; cursor: pointer;" onclick="openConvDetail('${escapeHtml(sid)}')">
                <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                    <div style="flex: 1; min-width: 0;">
                        <div style="font-weight: 500; margin-bottom: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${title}</div>
                        <div style="color: var(--text-muted); font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${preview}</div>
                    </div>
                    <div style="text-align: right; flex-shrink: 0; margin-left: 12px;">
                        <div style="color: var(--text-muted); font-size: 12px;">${timeStr}</div>
                        ${msgCount ? `<div style="color: var(--text-muted); font-size: 12px; margin-top: 2px;">${msgCount} 条</div>` : ''}
                        ${tokenStr ? `<div style="color: var(--text-muted); font-size: 11px; margin-top: 2px;">🪙 ${tokenStr}</div>` : ''}
                    </div>
                </div>
            </div>
        </div>`;
    }
    
    container.innerHTML = html;
}

// 渲染分页
function renderConvPagination(currentPage, totalPages, total) {
    const container = document.getElementById('conv-pagination');
    if (totalPages <= 1) { container.innerHTML = ''; return; }
    
    let html = '';
    html += `<button class="btn btn-sm" onclick="loadConversationList(${currentPage - 1})" ${currentPage <= 1 ? 'disabled' : ''}>上一页</button>`;
    
    // 页码按钮（最多显示5个）
    let startPage = Math.max(1, currentPage - 2);
    let endPage = Math.min(totalPages, startPage + 4);
    if (endPage - startPage < 4) startPage = Math.max(1, endPage - 4);
    
    for (let i = startPage; i <= endPage; i++) {
        html += `<button class="btn btn-sm${i === currentPage ? ' btn-primary' : ''}" onclick="loadConversationList(${i})">${i}</button>`;
    }
    
    html += `<button class="btn btn-sm" onclick="loadConversationList(${currentPage + 1})" ${currentPage >= totalPages ? 'disabled' : ''}>下一页</button>`;
    html += `<span style="color: var(--text-muted); font-size: 12px; margin-left: 8px;">${currentPage}/${totalPages}</span>`;
    
    container.innerHTML = html;
}

// 打开对话详情
let convDetailSessionId = '';
let convDetailLoadedCount = 0;

async function openConvDetail(sessionId) {
    const panel = document.getElementById('conv-detail-panel');
    const titleEl = document.getElementById('conv-detail-title');
    const messagesEl = document.getElementById('conv-detail-messages');
    
    convDetailSessionId = sessionId;
    convDetailLoadedCount = 0;
    panel.style.display = 'block';
    titleEl.textContent = '加载中...';
    messagesEl.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 20px 0;">加载中...</div>';
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    
    await loadConvMessages(sessionId, false);
}

async function loadConvMessages(sessionId, append = false) {
    const titleEl = document.getElementById('conv-detail-title');
    const messagesEl = document.getElementById('conv-detail-messages');
    const offset = append ? convDetailLoadedCount : 0;
    
    try {
        const resp = await fetch(`/api/conversations/${encodeURIComponent(sessionId)}/messages?limit=50&offset=${offset}`);
        const data = await resp.json();
        
        if (data.error) {
            messagesEl.innerHTML = '<div style="color: var(--error);">' + data.error + '</div>';
            return;
        }
        
        const messages = data.messages || [];
        const total = data.total || messages.length;
        
        if (!append) {
            convDetailLoadedCount = 0;
        }
        convDetailLoadedCount += messages.length;
        
        titleEl.textContent = `对话详情（${convDetailLoadedCount} / ${total} 条消息）`;
        
        // 渲染消息
        let html = '';
        if (!append) {
            html += `<div style="margin-bottom: 12px; display: flex; gap: 8px; justify-content: flex-end;">
                <button class="btn btn-sm" onclick="deleteConversation('${escapeHtml(sessionId)}')">🗑️ 删除对话</button>
            </div>`;
        }
        
        for (const msg of messages) {
            const isUser = msg.role === 'user';
            const roleLabel = isUser ? '👤 用户' : '🤖 助手';
            const bgColor = isUser ? 'var(--bg-user, rgba(59,130,246,0.08))' : 'var(--bg-assistant, rgba(0,0,0,0.02))';
            const timeStr = msg.created_at ? formatConvTime(msg.created_at) : '';
            const msgId = msg.id || '';
            const content = escapeHtml(msg.content || '');
            
            html += `
            <div style="padding: 12px; margin-bottom: 8px; border-radius: 8px; background: ${bgColor}; position: relative;" id="msg-${msgId}">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                    <span style="font-weight: 500; font-size: 13px;">${roleLabel}</span>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="color: var(--text-muted); font-size: 12px;">${timeStr}</span>
                        ${msgId ? `<button class="btn btn-sm" onclick="toggleEditMessage(${msgId})" style="font-size: 11px; padding: 2px 8px;">编辑</button>` : ''}
                    </div>
                </div>
                <div class="msg-content" id="msg-content-${msgId}" style="white-space: pre-wrap; word-break: break-word; font-size: 14px; line-height: 1.6;">${content}</div>
                <div class="msg-edit" id="msg-edit-${msgId}" style="display: none;">
                    <textarea id="msg-textarea-${msgId}" style="width: 100%; min-height: 100px; padding: 8px; border: 1px solid var(--border); border-radius: 6px; font-size: 14px; line-height: 1.6; resize: vertical; font-family: inherit;">${content}</textarea>
                    <div style="margin-top: 8px; display: flex; gap: 8px; justify-content: flex-end;">
                        <button class="btn btn-sm" onclick="toggleEditMessage(${msgId})">取消</button>
                        <button class="btn btn-sm btn-primary" onclick="saveMessageEdit(${msgId})">保存</button>
                    </div>
                </div>
            </div>`;
        }
        
        // 加载更多按钮
        if (convDetailLoadedCount < total) {
            html += `<div style="text-align: center; padding: 16px 0;">
                <button class="btn btn-primary" onclick="loadConvMessages('${escapeHtml(sessionId)}', true)">
                    加载更多（还有 ${total - convDetailLoadedCount} 条）
                </button>
            </div>`;
        }
        
        if (append) {
            // 追加模式：去掉旧的"加载更多"按钮，加上新内容
            const oldLoadMore = messagesEl.querySelector('[onclick*="loadConvMessages"]');
            if (oldLoadMore) oldLoadMore.parentElement.remove();
            messagesEl.insertAdjacentHTML('beforeend', html);
        } else {
            messagesEl.innerHTML = html;
        }
    } catch(e) {
        if (!append) {
            messagesEl.innerHTML = '<div style="color: var(--error);">加载失败: ' + e.message + '</div>';
        }
    }
}

function closeConvDetail() {
    document.getElementById('conv-detail-panel').style.display = 'none';
}

// 编辑消息
function toggleEditMessage(msgId) {
    const contentEl = document.getElementById('msg-content-' + msgId);
    const editEl = document.getElementById('msg-edit-' + msgId);
    
    if (editEl.style.display === 'none') {
        contentEl.style.display = 'none';
        editEl.style.display = 'block';
    } else {
        contentEl.style.display = '';
        editEl.style.display = 'none';
    }
}

async function saveMessageEdit(msgId) {
    const textarea = document.getElementById('msg-textarea-' + msgId);
    const newContent = textarea.value.trim();
    if (!newContent) { alert('内容不能为空'); return; }
    
    try {
        const resp = await fetch(`/api/chat/messages/${msgId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: newContent })
        });
        if (resp.status === 404) { alert('消息编辑功能暂未启用'); return; }
        const data = await resp.json();
        if (data.error) {
            alert('保存失败: ' + data.error);
            return;
        }
        
        // 更新显示
        const contentEl = document.getElementById('msg-content-' + msgId);
        contentEl.textContent = newContent;
        toggleEditMessage(msgId);
    } catch(e) {
        alert('请求失败: ' + e.message);
    }
}

// 删除对话
async function deleteConversation(sessionId) {
    if (!confirm('确定删除这个对话吗？（可在回收站恢复）')) return;
    
    try {
        const resp = await fetch(`/api/conversations/${encodeURIComponent(sessionId)}`, { method: 'DELETE' });
        const data = await resp.json();
        if (data.error) {
            alert('删除失败: ' + data.error);
            return;
        }
        closeConvDetail();
        if (convIsSearchMode) {
            searchConversations();
        } else {
            loadConversationList(convCurrentPage);
        }
    } catch(e) {
        alert('请求失败: ' + e.message);
    }
}

// 多选功能
function toggleConvSelectAll(checked) {
    document.querySelectorAll('.conv-checkbox').forEach(cb => { cb.checked = checked; });
    updateConvSelectionCount();
}

function updateConvSelectionCount() {
    const checked = document.querySelectorAll('.conv-checkbox:checked');
    const countEl = document.getElementById('conv-selected-count');
    const btnEl = document.getElementById('conv-batch-delete-btn');
    const mergeBtn = document.getElementById('conv-batch-merge-btn');
    const allCb = document.getElementById('conv-select-all');
    const allCheckboxes = document.querySelectorAll('.conv-checkbox');
    
    if (checked.length > 0) {
        countEl.style.display = '';
        countEl.textContent = `已选 ${checked.length} 个`;
        btnEl.style.display = '';
        if (mergeBtn) mergeBtn.style.display = '';
    } else {
        countEl.style.display = 'none';
        btnEl.style.display = 'none';
        if (mergeBtn) mergeBtn.style.display = 'none';
    }
    
    if (allCb) {
        allCb.checked = allCheckboxes.length > 0 && checked.length === allCheckboxes.length;
    }
}

async function batchDeleteConversations() {
    const checked = document.querySelectorAll('.conv-checkbox:checked');
    if (checked.length === 0) return;
    
    if (!confirm(`确定删除选中的 ${checked.length} 个对话吗？（可在回收站恢复）`)) return;
    
    const sessionIds = Array.from(checked).map(cb => cb.value);
    
    try {
        const resp = await fetch('/api/conversations/batch-delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_ids: sessionIds })
        });
        const data = await resp.json();
        if (data.error) {
            alert('批量删除失败: ' + data.error);
            return;
        }
        
        if (convIsSearchMode) {
            searchConversations();
        } else {
            loadConversationList(convCurrentPage);
        }
    } catch(e) {
        alert('请求失败: ' + e.message);
    }
}

async function batchMergeSessions() {
    const checked = document.querySelectorAll('.conv-checkbox:checked');
    if (checked.length === 0) return;
    
    const targetId = prompt('输入目标 Session ID（所有选中的对话将合并到这个session）:', 'interlocked');
    if (!targetId) return;
    
    const sessionIds = Array.from(checked).map(cb => cb.value);
    
    if (!confirm(`确定将选中的 ${sessionIds.length} 个对话合并到「${targetId}」吗？\n\n此操作不可撤销。`)) return;
    
    try {
        const resp = await fetch('/api/admin/merge-sessions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ source_ids: sessionIds, target_id: targetId })
        });
        const data = await resp.json();
        if (data.error) {
            alert('合并失败: ' + data.error);
            return;
        }
        
        alert(`合并完成！\n${data.merged_sessions} 个session → ${targetId}\n${data.merged_messages} 条消息\n${data.merged_token_records} 条token记录`);
        loadConversationList(convCurrentPage);
    } catch(e) {
        alert('请求失败: ' + e.message);
    }
}

// 工具函数
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function formatConvTime(isoStr) {
    try {
        const d = new Date(isoStr);
        const now = new Date();
        const diffMs = now - d;
        const diffDays = Math.floor(diffMs / 86400000);
        
        if (diffDays === 0) {
            return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
        } else if (diffDays === 1) {
            return '昨天';
        } else if (diffDays < 7) {
            return diffDays + '天前';
        } else {
            return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
        }
    } catch(e) {
        return '';
    }
}

// ============================================
// 对话线管理
// ============================================

let _threadData = { threads: [], active_session_id: '' };
let _summaryEditSid = '';

async function loadThreads() {
    try {
        const [statusResp, threadsResp] = await Promise.all([
            fetch('/api/partition/status'),
            fetch('/api/partition/threads')
        ]);
        const status = await statusResp.json();
        const data = await threadsResp.json();
        _threadData = data;
        
        renderThreadStatus(status);
        renderThreadList(data.threads);
        updateCopyFromSelect(data.threads);
    } catch(e) {
        document.getElementById('thread-status').textContent = '加载失败: ' + e.message;
    }
}

function renderThreadStatus(status) {
    const el = document.getElementById('thread-status');
    if (!status.enabled) {
        el.innerHTML = '<span style="color: var(--danger);">⚠️ 分区缓存未启用（CACHE_PARTITION_ENABLED=false）</span>';
        return;
    }
    
    el.innerHTML = `
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px;">
            <div><strong>活跃对话线</strong><br><span style="font-size: 18px; color: var(--primary);">${status.active_session_id || '未设置'}</span></div>
            <div><strong>轮转周期</strong><br>每 ${status.partition_x} 轮</div>
            <div><strong>摘要长度</strong><br>${status.summary_length} 字</div>
            <div><strong>A区起始轮</strong><br>第 ${status.a_start_round} 轮</div>
        </div>
    `;
}

function renderThreadList(threads) {
    const el = document.getElementById('thread-list');
    if (!threads || threads.length === 0) {
        el.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 20px 0;">暂无对话线</div>';
        return;
    }
    
    let html = '';
    for (const t of threads) {
        const isActive = t.is_active;
        const tokens = t.chat_tokens > 0 ? (t.chat_tokens >= 1000 ? (t.chat_tokens / 1000).toFixed(1) + 'K' : t.chat_tokens) : '0';
        const summaryPreview = t.summary ? (t.summary.substring(0, 80) + (t.summary.length > 80 ? '...' : '')) : '（无摘要）';
        const updatedStr = t.updated_at ? formatConvTime(t.updated_at) : '';
        
        html += `
        <div style="border: 1px solid ${isActive ? 'var(--primary)' : 'var(--border)'}; border-radius: 8px; padding: 14px; margin-bottom: 8px; ${isActive ? 'background: var(--bg-card); box-shadow: 0 0 0 1px var(--primary);' : ''}">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="font-weight: 600; font-size: 15px;">${t.session_id}</span>
                    ${isActive ? '<span style="background: var(--primary); color: white; font-size: 11px; padding: 2px 8px; border-radius: 10px;">活跃</span>' : ''}
                </div>
                <div style="display: flex; gap: 6px;">
                    <button class="btn btn-sm" onclick="renameThread('${t.session_id}')">✏️ 改名</button>
                    <button class="btn btn-sm" onclick="openSummaryModal('${t.session_id}')">📝 摘要</button>
                    ${!isActive ? `<button class="btn btn-sm btn-primary" onclick="switchThread('${t.session_id}')">切换到此</button>` : ''}
                </div>
            </div>
            <div style="color: var(--text-muted); font-size: 13px; line-height: 1.5;">
                <div>${summaryPreview}</div>
                <div style="margin-top: 6px; display: flex; gap: 16px;">
                    <span>💬 ${t.message_count} 条消息</span>
                    <span>🪙 ${tokens}</span>
                    <span>📝 摘要 ${t.summary_length} 字</span>
                    ${updatedStr ? `<span>更新于 ${updatedStr}</span>` : ''}
                </div>
            </div>
        </div>`;
    }
    
    el.innerHTML = html;
}

function updateCopyFromSelect(threads) {
    const sel = document.getElementById('new-thread-copy-from');
    // 保留第一个option
    sel.innerHTML = '<option value="">不继承，从零开始</option>';
    for (const t of threads) {
        if (t.summary_length > 0) {
            sel.innerHTML += `<option value="${t.session_id}">${t.session_id} (${t.summary_length}字)</option>`;
        }
    }
}

async function createThread() {
    const newId = document.getElementById('new-thread-id').value.trim();
    const copyFrom = document.getElementById('new-thread-copy-from').value;
    const msgEl = document.getElementById('thread-create-msg');
    
    if (!newId) {
        msgEl.innerHTML = '<div style="color: var(--danger);">请输入对话线ID</div>';
        return;
    }
    
    try {
        const resp = await fetch('/api/partition/thread', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_id: newId, copy_summary_from: copyFrom })
        });
        const data = await resp.json();
        if (data.error) {
            msgEl.innerHTML = `<div style="color: var(--danger);">${data.error}</div>`;
            return;
        }
        
        msgEl.innerHTML = `<div style="color: var(--success);">✅ 创建成功${data.summary_length > 0 ? '（继承了' + data.summary_length + '字摘要）' : ''}</div>`;
        document.getElementById('new-thread-id').value = '';
        loadThreads();
    } catch(e) {
        msgEl.innerHTML = `<div style="color: var(--danger);">请求失败: ${e.message}</div>`;
    }
}

async function renameThread(oldId) {
    const newId = prompt(`请输入新的对话线ID（当前: ${oldId}）:`, oldId);
    if (!newId || newId.trim() === '' || newId.trim() === oldId) return;
    try {
        const resp = await fetch('/api/partition/thread/rename', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ old_id: oldId, new_id: newId.trim() })
        });
        const data = await resp.json();
        if (data.error) {
            alert('改名失败: ' + data.error);
            return;
        }
        loadThreads();
    } catch(e) {
        alert('请求失败: ' + e.message);
    }
}

async function switchThread(sessionId) {
    if (!confirm(`确定切换到对话线「${sessionId}」吗？\n\n切换后所有平台的新消息将存入此对话线。`)) return;
    
    try {
        const resp = await fetch('/api/partition/switch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_id: sessionId })
        });
        const data = await resp.json();
        if (data.error) {
            alert('切换失败: ' + data.error);
            return;
        }
        loadThreads();
    } catch(e) {
        alert('请求失败: ' + e.message);
    }
}

async function openSummaryModal(sessionId) {
    _summaryEditSid = sessionId;
    document.getElementById('summary-modal-sid').textContent = sessionId;
    
    // 获取完整摘要
    try {
        const resp = await fetch('/api/partition/status');
        const status = await resp.json();
        
        // 如果是活跃session就直接用status的摘要，否则单独获取
        let summary = '';
        if (sessionId === status.active_session_id) {
            summary = status.summary || '';
        } else {
            // 找对应thread的摘要
            const thread = _threadData.threads.find(t => t.session_id === sessionId);
            if (thread) summary = thread.summary || '';
        }
        
        document.getElementById('summary-editor').value = summary;
        updateSummaryCharCount();
        document.getElementById('summaryModal').style.display = 'flex';
    } catch(e) {
        alert('获取摘要失败: ' + e.message);
    }
}

function closeSummaryModal() {
    document.getElementById('summaryModal').style.display = 'none';
    _summaryEditSid = '';
}

function updateSummaryCharCount() {
    const text = document.getElementById('summary-editor').value;
    document.getElementById('summary-char-count').textContent = `${text.length} 字`;
}

// 绑定输入事件
document.addEventListener('DOMContentLoaded', () => {
    const editor = document.getElementById('summary-editor');
    if (editor) editor.addEventListener('input', updateSummaryCharCount);
});

async function saveSummary() {
    const summary = document.getElementById('summary-editor').value;
    
    try {
        const resp = await fetch('/api/partition/summary', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_id: _summaryEditSid, summary: summary })
        });
        const data = await resp.json();
        if (data.error) {
            alert('保存失败: ' + data.error);
            return;
        }
        
        closeSummaryModal();
        loadThreads();
    } catch(e) {
        alert('请求失败: ' + e.message);
    }
}

async function clearSummary() {
    if (!confirm(`确定清空「${_summaryEditSid}」的摘要吗？此操作不可撤销。`)) return;
    
    try {
        const resp = await fetch('/api/partition/summary', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_id: _summaryEditSid })
        });
        const data = await resp.json();
        if (data.error) {
            alert('清空失败: ' + data.error);
            return;
        }
        
        closeSummaryModal();
        loadThreads();
    } catch(e) {
        alert('请求失败: ' + e.message);
    }
}

// ============================================
// 记忆向量补算
// ============================================
let _backfillPollTimer = null;

async function startBackfillMemoryEmbeddings() {
    const btn = document.getElementById('backfillMemBtn');
    const progress = document.getElementById('backfill-mem-progress');
    const msgEl = document.getElementById('backfill-mem-msg');
    
    btn.disabled = true;
    btn.textContent = '启动中...';
    msgEl.innerHTML = '';
    
    try {
        const resp = await fetch('/api/admin/backfill-memory-embeddings', { method: 'POST' });
        
        if (!resp.ok) {
            const text = await resp.text();
            msgEl.innerHTML = `<span style="color: var(--danger);">❌ 服务器错误 (${resp.status})：${text.substring(0, 200)}</span>`;
            btn.disabled = false;
            btn.textContent = '开始补算';
            return;
        }
        
        const data = await resp.json();
        
        if (data.error) {
            msgEl.innerHTML = `<span style="color: var(--danger);">❌ ${data.error}</span>`;
            btn.disabled = false;
            btn.textContent = '开始补算';
            return;
        }
        
        if (data.status === 'done') {
            msgEl.innerHTML = `<span style="color: var(--success);">✅ ${data.message}</span>`;
            btn.disabled = false;
            btn.textContent = '开始补算';
            return;
        }
        
        progress.style.display = 'block';
        updateBackfillProgress(0, data.total);
        _backfillPollTimer = setInterval(pollBackfillStatus, 2000);
    } catch (e) {
        msgEl.innerHTML = `<span style="color: var(--danger);">❌ ${e.message}</span>`;
        btn.disabled = false;
        btn.textContent = '开始补算';
    }
}

async function pollBackfillStatus() {
    try {
        const resp = await fetch('/api/admin/backfill-memory-embeddings/status');
        const data = await resp.json();
        
        updateBackfillProgress(data.done, data.total);
        
        if (!data.running) {
            clearInterval(_backfillPollTimer);
            _backfillPollTimer = null;
            
            const btn = document.getElementById('backfillMemBtn');
            const msgEl = document.getElementById('backfill-mem-msg');
            btn.disabled = false;
            btn.textContent = '开始补算';
            
            if (data.error) {
                msgEl.innerHTML = `<span style="color: var(--danger);">❌ 补算出错：${data.error}</span>`;
            } else {
                msgEl.innerHTML = `<span style="color: var(--success);">✅ 补算完成！共处理 ${data.done} 条记忆</span>`;
            }
        }
    } catch (e) {
        console.error('轮询补算状态失败:', e);
    }
}

function updateBackfillProgress(done, total) {
    const bar = document.getElementById('backfill-mem-bar');
    const text = document.getElementById('backfill-mem-text');
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    bar.style.width = pct + '%';
    text.textContent = `${done}/${total} (${pct}%)`;
}



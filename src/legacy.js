let currentView = "home";
window.setCurrentView = function(view) {
    currentView = view;
    // 如果离开 idlist 或 ticketing，自动关闭云机抽屉
    if (view !== 'idlist' && view !== 'ticketing') {
        const drawer = document.getElementById('cloudDrawer');
        if (drawer) drawer.classList.remove('open');
    }
}
let realtimeInited = false;
let originalIdListData = []; // 存储原始 ID 列表数据用于过滤

window.showView = function(view, searchKeyword = "") {
    console.log("legacy: showView called with:", view);
    
    // 映射 view 到路由路径
    const routeMap = {
        'home': '/',
        'inventory': '/inventory',
        'viewers': '/viewers',
        'idlist': '/idlist',
        'virtual_numbers': '/virtual_numbers',
        'shows': '/shows',
        'ticketing': '/ticketing',
        'chat_generator': '/chat_generator'
    };

    const path = routeMap[view] || '/';

    // 如果 React 路由已准备好，则使用路由跳转
    if (window.reactNavigate) {
        window.reactNavigate(path);
    } else {
        // 降级处理：直接修改 hash
        window.location.hash = path === '/' ? '#/' : `#${path}`;
    }

    // 处理特定逻辑
    if (view === 'inventory') {
        window.loadData();
    } else if (view === 'viewers') {
        window.loadViewers();
    } else if (view === 'idlist') {
        if (searchKeyword) {
            document.getElementById("idListSearch").value = searchKeyword;
        }
        window.loadIdList();
    }
}

// 获取后端演出数据
window.loadInventory = async function() {
    try {
        const res = await fetch("/api/data", {
            headers: { "ngrok-skip-browser-warning": "true" }
        });
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        const data = await res.json();
        renderCards(data);
    } catch (e) {
        console.error("加载数据失败:", e);
        try {
            const res = await fetch("http://127.0.0.1:8000/api/data");
            const data = await res.json();
            renderCards(data);
        } catch (e2) {
            document.getElementById("cardContainer").innerHTML = `<p style='color:red;'>连接后端失败，请确保 main.py 正在运行</p>`;
        }
    }
}
// 别名兼容旧代码
window.loadData = window.loadInventory;

// 渲染演出卡片
function renderCards(data) {
    const container = document.getElementById("cardContainer");
    if (!data || data.length === 0) {
        container.innerHTML = "<p style='text-align:center;width:100%;padding:20px;'>暂无演出数据，请先启动抓包脚本并刷新</p>";
        return;
    }
    container.innerHTML = "";
    data.forEach(item => {
        const wrapper = document.createElement("div");
        wrapper.className = "card-wrapper";
        let dateStr = (item.dates && item.dates.length > 1) 
            ? `${item.dates[0]} 至 ${item.dates[item.dates.length-1]} (${item.dates.length}场)`
            : (item.date || (item.dates ? item.dates[0] : "未知日期"));

        wrapper.innerHTML = `
            <div class="swipe-delete-btn" onclick="deleteCard(event, ${item.id})">
                <span>删除</span>
            </div>
            <div class="concert-card">
                <div class="delete-btn" onclick="deleteCard(event, ${item.id})">&times;</div>
                <div class="concert-name">${item.name}</div>
                <div class="concert-date">演出日期：${dateStr}</div>
                <div class="fetch-time">抓取时间：${item.fetch_time || '未知'}</div>
                <div style="margin-top:10px; color:#1890ff; font-size:12px;">点击查看所有场次库存</div>
            </div>
        `;
        const card = wrapper.querySelector('.concert-card');
        card.onclick = () => showDetail(item);
        if (window.innerWidth < 768) initSwipe(card, item.id);
        container.appendChild(wrapper);
    });
}

function initSwipe(el, id) {
    let startX = 0, moveX = 0, currentX = 0;
    const maxSwipe = 80;
    el.addEventListener('touchstart', (e) => {
        startX = e.touches[0].clientX;
        el.style.transition = 'none';
        document.querySelectorAll('.concert-card').forEach(other => {
            if (other !== el && other.style.transform !== 'translateX(0px)') {
                other.style.transition = 'transform 0.3s ease';
                other.style.transform = 'translateX(0px)';
            }
        });
    }, { passive: true });
    el.addEventListener('touchmove', (e) => {
        moveX = e.touches[0].clientX - startX;
        let targetX = moveX + currentX;
        if (targetX > 0) targetX = 0;
        if (targetX < -maxSwipe - 20) targetX = -maxSwipe - 20;
        el.style.transform = `translateX(${targetX}px)`;
    }, { passive: true });
    el.addEventListener('touchend', () => {
        el.style.transition = 'transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
        if (moveX < -maxSwipe / 2) {
            el.style.transform = `translateX(-${maxSwipe}px)`;
            currentX = -maxSwipe;
        } else {
            el.style.transform = 'translateX(0px)';
            currentX = 0;
        }
    });
}

window.deleteCard = async function(event, id) {
    event.stopPropagation();
    try {
        const res = await fetch(`/api/data/${id}`, {
            method: 'DELETE',
            headers: { "ngrok-skip-browser-warning": "true" }
        });
        const result = await res.json();
        if (result.status === "success") {
            if (currentView === "inventory") loadData();
        } else {
            alert("删除失败：" + result.msg);
        }
    } catch (e) {
        alert("网络错误，删除失败");
    }
}

// 观影人加载
window.loadViewers = async function() {
    const listEl = document.getElementById("viewerList");
    try {
        const res = await fetch("/api/viewers", { headers: { "ngrok-skip-browser-warning": "true" } });
        const data = await res.json();
        renderViewers(data);
    } catch (e) {
        listEl.innerHTML = "<p style='color:red;'>加载观影人失败</p>";
    }
}

function renderViewers(data) {
    const listEl = document.getElementById("viewerList");
    if (!data || data.length === 0) {
        listEl.innerHTML = "<p style='text-align:center;padding:20px;color:#666;'>暂无观影人数据</p>";
        return;
    }
    listEl.innerHTML = "";
    data.forEach(rawItem => {
        const item = normalizeViewerGroup(rawItem);
        if (!item.members.length) return;
        const wrapper = document.createElement("div");
        wrapper.className = "viewer-wrapper";
        const safeGroupKey = item.group_key.replace(/'/g, "\\'");
        const descHtml = item.desc ? `<div class="viewer-desc">${escapeHtml(item.desc).replace(/\n/g, "<br>")}</div>` : "";
        const membersHtml = item.members.map(member => {
            const safeName = (member.name || "").replace(/'/g, "\\'");
            const safeId = (member.id_number || "").replace(/'/g, "\\'");
            return `
                <div class="viewer-member">
                    <div class="viewer-row">
                        <div class="viewer-text" style="cursor: pointer;" onclick="copyPlainText(event, '${safeName}', '已复制姓名')">${escapeHtml(member.name || "未识别姓名")}</div>
                        <div class="viewer-actions"><button class="mini-btn" onclick="copyPlainText(event, '${safeName}', '已复制姓名')">复制姓名</button></div>
                    </div>
                    <div class="viewer-row">
                        <div class="viewer-sub viewer-id" style="cursor: pointer;" onclick="copyPlainText(event, '${safeId}', '已复制身份证')">${escapeHtml(member.id_number || "")}</div>
                        <div class="viewer-actions"><button class="mini-btn" onclick="copyPlainText(event, '${safeId}', '已复制身份证')">复制身份证</button></div>
                    </div>
                </div>
            `;
        }).join("");
        wrapper.innerHTML = `
            <div class="viewer-swipe-delete" onclick="deleteViewer(event, '${safeGroupKey}')">删除</div>
            <div class="viewer-item viewer-card">${descHtml}${membersHtml}<button class="mini-btn viewer-del-btn" onclick="deleteViewer(event, '${safeGroupKey}')">删除</button></div>
        `;
        const card = wrapper.querySelector(".viewer-card");
        if (window.innerWidth < 768) initViewerSwipe(card);
        listEl.appendChild(wrapper);
    });
}

function normalizeViewerGroup(item) {
    const members = Array.isArray(item.members) && item.members.length
        ? item.members.filter(member => member && member.id_number)
        : (item.id_number ? [{ name: item.name || "", id_number: item.id_number }] : []);
    return { group_key: item.group_key || members.map(member => member.id_number).join("|"), members, desc: item.desc || "" };
}

function escapeHtml(text) {
    return String(text || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function initViewerSwipe(el) {
    let startX = 0, moveX = 0, currentX = 0;
    const maxSwipe = 88;
    el.addEventListener('touchstart', (e) => {
        startX = e.touches[0].clientX;
        el.style.transition = 'none';
        document.querySelectorAll('.viewer-card').forEach(other => {
            if (other !== el && other.style.transform !== 'translateX(0px)') {
                other.style.transition = 'transform 0.3s ease';
                other.style.transform = 'translateX(0px)';
            }
        });
    }, { passive: true });
    el.addEventListener('touchmove', (e) => {
        moveX = e.touches[0].clientX - startX;
        let targetX = moveX + currentX;
        if (targetX > 0) targetX = 0;
        if (targetX < -maxSwipe - 20) targetX = -maxSwipe - 20;
        el.style.transform = `translateX(${targetX}px)`;
    }, { passive: true });
    el.addEventListener('touchend', () => {
        el.style.transition = 'transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
        if (moveX < -maxSwipe / 2) {
            el.style.transform = `translateX(-${maxSwipe}px)`;
            currentX = -maxSwipe;
        } else {
            el.style.transform = 'translateX(0px)';
            currentX = 0;
        }
    });
}

window.parseAndSaveViewers = async function() {
    const inputEl = document.getElementById("viewerInput");
    const text = (inputEl.value || "").trim();
    if (!text) return;
    try {
        const res = await fetch("/api/viewers/parse", {
            method: "POST",
            headers: { "Content-Type": "application/json; charset=utf-8", "ngrok-skip-browser-warning": "true" },
            body: JSON.stringify({ text })
        });
        const result = await res.json();
        if (result.status === "success") {
            inputEl.value = "";
            loadViewers();
        } else {
            alert("识别失败");
        }
    } catch (e) {
        alert("网络错误，识别失败");
    }
}

window.deleteViewer = async function(event, idNumber) {
    event.stopPropagation();
    if (!idNumber) return;
    try {
        const res = await fetch(`/api/viewers/${encodeURIComponent(idNumber)}`, {
            method: "DELETE",
            headers: { "ngrok-skip-browser-warning": "true" }
        });
        if (res.ok) if (currentView === "viewers") loadViewers();
    } catch (e) {}
}

window.clearViewers = async function() {
    try {
        const res = await fetch("/api/viewers", { method: "DELETE", headers: { "ngrok-skip-browser-warning": "true" } });
        if (res.ok) if (currentView === "viewers") loadViewers();
    } catch (e) {}
}

window.showToast = function(message) {
    const toast = document.getElementById("toast");
    toast.innerText = message;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 1500);
}

window.copyPlainText = function(event, text, msg = "已复制") {
    if (event) event.stopPropagation();
    if (!text) return;
    const executeCopy = (txt) => {
        if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(txt);
        const textarea = document.createElement("textarea");
        textarea.value = txt;
        textarea.style.position = "fixed";
        textarea.style.top = "-9999px";
        document.body.appendChild(textarea);
        textarea.focus(); textarea.select();
        try { document.execCommand("copy"); return Promise.resolve(); } catch (err) { return Promise.reject(err); } finally { document.body.removeChild(textarea); }
    };
    executeCopy(text).then(() => window.showToast(msg)).catch(() => window.showToast("复制失败"));
}

function showDetail(item) {
    const modal = document.getElementById("detailModal");
    const body = document.getElementById("modalBody");
    const dates = item.dates || (item.date ? [item.date] : []);
    const stockMap = item.stock_map || (item.date ? {[item.date]: item.stock_list} : {});
    body.innerHTML = `
        <h3 style="margin-bottom:15px;">${item.name}</h3>
        <p style="margin:10px 0; color:#666;">抓取时间：${item.fetch_time || '未知'}</p>
        <button class="copy-btn" id="copyBtn">📋 一键复制摘要</button>
        <div class="date-tabs" id="dateTabs"></div>
        <div id="stockListContainer" style="max-height: 400px; overflow-y: auto;"></div>
    `;
    modal.style.display = "flex";
    document.getElementById("copyBtn").onclick = () => copySummary(item);
    const tabsContainer = document.getElementById("dateTabs");
    const listContainer = document.getElementById("stockListContainer");
    dates.forEach((date, index) => {
        const tab = document.createElement("div");
        tab.className = `date-tab ${index === 0 ? 'active' : ''}`;
        tab.innerText = date;
        tab.onclick = () => {
            document.querySelectorAll('.date-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            renderStockList(stockMap[date], listContainer);
        };
        tabsContainer.appendChild(tab);
    });
    if (dates.length > 0) renderStockList(stockMap[dates[0]], listContainer);
    else listContainer.innerHTML = "<p>暂无场次信息</p>";
}

function renderStockList(stockList, container) {
    if (!stockList || !Array.isArray(stockList)) {
        container.innerHTML = "<p>该场次暂无库存信息</p>";
        return;
    }
    let html = '<h4 style="margin:10px 0; border-bottom:1px solid #eee; padding-bottom:5px;">场次库存详情：</h4>';
    stockList.forEach(stock => {
        html += `<div class="stock-item"><div style="display:flex; justify-content:space-between; align-items:center;"><span>${stock.sku_name || '普通票'}</span><div><span class="stock-price">¥${stock.price}</span> 库存：<span class="stock-num">${stock.stock}</span></div></div></div>`;
    });
    container.innerHTML = html;
}

window.closeModal = function() {
    document.getElementById("detailModal").style.display = "none";
}

function initModalClosing() {
    const modal = document.getElementById("detailModal");
    const modalContent = document.querySelector(".modal-content");
    modal.addEventListener('click', (e) => { if (e.target === modal) window.closeModal(); });
    modalContent.addEventListener('click', (e) => e.stopPropagation());
}

window.addEventListener('DOMContentLoaded', () => {
    initModalClosing();
    initRealtimeUpdates();
    const params = new URLSearchParams(window.location.search);
    const mode = params.get('mode');
    if (mode === 'desktop') document.body.classList.add('desktop-mode');
    // 路由交给 React Router 控制，不再手动调用 showView
});

function initRealtimeUpdates() {
    if (realtimeInited) return;
    realtimeInited = true;
    try {
        const eventSource = new EventSource("/api/events");
        eventSource.onmessage = function(event) {
            if (event.data === "concert_update") if (currentView === "inventory") loadData();
            if (event.data === "viewer_update") if (currentView === "viewers") loadViewers();
        };
    } catch (e) {}
}

// ID 列表加载
window.loadIdList = async function() {
    const listEl = document.getElementById("idListContainer");
    try {
        const res = await fetch("/api/idlist", { headers: { "ngrok-skip-browser-warning": "true" } });
        originalIdListData = await res.json();
        window.filterIdList();
    } catch (e) {
        listEl.innerHTML = "<p style='color:red;'>加载ID列表失败</p>";
    }
}

window.filterIdList = function() {
    const searchQuery = (document.getElementById("idListSearch").value || "").toLowerCase().trim();
    if (!searchQuery) { renderIdList(originalIdListData); return; }
    const keywords = searchQuery.split(/\s+/).filter(k => k);
    const filtered = originalIdListData.filter(item => {
        const searchableText = [item.title || "", item.itemId || "", ...item.tickets.map(t => t.info || "")].join(" ").toLowerCase();
        return keywords.every(kw => {
            if (searchableText.includes(kw)) return true;
            try {
                const pattern = kw.split('').map(char => char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*');
                return new RegExp(pattern, 'i').test(searchableText);
            } catch (e) { return false; }
        });
    });
    renderIdList(filtered);
}

window.handleCheckboxChange = function(el) {
    if (!el.checked) return;
    const currentGroup = el.getAttribute('data-group');
    const allCheckboxes = document.querySelectorAll('.ticket-checkbox:checked');
    let clearedCount = 0;
    allCheckboxes.forEach(cb => {
        if (cb !== el && cb.getAttribute('data-group') !== currentGroup) {
            cb.checked = false;
            clearedCount++;
        }
    });
    if (clearedCount > 0) window.showToast("已切换项目/日期，自动清空之前选择");
}

window.toggleTicketCheckbox = function(event, el) {
    // 如果点击的是 checkbox 本身，则由其自身的 onchange 处理，不在此处处理以防状态反转两次
    if (event.target.classList.contains('ticket-checkbox')) return;
    
    const checkbox = el.querySelector('.ticket-checkbox');
    if (checkbox) {
        checkbox.checked = !checkbox.checked;
        window.handleCheckboxChange(checkbox);
    }
}

function renderIdList(data) {
    const listEl = document.getElementById("idListContainer");
    if (!data || data.length === 0) {
        listEl.innerHTML = "<p style='text-align:center;padding:20px;color:#666;'>暂无ID列表数据</p>";
        return;
    }
    const dateColors = ['#1890ff', '#52c41a', '#f5222d', '#fa8c16', '#722ed1', '#13c2c2', '#eb2f96'];
    listEl.innerHTML = "";
    data.forEach(item => {
        const wrapper = document.createElement("div");
        wrapper.className = "viewer-wrapper";
        const uniqueDates = Array.from(new Set(item.tickets.map(t => {
            const m = t.info.match(/\d{4}-\d{2}-\d{2}/);
            return m ? m[0] : null;
        }).filter(d => d))).sort();
        const ticketsHtml = item.tickets.map(ticket => {
            const dateMatch = ticket.info.match(/\d{4}-\d{2}-\d{2}/);
            const date = dateMatch ? dateMatch[0] : null;
            const dateIdx = date ? uniqueDates.indexOf(date) : -1;
            const color = dateIdx !== -1 ? dateColors[dateIdx % dateColors.length] : '#222';
            let displayInfo = escapeHtml(ticket.info).replace(/(\d+)(元)/g, '<span style="font-size: 18px; font-weight: bold; margin: 0 2px;">$1</span>$2');
            return `<div class="viewer-member" onclick="toggleTicketCheckbox(event, this)" style="display: flex; align-items: center; gap: 10px; border-top: 1px solid #f0f0f0; padding: 10px 0; cursor: pointer;"><input type="checkbox" class="ticket-checkbox" value="${ticket.ticketId}" data-group="${item.itemId}_${date || 'nodate'}" onchange="handleCheckboxChange(this)" style="width: 20px; height: 20px; cursor: pointer;"><div style="flex: 1;"><div class="viewer-text" style="font-size: 14px; color: ${color};">${displayInfo}</div><div class="viewer-sub" style="font-size: 12px; color: #999;">ID: ${ticket.ticketId}</div></div></div>`;
        }).join("");
        wrapper.innerHTML = `
            <div class="viewer-swipe-delete" onclick="deleteIdGroup('${item.itemId}')">删除</div>
            <div class="viewer-item viewer-card" style="padding: 15px;">
                <div class="idlist-sticky-header">
                    <div class="viewer-row" style="margin-bottom: 10px; align-items: flex-start;">
                        <div style="flex: 1;">
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <div class="viewer-text" style="font-size: 16px; color: #1890ff; white-space: normal; word-break: break-all; flex: 1;">${escapeHtml(item.title)}</div>
                                <span style="cursor: pointer; color: #999; font-size: 14px;" onclick="editIdProjectTitle('${item.itemId}', '${escapeHtml(item.title).replace(/'/g, "\\'")}')">📝</span>
                            </div>
                            <div class="viewer-sub">项目ID: ${item.itemId}</div>
                        </div>
                    </div>
                    <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                        <button class="mini-btn" style="background: #e6f7ff; color: #1890ff;" onclick="copyPlainText(event, '${item.itemId}', '已复制项目ID')">复制项目ID</button>
                        <button class="mini-btn" style="background: #f6ffed; color: #52c41a;" onclick="copyProjectIds(this)">复制票价ID</button>
                        <button class="mini-btn" style="background: #f5f5f5; color: #8c8c8c;" onclick="clearProjectSelections(this)">清空勾选</button>
                        <button class="mini-btn viewer-del-btn" style="background: #fff1f0; color: #f5222d; border: 1px solid #ffa39e;" onclick="deleteIdGroup('${item.itemId}')">删除</button>
                    </div>
                </div>
                ${ticketsHtml}
            </div>
        `;
        const card = wrapper.querySelector(".viewer-card");
        if (window.innerWidth < 768) initGenericSwipe(card, () => deleteIdGroup(item.itemId));
        listEl.appendChild(wrapper);
    });
}

window.parseAndSaveIdList = async function() {
    const inputEl = document.getElementById("idListInput");
    const text = (inputEl.value || "").trim();
    if (!text) return;
    try {
        const res = await fetch("/api/idlist/parse", { method: "POST", headers: { "Content-Type": "application/json", "ngrok-skip-browser-warning": "true" }, body: JSON.stringify({ text }) });
        const result = await res.json();
        if (result.status === "success") { inputEl.value = ""; loadIdList(); }
        else alert("解析失败: " + result.msg);
    } catch (e) { alert("网络错误，解析失败"); }
}

window.autoSearchId = async function() {
    const keyword = document.getElementById("autoSearchKeyword").value.trim();
    if (!keyword) return window.showToast("请输入演出名称");
    const btn = document.getElementById("autoSearchBtn");
    const originalText = btn.innerText;
    btn.innerText = "搜索中..."; btn.disabled = true;
    try {
        const res = await fetch("/api/idlist/search", { method: "POST", headers: { "Content-Type": "application/json", "ngrok-skip-browser-warning": "true" }, body: JSON.stringify({ keyword }) });
        const result = await res.json();
        if (result.status === "success") {
            window.showToast("搜索成功，已自动提取 ID");
            document.getElementById("idListInput").value = result.data.url;
            await window.parseAndSaveIdList();
            document.getElementById("autoSearchKeyword").value = "";
        } else alert(result.msg);
    } catch (e) { alert("搜索失败，网络错误"); } finally { btn.innerText = originalText; btn.disabled = false; }
}

window.deleteIdGroup = async function(itemId) {
    if (!confirm("确定要删除整个项目的ID吗？")) return;
    try {
        const res = await fetch(`/api/idlist/${itemId}`, { method: "DELETE", headers: { "ngrok-skip-browser-warning": "true" } });
        if (res.ok) loadIdList();
    } catch (e) { alert("删除失败"); }
}

window.editIdProjectTitle = async function(itemId, oldTitle) {
    // 兼容环境：如果 prompt 被禁用，尝试使用更通用的方式或提醒
    let newTitle;
    try {
        newTitle = window.prompt("请输入新的演出名称:", oldTitle);
    } catch (e) {
        console.error("prompt error:", e);
        // 如果是在 Ant Design 环境下，可以尝试调用全局 message
        if (window.antd && window.antd.Modal) {
            window.antd.Modal.confirm({
                title: '修改演出名称',
                content: React.createElement(window.antd.Input, {
                    defaultValue: oldTitle,
                    onChange: (e) => (window._temp_legacy_title = e.target.value)
                }),
                onOk: async () => {
                    const val = window._temp_legacy_title || oldTitle;
                    if (val && val !== oldTitle) {
                        await performTitleUpdate(itemId, val);
                    }
                }
            });
            return;
        }
        alert("当前环境不支持快捷输入，请在 PC 端浏览器尝试。");
        return;
    }
    
    if (!newTitle || newTitle === oldTitle) return;
    await performTitleUpdate(itemId, newTitle);
}

async function performTitleUpdate(itemId, newTitle) {
    try {
        const res = await fetch(`/api/idlist/${itemId}/title`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json", "ngrok-skip-browser-warning": "true" },
            body: JSON.stringify({ title: newTitle })
        });
        const result = await res.json();
        if (result.status === "success") {
            if (window.showToast) window.showToast("更新成功");
            if (window.loadIdList) window.loadIdList();
        } else {
            alert("更新失败: " + result.msg);
        }
    } catch (e) {
        alert("网络错误，更新失败");
    }
}

window.copyProjectIds = function(btn) {
    const card = btn.closest('.viewer-card');
    const checkboxes = card.querySelectorAll(".ticket-checkbox:checked");
    if (checkboxes.length === 0) return window.showToast("请先勾选票价ID");
    const ids = Array.from(checkboxes).map(cb => cb.value).join("\n");
    window.copyPlainText(new Event('copy'), ids, "已复制票价ID");
}

window.clearAllSelections = function() {
    document.querySelectorAll(".ticket-checkbox").forEach(cb => cb.checked = false);
}

window.clearProjectSelections = function(btn) {
    btn.closest('.viewer-card').querySelectorAll(".ticket-checkbox").forEach(cb => cb.checked = false);
    window.showToast("已清空该项目勾选");
}

function initGenericSwipe(el, deleteFn) {
    let startX = 0, moveX = 0, currentX = 0;
    const maxSwipe = 88;
    el.addEventListener('touchstart', (e) => { startX = e.touches[0].clientX; el.style.transition = 'none'; }, { passive: true });
    el.addEventListener('touchmove', (e) => {
        moveX = e.touches[0].clientX - startX;
        let targetX = moveX + currentX;
        if (targetX > 0) targetX = 0;
        if (targetX < -maxSwipe - 20) targetX = -maxSwipe - 20;
        el.style.transform = `translateX(${targetX}px)`;
    }, { passive: true });
    el.addEventListener('touchend', () => {
        el.style.transition = 'transform 0.3s';
        if (moveX < -maxSwipe / 2) { el.style.transform = `translateX(-${maxSwipe}px)`; currentX = -maxSwipe; }
        else { el.style.transform = 'translateX(0px)'; currentX = 0; }
    });
}

function copySummary(item) {
    try {
        let name = item.name.split(/[“"” \-]/)[0] || item.name;
        const dates = item.dates || (item.date ? [item.date] : []);
        let dateStr = "";
        if (dates.length > 0) {
            const firstDate = new Date(dates[0]);
            dateStr = `${firstDate.getMonth() + 1}.${firstDate.getDate()}`;
            for (let i = 1; i < dates.length; i++) dateStr += `/${new Date(dates[i]).getDate()}`;
        }
        const stockMap = item.stock_map || (item.date ? {[item.date]: item.stock_list} : {});
        const priceMap = {};
        dates.forEach((date, dateIdx) => {
            (stockMap[date] || []).forEach(s => {
                if (!priceMap[s.price]) priceMap[s.price] = new Array(dates.length).fill(0);
                priceMap[s.price][dateIdx] = s.stock;
            });
        });
        let summary = `${name}\n${dateStr}`;
        Object.keys(priceMap).sort((a, b) => a - b).forEach(price => {
            summary += `\n${price}-${priceMap[price].join('/')}`;
        });
        navigator.clipboard.writeText(summary).then(() => window.showToast("✅ 摘要复制成功！")).catch(() => window.showToast("复制失败"));
    } catch (e) { alert("生成摘要失败"); }
}

window.toggleCloudDrawer = function() {
    document.getElementById('cloudDrawer').classList.toggle('open');
}

window.updateCloudResult = function() {
    const input = document.getElementById("cloudInput").value;
    const resultEl = document.getElementById("cloudResult");
    if (!input.trim()) { resultEl.innerText = ""; return; }
    const idPattern = /[1-9]\d{5}(?:18|19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx]/g;
    const namePattern = /[\u4e00-\u9fa5]{2,4}/g;
    const ignoreWords = ["连坐", "五月天", "一张", "录入", "电话", "连连", "两连"];
    const lines = input.split('\n').map(l => l.trim()).filter(l => l);
    const results = [];
    const usedNames = new Set();
    const usedIds = new Set();
    const allIds = [];
    lines.forEach((line, lineIdx) => {
        const matches = line.match(idPattern);
        if (matches) matches.forEach(id => allIds.push({ id, lineIdx, lineText: line }));
    });
    allIds.forEach(idInfo => {
        if (usedIds.has(idInfo.id)) return;
        let foundName = null;
        const namesInLine = idInfo.lineText.replace(idInfo.id, "").match(namePattern);
        if (namesInLine) {
            for (let n of namesInLine) if (!usedNames.has(n) && !ignoreWords.includes(n)) { foundName = n; break; }
        }
        if (!foundName) {
            const neighbors = [idInfo.lineIdx - 1, idInfo.lineIdx + 1];
            for (let nIdx of neighbors) {
                if (lines[nIdx]) {
                    const namesNearby = lines[nIdx].match(namePattern);
                    if (namesNearby) for (let n of namesNearby) if (!usedNames.has(n) && !ignoreWords.includes(n)) { foundName = n; break; }
                }
                if (foundName) break;
            }
        }
        if (foundName) { results.push({ name: foundName, id: idInfo.id }); usedNames.add(foundName); usedIds.add(idInfo.id); }
        else { results.push({ name: "未识别姓名", id: idInfo.id }); usedIds.add(idInfo.id); }
    });
    if (results.length === 0) { resultEl.innerText = "未识别到有效的姓名和身份证组合"; return; }
    let output = `${results.length}\n`;
    results.forEach(res => { output += `${res.name}\n${res.id}\n`; });
    resultEl.innerText = output.trim();
}

window.copyCloudResult = function() {
    const text = document.getElementById("cloudResult").innerText;
    if (!text || text.includes("未识别")) return window.showToast("没有可复制的内容");
    window.copyPlainText(new Event('copy'), text, "云机数据已复制");
}

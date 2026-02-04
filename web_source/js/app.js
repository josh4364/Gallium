// Gallium Frontend Application Logic

// --- State & Config ---
const getWsUrl = () => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}/ws`;
};

const CONFIG = {
    wsUrl: getWsUrl(),
    reconnectInterval: 3000,
    connectionTimeout: 5000 // Reset if stuck connecting
};

const STATE = {
    connected: false,
    activeTab: 'threads',
    functions: [],
    agents: [],
    workflows: [],
    structs: [],
    auto_run: false
};

// --- DOM Elements ---
const dom = {
    statusText: document.getElementById('conn-text'),
    statusInd: document.getElementById('conn-indicator'),
    tabs: document.querySelectorAll('.tab-btn'),
    views: document.querySelectorAll('.view'),
    frames: {
        agent: document.getElementById('frame-agent-editor'),
        function: document.getElementById('frame-function-editor'),
    },
    workflows: {
        agentSelect: document.getElementById('chat-workflow-select'),
    }
};

let ws;
let connTimeout;

// --- Initialization ---
function init() {
    setupTabs();
    setupLLMConnections();
    setupChatListeners();
    setupAutoRunToggle();
    connect();

    // Global API for Iframes
    exposeGlobalAPI();

    // Setup Workflow Tab
    // Setup Workflow Tab
    setupWorkflowTab();
}

function setupTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const target = e.target.closest('.tab-btn').dataset.target;
            switchTab(target);
        });
    });
}

function switchTab(tabName) {
    STATE.activeTab = tabName;

    // Update Buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        if (btn.dataset.target === tabName) btn.classList.add('active');
        else btn.classList.remove('active');
    });

    // Notify Agent Editor of Mode Switch
    if (tabName === 'agent-editor') {
        notifyEditorMode('frame-agent-editor', 'agent');
    } else if (tabName === 'function-editor') {
        notifyEditorMode('frame-function-editor', 'function');
    }

    // Update Views
    document.querySelectorAll('.view').forEach(view => {
        if (view.id === `view-${tabName}`) view.classList.add('active');
        else view.classList.remove('active');
    });
}

function setupLLMConnections() {
    // Local
    const btnLocal = document.getElementById('btn-save-local');
    if (btnLocal) {
        btnLocal.addEventListener('click', () => {
            const url = document.getElementById('llm-local-url').value.trim();
            const key = document.getElementById('llm-local-key').value.trim();
            sendAction('save_llm_config', {
                provider: 'local',
                config: { base_url: url, api_key: key }
            });
        });
    }

    // OpenAI
    const btnOpenAI = document.getElementById('btn-save-openai');
    if (btnOpenAI) {
        btnOpenAI.addEventListener('click', () => {
            const key = document.getElementById('llm-openai-key').value.trim();
            const model = document.getElementById('llm-openai-model').value.trim();
            sendAction('save_llm_config', {
                provider: 'openai',
                config: { api_key: key, model: model }
            });
        });
    }

    // Gemini
    const btnGemini = document.getElementById('btn-save-gemini');
    if (btnGemini) {
        btnGemini.addEventListener('click', () => {
            const key = document.getElementById('llm-gemini-key').value.trim();
            sendAction('save_llm_config', {
                provider: 'gemini',
                config: { api_key: key }
            });
        });
    }

    // Claude
    const btnClaude = document.getElementById('btn-save-claude');
    if (btnClaude) {
        btnClaude.addEventListener('click', () => {
            const key = document.getElementById('llm-claude-key').value.trim();
            sendAction('save_llm_config', {
                provider: 'anthropic',
                config: { api_key: key }
            });
        });
    }
}

// --- WebSocket Logic ---
function connect() {
    if (ws) {
        // Cleanup existing if connecting retry
        try { ws.close(); } catch (e) { }
    }

    // Update UI to show we are trying
    const txt = document.getElementById('conn-text');
    if (txt) txt.textContent = "Connecting...";

    ws = new WebSocket(CONFIG.wsUrl);

    // Timeout watchdog
    clearTimeout(connTimeout);
    connTimeout = setTimeout(() => {
        if (ws.readyState === WebSocket.CONNECTING) {
            console.warn("WS Connection timed out, retrying...");
            ws.close(); // This will trigger onclose -> retry
        }
    }, CONFIG.connectionTimeout);

    ws.onopen = () => {
        clearTimeout(connTimeout);
        STATE.connected = true;
        updateConnectionStatus(true);
        console.log("Connected to Gallium Backend");

        // Initial Fetch
        requestFunctions();
        requestAgents();
        requestWorkflows();
        requestStructs();
        sendAction('get_state');
        sendAction('get_llm_connections'); // Fetch connection data
    };

    ws.onclose = () => {
        clearTimeout(connTimeout);
        STATE.connected = false;
        updateConnectionStatus(false);
        setTimeout(connect, CONFIG.reconnectInterval);
    };

    ws.onerror = (err) => {
        console.error("WS Error:", err);
    };

    ws.onmessage = (event) => {
        try {
            const msg = JSON.parse(event.data);
            handleMessage(msg);
        } catch (e) {
            console.error("WS Parse Error", e);
        }
    };
}

function updateConnectionStatus(isConnected) {
    const el = document.getElementById('conn-indicator');
    const txt = document.getElementById('conn-text');
    if (el && txt) {
        if (isConnected) {
            el.className = "status-dot connected";
            txt.textContent = "Online";
        } else {
            el.className = "status-dot disconnected";
            txt.textContent = "Offline";
        }
    }
}

function sendAction(type, data = {}) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type, ...data }));
    } else {
        console.warn("WS not connected, action ignored:", type);
    }
}

// --- Message Handling ---
function handleMessage(msg) {
    switch (msg.type) {
        case 'function_list':
            STATE.functions = msg.functions || [];
            broadcastToEditors('importFunctionList', STATE.functions);
            break;

        case 'agent_list':
            STATE.agents = msg.agents || [];
            updateRouterDropdown(STATE.agents);
            broadcastToEditors('importAgentList', STATE.agents);
            break;

        case 'function_data':
            // Route to active editor
            routeFunctionDataToEditor(msg.id, msg.data !== undefined ? msg.data : msg.graph);
            break;

        case 'struct_list':
            broadcastToEditors('importStructList', msg.structs);
            break;

        case 'workflow_list':
            STATE.workflows = msg.workflows || [];
            updateWorkflowDropdowns();
            renderWorkflowList();
            break;

        case 'workflow_data':
            loadWorkflowToEditor(msg.data);
            break;

        case 'struct_save_response':
        case 'struct_delete_response':
        case 'save_response':
        case 'delete_response':
            // Log result
            console.log("Server Response:", msg);
            if (msg.success && (msg.type === 'save_response' || msg.type === 'delete_response')) {
                if (msg.is_agent) {
                    requestAgents();
                } else if (msg.is_workflow) {
                    requestWorkflows();
                    showToast(msg.type === 'save_response' ? 'Workflow Saved' : 'Workflow Deleted', 'success');
                } else {
                    requestFunctions(); // Refresh list
                }
            }
            break;

        case 'state_update':
            STATE.sim_state = msg.data;
            STATE.auto_run = msg.data.auto_run;
            updateAutoRunUI();
            renderThreadList();
            break;

        case 'log':
        case 'info':
        case 'error':
            // Log to console only, not the chat (chat history comes from thread.messages)
            console.log(`[${msg.type.toUpperCase()}] ${msg.message}`);
            break;

        case 'save_llm_response':
            if (msg.success) {
                showToast(`Saved ${msg.provider} configuration`, 'success');
            } else {
                showToast(`Failed to save ${msg.provider} config`, 'error');
            }
            break;

        case 'llm_connections':
            if (msg.data) {
                // Populate fields
                const c = msg.data;
                if (c.local) {
                    if (c.local.base_url) document.getElementById('llm-local-url').value = c.local.base_url;
                    if (c.local.api_key) document.getElementById('llm-local-key').value = c.local.api_key;
                }
                if (c.openai) {
                    if (c.openai.api_key) document.getElementById('llm-openai-key').value = c.openai.api_key;
                    if (c.openai.model) document.getElementById('llm-openai-model').value = c.openai.model;
                }
                if (c.gemini) {
                    if (c.gemini.api_key) document.getElementById('llm-gemini-key').value = c.gemini.api_key;
                }
                if (c.anthropic) {
                    if (c.anthropic.api_key) document.getElementById('llm-claude-key').value = c.anthropic.api_key;
                }
            }
            break;

        default:
        // console.log("Unhandled message:", msg);
    }
}

// --- Editor Interop ---
function routeFunctionDataToEditor(id, data) {
    // Logic: Send to the editor in the active tab.
    // If active tab is Agent -> Agent Frame
    // If active tab is Function -> Function Frame

    let targetFrame = null;
    if (STATE.activeTab === 'agent-editor') {
        targetFrame = document.getElementById('frame-agent-editor');
    } else if (STATE.activeTab === 'function-editor') {
        targetFrame = document.getElementById('frame-function-editor');
    }

    // Fallback: If neither (e.g. background update), maybe send to both?
    // Safer to only send to active to avoid state jumps

    if (targetFrame && targetFrame.contentWindow && targetFrame.contentWindow.receiveServerFunction) {
        targetFrame.contentWindow.receiveServerFunction(id, data);
    }
}

function broadcastToEditors(methodName, data) {
    ['frame-agent-editor', 'frame-function-editor'].forEach(fid => {
        const frame = document.getElementById(fid);
        if (frame && frame.contentWindow && frame.contentWindow[methodName]) {
            frame.contentWindow[methodName](data);
        } else if (frame) {
            // Retry on load
            frame.onload = () => {
                if (frame.contentWindow && frame.contentWindow[methodName]) {
                    frame.contentWindow[methodName](data);
                }
            };
        }
    });
}

// --- Workflow Logic ---
// --- Workflow Logic ---
function updateWorkflowDropdowns() {
    // Chat Active Workflow Dropdown
    const select = document.getElementById('chat-workflow-select');
    if (select) {
        const currentVal = select.value;
        select.innerHTML = `<option value="">-- Select Workflow --</option>`;

        STATE.workflows.forEach(wf => {
            const opt = document.createElement('option');
            opt.value = wf.id; // Usually same as name or filename stem
            opt.textContent = wf.name || wf.id;
            select.appendChild(opt);
        });

        if (currentVal) select.value = currentVal;
    }
}

function updateRouterDropdown(agents) {
    // Router Dropdown in Workflow Editor
    const select = document.getElementById('wf-router-select');
    if (!select) return;

    const currentVal = select.value;
    select.innerHTML = '<option value="">-- Select Router Agent --</option>';

    agents.forEach(a => {
        const opt = document.createElement('option');
        opt.value = a.id;
        opt.textContent = a.name || a.id;
        select.appendChild(opt);
    });

    if (currentVal) select.value = currentVal;
}

function setupWorkflowTab() {
    const btnAdd = document.getElementById('btn-add-role');
    const tbody = document.getElementById('wf-roles-body');
    const btnSave = document.getElementById('btn-save-workflow');
    const btnDelete = document.getElementById('btn-delete-workflow');
    const btnNew = document.getElementById('btn-new-workflow');
    const nameInput = document.getElementById('wf-name-input');
    const routerSelect = document.getElementById('wf-router-select');

    if (btnAdd && tbody) {
        btnAdd.addEventListener('click', () => {
            addRoleRow(tbody);
        });
    }

    if (btnSave) {
        btnSave.addEventListener('click', () => {
            // Gather data
            const workflowName = nameInput ? nameInput.value.trim() : "Untitled Workflow";
            const routerId = routerSelect ? routerSelect.value : null;

            const roles = [];
            if (tbody) {
                tbody.querySelectorAll('tr').forEach(tr => {
                    const inputs = tr.querySelectorAll('input, select');
                    if (inputs.length >= 2) {
                        const name = inputs[0].value.trim();
                        const provider = inputs[1].value;
                        const model = inputs[2].value.trim(); // Get model value
                        if (name) {
                            roles.push({ role: name, provider: provider, model: model });
                        }
                    }
                });
            }

            const payload = {
                router_agent: routerId,
                roles: roles
            };

            console.log("Saving Workflow:", workflowName, payload);
            sendAction('save_workflow', { name: workflowName, data: payload });
        });
    }

    if (btnDelete) {
        btnDelete.addEventListener('click', () => {
            const workflowName = nameInput ? nameInput.value.trim() : "";
            if (!workflowName) return;

            if (confirm(`Are you sure you want to delete workflow "${workflowName}"?`)) {
                // ID is often derived from name or we need the actual ID if we loaded it.
                // For now assuming name suffices or we find ID from list
                const wf = STATE.workflows.find(w => w.name === workflowName || w.id === workflowName);
                const id = wf ? wf.id : workflowName;
                sendAction('delete_workflow', { id: id });

                // Clear form
                if (nameInput) nameInput.value = "";
                if (routerSelect) routerSelect.value = "";
                if (tbody) tbody.innerHTML = "";
            }
        });
    }

    if (btnNew) {
        btnNew.addEventListener('click', () => {
            // Clear form
            if (nameInput) nameInput.value = "";
            if (routerSelect) routerSelect.value = "";
            if (tbody) {
                tbody.innerHTML = "";
                // Add default roles?
                addRoleRow(tbody, 'reviewer', 'local', '');
                addRoleRow(tbody, 'code_generator', 'local', '');
            }
        });
    }

    // Initial Load - populate default if empty
    if (tbody && tbody.children.length === 0) {
        addRoleRow(tbody, 'reviewer', 'local', '');
        addRoleRow(tbody, 'code_generator', 'local', '');
    }
}

function addRoleRow(tbody, name = '', provider = 'local', model = '') {
    const tr = document.createElement('tr');
    tr.innerHTML = `
        <td style="padding: 8px;">
            <input type="text" value="${name}" placeholder="Role Name">
        </td>
        <td style="padding: 8px;">
            <select class="role-provider-select">
                <option value="openai" ${provider === 'openai' ? 'selected' : ''}>OpenAI</option>
                <option value="anthropic" ${provider === 'anthropic' ? 'selected' : ''}>Anthropic</option>
                <option value="gemini" ${provider === 'gemini' ? 'selected' : ''}>Gemini</option>
                <option value="local" ${provider === 'local' ? 'selected' : ''}>Local</option>
            </select>
        </td>
        <td style="padding: 8px;">
            <input type="text" value="${model}" placeholder="Model (Optional)">
        </td>
        <td><button class="btn btn-secondary btn-remove-role" style="padding:4px 8px;">✕</button></td>
    `;

    // Bind remove button
    const btnRemove = tr.querySelector('.btn-remove-role');
    btnRemove.addEventListener('click', () => {
        tr.remove();
    });

    tbody.appendChild(tr);
}

function renderWorkflowList() {
    const list = document.getElementById('workflow-list');
    if (!list) return;
    list.innerHTML = '';

    // "New Workflow" isn't a list item generally, but let's list existing ones
    STATE.workflows.forEach(wf => {
        const item = document.createElement('div');
        item.className = 'thread-item'; // Reuse styling
        item.innerHTML = `
            <div class="thread-title">${wf.name}</div>
            <div class="thread-time">${wf.filename}</div>
        `;
        item.onclick = () => {
            // Highlight
            list.querySelectorAll('.thread-item').forEach(i => i.classList.remove('active'));
            item.classList.add('active');

            // Load
            sendAction('load_workflow', { id: wf.id });
        };
        list.appendChild(item);
    });
}

function loadWorkflowToEditor(data) {
    if (!data) return;

    const nameInput = document.getElementById('wf-name-input');
    const routerSelect = document.getElementById('wf-router-select');
    const tbody = document.getElementById('wf-roles-body');

    if (nameInput) nameInput.value = data.name || "";
    if (routerSelect) routerSelect.value = data.router_agent || "";

    if (tbody) {
        tbody.innerHTML = "";
        const roles = data.roles || [];
        roles.forEach(r => {
            addRoleRow(tbody, r.role, r.provider, r.model || '');
        });

        if (roles.length === 0) {
            // add placeholders? maybe not if loading empty
        }
    }
}

// --- Toast Notifications ---
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.style.cssText = `
        background: var(--bg-card);
        color: var(--text-primary);
        padding: 12px 20px;
        margin-top: 10px;
        border-radius: 8px;
        border: 1px solid var(--border-color);
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        display: flex; align-items: center; gap: 10px;
        animation: slideIn 0.3s ease-out;
        min-width: 200px;
    `;

    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'error') icon = '❌';

    toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;

    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}



// --- Iframe Bridge API (Globals) ---
function exposeGlobalAPI() {
    // The iframes call parent.saveFunctionToServer, etc.

    window.saveFunctionToServer = (id, graphData) => {
        sendAction('save_function', { id, graph: graphData });
    };

    window.deleteFunctionFromServer = (id) => {
        sendAction('delete_function', { id });
    };

    window.saveStructToServer = (id, data) => {
        sendAction('save_struct', { id, data });
    };

    window.saveAgentToServer = (id, data) => {
        sendAction('save_agent', { id, graph: data });
    };

    window.requestServerFunction = (id) => {
        sendAction('load_function', { id: id });
    };

    window.requestServerAgent = (id) => {
        sendAction('load_agent', { id: id });
    };

    window.openFunctionEditor = (functionId) => {
        // Switch to function editor tab
        const tab = document.querySelector('.tab-btn[data-target="function-editor"]');
        if (tab) tab.click();

        // Wait a tick for iframe to be ready/visible then load
        setTimeout(() => {
            const frame = document.getElementById('frame-function-editor');
            if (frame && frame.contentWindow && frame.contentWindow.funcManager) {
                // This triggers the internal load logic which sets currentFunctionId 
                // and requests data from server if needed.
                frame.contentWindow.funcManager.loadFunction(functionId);
            } else {
                // Fallback if not ready
                sendAction('load_function', { id: functionId });
            }
        }, 100);
    };

    window.deleteStructFromServer = (id) => {
        sendAction('delete_struct', { id });
    };

    window.requestServerStructs = () => {
        requestStructs();
    };

    window.deleteAgentToServer = (id) => {
        sendAction('delete_agent', { id });
    };

    window.requestAgentList = () => {
        requestAgents();
    };
}

// --- Editor Mode ---
function notifyEditorMode(frameId, mode) {
    const frame = document.getElementById(frameId);
    if (!frame) return;

    // Helper to send
    const send = () => {
        if (frame.contentWindow && frame.contentWindow.setEditorMode) {
            frame.contentWindow.setEditorMode(mode);
        }
    };

    if (frame.contentWindow.setEditorMode) {
        send();
    } else {
        frame.addEventListener('load', send);
    }
}

// --- Helpers ---
function requestFunctions() { sendAction('get_functions'); }
function requestAgents() { sendAction('get_agents'); }
function requestWorkflows() { sendAction('get_workflows'); }
function requestStructs() { sendAction('get_structs'); }

// --- Chat & Threads Logic ---
function setupChatListeners() {
    const btnSend = document.getElementById('btn-send-chat');
    const input = document.getElementById('chat-input');
    const btnNewChat = document.getElementById('btn-new-chat');

    const sendMessage = () => {
        const text = input ? input.value.trim() : '';
        if (!text) return;

        const activeThreadId = STATE.sim_state?.active_thread_id;

        if (activeThreadId && STATE.sim_state.threads && STATE.sim_state.threads[activeThreadId]) {
            // Follow-up message in active thread
            sendAction('user_message', {
                message: text
            });
        } else {
            // Start new goal thread
            const workflowSelect = document.getElementById('chat-workflow-select');
            const workflowId = workflowSelect ? workflowSelect.value : null;

            if (!workflowId) {
                showToast('Please select a workflow before sending a message', 'error');
                return;
            }

            // Send to Backend
            sendAction('start_goal', {
                prompt: text,
                agent_id: workflowId
            });
        }

        if (input) input.value = '';
    };

    if (btnSend) {
        btnSend.addEventListener('click', sendMessage);
    }

    if (input) {
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
    }

    if (btnNewChat) {
        btnNewChat.addEventListener('click', () => {
            // Tell backend to clear active thread
            sendAction('clear_active_thread');

            const history = document.getElementById('chat-history');
            if (history) history.innerHTML = '<div class="message system"><div class="content">New session started. Select a workflow.</div></div>';
            delete history.dataset.lastCount;

            const select = document.getElementById('chat-workflow-select');
            if (select) select.value = '';
        });
    }
}

function renderThreadList() {
    const list = document.getElementById('thread-list');
    if (!list || !STATE.sim_state || !STATE.sim_state.threads) return;

    list.innerHTML = '';
    const threads = STATE.sim_state.threads;
    const activeId = STATE.sim_state.active_thread_id;

    Object.values(threads).forEach(t => {
        const item = document.createElement('div');
        item.className = `thread-item ${t.id === activeId ? 'active' : ''}`;

        // Use a default title if memory goal is missing
        const title = t.memory && t.memory.goal ? t.memory.goal : "Untitled Session";
        const shortTitle = title.length > 25 ? title.substring(0, 25) + '...' : title;

        item.innerHTML = `
            <div style="flex: 1; min-width: 0;">
                <div class="thread-title">${shortTitle}</div>
                <div class="thread-time">${t.status || 'active'}</div>
            </div>
            <button class="delete-thread-btn" title="Delete Thread">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2M10 11v6M14 11v6" />
                </svg>
            </button>
        `;

        item.onclick = (e) => {
            if (e.target.closest('.delete-thread-btn')) {
                e.stopPropagation();
                if (confirm(`Delete thread "${title}"?`)) {
                    sendAction('delete_thread', { id: t.id });
                }
                return;
            }
            // Notify backend that we are switching the active thread
            sendAction('switch_thread', { id: t.id });
        };

        list.appendChild(item);
    });

    // Auto-render chat for current active if first time
    renderThreadChat();

    // If no threads, show placeholder
    if (Object.keys(threads).length === 0) {
        list.innerHTML = `
            <div class="thread-item active">
                <div class="thread-title">Current Session</div>
                <div class="thread-time">Just now</div>
            </div>
        `;
    }
}

function renderThreadChat() {
    const history = document.getElementById('chat-history');
    if (!history) return;

    const activeId = STATE.sim_state?.active_thread_id;
    if (!activeId || !STATE.sim_state.threads[activeId]) return;

    const thread = STATE.sim_state.threads[activeId];
    const messages = thread.messages || [];

    // Force redraw if thread ID changed or message count changed
    if (history.dataset.lastThreadId === activeId && history.dataset.lastCount == messages.length) return;

    // Update tracking
    history.dataset.lastCount = messages.length;
    history.dataset.lastThreadId = activeId;

    history.innerHTML = '';
    messages.forEach(m => {
        appendChatMessage(m.role, m.content);
    });
}

function appendChatMessage(role, text) {
    const history = document.getElementById('chat-history');
    if (!history) return;

    // Remove initial placeholder if present
    const firstChild = history.children[0];
    if (history.children.length === 1 && firstChild && firstChild.textContent.includes('Select a workflow') && firstChild.textContent.includes('begin')) {
        history.innerHTML = '';
    }

    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${role}`;

    let avatarChar = '🤖';
    if (role === 'user') avatarChar = '👤';
    if (role === 'system') avatarChar = '⚙️';

    let contentHtml = text || '';

    // Parse Markdown if available
    if (typeof marked !== 'undefined' && contentHtml) {
        // Configure marked to use breaks (like GitHub comments)
        // We can do this once locally or globally, but here works too
        contentHtml = marked.parse(contentHtml, { breaks: true });
    } else {
        // Fallback
        contentHtml = contentHtml.replace(/\n/g, '<br>');
    }

    if (role === 'system') {
        msgDiv.innerHTML = `<div class="content">${contentHtml}</div>`;
    } else {
        msgDiv.innerHTML = `
            <div class="avatar">${avatarChar}</div>
            <div class="content markdown-body">${contentHtml}</div>
        `;
    }

    // Highlight Code Blocks
    if (typeof hljs !== 'undefined') {
        msgDiv.querySelectorAll('pre code').forEach((el) => {
            hljs.highlightElement(el);
        });
    }

    history.appendChild(msgDiv);
    history.scrollTop = history.scrollHeight;
}

function setupAutoRunToggle() {
    const btn = document.getElementById('btn-toggle-auto');
    if (!btn) return;

    btn.addEventListener('click', () => {
        if (STATE.auto_run) {
            sendAction('stop_auto');
        } else {
            sendAction('start_auto');
        }
    });
}

function updateAutoRunUI() {
    const icon = document.getElementById('auto-run-icon');
    const text = document.getElementById('auto-run-text');
    const btn = document.getElementById('btn-toggle-auto');
    if (!icon || !text || !btn) return;

    if (STATE.auto_run) {
        icon.textContent = '⏸️';
        text.textContent = 'Pause';
        btn.classList.add('active');
        btn.style.borderColor = 'var(--accent-primary)';
    } else {
        icon.textContent = '▶️';
        text.textContent = 'Run';
        btn.classList.remove('active');
        btn.style.borderColor = 'var(--border-color)';
    }
}

// Run
window.addEventListener('DOMContentLoaded', init);

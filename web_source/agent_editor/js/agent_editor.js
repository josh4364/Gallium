class AgentEditor {
    constructor() {
        this.canvas = document.getElementById('agent-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.container = document.getElementById('editor-container');

        // Data
        this.agentId = null;
        this.states = []; // { id, x, y, name, function_id, isStart }
        this.transitions = []; // { id, from, to, condition }

        // Viewport
        this.scale = 1;
        this.cameraX = 0;
        this.cameraY = 0;

        // Interaction
        this.isDragging = false;
        this.lastY = 0;
        this.selection = null; // { type: 'state'|'transition', id }
        this.dragNode = null;
        this.linkingNode = null;
        this.isLinkMode = false;

        // Settings
        this.STYLES = {
            arrowColor: '#858585',
            arrowSelected: '#fff',
            stateColor: '#2d2d30',
            startColor: '#388e3c',
            textColor: '#ccc'
        };

        // Context Menu
        this.contextMenu = document.getElementById('context-menu');
        this.contextMenuPos = { x: 0, y: 0 };

        this.functions = []; // Cache of available functions

        this.init();
    }

    init() {
        // Resize Handler
        window.addEventListener('resize', () => this.resize());
        this.resize();

        // Mouse Events
        this.canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
        this.canvas.addEventListener('mouseup', (e) => this.onMouseUp(e));
        this.canvas.addEventListener('wheel', (e) => this.onWheel(e));
        this.canvas.addEventListener('contextmenu', (e) => this.onContextMenu(e));

        // Global Key Events
        document.addEventListener('keydown', (e) => this.onKeyDown(e));

        // Context Menu Actions
        document.getElementById('ctx-add-state').onclick = () => {
            // Convert screen to world
            const wx = (this.contextMenuPos.x - this.cameraX) / this.scale;
            const wy = (this.contextMenuPos.y - this.cameraY) / this.scale;
            this.addStateAt(wx, wy);
            this.hideContextMenu();
        };
        document.getElementById('ctx-delete').onclick = () => {
            this.deleteSelection();
            this.hideContextMenu();
        };

        document.getElementById('ctx-connect').onclick = () => {
            if (this.stateForContextMenu) {
                this.linkingNode = this.stateForContextMenu;
                this.stateForContextMenu = null;
                this.render();
            }
            this.hideContextMenu();
        };

        window.importFunctionList = (list) => {
            this.functions = list;
            // Only refresh properties if we have a state selection (which has the function dropdown)
            // or if we have a transition selection (which might use functions)
            // but try to avoid it if possible to prevent focus lost.
            if (this.selection) {
                this.updatePropertiesPanel();
            }
        };

        // Request lists
        if (window.parent && window.parent.sendAction) {
            window.parent.sendAction('get_agents');
            window.parent.sendAction('get_functions');
        }

        // Bridge Setup
        window.setEditorMode = (mode) => {
            console.log("AgentEditor: Set mode", mode);
            // We are always 'agent' mode effectively in this editor
        };

        window.receiveServerFunction = (id, data) => {
            console.log("AgentEditor: Received data", id);
            // Load if it's the current agent, OR if we don't have one selected yet
            if (!this.agentId || this.agentId === id) {
                this.loadAgentData(id, data);
            }
        };

        window.importAgentList = (agents) => {
            this.onAgentListReceived(agents);
        };

        // Request list on load
        if (window.parent && window.parent.requestAgentList) {
            window.parent.requestAgentList();
        } else {
            // Fallback: try standard request if function exists on parent
            if (window.parent && window.parent.sendAction) window.parent.sendAction('get_agents');
        }

        // Request initial if ID present (or wait for parent)
        this.startLoop();
    }

    resize() {
        this.canvas.width = this.container.clientWidth;
        this.canvas.height = this.container.clientHeight;
        this.render();
    }

    // --- Data Management ---

    loadAgentData(id, data) {
        if (!data) data = {};
        this.agentId = id;
        const nameInput = document.getElementById('agent-name-input');
        if (nameInput) nameInput.value = data.name || id;

        // Parse data
        // Expect format: { states: [], transitions: [], ... }
        // If loading generic "graph" format, might need conversion, 
        // but let's assume we save/load this specific format for Agents now.
        if (!data.states && !data.nodes) {
            // New Agent
            this.states = [
                { id: 'start', x: 200, y: 300, name: 'Start', function_id: null, isStart: true }
            ];
            this.transitions = [];
        } else {
            // Load existing
            this.states = data.states || [];
            this.transitions = data.transitions || [];

            // Migrate conditions if they are still strings
            this.transitions.forEach(t => {
                if (typeof t.condition === 'string' && t.condition !== '' && !t.conditions) {
                    t.conditions = [{ key: 'status', op: '==', value: t.condition }];
                    delete t.condition;
                } else if (!t.conditions) {
                    t.conditions = [];
                }
            });

            // Ensure start exists
            if (!this.states.find(s => s.isStart)) {
                this.states.unshift({ id: 'start', x: 200, y: 300, name: 'Start', function_id: null, isStart: true });
            }
        }

        this.updatePropertiesPanel();
        this.render();
    }

    onAgentListReceived(agents) {
        const list = document.getElementById('agent-list');
        list.innerHTML = '';

        agents.forEach(agent => {
            const div = document.createElement('div');
            div.className = 'agent-item';
            if (agent.id === this.agentId) div.classList.add('active');
            div.textContent = agent.name || agent.id;
            div.onclick = () => {
                this.agentId = agent.id; // Mark as targeted for loading
                if (window.parent && window.parent.requestServerAgent) {
                    window.parent.requestServerAgent(agent.id);
                }
            };
            list.appendChild(div);
        });

        // If no agent loaded and list not empty, load first
        if (!this.agentId && agents.length > 0) {
            if (window.parent && window.parent.requestServerAgent) {
                window.parent.requestServerAgent(agents[0].id);
            }
        } else if (!this.agentId) {
            // Create default view
            this.createNewAgent(true); // Don't save yet, just view
        }
    }

    createNewAgent(viewOnly = false) {
        const newId = 'agent_' + Math.random().toString(36).substr(2, 6);
        this.loadAgentData(newId, { name: 'New Agent' });
        if (!viewOnly) this.save();
    }

    deleteCurrentAgent() {
        if (!this.agentId) return;
        if (confirm('Delete current agent completely?')) {
            if (window.parent && window.parent.deleteAgentToServer) {
                window.parent.deleteAgentToServer(this.agentId);
                this.agentId = null;
                // Clear view
                this.createNewAgent(true);
            }
        }
    }

    toggleLinkMode() {
        this.isLinkMode = !this.isLinkMode;
        const btn = document.getElementById('btn-connect');
        if (this.isLinkMode) {
            btn.style.background = 'rgba(0,122,204,0.5)';
            btn.style.border = '1px solid #007acc';
        } else {
            btn.style.background = '';
            btn.style.border = '';
        }
    }

    save() {
        if (!this.agentId) return;

        const nameInput = document.getElementById('agent-name-input');
        const data = {
            name: nameInput ? nameInput.value : 'Untitled Agent',
            states: this.states,
            transitions: this.transitions,
            type: 'agent'
        };

        if (window.parent && window.parent.saveAgentToServer) {
            window.parent.saveAgentToServer(this.agentId, data);
        }
    }

    addState() {
        // Add at center of screen
        const wx = (this.canvas.width / 2 - this.cameraX) / this.scale;
        const wy = (this.canvas.height / 2 - this.cameraY) / this.scale;
        this.addStateAt(wx, wy);
    }

    addStateAt(x, y) {
        // Transform screen to world (if x,y are screen coords, but here we expect mostly world or pre-processed)
        // Actually, let's keep addStateAt taking World Coords for clarity if called internally?
        // But context menu passes screen coords. Let's standarize.

        const id = 'state_' + Math.random().toString(36).substr(2, 6);
        this.states.push({
            id: id,
            x: x,
            y: y,
            name: 'New State',
            function_id: null,
            isStart: false
        });
        this.render();
        this.save();
    }

    deleteSelection() {
        if (!this.selection) return;

        if (this.selection.type === 'state') {
            const state = this.states.find(s => s.id === this.selection.id);
            if (state && state.isStart) return; // Cannot delete start

            this.states = this.states.filter(s => s.id !== this.selection.id);
            // Remove connections
            this.transitions = this.transitions.filter(t => t.from !== this.selection.id && t.to !== this.selection.id);
        } else if (this.selection.type === 'transition') {
            this.transitions = this.transitions.filter(t => t.id !== this.selection.id);
        }

        this.selection = null;
        this.updatePropertiesPanel();
        this.render();
        this.save();
    }

    // --- Interaction ---

    onMouseDown(e) {
        const mx = e.offsetX;
        const my = e.offsetY;
        const wx = (mx - this.cameraX) / this.scale;
        const wy = (my - this.cameraY) / this.scale;

        this.hideContextMenu();

        // Handle Linking Click (if initiated via Context Menu)
        if (this.linkingNode && !e.shiftKey && !this.isLinkMode) {
            const wx = (mx - this.cameraX) / this.scale;
            const wy = (my - this.cameraY) / this.scale;

            // Hit test for target
            const hitState = this.states.slice().reverse().find(s => {
                const dx = s.x - wx;
                const dy = s.y - wy;
                return dx * dx + dy * dy < 40 * 40;
            });

            if (hitState && hitState !== this.linkingNode) {
                this.createTransition(this.linkingNode, hitState);
            }
            // Always clear linking node on click (finish or cancel)
            this.linkingNode = null;
            this.render();
            return;
        }

        // Hit Test States
        // Simple circle hit test, r=40
        const hitState = this.states.slice().reverse().find(s => {
            const dx = s.x - wx;
            const dy = s.y - wy;
            return dx * dx + dy * dy < 40 * 40;
        });

        if (hitState) {
            if (e.shiftKey || this.isLinkMode) {
                // Start Linking
                this.linkingNode = hitState;
            } else {
                // Select / Drag
                this.selection = { type: 'state', id: hitState.id };
                this.dragNode = hitState;
                this.updatePropertiesPanel();
            }
        } else {
            // Hit Test Transitions
            const hitTransition = this.transitions.find(t => {
                const sFrom = this.states.find(s => s.id === t.from);
                const sTo = this.states.find(s => s.id === t.to);
                if (!sFrom || !sTo) return false;
                // Hit test loosely against the line
                return this.distToSegment({ x: wx, y: wy }, sFrom, sTo) < 10;
            });

            if (hitTransition) {
                this.selection = { type: 'transition', id: hitTransition.id };
                this.updatePropertiesPanel();
            } else {
                // Click on Background
                this.selection = null;
                this.updatePropertiesPanel();

                if (e.button === 0 || e.button === 1) {
                    this.isDragging = true;
                    this.lastX = mx;
                    this.lastY = my;
                }
            }
        }

        this.render();
    }

    createTransition(fromNode, toNode) {
        // Check if exists
        const exists = this.transitions.find(t => t.from === fromNode.id && t.to === toNode.id);
        if (!exists) {
            this.transitions.push({
                id: 'trans_' + Math.random().toString(36).substr(2, 6),
                from: fromNode.id,
                to: toNode.id,
                conditions: []
            });
            this.save();
        }
    }

    onMouseMove(e) {
        const mx = e.offsetX;
        const my = e.offsetY;
        const wx = (mx - this.cameraX) / this.scale;
        const wy = (my - this.cameraY) / this.scale;

        if (this.dragNode) {
            this.dragNode.x = wx;
            this.dragNode.y = wy;
            this.render();
        } else if (this.isDragging) {
            const dx = mx - this.lastX;
            const dy = my - this.lastY;
            this.cameraX += dx;
            this.cameraY += dy;
            this.lastX = mx;
            this.lastY = my;
            this.render();
        } else if (this.linkingNode) {
            this.render();
            // Draw temp line
            this.ctx.save();
            this.ctx.translate(this.cameraX, this.cameraY);
            this.ctx.scale(this.scale, this.scale);
            this.ctx.beginPath();
            this.ctx.moveTo(this.linkingNode.x, this.linkingNode.y);
            this.ctx.lineTo(wx, wy);
            this.ctx.strokeStyle = '#fff';
            this.ctx.stroke();

            // Draw temp arrow head
            const angle = Math.atan2(wy - this.linkingNode.y, wx - this.linkingNode.x);
            const headLen = 10;
            this.ctx.beginPath();
            this.ctx.moveTo(wx, wy);
            this.ctx.lineTo(wx - headLen * Math.cos(angle - Math.PI / 6), wy - headLen * Math.sin(angle - Math.PI / 6));
            this.ctx.lineTo(wx - headLen * Math.cos(angle + Math.PI / 6), wy - headLen * Math.sin(angle + Math.PI / 6));
            this.ctx.fillStyle = '#fff';
            this.ctx.fill();

            this.ctx.restore();
        }
    }

    onMouseUp(e) {
        if (this.dragNode) {
            this.dragNode = null;
            this.save();
        }

        if (this.linkingNode) {
            // Check drop target
            const mx = e.offsetX;
            const my = e.offsetY;
            const wx = (mx - this.cameraX) / this.scale;
            const wy = (my - this.cameraY) / this.scale;

            const hitState = this.states.find(s => {
                const dx = s.x - wx;
                const dy = s.y - wy;
                return dx * dx + dy * dy < 40 * 40;
            });

            if (hitState && hitState !== this.linkingNode) {
                this.createTransition(this.linkingNode, hitState);
            }
            this.linkingNode = null;

            // Auto-exit link mode if preference? Or keep it?
            // User requested "controls to create A connection". Singular implies one-off usually.
            // But for heavy editing, toggle is better.
            // I'll toggle it off for improved clarity unless they held shift.
            if (this.isLinkMode && !e.shiftKey) {
                this.toggleLinkMode();
            }

            this.render();
        }

        this.isDragging = false;
    }

    onWheel(e) {
        e.preventDefault();
        const delta = -Math.sign(e.deltaY) * 0.1;
        this.scale = Math.max(0.1, Math.min(5, this.scale + delta));
        this.render();
    }

    onContextMenu(e) {
        e.preventDefault();

        const mx = e.offsetX;
        const my = e.offsetY;
        const wx = (mx - this.cameraX) / this.scale;
        const wy = (my - this.cameraY) / this.scale;

        // Hit test state
        const hitState = this.states.slice().reverse().find(s => {
            const dx = s.x - wx;
            const dy = s.y - wy;
            return dx * dx + dy * dy < 40 * 40;
        });

        this.stateForContextMenu = hitState;

        const btnAdd = document.getElementById('ctx-add-state');
        const btnConnect = document.getElementById('ctx-connect');
        const btnDelete = document.getElementById('ctx-delete');

        if (hitState) {
            btnAdd.style.display = 'none';
            btnConnect.style.display = 'block';
            btnDelete.style.display = 'block';

            // Select it invisibly or just track it? 
            // Better to just track in stateForContextMenu
        } else {
            btnAdd.style.display = 'block';
            btnConnect.style.display = 'none';
            btnDelete.style.display = 'block'; // Can delete transitions?
        }

        this.contextMenu.style.display = 'block';
        this.contextMenu.style.left = e.pageX + 'px';
        this.contextMenu.style.top = e.pageY + 'px';
        this.contextMenuPos = { x: e.offsetX, y: e.offsetY }; // Store relative pos for adding
    }

    hideContextMenu() {
        this.contextMenu.style.display = 'none';
    }

    onKeyDown(e) {
        if (e.key === 'Delete' || e.key === 'Backspace') {
            if (document.activeElement.tagName !== 'INPUT') {
                this.deleteSelection();
            }
        }
    }


    distToSegment(p, v, w) {
        const l2 = (w.x - v.x) ** 2 + (w.y - v.y) ** 2;
        if (l2 === 0) return Math.hypot(p.x - v.x, p.y - v.y);
        let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
        t = Math.max(0, Math.min(1, t));
        return Math.hypot(p.x - (v.x + t * (w.x - v.x)), p.y - (v.y + t * (w.y - v.y)));
    }

    // --- Rendering ---

    render() {
        // Clear
        this.ctx.resetTransform();
        this.ctx.fillStyle = '#1e1e1e';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Grid
        this.drawGrid();

        // Transform
        this.ctx.translate(this.cameraX, this.cameraY);
        this.ctx.scale(this.scale, this.scale);

        // Draw Transitions
        this.transitions.forEach(t => {
            const from = this.states.find(s => s.id === t.from);
            const to = this.states.find(s => s.id === t.to);
            if (from && to) this.drawArrow(from, to, t, t.id === (this.selection && this.selection.id));
        });

        // Draw States
        this.states.forEach(s => {
            this.drawState(s, this.selection && this.selection.type === 'state' && this.selection.id === s.id);
        });
    }

    drawGrid() {
        // ... (Optional: Standard grid drawing code)
    }

    drawState(state, isSelected) {
        const r = 40;

        this.ctx.beginPath();
        this.ctx.arc(state.x, state.y, r, 0, Math.PI * 2);

        this.ctx.fillStyle = state.isStart ? '#388e3c' : '#2d2d30';
        this.ctx.fill();

        this.ctx.lineWidth = isSelected ? 3 : 1;
        this.ctx.strokeStyle = state.isStart ? '#66bb6a' : '#007acc';
        this.ctx.stroke();

        // Label
        this.ctx.fillStyle = 'white';
        this.ctx.font = '12px Inter';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(state.name, state.x, state.y);
    }

    drawArrow(from, to, transition, isSelected) {
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const angle = Math.atan2(dy, dx);

        // Adjust start/end to be on circle edge (r=40)
        const r = 40;
        const startX = from.x + Math.cos(angle) * r;
        const startY = from.y + Math.sin(angle) * r;
        const endX = to.x - Math.cos(angle) * r;
        const endY = to.y - Math.sin(angle) * r;

        this.ctx.beginPath();
        this.ctx.moveTo(startX, startY);
        this.ctx.lineTo(endX, endY);
        this.ctx.strokeStyle = isSelected ? this.STYLES.arrowSelected : this.STYLES.arrowColor;
        this.ctx.lineWidth = isSelected ? 3 : 2;
        this.ctx.stroke();

        // Arrowhead
        const headLen = 12;
        this.ctx.beginPath();
        this.ctx.moveTo(endX, endY);
        this.ctx.lineTo(endX - headLen * Math.cos(angle - Math.PI / 6), endY - headLen * Math.sin(angle - Math.PI / 6));
        this.ctx.lineTo(endX - headLen * Math.cos(angle + Math.PI / 6), endY - headLen * Math.sin(angle + Math.PI / 6));
        this.ctx.fillStyle = isSelected ? this.STYLES.arrowSelected : this.STYLES.arrowColor;
        this.ctx.fill();

        // Label (Condition)
        const conditionText = (transition.conditions || []).map(c => `${c.key}${c.op}${c.value}`).join(' & ');
        if (conditionText) {
            const midX = (startX + endX) / 2;
            const midY = (startY + endY) / 2;

            this.ctx.save();
            this.ctx.translate(midX, midY);
            // Optionally rotate text with line? No, keep it horizontal for readability usually.
            // But let's offset it slightly up
            this.ctx.translate(0, -10);

            this.ctx.fillStyle = this.STYLES.textColor;
            this.ctx.font = '11px Fira Code';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';

            // Background for text
            const textMetrics = this.ctx.measureText(conditionText);
            const pad = 4;
            this.ctx.fillStyle = '#1e1e1e';
            this.ctx.fillRect(-textMetrics.width / 2 - pad, -8, textMetrics.width + pad * 2, 16);

            this.ctx.fillStyle = isSelected ? '#fff' : '#ccc';
            this.ctx.fillText(conditionText, 0, 0);
            this.ctx.restore();
        }
    }

    // --- UI Updates ---
    updatePropertiesPanel() {
        const panel = document.getElementById('properties-content');
        panel.innerHTML = '';

        if (this.selection && this.selection.type === 'state') {
            const state = this.states.find(s => s.id === this.selection.id);
            if (!state) return;

            // Build function options
            let funcOptions = `<option value="">-- No Function (Wait) --</option>`;
            this.functions.forEach(f => {
                const sel = (state.function_id === f.id) ? 'selected' : '';
                funcOptions += `<option value="${f.id}" ${sel}>${f.name}</option>`;
            });

            panel.innerHTML = `
                <div class="form-group">
                    <label>State Name</label>
                    <input type="text" id="prop-name" value="${state.name}">
                </div>
                <div class="form-group">
                    <label>Function Logic</label>
                    <select id="prop-func">
                        ${funcOptions}
                    </select>
                    <button class="action-btn" id="btn-create-func" style="margin-top:4px;">Create / Open Function</button>
                    <div style="font-size:10px; color:#666; margin-top:4px;">Logic to execute when entering this state.</div>
                </div>
                ${state.isStart ? `
                <div class="form-group">
                    <p style="font-size:11px; color:#aaa;">The Start State receives the initial User Prompt.</p>
                </div>` : ''}
            `;

            const nameInput = document.getElementById('prop-name');
            nameInput.onchange = (e) => {
                state.name = e.target.value;
                this.render();
                this.save();
            };

            const funcInput = document.getElementById('prop-func');
            funcInput.onchange = (e) => {
                state.function_id = e.target.value;
                this.save();
            };

            document.getElementById('btn-create-func').onclick = () => {
                let funcId = state.function_id;
                const isNew = !funcId;

                if (isNew) {
                    funcId = 'func_' + Math.random().toString(36).substr(2, 9);
                    state.function_id = funcId;

                    // Initialize with Context Input signature
                    const initialData = {
                        name: state.name + " Logic",
                        description: "Logic for agent state: " + state.name,
                        inputs: [
                            { id: 'in_ctx', name: 'ctx', type: 'context' }
                        ],
                        outputs: [],
                        nodes: [],
                        connections: []
                    };

                    if (window.parent && window.parent.saveFunctionToServer) {
                        window.parent.saveFunctionToServer(funcId, initialData);
                    }

                    this.save();
                    this.updatePropertiesPanel();
                }

                // Request Parent to Switch Tab
                if (window.parent && window.parent.openFunctionEditor) {
                    window.parent.openFunctionEditor(funcId);
                }
            };
        } else if (this.selection && this.selection.type === 'transition') {
            const trans = this.transitions.find(t => t.id === this.selection.id);
            if (!trans) return;

            if (!trans.conditions) trans.conditions = [];

            panel.innerHTML = `
                <div class="form-group">
                    <label>Transition Conditions</label>
                    <div id="conditions-list">
                        ${trans.conditions.map((c, i) => `
                            <div class="conditional-row">
                                <input type="text" class="cond-key" data-index="${i}" value="${c.key || ''}" placeholder="key">
                                <select class="cond-op" data-index="${i}">
                                    <option value="==" ${c.op === '==' ? 'selected' : ''}>==</option>
                                    <option value="!=" ${c.op === '!=' ? 'selected' : ''}>!=</option>
                                    <option value=">" ${c.op === '>' ? 'selected' : ''}>&gt;</option>
                                    <option value="<" ${c.op === '<' ? 'selected' : ''}>&lt;</option>
                                    <option value="contains" ${c.op === 'contains' ? 'selected' : ''}>contains</option>
                                </select>
                                <input type="text" class="cond-value" data-index="${i}" value="${c.value || ''}" placeholder="value">
                                <button class="remove-btn" data-index="${i}">&times;</button>
                            </div>
                        `).join('')}
                    </div>
                    <button class="add-row-btn" id="btn-add-condition">+ Add Condition</button>
                    <div style="font-size:10px; color:#666; margin-top:8px;">
                        Transitions occur when all conditions match keys in the context.
                    </div>
                </div>
            `;

            // Bind events
            panel.querySelectorAll('.cond-key').forEach(input => {
                input.oninput = (e) => { // Use oninput for immediate update, but maybe save on blur?
                    const idx = e.target.dataset.index;
                    trans.conditions[idx].key = e.target.value;
                    this.render(); // Immediate feedback
                };
                input.onblur = () => this.save();
            });

            panel.querySelectorAll('.cond-op').forEach(select => {
                select.onchange = (e) => {
                    const idx = e.target.dataset.index;
                    trans.conditions[idx].op = e.target.value;
                    this.render();
                    this.save();
                };
            });

            panel.querySelectorAll('.cond-value').forEach(input => {
                input.oninput = (e) => {
                    const idx = e.target.dataset.index;
                    trans.conditions[idx].value = e.target.value;
                    this.render();
                };
                input.onblur = () => this.save();
            });

            panel.querySelectorAll('.remove-btn').forEach(btn => {
                btn.onclick = (e) => {
                    const idx = e.target.dataset.index;
                    trans.conditions.splice(idx, 1);
                    this.updatePropertiesPanel();
                    this.render();
                    this.save();
                };
            });

            document.getElementById('btn-add-condition').onclick = () => {
                trans.conditions.push({ key: '', op: '==', value: '' });
                this.updatePropertiesPanel();
                this.save();
            };
        }
        else {
            panel.innerHTML = `<div class="empty-state">Select a state or transition to edit properties</div>`;

            // Show Agent Properties when nothing selected?
            if (this.agentId) {
                // Maybe add agent description here later
            }
        }
    }

    startLoop() {
        const loop = () => {
            this.render();
            requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
    }
}

const agentEditor = new AgentEditor();

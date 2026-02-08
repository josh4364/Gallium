Object.assign(NodeGraph.prototype, {
    initPaletteEvents() {
        const header = this.paletteEl.querySelector('.window-header');
        if (!header) return;

        let isDraggingPalette = false;
        let startX, startY;

        header.onmousedown = (e) => {
            isDraggingPalette = true;
            startX = e.clientX - this.paletteEl.offsetLeft;
            startY = e.clientY - this.paletteEl.offsetTop;
            e.preventDefault();
            e.stopPropagation(); // Prevent closing on move start
        };

        window.addEventListener('mousemove', (e) => {
            if (isDraggingPalette) {
                this.paletteEl.style.left = (e.clientX - startX) + 'px';
                this.paletteEl.style.top = (e.clientY - startY) + 'px';
            }
        });

        window.addEventListener('mouseup', () => {
            isDraggingPalette = false;
        });

        if (this.paletteSearch) {
            this.paletteSearch.oninput = () => this.renderPalette();
            this.paletteSearch.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    const query = this.paletteSearch.value.trim().toLowerCase();
                    if (query && this.nodeRegistry) {
                        const filtered = this.nodeRegistry.filter(node =>
                            node.name.toLowerCase().includes(query) ||
                            (node.tags && node.tags.some(t => t.toLowerCase().includes(query)))
                        );

                        if (filtered.length > 0) {
                            // Spawn the first match
                            this.addNode(filtered[0].type, this.menuX, this.menuY, null, filtered[0].params);
                            this.closePalette();
                            e.preventDefault();
                            e.stopPropagation();
                        }
                    }
                }
            });
        }

        // Block clicks on palette from reaching graph or global closure listener
        this.paletteEl.addEventListener('mousedown', (e) => {
            e.stopPropagation();
        });

        this.paletteEl.addEventListener('wheel', (e) => e.stopPropagation());
        this.paletteEl.addEventListener('contextmenu', (e) => e.stopPropagation());

        // Close on click outside (only on the initial down-click)
        window.addEventListener('mousedown', (e) => {
            if (this.paletteVisible && !this.paletteEl.contains(e.target)) {
                this.closePalette();
            }
        });
    },

    openPalette(clientX, clientY) {
        if (!this.paletteEl) return;
        this.paletteVisible = true;
        this.paletteEl.style.display = 'flex';
        this.paletteEl.style.left = clientX + 'px';
        this.paletteEl.style.top = clientY + 'px';

        const rect = this.container.getBoundingClientRect();
        this.menuX = (clientX - rect.left - this.panX) / this.zoomLevel;
        this.menuY = (clientY - rect.top - this.panY) / this.zoomLevel;

        if (this.paletteSearch) {
            this.paletteSearch.value = '';
            setTimeout(() => this.paletteSearch.focus(), 10);
        }
        this.renderPalette();
    },

    renderPalette() {
        if (!this.paletteList) return;
        const query = (this.paletteSearch ? this.paletteSearch.value : "").trim().toLowerCase();
        this.paletteList.innerHTML = '';

        if (!this.nodeRegistry) return;

        // Combine registry nodes with available functions
        // Filter out generic function_call from the registry list so it doesn't show up in palette
        let searchList = this.nodeRegistry.filter(n => n.type !== 'function_call');

        if (window.funcManager && window.funcManager.functionDB) {
            const funcs = window.funcManager.functionDB.getAllFunctions();
            funcs.forEach(f => {
                if (f.id !== window.funcManager.currentFunctionId) {
                    searchList.push({
                        type: 'function_call',
                        name: 'Call: ' + f.name,
                        tags: [...f.tags, 'Function', 'call'],
                        params: { functionId: f.id },
                        isFunction: true
                    });
                }
            });
        }

        // Add user structures
        if (window.typeDB) {
            window.typeDB.getStructs().forEach(s => {
                const category = s.tag && s.tag.trim() ? s.tag.trim() : 'Struct';
                searchList.push({
                    type: 'struct_make',
                    name: 'Make ' + s.name,
                    tags: [category, 'make', s.name],
                    params: { structId: s.id }
                });
                searchList.push({
                    type: 'struct_access',
                    name: 'Access ' + s.name,
                    tags: [category, 'access', s.name],
                    params: { structId: s.id }
                });
            });

            // Add List/Map generic nodes
            searchList.push({
                type: 'list_create',
                name: 'Create List',
                tags: ['List', 'array', 'new'],
                params: { element_type: 'any_not_exec', num_elements: 1 }
            });
            searchList.push({
                type: 'list_get',
                name: 'List Get',
                tags: ['List', 'array', 'get'],
                params: { element_type: 'any_not_exec' }
            });
            searchList.push({
                type: 'list_set',
                name: 'List Set',
                tags: ['List', 'array', 'set'],
                params: { element_type: 'any_not_exec' }
            });
            searchList.push({
                type: 'list_add',
                name: 'List Add',
                tags: ['List', 'array', 'push'],
                params: { element_type: 'any_not_exec' }
            });
            searchList.push({
                type: 'list_remove_at',
                name: 'List Remove At',
                tags: ['List', 'array', 'delete'],
                params: { element_type: 'any_not_exec' }
            });

            // Map Generic Nodes
            searchList.push({
                type: 'map_create',
                name: 'Create Map',
                tags: ['Map', 'dictionary', 'new'],
                params: { key_type: 'string', value_type: 'any_not_exec' }
            });
            searchList.push({
                name: 'Map Get',
                type: 'map_get',
                tags: ['Map', 'dictionary', 'get'],
                params: { key_type: 'string', value_type: 'any_not_exec' }
            });
            searchList.push({
                name: 'Map Set',
                type: 'map_set',
                tags: ['Map', 'dictionary', 'set'],
                params: { key_type: 'string', value_type: 'any_not_exec' }
            });
            searchList.push({
                name: 'Map Remove',
                type: 'map_remove',
                tags: ['Map', 'dictionary', 'delete'],
                params: { key_type: 'string', value_type: 'any_not_exec' }
            });
        }

        // Add variables from Set Variable nodes
        const variables = new Set();
        this.nodes.forEach(n => {
            if (n.type === 'set_variable' && n.params.name) {
                variables.add(n.params.name);
            }
        });

        variables.forEach(varName => {
            searchList.push({
                type: 'get_variable',
                name: `Get: ${varName}`,
                tags: ['Data', 'variable', 'get', varName],
                params: { name: varName }
            });
        });

        const filtered = searchList.filter(node => {
            if (query === '') return true;
            return node.name.toLowerCase().includes(query) ||
                (node.tags && node.tags.some(t => t.toLowerCase().includes(query)));
        });

        if (query === '') {
            const categories = {};
            filtered.forEach(node => {
                let cat = (node.tags && node.tags[0]) || 'General';
                // Normalize to Title Case for case-insensitive grouping
                cat = cat.charAt(0).toUpperCase() + cat.slice(1).toLowerCase();

                if (!categories[cat]) categories[cat] = [];
                categories[cat].push(node);
            });

            Object.keys(categories).sort().forEach(cat => {
                const catEl = document.createElement('div');
                const isExpanded = this.expandedCategories.has(cat);
                catEl.className = `category-item ${!isExpanded ? 'collapsed' : ''}`;
                catEl.innerHTML = cat; // Use innerHTML for potential styling
                if (cat === 'Function') catEl.style.color = 'var(--secondary-accent)';

                catEl.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
                catEl.onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (this.expandedCategories.has(cat)) this.expandedCategories.delete(cat);
                    else this.expandedCategories.add(cat);
                    this.renderPalette();
                };
                this.paletteList.appendChild(catEl);

                if (isExpanded) {
                    categories[cat].forEach(node => {
                        this.paletteList.appendChild(this.createPaletteItem(node));
                    });
                }
            });
        } else {
            if (filtered.length === 0) {
                const noRes = document.createElement('div');
                noRes.className = 'menu-item';
                noRes.textContent = 'No results found';
                this.paletteList.appendChild(noRes);
            } else {
                filtered.forEach(node => {
                    this.paletteList.appendChild(this.createPaletteItem(node));
                });
            }
        }
    },

    createPaletteItem(node) {
        const div = document.createElement('div');
        div.className = 'menu-item';
        div.textContent = node.name;

        div.addEventListener('mouseenter', (e) => {
            this.showPaletteTooltip(node, e.target);
        });

        div.addEventListener('mouseleave', () => {
            this.hidePaletteTooltip();
        });

        div.onclick = () => {
            this.addNode(node.type, this.menuX, this.menuY, null, node.params);
            this.closePalette();
        };
        return div;
    },

    showPaletteTooltip(node, targetEl) {
        if (!this.paletteTooltip) {
            this.paletteTooltip = document.createElement('div');
            this.paletteTooltip.className = 'palette-tooltip';
            document.body.appendChild(this.paletteTooltip);
        }

        let inputs = [];
        let outputs = [];
        let description = "";
        let title = node.name;
        let tags = node.tags || [];

        // 1. Resolve Function Calls
        if (node.isFunction && window.funcManager) {
            const f = window.funcManager.functionDB.getFunction(node.params.functionId);
            if (f) {
                description = f.description || "Function Call";
                // Construct inputs/outputs for display
                inputs = [{ label: 'exec_in', type: 'exec' }];
                f.inputs.forEach(i => inputs.push({ label: i.name, type: i.type }));

                outputs = [{ label: 'exec_out', type: 'exec' }];
                f.outputs.forEach(o => outputs.push({ label: o.name, type: o.type }));
            }
        }
        // 2. Resolve Registry Nodes
        else {
            inputs = node.inputs || [];
            outputs = node.outputs || [];

            // Try to get description from node registry or params
            description = node.description || (node.params && node.params.description) || "";

            // Special handling for dynamic nodes
            if (node.type === 'set_variable') {
                description = "Set the value of a local variable.";
                inputs = [{ label: 'exec_in', type: 'exec' }, { label: 'Value', type: 'any_not_exec' }];
                outputs = [{ label: 'exec_out', type: 'exec' }];
            } else if (node.type === 'get_variable') {
                description = "Get the value of a local variable.";
                outputs = [{ label: 'Value', type: 'any_not_exec' }];
            }
        }

        let html = `
            <div class="tooltip-header">
                <div class="tooltip-title">${title}</div>
                ${tags.length > 0 ? `<div class="tooltip-tags">${tags.map(t => `<span class="tooltip-tag">${t}</span>`).join('')}</div>` : ''}
            </div>
        `;

        if (description) {
            html += `<div class="tooltip-description">${description}</div>`;
        }

        if (inputs && inputs.length > 0) {
            html += `
                <div class="tooltip-io-section">
                    <div class="tooltip-section-header">Inputs</div>
                    ${inputs.map(i => `
                        <div class="tooltip-row">
                            <span class="label">${i.label || i.name || i.key}</span>
                            <span class="type type-${(i.type || 'any').split(':')[0]}">${i.type || 'any'}</span>
                        </div>
                    `).join('')}
                </div>
            `;
        }

        if (outputs && outputs.length > 0) {
            html += `
                <div class="tooltip-io-section" style="margin-top: 8px;">
                    <div class="tooltip-section-header">Outputs</div>
                    ${outputs.map(o => `
                        <div class="tooltip-row">
                            <span class="label">${o.label || o.name || o.key}</span>
                            <span class="type type-${(o.type || 'any').split(':')[0]}">${o.type || 'any'}</span>
                        </div>
                    `).join('')}
                </div>
            `;
        }

        this.paletteTooltip.innerHTML = html;
        this.paletteTooltip.classList.add('visible');

        // Position
        const rect = targetEl.getBoundingClientRect();
        // Position to the right of the menu
        let left = rect.right + 10;
        let top = rect.top;

        // Check bounds
        if (left + 280 > window.innerWidth) {
            // detailed tooltip might be better on the left if no space on right
            left = rect.left - 290;
        }

        // Prevent off-screen bottom
        // We need to wait for render to get height, or approximate
        // But since we set innerHTML, the height should be available if we query it now?
        // Actually, sometimes browser needs a frame. But let's try.
        const tooltipHeight = this.paletteTooltip.offsetHeight || 200; // heuristic
        if (top + tooltipHeight > window.innerHeight) {
            top = window.innerHeight - tooltipHeight - 10;
        }

        this.paletteTooltip.style.left = left + 'px';
        this.paletteTooltip.style.top = top + 'px';
    },

    hidePaletteTooltip() {
        if (this.paletteTooltip) {
            this.paletteTooltip.classList.remove('visible');
        }
    },

    closePalette() {
        if (this.paletteEl) {
            this.paletteEl.style.display = 'none';
        }
        this.paletteVisible = false;
        this.hidePaletteTooltip();
    },

    addNode(type, x, y, id = null, params = null, savedInputs = null, savedOutputs = null, width = null, height = null) {
        let nodeDef = this.nodeRegistry.find(n => n.type === type);

        // If not in registry, check for dynamic types
        if (!nodeDef) {
            if (type === 'function_call') {
                nodeDef = this.nodeRegistry.find(n => n.type === 'function_call');
            } else if (type.startsWith('struct_') || type.startsWith('list_') || type.startsWith('map_')) {
                nodeDef = {
                    type: type,
                    name: type,
                    params: params || {}
                };
            }
        }

        if (!nodeDef) {
            console.error(`Node type ${type} not found in registry`);
            return null;
        }

        const nodeParams = params ? JSON.parse(JSON.stringify(params)) : JSON.parse(JSON.stringify(nodeDef.params || {}));
        const nodeId = id || 'node_' + Math.random().toString(36).substr(2, 9);
        let nodeTitle = nodeDef.name;
        let isFunctionCall = false;
        let funcRef = null;

        // Force title update and resolve function ref
        if (type === 'function_call' && nodeParams && nodeParams.functionId && window.funcManager) {
            funcRef = window.funcManager.functionDB.getFunction(nodeParams.functionId);
            if (funcRef) {
                nodeTitle = funcRef.name;
                isFunctionCall = true;
            } else {
                nodeTitle = "Missing: " + (nodeParams.functionName || "Function");
                nodeParams.error = "Function Missing";
            }
        }

        let inputs = [];
        let outputs = [];

        // Logic for Inputs
        if (isFunctionCall && funcRef) {
            // Smart Merge for Function Call Inputs
            let execId = null;
            if (savedInputs) {
                const savedExec = savedInputs.find(i => i.type === 'exec');
                if (savedExec) execId = savedExec.id;
            }
            inputs.push({
                label: 'exec_in',
                type: 'exec',
                id: execId || (nodeId + '_in_exec')
            });

            const usedInputIds = new Set();
            if (execId) usedInputIds.add(execId);

            funcRef.inputs.forEach(def => {
                let pid = null;

                // 1. Try to find existing ID by key (name) + type
                if (savedInputs) {
                    const match = savedInputs.find(i => !usedInputIds.has(i.id) && i.key === def.name && i.type === def.type);
                    if (match) pid = match.id;
                }
                // 2. Fallback: Label match + type
                if (!pid && savedInputs) {
                    const matchLabel = savedInputs.find(i => !usedInputIds.has(i.id) && i.label === def.name && i.type === def.type);
                    if (matchLabel) pid = matchLabel.id;
                }
                // 3. Fallback: Loose match by Name/Key (ignore type mismatch)
                if (!pid && savedInputs) {
                    const matchLoose = savedInputs.find(i => !usedInputIds.has(i.id) && (i.key === def.name || i.label === def.name));
                    if (matchLoose) pid = matchLoose.id;
                }
                // 4. Fallback: Heuristic Match by Type (First available of same type)
                if (!pid && savedInputs) {
                    const matchType = savedInputs.find(i => !usedInputIds.has(i.id) && i.type === def.type);
                    if (matchType) pid = matchType.id;
                }

                if (!pid) {
                    pid = nodeId + '_' + (def.name.toLowerCase().replace(/\s+/g, '_') + '_' + Math.random().toString(36).substr(2, 4));
                }

                if (pid) usedInputIds.add(pid);

                inputs.push({
                    label: def.name,
                    type: def.type,
                    key: def.name,
                    id: pid
                });
            });

        } else if (savedInputs) {
            // Standard restore
            inputs = savedInputs.map(i => ({ ...i }));
        } else {
            // Fresh creation
            let rawInputs = nodeDef.inputs || [];
            if (type === 'function_return' && window.funcManager) {
                const curFunc = window.funcManager.functionDB.getFunction(window.funcManager.currentFunctionId);
                if (curFunc) {
                    // Match FunctionManager.updateFunctionReturnNode logic:
                    // ID: node.id + '_flow' for Exec
                    // ID: node.id + '_in_' + output.id for others

                    // We construct explicit IDs here so the map below doesn't mess it up
                    inputs = [];
                    inputs.push({
                        label: 'exec_in', type: 'exec', id: nodeId + '_flow'
                    });

                    curFunc.outputs.forEach(o => {
                        inputs.push({
                            label: o.name,
                            type: o.type,
                            key: o.id,
                            id: nodeId + '_in_' + o.id
                        });
                    });

                    // Bypass the map below
                }
            } else if (!isFunctionCall) {
                // If it IS a function call but MISSING, we might want default ports?
                if (type === 'function_call' && !funcRef) {
                    // Empty or Error ports
                }
            }

            if (inputs.length === 0 && rawInputs.length > 0) {
                inputs = rawInputs.map(input => ({
                    ...input,
                    id: nodeId + '_' + (input.key || input.label.toLowerCase().replace(/\s+/g, '_') + '_' + Math.random().toString(36).substr(2, 4))
                }));
            }

            // Dynamic input logic for string_format
            if (type === 'string_format' && inputs.length === 0) {
                const format = nodeParams.format || '';
                const count = (format.match(/{}/g) || []).length;
                for (let i = 1; i <= count; i++) {
                    const key = `arg${i}`;
                    inputs.push({
                        label: `Arg ${i}`,
                        type: 'any_not_exec',
                        key: key,
                        id: `${nodeId}_in_${key}_${Math.random().toString(36).substr(2, 4)}`
                    });
                    if (nodeParams[key] === undefined) {
                        nodeParams[key] = null;
                    }
                }
            }
        }


        // Logic for Outputs
        if (isFunctionCall && funcRef) {
            // Smart Merge for Function Call Outputs
            let execId = null;
            if (savedOutputs) {
                const savedExec = savedOutputs.find(o => o.type === 'exec');
                if (savedExec) execId = savedExec.id;
            }
            outputs.push({
                label: 'exec_out',
                type: 'exec',
                id: execId || (nodeId + '_out_exec')
            });

            const usedOutputIds = new Set();
            if (execId) usedOutputIds.add(execId);

            funcRef.outputs.forEach(def => {
                let pid = null;
                if (savedOutputs) {
                    const match = savedOutputs.find(o => !usedOutputIds.has(o.id) && o.key === def.name && o.type === def.type);
                    if (match) pid = match.id;
                }
                if (!pid && savedOutputs) {
                    const matchLabel = savedOutputs.find(o => !usedOutputIds.has(o.id) && o.label === def.name && o.type === def.type);
                    if (matchLabel) pid = matchLabel.id;
                }
                // Fallback: Loose match by Name/Key
                if (!pid && savedOutputs) {
                    const matchLoose = savedOutputs.find(o => !usedOutputIds.has(o.id) && (o.key === def.name || o.label === def.name));
                    if (matchLoose) pid = matchLoose.id;
                }
                // Fallback: Heuristic Match by Type
                if (!pid && savedOutputs) {
                    const matchType = savedOutputs.find(o => !usedOutputIds.has(o.id) && o.type === def.type);
                    if (matchType) pid = matchType.id;
                }

                if (!pid) {
                    pid = nodeId + '_' + (def.name.toLowerCase().replace(/\s+/g, '_') + '_' + Math.random().toString(36).substr(2, 4));
                }

                if (pid) usedOutputIds.add(pid);

                outputs.push({
                    label: def.name,
                    type: def.type,
                    key: def.name,
                    id: pid
                });
            });

        } else if (savedOutputs) {
            outputs = savedOutputs.map(o => ({ ...o }));
        } else {
            let rawOutputs = nodeDef.outputs || [];
            if (type === 'start' && window.funcManager) {
                const curFunc = window.funcManager.functionDB.getFunction(window.funcManager.currentFunctionId);
                if (curFunc) {
                    // Match FunctionManager.updateFunctionInputNode logic:
                    // ID: node.id + '_flow' for Exec
                    // ID: node.id + '_out_' + input.id for others
                    outputs = [];
                    outputs.push({
                        label: 'exec_out', type: 'exec', id: nodeId + '_flow'
                    });
                    curFunc.inputs.forEach(i => {
                        outputs.push({
                            label: i.name,
                            type: i.type,
                            key: i.id,
                            id: nodeId + '_out_' + i.id
                        });
                    });
                }
            }

            if (outputs.length === 0 && rawOutputs.length > 0) {
                outputs = rawOutputs.map(output => ({
                    ...output,
                    id: nodeId + '_' + (output.key || output.label.toLowerCase().replace(/\s+/g, '_') + '_' + Math.random().toString(36).substr(2, 4))
                }));
            }
        }

        // Logic for Dynamic Port Nodes (Struct/List/Map)
        if (type === 'struct_access' && nodeParams.structId && window.typeDB) {
            const s = window.typeDB.getStruct(nodeParams.structId);
            if (s) {
                nodeTitle = "Access " + s.name;
                inputs = [{ label: 'Object', type: 'struct:' + s.id, key: 'object', id: nodeId + '_obj' }];
                outputs = s.fields.map(f => ({
                    label: f.name,
                    type: f.type,
                    key: f.name,
                    id: nodeId + '_out_' + f.name
                }));
            }
        } else if (type === 'struct_make' && nodeParams.structId && window.typeDB) {
            const s = window.typeDB.getStruct(nodeParams.structId);
            if (s) {
                nodeTitle = "Make " + s.name;
                outputs = [{ label: 'Object', type: 'struct:' + s.id, id: nodeId + '_obj' }];
                inputs = s.fields.map(f => ({
                    label: f.name,
                    type: f.type,
                    key: f.name,
                    id: nodeId + '_in_' + f.name
                }));
            }
        } else if (type.startsWith('list_') && nodeParams.element_type) {
            const elType = nodeParams.element_type;
            const details = window.typeDB.getTypeDetails(elType);
            const listType = 'list:' + elType;

            if (type === 'list_create') {
                nodeTitle = "Create List" + (elType === 'any_not_exec' ? "" : " (" + details.name + ")");
                inputs = [
                    { label: 'num_elements', type: 'number', key: 'num_elements', id: nodeId + '_count' }
                ];
                outputs = [{ label: 'List', type: listType, key: 'list', id: nodeId + '_out' }];
            } else if (type === 'list_get') {
                nodeTitle = "List Get" + (elType === 'any_not_exec' ? "" : " (" + details.name + ")");
                inputs = [
                    { label: 'List', type: (elType === 'any_not_exec' ? 'any_not_exec' : listType), key: 'list', id: nodeId + '_list' },
                    { label: 'Index', type: 'number', key: 'index', id: nodeId + '_index' }
                ];
                outputs = [{ label: 'Value', type: elType, key: 'value', id: nodeId + '_val' }];
            } else if (type === 'list_set') {
                nodeTitle = "List Set" + (elType === 'any_not_exec' ? "" : " (" + details.name + ")");
                inputs = [
                    { label: 'exec_in', type: 'exec', id: nodeId + '_exec_in' },
                    { label: 'List', type: (elType === 'any_not_exec' ? 'any_not_exec' : listType), key: 'list', id: nodeId + '_list' },
                    { label: 'Index', type: 'number', key: 'index', id: nodeId + '_index' },
                    { label: 'Value', type: elType, key: 'value', id: nodeId + '_val' }
                ];
                outputs = [
                    { label: 'exec_out', type: 'exec', id: nodeId + '_exec_out' },
                    { label: 'List', type: (elType === 'any_not_exec' ? 'any_not_exec' : listType), key: 'list', id: nodeId + '_out' }
                ];
            } else if (type === 'list_add') {
                nodeTitle = "List Add" + (elType === 'any_not_exec' ? "" : " (" + details.name + ")");
                inputs = [
                    { label: 'exec_in', type: 'exec', id: nodeId + '_exec_in' },
                    { label: 'List', type: (elType === 'any_not_exec' ? 'any_not_exec' : listType), key: 'list', id: nodeId + '_list' },
                    { label: 'Value', type: elType, key: 'value', id: nodeId + '_val' }
                ];
                outputs = [
                    { label: 'exec_out', type: 'exec', id: nodeId + '_exec_out' },
                    { label: 'List', type: (elType === 'any_not_exec' ? 'any_not_exec' : listType), key: 'list', id: nodeId + '_out' }
                ];
            } else if (type === 'list_remove_at') {
                nodeTitle = "List Remove At" + (elType === 'any_not_exec' ? "" : " (" + details.name + ")");
                inputs = [
                    { label: 'exec_in', type: 'exec', id: nodeId + '_exec_in' },
                    { label: 'List', type: (elType === 'any_not_exec' ? 'any_not_exec' : listType), key: 'list', id: nodeId + '_list' },
                    { label: 'Index', type: 'number', key: 'index', id: nodeId + '_index' }
                ];
                outputs = [
                    { label: 'exec_out', type: 'exec', id: nodeId + '_exec_out' },
                    { label: 'List', type: (elType === 'any_not_exec' ? 'any_not_exec' : listType), key: 'list', id: nodeId + '_out' }
                ];
            } else if (type === 'list_make') {
                nodeTitle = "Make List" + (elType === 'any_not_exec' ? "" : " (" + details.name + ")");
                // Start with 1 input if clean, or preserve if restoring? 
                // This block is for initial creation (or restore if inputs not provided, though addNode usually handles that)
                inputs = [
                    { label: 'Item 0', type: elType, key: 'in_0', id: nodeId + '_in_0' }
                ];
                outputs = [{ label: 'List', type: listType, key: 'list', id: nodeId + '_out' }];
            }
        } else if (type.startsWith('map_')) {
            const keyType = nodeParams.key_type || 'string';
            const valType = nodeParams.value_type || 'any_not_exec';
            const mapType = `map:${keyType}:${valType}`;
            const details = window.typeDB.getTypeDetails(mapType);

            if (type === 'map_create') {
                nodeTitle = "Create Map (" + details.name.replace('Map of ', '') + ")";
                inputs = [];
                outputs = [{ label: 'Map', type: mapType, key: 'map', id: nodeId + '_out' }];
            } else if (type === 'map_get') {
                nodeTitle = "Map Get (" + details.name.replace('Map of ', '') + ")";
                inputs = [
                    { label: 'Map', type: mapType, key: 'map', id: nodeId + '_map' },
                    { label: 'Key', type: keyType, key: 'key', id: nodeId + '_key' }
                ];
                outputs = [{ label: 'Value', type: valType, key: 'value', id: nodeId + '_val' }];
            } else if (type === 'map_set') {
                nodeTitle = "Map Set (" + details.name.replace('Map of ', '') + ")";
                inputs = [
                    { label: 'exec_in', type: 'exec', id: nodeId + '_exec_in' },
                    { label: 'Map', type: mapType, key: 'map', id: nodeId + '_map' },
                    { label: 'Key', type: keyType, key: 'key', id: nodeId + '_key' },
                    { label: 'Value', type: valType, key: 'value', id: nodeId + '_val' }
                ];
                outputs = [
                    { label: 'exec_out', type: 'exec', id: nodeId + '_exec_out' },
                    { label: 'Map', type: mapType, key: 'map', id: nodeId + '_out' }
                ];
            } else if (type === 'map_remove') {
                nodeTitle = "Map Remove (" + details.name.replace('Map of ', '') + ")";
                inputs = [
                    { label: 'exec_in', type: 'exec', id: nodeId + '_exec_in' },
                    { label: 'Map', type: mapType, key: 'map', id: nodeId + '_map' },
                    { label: 'Key', type: keyType, key: 'key', id: nodeId + '_key' }
                ];
                outputs = [
                    { label: 'exec_out', type: 'exec', id: nodeId + '_exec_out' },
                    { label: 'Map', type: mapType, key: 'map', id: nodeId + '_out' }
                ];
            }
        }


        const node = {
            id: nodeId,
            type,
            x: x !== undefined ? x : (this.menuX || 100),
            y: y !== undefined ? y : (this.menuY || 100),
            width: width,
            height: height,
            title: nodeTitle,
            inputs,
            outputs,
            params: nodeParams
        };

        // Handle error state visual
        if (nodeParams.error) {
            node.error = nodeParams.error;
            node.title = "ERROR: " + (nodeDef.name);
        }

        if (type === 'string_format') {
            this.updateStringFormatPorts(node);
        }

        this.nodes.push(node);
        this.createNodeElement(node);
        this.renderMinimap();
        const countEl = document.getElementById('node-count');
        if (countEl) countEl.innerText = this.nodes.length;

        if (!this.isRestoring) {
            this.saveHistory('Added Node');
        }

        return node;
    },

    onNodeParamChanged(node, key, value) {
        node.params[key] = value;
        if (node.type.startsWith('list_')) {
            if (key === 'num_elements' || key === 'element_type') {
                this.updateListPorts(node);
            }
        } else if (node.type.startsWith('map_')) {
            if (key === 'key_type' || key === 'value_type') {
                this.updateMapPorts(node);
            }
        } else if (node.type === 'string_format' && key === 'format') {
            this.updateStringFormatPorts(node);
        } else if (node.type === 'set_variable' && key === 'name') {
            const valuePort = node.inputs.find(i => i.key === 'value');
            if (valuePort) {
                this.onVariableTypeChanged(value, valuePort.type);
            }
        } else if (node.type === 'get_variable' && key === 'name') {
            const setNode = this.nodes.find(n => n.type === 'set_variable' && n.params.name === node.params[key]);
            if (setNode) {
                const valuePort = setNode.inputs.find(i => i.key === 'value');
                if (valuePort) {
                    const outPort = node.outputs[0];
                    outPort.type = valuePort.type;
                    const portEl = document.getElementById(outPort.id);
                    if (portEl) {
                        portEl.className = `port port-output port-type-${outPort.type}`;
                    }
                }
            } else {
                const outPort = node.outputs[0];
                outPort.type = 'any_not_exec';
                const portEl = document.getElementById(outPort.id);
                if (portEl) {
                    portEl.className = `port port-output port-type-any_not_exec`;
                }
            }
        }
        this.renderConnections();
    },

    onVariableTypeChanged(varName, newType) {
        this.nodes.forEach(node => {
            if (node.type === 'get_variable' && node.params.name === varName) {
                const outPort = node.outputs[0];
                if (outPort.type !== newType) {
                    outPort.type = newType;
                    const portEl = document.getElementById(outPort.id);
                    if (portEl) {
                        portEl.className = `port port-output port-type-${newType}`;
                    }
                    // Connections from this port should also update color
                    this.connections.forEach(conn => {
                        if (conn.fromPort === outPort) {
                            const style = getComputedStyle(document.documentElement);
                            const color = style.getPropertyValue(`--type-${newType}`).trim() || '#fff';
                            conn.element.style.stroke = color;
                            conn.element.style.filter = `drop-shadow(0 0 8px ${color}66)`;
                        }
                    });
                }
            }
        });
    },

    deleteNode(node, suppressHistory = false) {
        // Delete connections
        this.connections = this.connections.filter(c => {
            if (c.fromNode === node || c.toNode === node) {
                if (c.element && c.element.parentNode) this.svgLayer.removeChild(c.element);
                if (c.arrow && c.arrow.parentNode) this.svgLayer.removeChild(c.arrow);
                if (c.hitArea && c.hitArea.parentNode) this.svgLayer.removeChild(c.hitArea);
                return false;
            }
            return true;
        });

        // Delete node
        if (node.element && node.element.parentNode) {
            this.nodesLayer.removeChild(node.element);
        }
        this.nodes = this.nodes.filter(n => n !== node);
        this.selectedNode = null;

        const countEl = document.getElementById('node-count');
        if (countEl) countEl.innerText = this.nodes.length;
        this.renderMinimap();

        if (!suppressHistory && !this.isRestoring) this.saveHistory('Deleted Node');
    },

    updateListPorts(node) {
        const nodeId = node.id;
        const nodeParams = node.params;
        const type = node.type;
        const elType = nodeParams.element_type || 'any_not_exec';
        const details = window.typeDB.getTypeDetails(elType);
        const listType = 'list:' + elType;
        let inputs = [];
        let outputs = [];
        let nodeTitle = node.title;

        if (type === 'list_create') {
            nodeTitle = "Create List" + (elType === 'any_not_exec' ? "" : " (" + details.name + ")");
            inputs = [
                { label: 'num_elements', type: 'number', key: 'num_elements', id: nodeId + '_count' }
            ];
            outputs = [{ label: 'List', type: listType, key: 'list', id: nodeId + '_out' }];
        } else if (type === 'list_get') {
            nodeTitle = "List Get" + (elType === 'any_not_exec' ? "" : " (" + details.name + ")");
            inputs = [
                { label: 'List', type: (elType === 'any_not_exec' ? 'any_not_exec' : listType), key: 'list', id: nodeId + '_list' },
                { label: 'Index', type: 'number', key: 'index', id: nodeId + '_index' }
            ];
            outputs = [{ label: 'Value', type: elType, key: 'value', id: nodeId + '_val' }];
        } else if (type === 'list_set') {
            nodeTitle = "List Set" + (elType === 'any_not_exec' ? "" : " (" + details.name + ")");
            inputs = [
                { label: 'exec_in', type: 'exec', id: nodeId + '_exec_in' },
                { label: 'List', type: (elType === 'any_not_exec' ? 'any_not_exec' : listType), key: 'list', id: nodeId + '_list' },
                { label: 'Index', type: 'number', key: 'index', id: nodeId + '_index' },
                { label: 'Value', type: elType, key: 'value', id: nodeId + '_val' }
            ];
            outputs = [
                { label: 'exec_out', type: 'exec', id: nodeId + '_exec_out' },
                { label: 'List', type: (elType === 'any_not_exec' ? 'any_not_exec' : listType), key: 'list', id: nodeId + '_out' }
            ];
        } else if (type === 'list_add') {
            nodeTitle = "List Add" + (elType === 'any_not_exec' ? "" : " (" + details.name + ")");
            inputs = [
                { label: 'exec_in', type: 'exec', id: nodeId + '_exec_in' },
                { label: 'List', type: (elType === 'any_not_exec' ? 'any_not_exec' : listType), key: 'list', id: nodeId + '_list' },
                { label: 'Value', type: elType, key: 'value', id: nodeId + '_val' }
            ];
            outputs = [
                { label: 'exec_out', type: 'exec', id: nodeId + '_exec_out' },
                { label: 'List', type: (elType === 'any_not_exec' ? 'any_not_exec' : listType), key: 'list', id: nodeId + '_out' }
            ];
        } else if (type === 'list_remove_at') {
            nodeTitle = "List Remove At" + (elType === 'any_not_exec' ? "" : " (" + details.name + ")");
            inputs = [
                { label: 'exec_in', type: 'exec', id: nodeId + '_exec_in' },
                { label: 'List', type: (elType === 'any_not_exec' ? 'any_not_exec' : listType), key: 'list', id: nodeId + '_list' },
                { label: 'Index', type: 'number', key: 'index', id: nodeId + '_index' }
            ];
            outputs = [
                { label: 'exec_out', type: 'exec', id: nodeId + '_exec_out' },
                { label: 'List', type: (elType === 'any_not_exec' ? 'any_not_exec' : listType), key: 'list', id: nodeId + '_out' }
            ];
        } else if (type === 'list_make') {
            nodeTitle = "Make List" + (elType === 'any_not_exec' ? "" : " (" + details.name + ")");
            // Preserve existing inputs but update type
            inputs = node.inputs.map(i => ({
                ...i,
                type: elType
            }));
            outputs = [{ label: 'List', type: (elType === 'any_not_exec' ? 'list:any_not_exec' : listType), key: 'list', id: nodeId + '_out' }];
        }

        node.title = nodeTitle;
        node.inputs = inputs;
        node.outputs = outputs;

        if (node.element) {
            const header = node.element.querySelector('.node-header');
            if (header) header.innerText = node.title;
        }

        this.refreshNodePorts(node);
    },

    updateMapPorts(node) {
        const nodeId = node.id;
        const nodeParams = node.params;
        const type = node.type;
        const keyType = nodeParams.key_type || 'string';
        const valType = nodeParams.value_type || 'any_not_exec';
        const mapType = `map:${keyType}:${valType}`;
        const details = window.typeDB.getTypeDetails(mapType);
        let inputs = [];
        let outputs = [];
        let nodeTitle = node.title;

        if (type === 'map_create') {
            nodeTitle = "Create Map (" + details.name.replace('Map of ', '') + ")";
            inputs = [];
            outputs = [{ label: 'Map', type: mapType, key: 'map', id: nodeId + '_out' }];
        } else if (type === 'map_get') {
            nodeTitle = "Map Get (" + details.name.replace('Map of ', '') + ")";
            inputs = [
                { label: 'Map', type: mapType, key: 'map', id: nodeId + '_map' },
                { label: 'Key', type: keyType, key: 'key', id: nodeId + '_key' }
            ];
            outputs = [{ label: 'Value', type: valType, key: 'value', id: nodeId + '_val' }];
        } else if (type === 'map_set') {
            nodeTitle = "Map Set (" + details.name.replace('Map of ', '') + ")";
            inputs = [
                { label: 'exec_in', type: 'exec', id: nodeId + '_exec_in' },
                { label: 'Map', type: mapType, key: 'map', id: nodeId + '_map' },
                { label: 'Key', type: keyType, key: 'key', id: nodeId + '_key' },
                { label: 'Value', type: valType, key: 'value', id: nodeId + '_val' }
            ];
            outputs = [
                { label: 'exec_out', type: 'exec', id: nodeId + '_exec_out' },
                { label: 'Map', type: mapType, key: 'map', id: nodeId + '_out' }
            ];
        } else if (type === 'map_remove') {
            nodeTitle = "Map Remove (" + details.name.replace('Map of ', '') + ")";
            inputs = [
                { label: 'exec_in', type: 'exec', id: nodeId + '_exec_in' },
                { label: 'Map', type: mapType, key: 'map', id: nodeId + '_map' },
                { label: 'Key', type: keyType, key: 'key', id: nodeId + '_key' }
            ];
            outputs = [
                { label: 'exec_out', type: 'exec', id: nodeId + '_exec_out' },
                { label: 'Map', type: mapType, key: 'map', id: nodeId + '_out' }
            ];
        }

        node.title = nodeTitle;
        node.inputs = inputs;
        node.outputs = outputs;

        if (node.element) {
            const header = node.element.querySelector('.node-header');
            if (header) header.innerText = node.title;
        }

        this.refreshNodePorts(node);
    },

    refreshNodePorts(node) {
        if (!node.element) return;
        const inputsCol = node.element.querySelector('.node-inputs');
        const outputsCol = node.element.querySelector('.node-outputs');

        if (inputsCol) {
            inputsCol.innerHTML = '';
            node.inputs.forEach(input => {
                inputsCol.appendChild(this.createPort(node, input, true));
            });
        }
        if (outputsCol) {
            outputsCol.innerHTML = '';
            node.outputs.forEach(output => {
                outputsCol.appendChild(this.createPort(node, output, false));
            });
        }
        this.renderConnections();
    },

    updateStringFormatPorts(node) {
        const format = node.params.format || '';
        const count = (format.match(/{}/g) || []).length;

        const oldInputs = [...node.inputs];
        const newInputs = [];

        for (let i = 1; i <= count; i++) {
            const key = `arg${i}`;
            const label = `Arg ${i}`;
            const existing = oldInputs.find(input => input.key === key);
            if (existing) {
                newInputs.push(existing);
            } else {
                newInputs.push({
                    label,
                    type: 'any_not_exec',
                    key,
                    id: `${node.id}_in_${key}_${Math.random().toString(36).substr(2, 4)}`
                });
                if (node.params[key] === undefined) {
                    node.params[key] = null;
                }
            }
        }

        // Find connections that are now orphaned
        const newInputIds = new Set(newInputs.map(i => i.id));
        this.connections = this.connections.filter(c => {
            if (c.toNode === node && !newInputIds.has(c.toPort.id)) {
                if (c.element && c.element.parentNode) this.svgLayer.removeChild(c.element);
                if (c.hitArea && c.hitArea.parentNode) this.svgLayer.removeChild(c.hitArea);
                return false;
            }
            return true;
        });

        node.inputs = newInputs;

        // Cleanup params that are no longer inputs to avoid extra widgets
        Object.keys(node.params).forEach(k => {
            if (k.startsWith('arg') && !newInputs.some(i => i.key === k)) {
                delete node.params[k];
            }
        });

        this.refreshNodePorts(node);
    },

    createNodeElement(node) {
        const div = document.createElement('div');
        div.className = `node node-type-${node.type}`;
        if (node.error) {
            div.style.borderColor = 'var(--danger)';
            div.style.boxShadow = '0 0 10px var(--danger)';
        }
        if (this.selectedNodes.has(node) || this.selectedNode === node) {
            div.classList.add('selected');
        }
        div.style.left = node.x + 'px';
        div.style.top = node.y + 'px';
        if (node.width) div.style.width = node.width + 'px';
        if (node.height) div.style.height = node.height + 'px';
        div.id = node.id;

        // Header
        const header = document.createElement('div');
        header.className = 'node-header';
        header.innerHTML = node.title;
        div.appendChild(header);

        // Content (for nodes with central editors)
        const content = document.createElement('div');
        content.className = 'node-content';

        // Top Row for specialized full-width content (Virtual Row 1)
        const topRow = document.createElement('div');
        topRow.className = 'node-top-row';

        // Handle specialized content based on node type
        if (node.type === 'action') {
            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'node-input';
            input.value = node.params.name || node.title;
            input.placeholder = 'Task Name...';
            input.onclick = (e) => e.stopPropagation();
            input.oninput = (e) => node.params.name = e.target.value;
            input.onchange = () => this.saveHistory('Renamed Action');
            topRow.appendChild(input);
        } else if (['string', 'number', 'boolean', 'bool'].includes(node.type)) {
            // Constants still go in the body (main content col) for now
        }

        if (topRow.childNodes.length > 0) {
            div.appendChild(topRow);
        }

        // Flex container for the node body
        const contentRow = document.createElement('div');
        contentRow.className = 'node-main-row';
        div.appendChild(contentRow);

        const inputsCol = document.createElement('div');
        inputsCol.className = 'node-ports-col node-inputs';
        contentRow.appendChild(inputsCol);

        const centerCol = document.createElement('div');
        centerCol.className = 'node-content-col';
        contentRow.appendChild(centerCol);

        const outputsCol = document.createElement('div');
        outputsCol.className = 'node-ports-col node-outputs';
        contentRow.appendChild(outputsCol);

        // Params / Widgets
        const nodeDef = this.nodeRegistry.find(n => n.type === node.type) || { params: {} };

        // Helper to check if a param is exposed as an input port
        const isParamPort = (key) => node.inputs.some(i => i.key === key);

        Object.keys(node.params).forEach(key => {
            if (isParamPort(key)) return; // Skip if it's a port

            // Hide element_type, key_type, value_type and structId for internal management
            if ((node.type.startsWith('list_') || node.type.startsWith('map_')) && (key === 'element_type' || key === 'key_type' || key === 'value_type')) return;
            if (node.type.startsWith('struct_') && key === 'structId') return;
            if (node.type === 'list_create' && key === 'num_elements') return; // Now a port

            const val = node.params[key];
            const widget = document.createElement('div');
            widget.className = 'node-widget';

            if (typeof val === 'boolean') {
                const toggle = document.createElement('div');
                toggle.className = `bool-toggle ${val ? 'is-true' : 'is-false'}`;
                toggle.innerText = val ? 'TRUE' : 'FALSE';
                toggle.onclick = (e) => {
                    node.params[key] = !node.params[key];
                    toggle.className = `bool-toggle ${node.params[key] ? 'is-true' : 'is-false'}`;
                    toggle.innerText = node.params[key] ? 'TRUE' : 'FALSE';
                    this.saveHistory('Toggle Param');
                };
                widget.appendChild(toggle);
            } else if (typeof val === 'string' || typeof val === 'number') {
                if ((['string', 'string_format', 'ai_eval', 'log_message'].includes(node.type)) && (['value', 'format', 'system_prompt', 'prompt', 'message'].includes(key))) {
                    const area = document.createElement('textarea');
                    area.className = 'node-textarea';
                    if (node.type === 'string_format') {
                        area.oninput = (e) => {
                            node.params[key] = e.target.value;
                            this.updateStringFormatPorts(node);
                        };
                    } else {
                        area.oninput = (e) => {
                            node.params[key] = e.target.value;
                        };
                    }
                    area.value = val;
                    area.onchange = () => this.saveHistory(`Edit ${node.type}`);
                    area.onmousedown = e => e.stopPropagation();
                    widget.appendChild(area);
                } else {
                    const input = document.createElement('input');
                    input.type = typeof val === 'number' ? 'number' : 'text';
                    input.className = 'node-input inline-editor';
                    if (typeof val === 'number') input.classList.add('math-input');
                    input.value = val;
                    input.oninput = (e) => {
                        const val = typeof node.params[key] === 'number' ? parseFloat(e.target.value) : e.target.value;
                        this.onNodeParamChanged(node, key, val);
                    };
                    input.onchange = () => this.saveHistory('Edit Param');
                    input.onmousedown = e => e.stopPropagation();
                    widget.appendChild(input);
                }
            }
            // Label for param
            if (!['string', 'number', 'boolean', 'string_format', 'list_create'].includes(node.type)) {
                const lbl = document.createElement('div');
                lbl.innerText = key;
                lbl.style.fontSize = '10px';
                lbl.style.color = '#777';
                lbl.style.marginBottom = '2px';
                centerCol.appendChild(lbl);
            }
            if (widget.hasChildNodes()) {
                centerCol.appendChild(widget);
            }
        });

        // Add Type Selector for List/Map Create
        if (node.type === 'list_create') {
            const selector = this.createComplexTypeSelector('Element Type', node.params.element_type, (newType) => {
                this.onNodeParamChanged(node, 'element_type', newType);
                this.saveHistory('Changed Node Type');
            });
            centerCol.insertBefore(selector, centerCol.firstChild);
        } else if (node.type === 'map_create') {
            const valSelector = this.createComplexTypeSelector('Value Type', node.params.value_type, (newType) => {
                this.onNodeParamChanged(node, 'value_type', newType);
                this.saveHistory('Changed Node Type');
            });
            const keySelector = this.createComplexTypeSelector('Key Type', node.params.key_type, (newType) => {
                this.onNodeParamChanged(node, 'key_type', newType);
                this.saveHistory('Changed Node Type');
            });
            centerCol.insertBefore(valSelector, centerCol.firstChild);
            centerCol.insertBefore(keySelector, centerCol.firstChild);
        } else if (node.type === 'create_tool') {
            const funcSelector = this.createFunctionSelector('Target Function', node.params.function_name, (newFunc) => {
                this.onNodeParamChanged(node, 'function_name', newFunc);
                this.saveHistory('Changed Tool Function');
            });
            centerCol.insertBefore(funcSelector, centerCol.firstChild);
        }

        // Create Ports
        if (node.inputs) {
            node.inputs.forEach(input => {
                inputsCol.appendChild(this.createPort(node, input, true));
            });
        }
        if (node.outputs) {
            node.outputs.forEach(output => {
                outputsCol.appendChild(this.createPort(node, output, false));
            });
        }

        // Event listeners
        div.onmousedown = (e) => {
            // If clicking header or empty space
            if (e.target === div || e.target === header || e.target === contentRow || e.target === centerCol) {
                this.isDraggingNode = node;
                this.nodeOrigX = node.x;
                this.nodeOrigY = node.y;
                this.dragStartX = e.clientX;
                this.dragStartY = e.clientY;

                if (e.shiftKey) {
                    this.selectNode(node, true);
                } else if (!this.selectedNodes.has(node)) {
                    this.selectNode(node, false);
                }

                // Store initial positions of all key nodes
                this.dragStartPositions = new Map();
                this.selectedNodes.forEach(n => {
                    this.dragStartPositions.set(n.id, { x: n.x, y: n.y });
                });

                e.stopPropagation();
            }
        };

        // Z-Index handling on click
        div.addEventListener('mousedown', () => {
            // Move to end of DOM (highest Z)
            if (div.parentNode) div.parentNode.appendChild(div);
        });

        // Double click to focus?
        div.ondblclick = (e) => {
            e.stopPropagation();
            // Maybe open detailed editor?
        };

        // Add resizer handle for specific nodes
        if (nodeDef.resizable) {
            const resizer = document.createElement('div');
            resizer.className = 'node-resizer';
            div.appendChild(resizer);

            resizer.onmousedown = (e) => {
                e.stopPropagation();
                e.preventDefault();
                const startWidth = div.offsetWidth;
                const startHeight = div.offsetHeight;
                const startX = e.clientX;
                const startY = e.clientY;

                const onMouseMove = (moveE) => {
                    const newWidth = Math.max(300, startWidth + (moveE.clientX - startX) / this.zoomLevel);
                    const newHeight = Math.max(120, startHeight + (moveE.clientY - startY) / this.zoomLevel);
                    div.style.width = newWidth + 'px';
                    div.style.height = newHeight + 'px';
                    node.width = newWidth;
                    node.height = newHeight;
                    this.renderConnections();
                };

                const onMouseUp = () => {
                    document.removeEventListener('mousemove', onMouseMove);
                    document.removeEventListener('mouseup', onMouseUp);
                    this.saveHistory('Resize Node');
                };

                document.addEventListener('mousemove', onMouseMove);
                document.addEventListener('mouseup', onMouseUp);
            };
        }

        this.nodesLayer.appendChild(div);
        node.element = div;
        // Watch for resizes (manual or auto) to update connections
        const ro = new ResizeObserver(() => {
            // Update node dimensions
            node.width = div.offsetWidth;
            node.height = div.offsetHeight;
            this.renderConnections();
        });
        ro.observe(div);
    },

    createPort(node, portData, isInput) {
        const portWrapper = document.createElement('div');
        portWrapper.className = `port-wrapper ${isInput ? 'port-wrapper-input' : 'port-wrapper-output'}`;

        const port = document.createElement('div');
        port.className = `port port-${isInput ? 'input' : 'output'}`;

        // Handle complex type coloring
        if (window.typeDB) {
            const details = window.typeDB.getTypeDetails(portData.type);
            port.style.color = details.color;
            port.style.borderColor = details.color;
            if (portData.type === 'exec') {
                port.style.borderRadius = '4px';
            }
        } else {
            port.classList.add(`port-type-${portData.type}`);
        }

        port.id = portData.id;

        port.onmousedown = (e) => {
            e.stopPropagation();
            this.startConnection(node, portData, isInput ? 'input' : 'output', e.clientX, e.clientY);
        };
        port.onmouseup = (e) => {
            e.stopPropagation();
            this.finishConnection(node, portData, isInput ? 'input' : 'output');
        };

        const formatLabel = (lbl) => {
            if (!lbl || !lbl.startsWith('exec_')) return lbl;
            const part = lbl.replace('exec_', '');
            return part.charAt(0).toUpperCase() + part.slice(1);
        };

        if (isInput) {
            portWrapper.appendChild(port);
            if (portData.label) {
                const label = document.createElement('span');
                label.className = 'port-label';
                if (portData.label.length <= 1) label.classList.add('port-label-small');
                label.innerText = formatLabel(portData.label);
                portWrapper.appendChild(label);
            }
        } else {
            if (portData.label) {
                const label = document.createElement('span');
                label.className = 'port-label';
                label.innerText = formatLabel(portData.label);
                portWrapper.appendChild(label);
            }
            portWrapper.appendChild(port);
        }

        // Tooltip listeners
        portWrapper.addEventListener('mouseenter', (e) => {
            if (!this.isCreatingConnection) {
                this.showTooltip(e.clientX, e.clientY, portData.type);
            }
        });
        portWrapper.addEventListener('mousemove', (e) => {
            if (this.tooltipEl && this.tooltipEl.classList.contains('active')) {
                this.tooltipEl.style.left = (e.clientX + 10) + 'px';
                this.tooltipEl.style.top = (e.clientY + 10) + 'px';
            }
        });
        portWrapper.addEventListener('mouseleave', () => {
            this.hideTooltip();
        });

        // Inline Editor for Inputs
        if (isInput && portData.key && node.params.hasOwnProperty(portData.key)) {
            const nodeDef = this.nodeRegistry.find(n => n.type === node.type);
            const isNodeResizable = nodeDef && nodeDef.resizable;
            const editor = this.createInlineEditor(portData.type, node.params[portData.key], (val) => {
                this.onNodeParamChanged(node, portData.key, val);
            }, {
                resizable: !isNodeResizable && portData.type === 'string',
                multiline: false
            });
            editor.classList.add('inline-editor');
            if (node.type.startsWith('math_')) {
                editor.classList.add('math-input');
            }
            editor.dataset.portId = portData.id;
            portWrapper.appendChild(editor);

            // Initial visibility check
            if (this.connections.some(c => c.toPort.id === portData.id)) {
                editor.style.display = 'none';
            }
        }

        return portWrapper;
    },

    createInlineEditor(type, value, onChange, options = {}) {
        if (type === 'string') {
            const textarea = document.createElement('textarea');
            textarea.className = 'node-input node-textarea';
            textarea.value = value || '';

            if (options.multiline) {
                // Large initial size for string constant nodes to fill the body
                textarea.rows = 6;
                textarea.style.minHeight = '100px';
                if (options.resizable) {
                    textarea.style.resize = 'both';
                }
            } else {
                // Auto-expanding single-line editors
                textarea.rows = 1;
                textarea.style.resize = options.resizable ? 'both' : 'none'; // Allow width resize if requested
                textarea.style.whiteSpace = 'pre-wrap';
                textarea.style.overflow = 'hidden';
                textarea.style.height = 'auto';
                textarea.style.minWidth = '80px'; // Base width

                const autoResize = () => {
                    textarea.style.height = 'auto';
                    textarea.style.height = textarea.scrollHeight + 'px';
                };

                textarea.addEventListener('input', autoResize);
                // Initial resize
                setTimeout(autoResize, 0);
            }

            textarea.oninput = (e) => {
                onChange(e.target.value);
            };
            textarea.onchange = () => {
                this.saveHistory('Text Changed');
            };
            textarea.onmousedown = (e) => e.stopPropagation();

            return textarea;
        } else if (type === 'number') {
            const input = document.createElement('input');
            input.type = 'number';
            input.className = 'node-input';
            input.value = value || 0;
            input.oninput = (e) => onChange(parseFloat(e.target.value));
            input.onchange = () => this.saveHistory('Value Changed');
            input.onmousedown = (e) => e.stopPropagation();
            return input;
        } else if (type === 'boolean' || type === 'bool') {
            const btn = document.createElement('button');
            btn.className = 'bool-toggle';
            value = !!value;

            const updateBtn = (val) => {
                btn.innerHTML = val ? '<span>TRUE</span>' : '<span>FALSE</span>';
                btn.classList.toggle('is-true', val);
                btn.classList.toggle('is-false', !val);
            };

            updateBtn(value);

            btn.onclick = (e) => {
                e.stopPropagation();
            };
            btn.onmousedown = (e) => {
                e.stopPropagation();
                value = !value;
                updateBtn(value);
                onChange(value);
                this.saveHistory('Toggle Bool');
            };
            return btn;
        }
        return document.createElement('div');
    },

    createComplexTypeSelector(label, currentType, onChange) {
        const container = document.createElement('div');
        container.className = 'complex-type-selector';
        container.style.marginTop = '4px';
        container.style.marginBottom = '8px';

        let activeType = currentType;

        const refresh = () => {
            container.innerHTML = '';
            const lbl = document.createElement('div');
            lbl.innerText = label;
            lbl.style.fontSize = '11px';
            lbl.style.fontWeight = '600';
            lbl.style.color = 'var(--text-secondary)';
            lbl.style.marginBottom = '6px';
            container.appendChild(lbl);
            container.appendChild(renderSelector(activeType, (newType) => {
                activeType = newType;
                onChange(newType);
                refresh();
            }));
        };

        const renderSelector = (targetType, onUpdate) => {
            if (!targetType) targetType = 'any_not_exec';  // Default safety fallback

            const row = document.createElement('div');
            row.style.display = 'flex';
            row.style.flexDirection = 'column';
            row.style.gap = '4px';

            const topRow = document.createElement('div');
            topRow.style.display = 'flex';
            topRow.style.gap = '2px';
            row.appendChild(topRow);

            let baseType = targetType;
            let modifier = 'none';
            let mapValueType = 'string';

            if (targetType.startsWith('list:')) {
                modifier = 'list';
                baseType = targetType.substring(5);
            } else if (targetType.startsWith('map:')) {
                modifier = 'map';
                const rest = targetType.substring(4);
                if (rest.startsWith('struct:')) {
                    const parts = rest.split(':');
                    baseType = parts[0] + ':' + parts[1];
                    mapValueType = parts.slice(2).join(':') || 'string';
                } else {
                    const idx = rest.indexOf(':');
                    if (idx !== -1) {
                        baseType = rest.substring(0, idx);
                        mapValueType = rest.substring(idx + 1);
                    } else {
                        baseType = rest;
                        mapValueType = 'string';
                    }
                }
            }

            const primitives = window.typeDB.primitives.filter(p => !['exec', 'any', 'any_not_exec'].includes(p.id));
            const structs = window.typeDB.getStructs().map(s => `struct:${s.id}`);
            const allBase = [...primitives.map(p => p.id), ...structs];

            const typeSelect = document.createElement('select');
            typeSelect.className = 'node-input inline-editor';
            typeSelect.style.flex = "1";
            allBase.forEach(tStr => {
                const details = window.typeDB.getTypeDetails(tStr);
                const opt = document.createElement('option');
                opt.value = tStr;
                opt.textContent = details.name;
                if (tStr === baseType) opt.selected = true;
                typeSelect.appendChild(opt);
            });

            const modSelect = document.createElement('select');
            modSelect.className = 'node-input inline-editor';
            modSelect.style.width = '45px';
            [['none', '-'], ['list', '[]'], ['map', '{}']].forEach(([m, label]) => {
                const opt = document.createElement('option');
                opt.value = m;
                opt.textContent = label;
                if (m === modifier) opt.selected = true;
                modSelect.appendChild(opt);
            });

            typeSelect.onchange = (e) => {
                const newBase = e.target.value;
                if (modifier === 'list') onUpdate(`list:${newBase}`);
                else if (modifier === 'map') onUpdate(`map:${newBase}:${mapValueType}`);
                else onUpdate(newBase);
            };

            modSelect.onchange = (e) => {
                const newMod = e.target.value;
                if (newMod === 'list') onUpdate(`list:${baseType}`);
                else if (newMod === 'map') onUpdate(`map:${baseType}:${mapValueType}`);
                else onUpdate(baseType);
            };

            topRow.appendChild(typeSelect);
            topRow.appendChild(modSelect);

            if (modifier === 'list') {
                const subLabel = document.createElement('div');
                subLabel.innerText = "Inner Element:";
                subLabel.style.fontSize = '9px'; subLabel.style.color = '#777'; subLabel.style.marginLeft = '10px';
                row.appendChild(subLabel);

                const subContainer = document.createElement('div');
                subContainer.style.marginLeft = '10px'; subContainer.style.borderLeft = '1px dashed #444'; subContainer.style.paddingLeft = '6px';
                subContainer.appendChild(renderSelector(baseType, (newInner) => {
                    onUpdate(`list:${newInner}`);
                }));
                row.appendChild(subContainer);
            } else if (modifier === 'map') {
                const subLabel = document.createElement('div');
                subLabel.innerText = "Value Type:";
                subLabel.style.fontSize = '9px'; subLabel.style.color = '#777'; subLabel.style.marginLeft = '10px';
                row.appendChild(subLabel);

                const subContainer = document.createElement('div');
                subContainer.style.marginLeft = '10px'; subContainer.style.borderLeft = '1px dashed #444'; subContainer.style.paddingLeft = '6px';
                subContainer.appendChild(renderSelector(mapValueType, (newVal) => {
                    onUpdate(`map:${baseType}:${newVal}`);
                }));
                row.appendChild(subContainer);
            }
            return row;
        };

        refresh();
        return container;
    },

    createFunctionSelector(label, currentFunc, onChange) {
        const container = document.createElement('div');
        container.className = 'complex-type-selector'; // Reuse style
        container.style.marginTop = '4px';
        container.style.marginBottom = '8px';

        const lbl = document.createElement('div');
        lbl.innerText = label;
        lbl.style.fontSize = '11px';
        lbl.style.fontWeight = '600';
        lbl.style.color = 'var(--text-secondary)';
        lbl.style.marginBottom = '6px';
        container.appendChild(lbl);

        const select = document.createElement('select');
        select.className = 'node-input inline-editor';
        select.style.width = '100%';

        // Populate options
        // Populate options
        if (window.funcManager && window.funcManager.functionDB) {
            const funcs = window.funcManager.functionDB.getAllFunctions();

            // Add empty option if current is empty or not found
            const emptyOpt = document.createElement('option');
            emptyOpt.value = "";
            emptyOpt.textContent = "-- Select Function --";
            select.appendChild(emptyOpt);

            funcs.forEach(f => {
                const opt = document.createElement('option');
                // We use the function NAME as the value because create_tool needs a human-readable name
                // for the tool ID, and the backend will need to resolve this name to the file ID.
                opt.value = f.name || f.id;
                opt.textContent = f.name || f.id;
                if ((f.name && f.name === currentFunc) || f.id === currentFunc) opt.selected = true;
                select.appendChild(opt);
            });
        }

        select.onchange = (e) => {
            onChange(e.target.value);
        };

        // Prevent event propagation so we can select without dragging node
        select.onmousedown = (e) => e.stopPropagation();

        container.appendChild(select);
        return container;
    },

    updateNodeElement(node) {
        node.element.style.left = node.x + 'px';
        node.element.style.top = node.y + 'px';
    },

    selectNode(node, additive = false) {
        if (!additive) {
            this.deselectNodes();
        }
        this.selectedNodes.add(node);
        this.selectedNode = node; // Primary selection
        node.element.classList.add('selected');
        // Bring to front
        this.nodesLayer.appendChild(node.element);
    },

    deselectNodes() {
        this.selectedNodes.forEach(n => {
            if (n.element) n.element.classList.remove('selected');
        });
        this.selectedNodes.clear();
        this.selectedNode = null;
    }
});

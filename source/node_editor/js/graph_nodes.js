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
            // Exclude current function to prevent recursion? Or allow it (recursion limits?)
            // For now allow it.
            funcs.forEach(f => {
                if (f.id !== window.funcManager.currentFunctionId) {
                    searchList.push({
                        type: 'function_call',
                        name: 'Call: ' + f.name,
                        tags: [...f.tags, 'Function', 'call'],
                        params: { functionId: f.id },
                        // Visual hint?
                        isFunction: true
                    });
                }
            });
        }

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
        div.innerHTML = `
            <div style="width: 8px; height: 8px; border-radius: 50%; background: var(--secondary-accent)"></div>
            ${node.name}
        `;
        div.onclick = () => {
            this.addNode(node.type, this.menuX, this.menuY, null, node.params);
            this.closePalette();
        };
        return div;
    },

    closePalette() {
        if (this.paletteEl) {
            this.paletteEl.style.display = 'none';
        }
        this.paletteVisible = false;
    },

    addNode(type, x, y, id = null, params = null, savedInputs = null, savedOutputs = null) {
        let nodeDef = this.nodeRegistry.find(n => n.type === type);

        // If not in registry (e.g. dynamic function call without registry entry), use generic
        if (!nodeDef && type === 'function_call') {
            nodeDef = this.nodeRegistry.find(n => n.type === 'function_call');
        }

        if (!nodeDef) {
            console.error(`Node type ${type} not found in registry`);
            return null;
        }

        const nodeId = id || 'node_' + Math.random().toString(36).substr(2, 9);
        let nodeTitle = nodeDef.name;
        let isFunctionCall = false;
        let funcRef = null;

        // Force title update and resolve function ref
        if (type === 'function_call' && params && params.functionId && window.funcManager) {
            funcRef = window.funcManager.functionDB.getFunction(params.functionId);
            if (funcRef) {
                nodeTitle = funcRef.name;
                isFunctionCall = true;
            } else {
                nodeTitle = "Missing: " + (params.functionName || "Function");
                params.error = "Function Missing";
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
                label: 'In',
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
                        label: 'End', type: 'exec', id: nodeId + '_flow'
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
                label: 'Out',
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
            if (type === 'function_input' && window.funcManager) {
                const curFunc = window.funcManager.functionDB.getFunction(window.funcManager.currentFunctionId);
                if (curFunc) {
                    // Match FunctionManager.updateFunctionInputNode logic:
                    // ID: node.id + '_flow' for Exec
                    // ID: node.id + '_out_' + input.id for others
                    outputs = [];
                    outputs.push({
                        label: 'Start', type: 'exec', id: nodeId + '_flow'
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

        const nodeParams = params ? JSON.parse(JSON.stringify(params)) : JSON.parse(JSON.stringify(nodeDef.params || {}));

        const node = {
            id: nodeId,
            type,
            x: x !== undefined ? x : (this.menuX || 100),
            y: y !== undefined ? y : (this.menuY || 100),
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

        this.nodes.push(node);
        this.createNodeElement(node);
        this.updateMinimap();
        const countEl = document.getElementById('node-count');
        if (countEl) countEl.innerText = this.nodes.length;

        if (!this.isRestoring) {
            this.saveHistory('Added Node');
        }
        return node;
    },

    deleteNode(node, suppressHistory = false) {
        // Delete connections
        this.connections = this.connections.filter(c => {
            if (c.fromNode === node || c.toNode === node) {
                if (c.element && c.element.parentNode) this.svgLayer.removeChild(c.element);
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
        this.updateMinimap();

        if (!suppressHistory && !this.isRestoring) this.saveHistory('Deleted Node');
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

            const val = node.params[key];
            const widget = document.createElement('div');
            widget.style.padding = '0 10px 10px 10px';

            if (typeof val === 'boolean') {
                const toggle = document.createElement('div');
                toggle.className = `bool-toggle ${val ? 'is-true' : 'is-false'}`;
                toggle.innerText = val ? 'TRUE' : 'FALSE';
                toggle.onclick = (e) => {
                    node.params[key] = !node.params[key];
                    toggle.className = `bool-toggle ${node.params[key] ? 'is-true' : 'is-false'}`;
                    toggle.innerText = node.params[key] ? 'TRUE' : 'FALSE';
                    this.saveHistory('Toggle Param');
                    // Trigger updates if needed
                };
                widget.appendChild(toggle);
            } else if (typeof val === 'string' || typeof val === 'number') {
                if (node.type === 'string' && key === 'value') {
                    const area = document.createElement('textarea');
                    area.className = 'node-textarea';
                    area.value = val;
                    area.oninput = (e) => {
                        node.params[key] = e.target.value;
                    };
                    area.onchange = () => this.saveHistory('Edit String');
                    // Prevent drag
                    area.onmousedown = e => e.stopPropagation();
                    widget.appendChild(area);
                } else {
                    const input = document.createElement('input');
                    input.type = typeof val === 'number' ? 'number' : 'text';
                    input.className = 'node-input inline-editor';
                    if (typeof val === 'number') input.classList.add('math-input');
                    input.value = val;
                    input.oninput = (e) => {
                        node.params[key] = typeof val === 'number' ? parseFloat(e.target.value) : e.target.value;
                    };
                    input.onchange = () => this.saveHistory('Edit Param');
                    input.onmousedown = e => e.stopPropagation();
                    widget.appendChild(input);
                }
            }
            // Label for param
            if (node.type !== 'string' && node.type !== 'number' && node.type !== 'boolean') {
                const lbl = document.createElement('div');
                lbl.innerText = key;
                lbl.style.fontSize = '10px';
                lbl.style.color = '#777';
                lbl.style.marginBottom = '2px';
                centerCol.appendChild(lbl);
            }
            centerCol.appendChild(widget);
        });

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

        this.nodesLayer.appendChild(div);
        node.element = div;
        // Watch for resizes (manual or auto) to update connections
        const ro = new ResizeObserver(() => {
            this.renderConnections();
        });
        ro.observe(div);
    },

    createPort(node, portData, isInput) {
        const portWrapper = document.createElement('div');
        portWrapper.className = `port-wrapper ${isInput ? 'port-wrapper-input' : 'port-wrapper-output'}`;

        const port = document.createElement('div');
        port.className = `port port-${isInput ? 'input' : 'output'} port-type-${portData.type}`;
        port.id = portData.id;

        port.onmousedown = (e) => {
            e.stopPropagation();
            this.startConnection(node, portData, isInput ? 'input' : 'output');
        };
        port.onmouseup = (e) => {
            e.stopPropagation();
            this.finishConnection(node, portData, isInput ? 'input' : 'output');
        };

        if (isInput) {
            portWrapper.appendChild(port);
            if (portData.label) {
                const label = document.createElement('span');
                label.className = 'port-label';
                if (portData.label.length <= 1) label.classList.add('port-label-small');
                label.innerText = portData.label;
                portWrapper.appendChild(label);
            }
        } else {
            if (portData.label) {
                const label = document.createElement('span');
                label.className = 'port-label';
                label.innerText = portData.label;
                portWrapper.appendChild(label);
            }
            portWrapper.appendChild(port);
        }

        // Inline Editor for Inputs
        if (isInput && portData.key && node.params.hasOwnProperty(portData.key)) {
            const editor = this.createInlineEditor(portData.type, node.params[portData.key], (val) => {
                node.params[portData.key] = val;
                this.renderConnections(); // Value change might affect things?
            }, {
                resizable: portData.type === 'string',
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

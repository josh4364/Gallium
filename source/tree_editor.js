class NodeGraph {
    constructor(options = {}) {
        this.container = options.container || document.getElementById('editor-container');
        this.graphLayer = options.graphLayer || document.getElementById('graph-layer');
        this.nodesLayer = options.nodesLayer || document.getElementById('nodes-layer');
        this.svgLayer = options.svgLayer || document.getElementById('svg-layer');
        this.minimapContent = options.minimapContent || document.getElementById('minimap-content');
        this.minimapViewport = options.minimapViewport || document.getElementById('minimap-viewport');

        this.nodes = [];
        this.connections = [];

        this.zoomLevel = 1;
        this.panX = 200; // Better initial pan
        this.panY = 150;

        this.connectionStyle = 'curve';

        this.selectedNode = null;
        this.selectedNodes = new Set();
        this.hoveredConnection = null;

        // Node Palette Registry
        this.nodeRegistry = options.nodeRegistry || [];

        this.paletteVisible = false;
        this.paletteEl = options.paletteEl || document.getElementById('context-menu');
        this.paletteList = this.paletteEl ? this.paletteEl.querySelector('.palette-content') : null;
        this.paletteSearch = this.paletteEl ? this.paletteEl.querySelector('#node-search') : null;
        this.expandedCategories = new Set();

        this.initEvents();
        if (this.paletteEl) this.initPaletteEvents();
        if (this.minimapContent) this.initMinimapEvents();
        this.updateTransform();

        // Undo/Redo System
        this.history = [];
        this.historyIndex = -1;
        this.isRestoring = false; // Flag to prevent triggering saves during restore

        // Initial state
        setTimeout(() => this.saveHistory('Initial State'), 100);
    }

    showNotification(text) {
        const area = document.getElementById('notification-area');
        if (!area) return;
        const toast = document.createElement('div');
        toast.className = 'notification-toast';
        toast.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="16" x2="12" y2="12"></line>
                <line x1="12" y1="8" x2="12.01" y2="8"></line>
            </svg>
            <span>${text}</span>
        `;
        area.appendChild(toast);
        // Remove after 3s
        setTimeout(() => {
            toast.style.animation = 'fadeOut 0.3s forwards';
            setTimeout(() => {
                if (toast.parentNode) toast.parentNode.removeChild(toast);
            }, 300);
        }, 3000);
    }

    async compress(string) {
        const stream = new Blob([string]).stream();
        const compressedReadableStream = stream.pipeThrough(new CompressionStream("gzip"));
        const compressedResponse = new Response(compressedReadableStream);
        const blob = await compressedResponse.blob();
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result); // key for base64
            reader.readAsDataURL(blob);
        });
    }

    async decompress(dataUrl) {
        const res = await fetch(dataUrl);
        const blob = await res.blob();
        const stream = blob.stream().pipeThrough(new DecompressionStream("gzip"));
        const resp = new Response(stream);
        return await resp.text();
    }

    async serialize() {
        const data = {
            nodes: this.nodes.map(n => ({
                id: n.id,
                type: n.type,
                x: n.x, y: n.y,
                title: n.title,
                params: n.params,
                inputs: n.inputs.map(i => ({ id: i.id, label: i.label, type: i.type, key: i.key })),
                outputs: n.outputs.map(o => ({ id: o.id, label: o.label, type: o.type, key: o.key }))
            })),
            connections: this.connections.map(c => ({
                fromNode: c.fromNode.id,
                fromPort: c.fromPort.id,
                toNode: c.toNode.id,
                toPort: c.toPort.id
            })),
            view: { panX: this.panX, panY: this.panY, zoom: this.zoomLevel }
        };
        return JSON.stringify(data);
    }

    async saveHistory(actionName = 'Action') {
        if (this.isRestoring) return;

        const json = await this.serialize();
        const compressed = await this.compress(json);

        // Remove future logic if we are branching
        if (this.historyIndex < this.history.length - 1) {
            this.history = this.history.slice(0, this.historyIndex + 1);
        }

        this.history.push({ data: compressed, action: actionName });
        this.historyIndex++;

        // Limit history size? (Optional, user said "global undo buffer" suggests unlimited but dangerous)
        if (this.history.length > 50) {
            this.history.shift();
            this.historyIndex--;
        }
    }

    async undo() {
        if (this.historyIndex > 0) {
            this.historyIndex--;
            const state = this.history[this.historyIndex];
            await this.restoreState(state.data, false); // Don't restore view on undo
            this.showNotification(`Undo: ${this.history[this.historyIndex + 1].action}`);
        }
    }

    async redo() {
        if (this.historyIndex < this.history.length - 1) {
            this.historyIndex++;
            const state = this.history[this.historyIndex];
            await this.restoreState(state.data, false); // Don't restore view on redo
            this.showNotification(`Redo: ${state.action}`);
        }
    }

    async restoreState(compressedData, restoreView = false) {
        this.isRestoring = true;
        try {
            const json = await this.decompress(compressedData);
            const data = JSON.parse(json);

            // Clear
            this.nodes.forEach(n => {
                if (n.element.parentNode) n.element.parentNode.removeChild(n.element);
            });
            this.connections.forEach(c => {
                if (c.element) c.element.remove();
                if (c.hitArea) c.hitArea.remove();
            });
            this.nodes = [];
            this.connections = [];
            this.selectedNode = null;
            if (this.selectedNodes) this.selectedNodes.clear();
            this.hoveredConnection = null;

            // View
            if (restoreView && data.view) {
                this.panX = data.view.panX;
                this.panY = data.view.panY;
                this.zoomLevel = data.view.zoom;
                this.updateTransform();
            }

            // Restore Nodes
            data.nodes.forEach(n => {
                this.addNode(n.type, n.x, n.y, n.id, n.params, n.inputs, n.outputs);
            });

            // Restore Connections
            data.connections.forEach(c => {
                const fromNode = this.nodes.find(n => n.id === c.fromNode);
                const toNode = this.nodes.find(n => n.id === c.toNode);
                if (fromNode && toNode) {
                    const fromPort = fromNode.outputs.find(p => p.id === c.fromPort) || this.nodesLayer.querySelector(`#${c.fromPort}`); // Search fallback? IDs should match if saved correctly.
                    const toPort = toNode.inputs.find(p => p.id === c.toPort);

                    // Simple check
                    const realFromPort = fromNode.outputs.find(p => p.id === c.fromPort);
                    const realToPort = toNode.inputs.find(p => p.id === c.toPort);

                    if (realFromPort && realToPort) {
                        this.addConnection(fromNode, realFromPort, toNode, realToPort, true);
                    }
                }
            });

        } catch (e) {
            console.error("Failed to restore", e);
            this.showNotification("Error restoring history");
        } finally {
            this.isRestoring = false;
            this.updateMinimap();
        }
    }

    async saveToFile() {
        let json;
        if (window.funcManager && window.funcManager.functionDB) {
            await window.funcManager.saveCurrentFunction();
            json = window.funcManager.functionDB.dump();
        } else {
            json = await this.serialize();
        }

        const compressed = await this.compress(json);
        const b64 = compressed.split(',')[1];

        const blob = new Blob([b64], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = 'project_state.graph';
        document.body.appendChild(a);
        a.click();

        setTimeout(() => {
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        }, 100);
    }

    triggerLoad() {
        document.getElementById('file-input').click();
    }

    async loadFromFile(input) {
        const file = input.files[0];
        if (!file) return;

        // Save current state before loading? If loading project, history is wiped/replaced.

        const reader = new FileReader();
        reader.onload = async (e) => {
            const content = e.target.result;

            // Reconstruct data URL for decompression
            const dataUrl = `data:application/octet-stream;base64,${content}`;

            try {
                const decompressed = await this.decompress(dataUrl);
                const data = JSON.parse(decompressed);

                // Detect Type
                // Project DB is a map of ID -> Function Object
                const keys = Object.keys(data);
                const isProject = keys.some(k => k.startsWith('func_'));
                const isGraph = data.nodes && data.connections;

                if (isProject && window.funcManager) {
                    if (window.funcManager.functionDB.load(decompressed)) {
                        window.funcManager.updateSelector();
                        // Load first function
                        const all = window.funcManager.functionDB.getAllFunctions();
                        if (all.length > 0) {
                            await window.funcManager.loadFunction(all[0].id);
                        } else {
                            // Create default if empty db?
                            window.funcManager.createNewFunction();
                        }
                        this.showNotification("Project Loaded");
                    }
                } else if (isGraph) {
                    // Single graph load
                    await this.loadData(decompressed);
                    this.recenter();
                    this.showNotification("Graph Loaded");
                } else {
                    console.error("Unknown file format");
                    this.showNotification("Error: Unknown File Format");
                }

            } catch (err) {
                console.error("Failed to load/decompress", err);
                // Fallback try JSON parse directly? 
                // Currently save is always compressed.
                this.showNotification("Error Loading File");
            }
        };
        reader.readAsText(file);
        input.value = '';
    }

    clear() {
        // Remove all DOM elements
        this.nodes.forEach(n => {
            if (n.element.parentNode) n.element.parentNode.removeChild(n.element);
        });
        this.connections.forEach(c => {
            if (c.element) c.element.remove();
            if (c.hitArea) c.hitArea.remove();
        });

        this.nodes = [];
        this.connections = [];
        this.selectedNode = null;
        if (this.selectedNodes) this.selectedNodes.clear();
        this.hoveredConnection = null;
        this.history = [];
        this.historyIndex = -1;
        this.updateMinimap();

        const countEl = document.getElementById('node-count');
        if (countEl) countEl.innerText = 0;
    }

    async loadData(jsonString) {
        this.isRestoring = true;
        try {
            const data = JSON.parse(jsonString);
            this.clear();

            // View
            if (data.view) {
                this.panX = data.view.panX;
                this.panY = data.view.panY;
                this.zoomLevel = data.view.zoom;
                this.updateTransform();
            }

            // Restore Nodes
            data.nodes.forEach(n => {
                // Refresh function call details from DB if available
                if (n.type === 'function_call' && n.params && n.params.functionId && window.funcManager) {
                    const func = window.funcManager.functionDB.getFunction(n.params.functionId);
                    if (func) {
                        n.title = func.name;
                    } else {
                        n.title = "Missing: " + n.title;
                        n.params.error = "Function Missing";
                    }
                }
                this.addNode(n.type, n.x, n.y, n.id, n.params, n.inputs, n.outputs);
            });

            // Restore Connections
            data.connections.forEach(c => {
                const fromNode = this.nodes.find(n => n.id === c.fromNode);
                const toNode = this.nodes.find(n => n.id === c.toNode);
                if (fromNode && toNode) {
                    const fromPort = fromNode.outputs.find(p => p.id === c.fromPort);
                    const toPort = toNode.inputs.find(p => p.id === c.toPort);
                    if (fromPort && toPort) {
                        this.addConnection(fromNode, fromPort, toNode, toPort, true);
                    }
                }
            });

        } catch (e) {
            console.error("Failed to load data", e);
            this.showNotification("Error loading graph data");
        } finally {
            this.isRestoring = false;
            this.updateMinimap();
        }
    }

    initMinimapEvents() {
        const minimap = this.minimapContent.parentElement;
        if (!minimap) return;
        minimap.addEventListener('mousedown', (e) => {
            e.stopPropagation();
        });
        minimap.addEventListener('wheel', (e) => {
            e.stopPropagation();
        });
    }

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
    }

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
    }

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
    }

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
    }

    closePalette() {
        if (this.paletteEl) {
            this.paletteEl.style.display = 'none';
        }
        this.paletteVisible = false;
    }

    initEvents() {
        this.container.addEventListener('mousedown', (e) => {
            // Pan on Middle Mouse OR (Left Mouse on Background ONLY)
            const isLeftClick = e.button === 0;
            const isMiddleClick = e.button === 1;
            const isBackground = e.target === this.container || e.target === this.graphLayer || e.target.id === 'svg-layer';

            if (isMiddleClick || (isLeftClick && isBackground && !e.shiftKey)) {
                this.isPanning = true;
                this.startX = e.clientX - this.panX;
                this.startY = e.clientY - this.panY;
                this.container.style.cursor = 'grabbing';
            } else if (isLeftClick && isBackground && e.shiftKey) {
                this.isBoxSelecting = true;
                this.boxSelectStart = { x: e.clientX, y: e.clientY };
                this.boxSelectEl = document.createElement('div');
                this.boxSelectEl.className = 'selection-box';
                this.boxSelectEl.style.left = e.clientX + 'px';
                this.boxSelectEl.style.top = e.clientY + 'px';
                this.boxSelectEl.style.width = '0px';
                this.boxSelectEl.style.height = '0px';
                document.body.appendChild(this.boxSelectEl);
                this.deselectNodes();
            } else if (isLeftClick && !this.isDraggingNode && !this.isCreatingConnection) {
                this.deselectNodes();
            }
        });

        window.addEventListener('mousemove', (e) => {
            if (this.isPanning) {
                this.panX = e.clientX - this.startX;
                this.panY = e.clientY - this.startY;
                this.updateTransform();
            }
            if (this.isBoxSelecting) {
                const currentX = e.clientX;
                const currentY = e.clientY;

                const left = Math.min(this.boxSelectStart.x, currentX);
                const top = Math.min(this.boxSelectStart.y, currentY);
                const width = Math.abs(currentX - this.boxSelectStart.x);
                const height = Math.abs(currentY - this.boxSelectStart.y);

                this.boxSelectEl.style.left = left + 'px';
                this.boxSelectEl.style.top = top + 'px';
                this.boxSelectEl.style.width = width + 'px';
                this.boxSelectEl.style.height = height + 'px';
            }
            if (this.isDraggingNode) {
                const dx = (e.clientX - this.dragStartX) / this.zoomLevel;
                const dy = (e.clientY - this.dragStartY) / this.zoomLevel;

                if (this.dragStartPositions) {
                    this.dragStartPositions.forEach((pos, nodeId) => {
                        const node = this.nodes.find(n => n.id === nodeId);
                        if (node) {
                            node.x = pos.x + dx;
                            node.y = pos.y + dy;
                            this.updateNodeElement(node);
                        }
                    });
                } else {
                    this.isDraggingNode.x = this.nodeOrigX + dx;
                    this.isDraggingNode.y = this.nodeOrigY + dy;
                    this.updateNodeElement(this.isDraggingNode);
                }

                this.renderConnections();
                this.updateMinimap();
            }
            if (this.isCreatingConnection) {
                this.updateDraftConnection(e.clientX, e.clientY);
            }
        });

        window.addEventListener('mouseup', () => {
            if (this.isDraggingNode && !this.isRestoring) {
                // Determine if we actually moved
                let moved = false;
                if (this.dragStartPositions && this.dragStartPositions.size > 0 && this.isDraggingNode) {
                    const startPos = this.dragStartPositions.get(this.isDraggingNode.id);
                    if (startPos && (startPos.x !== this.isDraggingNode.x || startPos.y !== this.isDraggingNode.y)) {
                        moved = true;
                    }
                } else if (this.nodeOrigX !== this.isDraggingNode.x || this.nodeOrigY !== this.isDraggingNode.y) {
                    moved = true;
                }

                if (moved) {
                    this.saveHistory('Moved Node(s)');
                }
            }

            if (this.isBoxSelecting) {
                this.finishBoxSelection();
            }

            this.isPanning = false;
            this.container.style.cursor = 'default';
            this.isDraggingNode = null;
            this.dragStartPositions = null;
            if (this.isCreatingConnection) {
                this.cancelDraftConnection();
            }
        });

        this.container.addEventListener('wheel', (e) => {
            e.preventDefault();
            const delta = e.deltaY > 0 ? 0.9 : 1.1;
            this.zoom(delta, e.clientX, e.clientY);
        });

        this.container.oncontextmenu = (e) => {
            e.preventDefault();
            this.openPalette(e.clientX, e.clientY);
        };

        window.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT') return;

            if (e.key === 'Delete' || e.key === 'Backspace') {
                if (this.selectedNodes && this.selectedNodes.size > 0) {
                    const nodesToDelete = Array.from(this.selectedNodes);
                    nodesToDelete.forEach(n => this.deleteNode(n, true));
                    this.selectedNodes.clear();
                    this.saveHistory('Deleted Nodes');
                } else if (this.selectedNode) {
                    this.deleteNode(this.selectedNode);
                } else if (this.hoveredConnection) {
                    this.deleteConnection(this.hoveredConnection);
                }
            }
            if (e.key === ' ' && !this.isPanning) {
                this.isPanningMode = true;
                this.container.style.cursor = 'grab';
            }
            if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'z')) {
                e.preventDefault();
                if (e.shiftKey) {
                    this.redo();
                } else {
                    this.undo();
                }
            }
            if (e.code === 'NumpadDecimal') {
                this.focusSelection();
            }
        });

        window.addEventListener('keyup', (e) => {
            if (e.key === ' ') {
                this.isPanningMode = false;
                this.container.style.cursor = 'default';
            }
        });
    }

    finishBoxSelection() {
        if (!this.boxSelectEl) return;

        const rect = this.boxSelectEl.getBoundingClientRect();
        if (this.boxSelectEl.parentNode) {
            this.boxSelectEl.parentNode.removeChild(this.boxSelectEl);
        }
        this.boxSelectEl = null;
        this.isBoxSelecting = false;

        this.nodes.forEach(node => {
            if (!node.element) return;
            const nodeRect = node.element.getBoundingClientRect();
            if (this.rectsIntersect(rect, nodeRect)) {
                this.selectNode(node, true);
            }
        });
    }

    rectsIntersect(r1, r2) {
        return !(r2.left > r1.right ||
            r2.right < r1.left ||
            r2.top > r1.bottom ||
            r2.bottom < r1.top);
    }

    zoom(factor, centerX, centerY) {
        if (!centerX) centerX = window.innerWidth / 2;
        if (!centerY) centerY = window.innerHeight / 2;

        const prevZoom = this.zoomLevel;
        this.zoomLevel *= factor;
        this.zoomLevel = Math.max(0.1, Math.min(3, this.zoomLevel));

        const actualFactor = this.zoomLevel / prevZoom;
        this.panX = centerX - (centerX - this.panX) * actualFactor;
        this.panY = centerY - (centerY - this.panY) * actualFactor;

        this.updateTransform();
    }

    resetZoom() {
        // Zoom to 1.0 around the center of the screen
        const centerX = window.innerWidth / 2;
        const centerY = window.innerHeight / 2;

        const prevZoom = this.zoomLevel;
        this.zoomLevel = 1.0;

        const actualFactor = this.zoomLevel / prevZoom;
        this.panX = centerX - (centerX - this.panX) * actualFactor;
        this.panY = centerY - (centerY - this.panY) * actualFactor;

        this.updateTransform();
    }

    focusSelection() {
        let nodesToFocus = [];
        if (this.selectedNodes && this.selectedNodes.size > 0) {
            nodesToFocus = Array.from(this.selectedNodes);
        } else if (this.selectedNode) {
            nodesToFocus = [this.selectedNode];
        }

        if (nodesToFocus.length === 0) return;

        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        nodesToFocus.forEach(n => {
            minX = Math.min(minX, n.x);
            const width = n.element ? n.element.offsetWidth : 240;
            const height = n.element ? n.element.offsetHeight : 100;
            maxX = Math.max(maxX, n.x + width);
            minY = Math.min(minY, n.y);
            maxY = Math.max(maxY, n.y + height);
        });

        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;

        const viewportW = this.container.clientWidth || window.innerWidth;
        const viewportH = this.container.clientHeight || window.innerHeight;

        // Keep current zoom, just pan to center
        this.panX = (viewportW / 2) - (centerX * this.zoomLevel);
        this.panY = (viewportH / 2) - (centerY * this.zoomLevel);

        this.updateTransform();
    }

    recenter() {
        if (this.nodes.length === 0) {
            this.panX = 200;
            this.panY = 150;
            this.updateTransform();
            return;
        }

        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        this.nodes.forEach(n => {
            minX = Math.min(minX, n.x);
            // Approximation if we don't have element dimensions yet (e.g. before render frame), 
            // but elements should be created by now in restoreState.
            const width = n.element ? n.element.offsetWidth : 240;
            const height = n.element ? n.element.offsetHeight : 100;
            maxX = Math.max(maxX, n.x + width);
            minY = Math.min(minY, n.y);
            maxY = Math.max(maxY, n.y + height);
        });

        // Center of the bounding box around all nodes
        const graphCenterX = (minX + maxX) / 2;
        const graphCenterY = (minY + maxY) / 2;

        // Center of the viewport
        const viewportW = this.container.clientWidth || window.innerWidth;
        const viewportH = this.container.clientHeight || window.innerHeight;

        // We want the graphCenter to be at viewportCenter.
        // ScreenPos = GraphPos * Zoom + Pan
        // Pan = ScreenPos - GraphPos * Zoom
        this.panX = (viewportW / 2) - (graphCenterX * this.zoomLevel);
        this.panY = (viewportH / 2) - (graphCenterY * this.zoomLevel);

        this.updateTransform();
    }

    updateTransform() {
        this.graphLayer.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.zoomLevel})`;
        const zoomEl = document.getElementById('zoom-level');
        if (zoomEl) zoomEl.innerText = Math.round(this.zoomLevel * 100) + '%';

        // Connection style selector
        const styleSelect = document.getElementById('connection-style-select');
        if (styleSelect) {
            styleSelect.value = this.connectionStyle;
            styleSelect.onchange = (e) => {
                this.connectionStyle = e.target.value;
                this.renderConnections();
            };
        }
        const posEl = document.getElementById('view-pos');
        if (posEl) posEl.innerText = `${Math.round(this.panX)}, ${Math.round(this.panY)}`;
        this.updateMinimap();
    }

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
    }

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
    }

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
    }

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
    }

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
    }

    updateNodeElement(node) {
        node.element.style.left = node.x + 'px';
        node.element.style.top = node.y + 'px';
    }

    selectNode(node, additive = false) {
        if (!additive) {
            this.deselectNodes();
        }
        this.selectedNodes.add(node);
        this.selectedNode = node; // Primary selection
        node.element.classList.add('selected');
        // Bring to front
        this.nodesLayer.appendChild(node.element);
    }

    deselectNodes() {
        this.selectedNodes.forEach(n => {
            if (n.element) n.element.classList.remove('selected');
        });
        this.selectedNodes.clear();
        this.selectedNode = null;
    }

    startConnection(node, port, type) {
        this.isCreatingConnection = { node, port, type };
        this.draftLine = document.createElementNS("http://www.w3.org/2000/svg", "path");
        this.draftLine.setAttribute("class", "connection-line draft");
        this.svgLayer.appendChild(this.draftLine);
    }

    updateDraftConnection(clientX, clientY) {
        if (!this.isCreatingConnection) return;

        const portEl = document.getElementById(this.isCreatingConnection.port.id);
        if (!portEl) return;
        const portRect = portEl.getBoundingClientRect();
        const containerRect = this.container.getBoundingClientRect();

        const startX = (portRect.left - containerRect.left + portRect.width / 2 - this.panX) / this.zoomLevel;
        const startY = (portRect.top - containerRect.top + portRect.height / 2 - this.panY) / this.zoomLevel;
        const endX = (clientX - containerRect.left - this.panX) / this.zoomLevel;
        const endY = (clientY - containerRect.top - this.panY) / this.zoomLevel;

        this.draftLine.setAttribute("d", this.calculatePath(startX, startY, endX, endY));
    }

    finishConnection(node, port, type) {
        if (this.isCreatingConnection && this.isCreatingConnection.type !== type) {
            const fromNode = this.isCreatingConnection.type === 'output' ? this.isCreatingConnection.node : node;
            const fromPort = this.isCreatingConnection.type === 'output' ? this.isCreatingConnection.port : port;
            const toNode = this.isCreatingConnection.type === 'input' ? this.isCreatingConnection.node : node;
            const toPort = this.isCreatingConnection.type === 'input' ? this.isCreatingConnection.port : port;

            if (fromNode === toNode) {
                console.warn("Self-connection prevented");
                this.cancelDraftConnection();
                return;
            }

            if (fromPort.type !== toPort.type) {
                console.warn("Connection type mismatch:", fromPort.type, "vs", toPort.type);
                this.cancelDraftConnection();
                return;
            }

            this.addConnection(fromNode, fromPort, toNode, toPort);
        }
        this.cancelDraftConnection();
    }

    cancelDraftConnection() {
        if (this.draftLine) {
            if (this.draftLine.parentNode) this.svgLayer.removeChild(this.draftLine);
            this.draftLine = null;
        }
        this.isCreatingConnection = null;
    }

    addConnection(fromNode, fromPort, toNode, toPort, isRestore = false) {
        if (this.connections.some(c => c.fromPort.id === fromPort.id && c.toPort.id === toPort.id)) return;

        if (toPort.type !== 'exec') {
            const existing = this.connections.find(c => c.toPort.id === toPort.id);
            if (existing) this.deleteConnection(existing, true); // Suppress history on internal delete
        }

        const conn = { fromNode, fromPort, toNode, toPort };

        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("class", "connection-line");

        const style = getComputedStyle(document.documentElement);
        const color = style.getPropertyValue(`--type-${fromPort.type}`).trim() || '#fff';
        path.style.stroke = color;
        path.style.filter = `drop-shadow(0 0 8px ${color}66)`;

        const hitArea = document.createElementNS("http://www.w3.org/2000/svg", "path");
        hitArea.setAttribute("fill", "none");
        hitArea.setAttribute("stroke", "rgba(255, 255, 255, 0.01)");
        hitArea.setAttribute("stroke-width", "16");
        hitArea.setAttribute("pointer-events", "stroke");
        hitArea.style.cursor = "pointer";

        hitArea.onmouseenter = () => {
            this.hoveredConnection = conn;
            path.style.strokeWidth = "5";
            path.style.opacity = "1";
            path.style.filter = `drop-shadow(0 0 12px ${color})`;
        };
        hitArea.onmouseleave = () => {
            if (this.hoveredConnection === conn) {
                this.hoveredConnection = null;
                path.style.strokeWidth = "";
                path.style.opacity = "";
                path.style.filter = `drop-shadow(0 0 8px ${color}66)`;
            }
        };

        hitArea.onmousedown = (e) => {
            e.stopPropagation();
            this.deselectNodes();
        };

        this.svgLayer.appendChild(path);
        this.svgLayer.appendChild(hitArea);

        conn.element = path;
        conn.hitArea = hitArea;

        this.connections.push(conn);

        // Hide inline editor
        const editor = toNode.element.querySelector(`.inline-editor[data-port-id="${toPort.id}"]`);
        if (editor) editor.style.display = 'none';

        this.renderConnections();
        if (!isRestore && !this.isRestoring) this.saveHistory('Connected');
    }

    deleteConnection(conn, suppressHistory = false) {
        if (conn.element && conn.element.parentNode) {
            this.svgLayer.removeChild(conn.element);
        }
        if (conn.hitArea && conn.hitArea.parentNode) {
            this.svgLayer.removeChild(conn.hitArea);
        }

        // Show inline editor
        const editor = conn.toNode.element.querySelector(`.inline-editor[data-port-id="${conn.toPort.id}"]`);
        if (editor) editor.style.display = '';

        this.connections = this.connections.filter(c => c !== conn);
        if (this.hoveredConnection === conn) {
            this.hoveredConnection = null;
        }

        if (!suppressHistory && !this.isRestoring) this.saveHistory('Deleted Connection');
    }

    calculatePath(x1, y1, x2, y2) {
        if (this.connectionStyle === 'circuit') {
            // 45-degree angle visual style
            const midX = (x1 + x2) / 2;
            const dist = Math.abs(x2 - x1);
            // Simple circuit: horizontal -> diagonal -> horizontal
            // We want to avoid overlapping logic for now, so let's try a standardized approach
            // Go horizontal to midway, then vertical? No, that's Manhattan.
            // Circuit usually means limiting lines to 0, 45, 90 degrees.

            // Heuristic: Go horizontal out, then 45 to align Y, then horizontal in.

            // Calculate 45 deg segment length needed to cover Y difference
            const dy = y2 - y1;
            const dx = x2 - x1;

            let path = `M ${x1} ${y1}`;

            // If nodes are too close horizontally, fallback to chamfered manhattan
            if (dx < 40) return this.calculateChamferedManhattan(x1, y1, x2, y2);

            // We want the 45 deg segment to be in the middle if possible
            const chamferSize = Math.min(Math.abs(dy), Math.abs(dx) / 2);
            // ... (rest of circuit logic is fine if we return early above)
            const signY = dy > 0 ? 1 : -1;

            const p1x = x1 + (dx / 2) - (Math.abs(dy) / 2);
            const p2x = x1 + (dx / 2) + (Math.abs(dy) / 2);

            // Verify order
            if (p1x > x1 && p2x < x2) {
                path += ` L ${p1x} ${y1} L ${p2x} ${y2} L ${x2} ${y2}`;
            } else {
                return this.calculateChamferedManhattan(x1, y1, x2, y2);
            }
            return path;

        } else if (this.connectionStyle === 'straight') {
            return this.calculateManhattan(x1, y1, x2, y2);
        }

        // Default Curve
        return this.calculateBezier(x1, y1, x2, y2);
    }

    calculateManhattan(x1, y1, x2, y2) {
        const midX = (x1 + x2) / 2;
        return `M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2} ${y2}`;
    }

    calculateChamferedManhattan(x1, y1, x2, y2) {
        let midX = (x1 + x2) / 2;
        const dx = Math.abs(x2 - x1);
        const dy = Math.abs(y2 - y1);
        const signY = y2 > y1 ? 1 : -1;
        const signX = x2 > x1 ? 1 : -1;

        // Chamfer radius (max 10 or half available space)
        const maxR = Math.min(10, dx / 2);
        const r = Math.min(maxR, dy / 2);

        if (r < 2) return this.calculateManhattan(x1, y1, x2, y2);

        // Corner 1: (midX, y1) -> Approached from x1 (horizontal)
        // Corner 2: (midX, y2) -> Leaving to x2 (horizontal)

        return `M ${x1} ${y1} ` +
            `L ${midX - r * signX} ${y1} ` +
            `L ${midX} ${y1 + r * signY} ` +
            `L ${midX} ${y2 - r * signY} ` +
            `L ${midX + r * signX} ${y2} ` +
            `L ${x2} ${y2}`;
    }

    calculateBezier(x1, y1, x2, y2) {
        const dist = Math.abs(x2 - x1) + Math.abs(y2 - y1);
        const cp1x = x1 + dist * 0.4;
        const cp2x = x2 - dist * 0.4;
        return `M ${x1} ${y1} C ${cp1x} ${y1}, ${cp2x} ${y2}, ${x2} ${y2}`;
    }

    renderConnections() {
        const containerRect = this.container.getBoundingClientRect();
        this.connections.forEach(conn => {
            const fromEl = document.getElementById(conn.fromPort.id);
            const toEl = document.getElementById(conn.toPort.id);
            if (!fromEl || !toEl) return;

            const fromRect = fromEl.getBoundingClientRect();
            const toRect = toEl.getBoundingClientRect();

            const x1 = (fromRect.left - containerRect.left + fromRect.width / 2 - this.panX) / this.zoomLevel;
            const y1 = (fromRect.top - containerRect.top + fromRect.height / 2 - this.panY) / this.zoomLevel;
            const x2 = (toRect.left - containerRect.left + toRect.width / 2 - this.panX) / this.zoomLevel;
            const y2 = (toRect.top - containerRect.top + toRect.height / 2 - this.panY) / this.zoomLevel;

            const d = this.calculatePath(x1, y1, x2, y2);
            conn.element.setAttribute("d", d);
            if (conn.hitArea) {
                conn.hitArea.setAttribute("d", d);
            }
        });
    }

    updateMinimap() {
        if (!this.minimapContent) return;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        if (this.nodes.length === 0) {
            minX = -500; minY = -500; maxX = 1500; maxY = 1500;
        } else {
            this.nodes.forEach(n => {
                minX = Math.min(minX, n.x);
                minY = Math.min(minY, n.y);
                maxX = Math.max(maxX, n.x + 200);
                maxY = Math.max(maxY, n.y + 150);
            });
            minX -= 1000; minY -= 1000; maxX += 1000; maxY += 1000;
        }

        const width = maxX - minX;
        const height = maxY - minY;
        const mmWidth = 200;
        const mmHeight = 150;
        const scale = Math.min(mmWidth / width, mmHeight / height);

        this.minimapContent.innerHTML = '';
        this.nodes.forEach(n => {
            const rect = document.createElement('div');
            rect.className = 'minimap-node';
            rect.style.left = (n.x - minX) * scale + 'px';
            rect.style.top = (n.y - minY) * scale + 'px';
            rect.style.width = Math.max(1, 200 * scale) + 'px';
            rect.style.height = Math.max(1, 100 * scale) + 'px';

            const nodeDef = this.nodeRegistry.find(nd => nd.type === n.type);
            rect.style.background = (nodeDef && nodeDef.color) ? nodeDef.color : 'var(--primary-accent)';

            rect.style.position = 'absolute';
            rect.style.opacity = '0.5';
            this.minimapContent.appendChild(rect);
        });

        const vpX = (-this.panX / this.zoomLevel - minX) * scale;
        const vpY = (-this.panY / this.zoomLevel - minY) * scale;
        const vpW = (window.innerWidth / this.zoomLevel) * scale;
        const vpH = (window.innerHeight / this.zoomLevel) * scale;

        if (this.minimapViewport) {
            this.minimapViewport.style.left = vpX + 'px';
            this.minimapViewport.style.top = vpY + 'px';
            this.minimapViewport.style.width = vpW + 'px';
            this.minimapViewport.style.height = vpH + 'px';
        }
    }

    render() {
        this.renderConnections();
        this.updateMinimap();
    }
}

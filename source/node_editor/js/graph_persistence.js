Object.assign(NodeGraph.prototype, {
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
    },

    async decompress(dataUrl) {
        const res = await fetch(dataUrl);
        const blob = await res.blob();
        const stream = blob.stream().pipeThrough(new DecompressionStream("gzip"));
        const resp = new Response(stream);
        return await resp.text();
    },

    async serialize() {
        const data = {
            nodes: this.nodes.map(n => ({
                id: n.id,
                type: n.type,
                x: n.x, y: n.y,
                width: n.width,
                height: n.height,
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
            types: window.typeDB ? window.typeDB.serialize() : null,
            view: { panX: this.panX, panY: this.panY, zoom: this.zoomLevel }
        };
        return JSON.stringify(data);
    },

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
                this.addNode(n.type, n.x, n.y, n.id, n.params, n.inputs, n.outputs, n.width, n.height);
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
    },

    async saveToFile() {
        if (window.funcManager && window.funcManager.functionDB) {
            await window.funcManager.saveCurrentFunction();

            const currentFuncId = window.funcManager.currentFunctionId;
            const currentFunc = window.funcManager.functionDB.getFunction(currentFuncId);

            if (currentFunc) {
                // Prepare Payload for Server
                // We want to unpack 'data' string into the object so the server has a clean JSON
                let graphData = {};
                try {
                    graphData = JSON.parse(currentFunc.data);
                } catch (e) {
                    console.error("Error parsing graph data", e);
                }

                const payload = {
                    id: currentFunc.id,
                    name: currentFunc.name,
                    description: currentFunc.description,
                    tags: currentFunc.tags,
                    inputs: currentFunc.inputs,
                    outputs: currentFunc.outputs,
                    nodes: graphData.nodes || [],
                    connections: graphData.connections || [],
                    view: graphData.view
                };

                // Send to Server via Parent
                if (window.parent && window.parent.saveFunctionToServer) {
                    window.parent.saveFunctionToServer(currentFunc.id, payload);
                    this.showNotification("Saving to Server...");
                    return;
                }
            }

            // Fallback: Download full DB if no server connection or legacy
            const json = window.funcManager.functionDB.dump();
            this.downloadFile(json, 'project_state.json');
        } else {
            // Single graph mode
            const json = await this.serialize();
            // Try server save for single graph? 
            if (window.parent && window.parent.saveFunctionToServer) {
                const data = JSON.parse(json);
                // Assign a temp ID
                window.parent.saveFunctionToServer("graph_" + Date.now(), data);
                this.showNotification("Saving to Server...");
                return;
            }
            this.downloadFile(json, 'graph_state.graph');
        }
    },

    downloadFile(content, filename) {
        const stream = new Blob([content]).stream();
        const compressedReadableStream = stream.pipeThrough(new CompressionStream("gzip"));
        // For simple download we might not need compression if saving to disk? 
        // But original code did compress. Let's keep it simple for now and just text download if it's fallback.
        // Actually original used gzip.
        // Let's just do plain text for fallback to be safe/inspectable, or stick to compress.
        // Re-implementing original compression logic for download:

        // ... (truncated reuse of compress helper)
        this.compress(content).then(compressed => {
            const b64 = compressed.split(',')[1];
            const blob = new Blob([b64], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            setTimeout(() => {
                document.body.removeChild(a);
                window.URL.revokeObjectURL(url);
            }, 100);
        });
    },

    triggerLoad() {
        document.getElementById('file-input').click();
    },

    async loadFromFile(input) {
        const file = input.files[0];
        if (!file) return;

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
                this.showNotification("Error Loading File");
            }
        };
        reader.readAsText(file);
        input.value = '';
    },

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
    },

    async loadData(input) {
        this.isRestoring = true;
        try {
            let data;
            if (typeof input === 'string') {
                try {
                    data = JSON.parse(input);
                } catch (e) {
                    console.error("GraphPersistence: Failed to parse JSON string", e);
                    return;
                }
            } else if (typeof input === 'object') {
                data = input;
            } else {
                console.error("GraphPersistence: Invalid data type", typeof input);
                return;
            }

            if (!data) {
                console.error("GraphPersistence: Data is null/undefined");
                return;
            }

            this.clear();

            // Restore Types
            if (data.types && window.typeDB) {
                window.typeDB.load(data.types);
            }

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
                this.addNode(n.type, n.x, n.y, n.id, n.params, n.inputs, n.outputs, n.width, n.height);
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
});

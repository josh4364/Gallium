// TypeDatabase is now in type_system.js

class FunctionDatabase {
    constructor() {
        this.functions = {}; // Map<id, FunctionData>
        // Seed with a default function
        const seed = this.createFunction('Main', 'Entry point of the program.');
        seed.isSeed = true;
    }

    createFunction(name, description = '', prefix = 'func_') {
        const id = prefix + Math.random().toString(36).substr(2, 9);
        this.functions[id] = {
            id: id,
            name: name,
            description: description,
            tags: [],
            inputs: [], // Array of {name, type, id}
            outputs: [], // Array of {name, type, id}
            data: { nodes: [], connections: [] }, // Serialized graph data
            history: [], // Undo stack
            historyIndex: -1
        };
        return this.functions[id];
    }

    getFunction(id) {
        return this.functions[id];
    }

    getAllFunctions() {
        return Object.values(this.functions);
    }

    updateFunction(id, updates) {
        if (this.functions[id]) {
            Object.assign(this.functions[id], updates);
            return this.functions[id];
        }
        return null;
    }

    deleteFunction(id) {
        delete this.functions[id];
    }

    dump() {
        return JSON.stringify(this.functions);
    }

    load(jsonString) {
        try {
            const data = JSON.parse(jsonString);
            // Validate?
            this.functions = data;
            return true;
        } catch (e) {
            console.error("Failed to load function db", e);
            return false;
        }
    }
}

class FunctionManager {
    constructor(graph, typeDB, functionDB, agentDB) {
        this.graph = graph;
        this.typeDB = typeDB;
        this.functionDB = functionDB;
        this.agentDB = agentDB || new FunctionDatabase(); // Optional for now
        this.mode = 'function'; // 'function' or 'agent'
        this.currentFunctionId = null;

        // Initialize with functions by default
        this.loadFirstAvailable();
        this.bindUI();
    }

    get curDB() {
        return this.mode === 'agent' ? this.agentDB : this.functionDB;
    }

    setMode(mode) {
        if (this.mode === mode) return;
        this.mode = mode;
        this.currentFunctionId = null;
        console.log("Switched to mode:", mode);
        this.updateSelector();
        this.loadFirstAvailable();
    }

    loadFirstAvailable() {
        const items = this.curDB.getAllFunctions();
        if (items.length > 0) {
            this.loadFunction(items[0].id);
        } else {
            // Create default?
            this.graph.clear();
            this.updateSelector();
        }
    }

    bindUI() {
        const nameField = document.getElementById('func-name');
        if (nameField) {
            nameField.onchange = (e) => {
                const func = this.curDB.getFunction(this.currentFunctionId);
                if (func) {
                    func.name = e.target.value;
                    this.updateSelector();
                }
            };
        }

        const descField = document.getElementById('func-desc');
        if (descField) {
            descField.onchange = (e) => {
                const func = this.curDB.getFunction(this.currentFunctionId);
                if (func) func.description = e.target.value;
            };
        }

        const selector = document.getElementById('function-selector');
        if (selector) {
            selector.onchange = (e) => {
                this.saveCurrentFunction();
                this.loadFunction(e.target.value);
            };
        }
    }

    updateSelector() {
        const selector = document.getElementById('function-selector');
        if (!selector) return;
        selector.innerHTML = '';

        const funcs = this.curDB.getAllFunctions();
        funcs.forEach(f => {
            const opt = document.createElement('option');
            opt.value = f.id;
            opt.text = f.name;
            if (f.id === this.currentFunctionId) opt.selected = true;
            selector.appendChild(opt);
        });
    }

    async createNewFunction() {
        await this.saveCurrentFunction();
        const prefix = this.mode === 'agent' ? 'agent_' : 'func_';
        const name = this.mode === 'agent' ? 'New Agent' : 'New Function';
        const newFunc = this.curDB.createFunction(name, '', prefix);

        // Switch to the new one
        this.currentFunctionId = newFunc.id;
        this.updateSelector();
        await this.loadFunction(newFunc.id);

        // Save the new stub to server immediately so it's not purged on refresh
        await this.saveCurrentFunction();
    }

    async deleteCurrentFunction() {
        if (!this.currentFunctionId) return;

        const func = this.curDB.getFunction(this.currentFunctionId);
        if (!func) return;

        if (!confirm(`Are you sure you want to delete the function "${func.name}"? This will also delete the file on disk.`)) {
            return;
        }

        const idToDelete = this.currentFunctionId;

        // Notify Server
        if (this.mode === 'agent') {
            if (window.parent && window.parent.deleteAgentToServer) {
                window.parent.deleteAgentToServer(idToDelete);
            }
        } else {
            if (window.parent && window.parent.deleteFunctionFromServer) {
                window.parent.deleteFunctionFromServer(idToDelete);
            }
        }

        // Delete Locally
        this.curDB.deleteFunction(idToDelete);
        this.currentFunctionId = null;

        // Load another function or a new one
        const remaining = this.curDB.getAllFunctions();
        if (remaining.length > 0) {
            await this.loadFunction(remaining[0].id);
        } else {
            await this.createNewFunction();
        }

        this.updateSelector();
    }

    async loadFunction(functionId) {
        if (this.currentFunctionId && this.currentFunctionId !== functionId) {
            this.saveCurrentFunction();
        }

        const func = this.curDB.getFunction(functionId);
        if (!func) return;

        this.currentFunctionId = functionId;
        this.updateSelector();
        this.updateUI();

        // Lazy Load from Server
        if ((!func.data || Object.keys(func.data).length === 0) && window.parent) {
            console.log("Requesting data from server:", functionId);
            if (this.mode === 'agent' && window.parent.requestServerAgent) {
                window.parent.requestServerAgent(functionId);
            } else if (window.parent.requestServerFunction) {
                window.parent.requestServerFunction(functionId);
            }
            return; // Wait for callback
        }

        // Clear and Load
        if (func.data) {
            console.log("FunctionManager: Loading data into graph", typeof func.data);
            if (this.graph.loadData) {
                // Handle both string and object data
                let dataToLoad = typeof func.data === 'string' ? func.data : JSON.stringify(func.data);
                const isEmpty = !dataToLoad || dataToLoad === "{}" || dataToLoad === "null" || dataToLoad === '{"nodes":[],"connections":[]}';

                if (isEmpty) {
                    console.log("FunctionManager: Graph data is empty, clearing view.");
                    this.graph.clear();
                    this.graph.recenter();
                } else {
                    await this.graph.loadData(dataToLoad);
                }
            } else {
                console.warn("NodeGraph.loadData not implemented");
            }
        } else {
            console.log("FunctionManager: No data found for function, clearing.");
            this.graph.clear();
            this.graph.recenter();
            // Do not save initial state here if it's a new function
        }

        // Restore History
        if (func.history && func.history.length > 0) {
            this.graph.history = [...func.history];
            this.graph.historyIndex = func.historyIndex;
        } else {
            this.graph.history = [];
            this.graph.historyIndex = -1;
            this.graph.saveHistory('Initial State');
        }

        this.updateUI();
    }

    onServerFunctionLoaded(id, data) {
        console.log("FunctionManager: onServerFunctionLoaded", id, data);
        const func = this.curDB.getFunction(id);
        if (func) {
            if (!data) {
                console.warn("FunctionManager: Received null data for function", id, "- assuming empty.");
                func.data = { nodes: [], connections: [] };
                // If it's the current function, force a re-load to clear the view
                if (this.currentFunctionId === id) {
                    this.loadFunction(id);
                }
                return;
            }
            // Update metadata if present in data
            if (data.name) func.name = data.name;
            if (data.description) func.description = data.description;
            if (data.tags) func.tags = data.tags;
            if (data.inputs) func.inputs = data.inputs;
            if (data.outputs) func.outputs = data.outputs;

            // Store graph data
            func.data = data;

            console.log("FunctionManager: stored data");

            // Only update the graph if this function is the one currently being viewed
            if (this.currentFunctionId === id) {
                console.log("FunctionManager: Loading function into graph view");
                this.loadFunction(id);
            } else {
                console.log("FunctionManager: Function updated in background (not active)");
            }
        } else {
            console.error("FunctionManager: Function not found in DB", id);
        }
    }

    async saveCurrentFunction() {
        if (this.currentFunctionId) {
            const currentFunc = this.curDB.getFunction(this.currentFunctionId);
            if (currentFunc) {
                const graphData = await this.graph.serialize();
                let parsedGraph = {};
                try {
                    parsedGraph = JSON.parse(graphData);
                } catch (e) { console.error("Save failure: could not parse serialized graph", e); }

                // Avoid saving empty seeds to prevent duplicate "Main" files on disk
                if (currentFunc.isSeed && (!parsedGraph.nodes || parsedGraph.nodes.length === 0)) {
                    console.log("Skipping save of empty seed function:", currentFunc.name);
                    return;
                }

                const fullPayload = {
                    ...parsedGraph,
                    name: currentFunc.name,
                    description: currentFunc.description,
                    inputs: currentFunc.inputs,
                    outputs: currentFunc.outputs,
                    tags: currentFunc.tags
                };

                currentFunc.data = fullPayload; // Store object locally too
                currentFunc.history = [...this.graph.history];
                currentFunc.historyIndex = this.graph.historyIndex;

                // Notify Server
                if (window.parent) {
                    if (this.mode === 'agent' && window.parent.saveAgentToServer) {
                        window.parent.saveAgentToServer(currentFunc.id, fullPayload);
                    } else if (window.parent.saveFunctionToServer) {
                        window.parent.saveFunctionToServer(currentFunc.id, fullPayload);
                    }
                }
            }
        }
    }

    updateUI() {
        const func = this.curDB.getFunction(this.currentFunctionId);
        if (!func) return;

        // Populate fields
        const nameField = document.getElementById('func-name');
        if (nameField) nameField.value = func.name;

        const descField = document.getElementById('func-desc');
        if (descField) descField.value = func.description;

        this.renderTags(func);
        this.renderIOList(func, 'input');
        this.renderIOList(func, 'output');

        // Update any Special Nodes in the graph (Function Input / Return)
        this.updateSpecialNodes();
    }

    updateSpecialNodes() {
        const func = this.curDB.getFunction(this.currentFunctionId);
        // Find Function Input nodes
        this.graph.nodes.forEach(node => {
            if (node.type === 'start') {
                this.updateFunctionInputNode(node, func);
            }
            if (node.type === 'function_return') {
                this.updateFunctionReturnNode(node, func);
            }
        });
        // We also need to update the DOM elements for these nodes to reflect new ports
        this.graph.nodes.forEach(node => {
            if (node.type === 'start' || node.type === 'function_return') {
                this.graph.updateNodeElement(node); // This needs to exist or I use the internal createNodeElement re-render logic
                // The graph.updateNodeElement only updates position. 
                // I might need to re-create the DOM or update ports manually.
                // Simplest is to force re-render of the node DOM.
                const oldEl = node.element;
                if (oldEl && oldEl.parentNode) {
                    oldEl.parentNode.removeChild(oldEl);
                }
                this.graph.createNodeElement(node);
            }
        });

        // Redraw connections because ports might have moved
        this.graph.renderConnections();
    }

    updateFunctionInputNode(node, func) {
        // Output ports of this node = Inputs of the function
        // We must preserve IDs if possible to keep connections
        const newOutputs = func.inputs.map(input => {
            // Check if we already have an output for this input
            // The node outputs store the ID.
            // We need a consistent ID generation strategy.
            // Use the input's persistent ID from the Function definition.
            return {
                id: node.id + '_out_' + input.id,
                label: input.name,
                type: input.type
            };
        });
        node.outputs = newOutputs;
        node.title = "Start";
        // Inputs? Function Input node usually has no inputs (it generates data).
        // Except maybe Exec?
        // Let's add Exec Output automatically? Or user defines it?
        // Usually "Entry" has Exec Out.
        // Let's assume the first output should implicitly be Exec if not defined, 
        // or we add a special "Start" exec pin.
        // The user prompt "Function Input (which contains the output nodes for all of the user defined inputs to this graph)"
        // It likely implies data inputs. The control flow usually starts from a separate "Entry" node or this node is the Entry.
        // Let's add a fixed Exec output called "Flow".
        if (!node.outputs.find(o => o.type === 'exec')) {
            node.outputs.unshift({ id: node.id + '_flow', label: 'exec_out', type: 'exec' });
        }
    }

    updateFunctionReturnNode(node, func) {
        // Input ports of this node = Outputs of the function
        const newInputs = func.outputs.map(output => {
            return {
                id: node.id + '_in_' + output.id,
                label: output.name,
                type: output.type
            };
        });
        node.inputs = newInputs;
        node.title = "Return";

        // Ensure Exec Input
        if (!node.inputs.find(i => i.type === 'exec')) {
            node.inputs.unshift({ id: node.id + '_flow', label: 'exec_in', type: 'exec' });
        }
    }

    renderTags(func) {
        const container = document.getElementById('func-tags');
        if (!container) return;
        container.innerHTML = '';

        // Add Button
        const addBtn = document.createElement('button');
        addBtn.className = 'tag-btn add';
        addBtn.innerText = '+ Tag';
        addBtn.onclick = () => {
            const input = document.createElement('input');
            input.type = 'text';
            input.style.background = 'rgba(0,0,0,0.3)';
            input.style.border = '1px solid var(--primary-accent)';
            input.style.color = '#fff';
            input.style.borderRadius = '4px';
            input.style.padding = '2px 6px';
            input.style.fontSize = '10px';
            input.style.width = '80px';
            input.style.outline = 'none';
            input.placeholder = 'Tag name...';

            container.replaceChild(input, addBtn);
            input.focus();

            const commit = () => {
                const val = input.value.trim();
                // Only add if not empty and not duplicate?
                if (val && !func.tags.includes(val)) {
                    func.tags.push(val);
                }
                this.renderTags(func);
            };

            input.onblur = () => commit();
            input.onkeydown = (e) => {
                if (e.key === 'Enter') {
                    input.blur();
                }
                if (e.key === 'Escape') {
                    this.renderTags(func);
                }
            };
        };
        container.appendChild(addBtn);

        func.tags.forEach((tag, index) => {
            const tagEl = document.createElement('span');
            tagEl.className = 'func-tag';
            if (index === 0) tagEl.classList.add('category-tag'); // First tag is category
            tagEl.innerHTML = `${tag} <span class="remove" data-index="${index}">×</span>`;

            tagEl.querySelector('.remove').onclick = (e) => {
                e.stopPropagation();
                func.tags.splice(index, 1);
                this.renderTags(func);
            };
            container.appendChild(tagEl);
        });
    }

    renderIOList(func, type) {
        const container = document.getElementById(`func-${type}s-list`);
        if (!container) return;
        container.innerHTML = '';

        const list = type === 'input' ? func.inputs : func.outputs;

        list.forEach((item, index) => {
            const row = document.createElement('div');
            row.className = 'io-row';

            const nameInput = document.createElement('input');
            nameInput.type = 'text';
            nameInput.value = item.name;
            nameInput.className = 'io-name';
            nameInput.onchange = (e) => {
                item.name = e.target.value;
                this.updateSpecialNodes();
            };

            const typeSelect = document.createElement('select');
            typeSelect.className = 'io-type';
            this.typeDB.getAllTypeStrings().forEach(tStr => {
                const details = this.typeDB.getTypeDetails(tStr);
                const opt = document.createElement('option');
                opt.value = tStr;
                opt.text = details.name;
                if (tStr === item.type) opt.selected = true;
                typeSelect.appendChild(opt);
            });
            typeSelect.onchange = (e) => {
                item.type = e.target.value;
                this.updateSpecialNodes();
            };

            const delBtn = document.createElement('button');
            delBtn.innerText = '×';
            delBtn.className = 'io-del';
            delBtn.onclick = () => {
                list.splice(index, 1);
                this.renderIOList(func, type);
                this.updateSpecialNodes();
            };

            row.appendChild(nameInput);
            row.appendChild(typeSelect);
            row.appendChild(delBtn);
            container.appendChild(row);
        });

        const addBtn = document.createElement('button');
        addBtn.className = 'io-add';
        addBtn.innerText = `+ Add ${type === 'input' ? 'Input' : 'Output'}`;
        addBtn.onclick = () => {
            list.push({
                id: Math.random().toString(36).substr(2, 5),
                name: 'New ' + (type === 'input' ? 'Input' : 'Output'),
                type: 'string' // Default
            });
            this.renderIOList(func, type);
            this.updateSpecialNodes();
        };
        container.appendChild(addBtn);
    }
}

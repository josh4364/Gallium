const graph = new NodeGraph({
    nodeRegistry: nodeRegistry
});

// Initialize Function System
const typeDB = new TypeDatabase();
const functionDB = new FunctionDatabase();
const funcManager = new FunctionManager(graph, typeDB, functionDB);

// Make globally available for UI
window.funcManager = funcManager;
window.graph = graph; // Make graph globally available too (for HTML onclick handlers)

// Bridge for Parent (Index.html)
window.importFunctionList = (list) => {
    const serverIds = new Set(list.map(f => f.id));

    // Remove local functions not on server (unless they are newly created and not yet saved?)
    // Actually, if they are newly created, they don't have an ID that would match a server list anyway.
    // Let's just sync to what the server says is the reality.
    Object.keys(functionDB.functions).forEach(id => {
        if (!serverIds.has(id)) {
            // Special case: if it's the default 'Main' and we have other server functions, we can remove it.
            // But if it's the ONLY function, maybe keep it?
            // Actually, if the server sent a list, that IS the source of truth.
            delete functionDB.functions[id];
        }
    });

    // Merge list into DB
    list.forEach(f => {
        let existing = functionDB.getFunction(f.id);
        if (!existing) {
            // Create stub
            functionDB.functions[f.id] = {
                id: f.id,
                name: f.name || f.id,
                description: f.description || '',
                tags: [],
                inputs: [],
                outputs: [],
                data: null,
                history: [],
                historyIndex: -1
            };
        } else {
            // Update name if changed
            existing.name = f.name;
        }
    });
    funcManager.updateSelector();

    // Load first server function if none loaded or if we are on the default dummy function
    const current = functionDB.getFunction(funcManager.currentFunctionId);
    const isDefaultStub = current && current.name === 'Main' && current.id.startsWith('func_');

    if ((!funcManager.currentFunctionId || isDefaultStub) && list.length > 0) {
        funcManager.loadFunction(list[0].id);
    }
};

window.receiveServerFunction = (id, data) => {
    funcManager.onServerFunctionLoaded(id, data);
};

// No longer creating static example nodes here, as FunctionManager will load the default function

graph.render();

// Helper for the add button in toolbar
window.showAddMenu = function (e) {
    graph.openPalette(e.clientX, e.clientY);
    if (e.stopPropagation) e.stopPropagation();
    if (e.preventDefault) e.preventDefault();
    return false;
};

const graph = new NodeGraph({
    nodeRegistry: nodeRegistry
});

// Initialize Function System
const typeDB = new TypeDatabase();
const typeEditor = new TypeEditor(typeDB);
const functionDB = new FunctionDatabase();
const funcManager = new FunctionManager(graph, typeDB, functionDB);

// Make globally available for UI
window.typeDB = typeDB;
window.typeEditor = typeEditor;
window.funcManager = funcManager;
window.graph = graph; // Make graph globally available too (for HTML onclick handlers)

// Check if structs arrived before typeDB was ready
if (window._pendingStructs) {
    typeDB.importFromServer(window._pendingStructs);
    delete window._pendingStructs;
}

window.openTypePanel = () => {
    document.getElementById('type-panel').classList.add('active');
};

window.closeTypePanel = () => {
    document.getElementById('type-panel').classList.remove('active');
};

// Bridge for Parent (Index.html)
window.importFunctionList = (list) => {
    const serverIds = new Set(list.map(f => f.id));

    // Check if current is a default stub BEFORE sync
    const currentBefore = functionDB.getFunction(funcManager.currentFunctionId);
    const isDefaultStub = currentBefore && currentBefore.name === 'Main' && currentBefore.id.startsWith('func_');

    // Remove local functions not on server
    Object.keys(functionDB.functions).forEach(id => {
        if (!serverIds.has(id)) {
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

    // Load first server function if current is missing, was a stub, or none loaded
    const currentAfter = functionDB.getFunction(funcManager.currentFunctionId);
    if ((!currentAfter || isDefaultStub || !funcManager.currentFunctionId) && list.length > 0) {
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

// Toggle Handlers
window.toggleFunctionPanel = () => {
    const panel = document.getElementById('function-panel');
    const btn = document.getElementById('btn-toggle-functions');
    const isOpen = !panel.classList.contains('hidden');

    if (isOpen) {
        panel.classList.add('hidden');
        btn.classList.remove('active');
        document.body.classList.add('func-panel-hidden');
    } else {
        panel.classList.remove('hidden');
        btn.classList.add('active');
        document.body.classList.remove('func-panel-hidden');
    }
};

window.toggleTypePanel = () => {
    const panel = document.getElementById('type-panel');
    const btn = document.getElementById('btn-toggle-types');
    const isActive = panel.classList.contains('active');

    if (isActive) {
        panel.classList.remove('active');
        btn.classList.remove('active');
    } else {
        panel.classList.add('active');
        btn.classList.add('active');
    }
};

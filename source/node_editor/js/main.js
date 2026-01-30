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

// No longer creating static example nodes here, as FunctionManager will load the default function

graph.render();

// Helper for the add button in toolbar
window.showAddMenu = function (e) {
    graph.openPalette(e.clientX, e.clientY);
    if (e.stopPropagation) e.stopPropagation();
    if (e.preventDefault) e.preventDefault();
    return false;
};

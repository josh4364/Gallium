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
        this.clipboard = null;

        // Node Registry configuration
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

        // Tooltip System
        this.tooltipEl = document.createElement('div');
        this.tooltipEl.className = 'port-tooltip';
        document.body.appendChild(this.tooltipEl);

        // Initial state
        setTimeout(() => this.saveHistory('Initial State'), 100);
    }

    showTooltip(x, y, type) {
        if (!this.tooltipEl) return;

        let content = `<span class="port-tooltip-type">${type}</span>`;
        if (window.typeDB) {
            const details = window.typeDB.getTypeDetails(type);
            content = `<span class="port-tooltip-type" style="color:${details.color}">${details.name}</span>`;
        }

        this.tooltipEl.innerHTML = content;
        this.tooltipEl.classList.add('active');
        this.tooltipEl.style.position = 'fixed';
        this.tooltipEl.style.left = (x + 10) + 'px';
        this.tooltipEl.style.top = (y + 10) + 'px';
    }

    hideTooltip() {
        if (this.tooltipEl && !this.isCreatingConnection) {
            this.tooltipEl.classList.remove('active');
        }
    }
}

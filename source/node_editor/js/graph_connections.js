Object.assign(NodeGraph.prototype, {
    startConnection(node, port, type) {
        this.isCreatingConnection = { node, port, type };
        this.draftLine = document.createElementNS("http://www.w3.org/2000/svg", "path");
        this.draftLine.setAttribute("class", "connection-line draft");
        this.svgLayer.appendChild(this.draftLine);
    },

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
    },

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
    },

    cancelDraftConnection() {
        if (this.draftLine) {
            if (this.draftLine.parentNode) this.svgLayer.removeChild(this.draftLine);
            this.draftLine = null;
        }
        this.isCreatingConnection = null;
    },

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
    },

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
    },

    calculatePath(x1, y1, x2, y2) {
        if (this.connectionStyle === 'circuit') {
            const dy = y2 - y1;
            const dx = x2 - x1;

            let path = `M ${x1} ${y1}`;

            // If nodes are too close horizontally, fallback to chamfered manhattan
            if (dx < 40) return this.calculateChamferedManhattan(x1, y1, x2, y2);

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
    },

    calculateManhattan(x1, y1, x2, y2) {
        const midX = (x1 + x2) / 2;
        return `M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2} ${y2}`;
    },

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

        return `M ${x1} ${y1} ` +
            `L ${midX - r * signX} ${y1} ` +
            `L ${midX} ${y1 + r * signY} ` +
            `L ${midX} ${y2 - r * signY} ` +
            `L ${midX + r * signX} ${y2} ` +
            `L ${x2} ${y2}`;
    },

    calculateBezier(x1, y1, x2, y2) {
        const dist = Math.abs(x2 - x1) + Math.abs(y2 - y1);
        const cp1x = x1 + dist * 0.4;
        const cp2x = x2 - dist * 0.4;
        return `M ${x1} ${y1} C ${cp1x} ${y1}, ${cp2x} ${y2}, ${x2} ${y2}`;
    },

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
});

Object.assign(NodeGraph.prototype, {
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
    },

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
    },

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
    },

    rectsIntersect(r1, r2) {
        return !(r2.left > r1.right ||
            r2.right < r1.left ||
            r2.top > r1.bottom ||
            r2.bottom < r1.top);
    },

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
    },

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
    },

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
    },

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
    },

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
    },

    initMinimapEvents() {
        const minimap = this.minimapContent.parentElement;
        if (!minimap) return;
        minimap.addEventListener('mousedown', (e) => {
            e.stopPropagation();
        });
        minimap.addEventListener('wheel', (e) => {
            e.stopPropagation();
        });
    },

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
    },

    render() {
        this.renderConnections();
        this.updateMinimap();
    }
});

Object.assign(NodeGraph.prototype, {
    startConnection(node, port, type, clientX, clientY) {
        this.isCreatingConnection = { node, port, type };
        this.draftLine = document.createElementNS("http://www.w3.org/2000/svg", "path");
        this.draftLine.setAttribute("class", "connection-line draft");
        this.svgLayer.appendChild(this.draftLine);

        // Show tooltip for the source port
        this.showTooltip(clientX || 0, clientY || 0, port.type);
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

        // Update tooltip position
        if (this.tooltipEl) {
            this.tooltipEl.style.left = (clientX + 10) + 'px';
            this.tooltipEl.style.top = (clientY + 10) + 'px';
        }
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

            const isAny = (t) => t === 'any';
            const isAnyNotExec = (t) => t === 'any_not_exec';
            const isExec = (t) => t === 'exec';

            if (fromPort.type !== toPort.type) {
                const canConnect = isAny(fromPort.type) || isAny(toPort.type) ||
                    (isAnyNotExec(fromPort.type) && !isExec(toPort.type)) ||
                    (isAnyNotExec(toPort.type) && !isExec(fromPort.type)) ||
                    (fromPort.type.startsWith('map:') && toPort.type.startsWith('map:') && (fromPort.type.includes('any_not_exec') || toPort.type.includes('any_not_exec'))) ||
                    (fromPort.type.startsWith('list:') && toPort.type.startsWith('list:') && (fromPort.type.includes('any_not_exec') || toPort.type.includes('any_not_exec')));

                if (!canConnect) {
                    console.warn("Connection type mismatch:", fromPort.type, "vs", toPort.type);
                    this.cancelDraftConnection();
                    return;
                }
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
        this.hideTooltip();
    },

    addConnection(fromNode, fromPort, toNode, toPort, isRestore = false) {
        if (this.connections.some(c => c.fromPort.id === fromPort.id && c.toPort.id === toPort.id)) return;

        if (toPort.type !== 'exec') {
            const existing = this.connections.find(c => c.toPort.id === toPort.id);
            if (existing) this.deleteConnection(existing, true); // Suppress history on internal delete
        }

        const conn = { fromNode, fromPort, toNode, toPort };

        // Handle any/any_not_exec type assignment
        if (toPort.type === 'any_not_exec' || toPort.type === 'any') {
            toPort.type = fromPort.type;
            const portEl = document.getElementById(toPort.id);
            if (portEl) {
                if (window.typeDB) {
                    const details = window.typeDB.getTypeDetails(toPort.type);
                    portEl.style.color = details.color;
                    portEl.style.borderColor = details.color;
                } else {
                    portEl.className = `port port-input port-type-${toPort.type}`;
                }
            }
            if (toNode.type.includes('variable')) {
                this.onVariableTypeChanged(toNode.params.name, toPort.type);
            }
        } else if (fromPort.type === 'any_not_exec' || fromPort.type === 'any') {
            fromPort.type = toPort.type;
            const portEl = document.getElementById(fromPort.id);
            if (portEl) {
                if (window.typeDB) {
                    const details = window.typeDB.getTypeDetails(fromPort.type);
                    portEl.style.color = details.color;
                    portEl.style.borderColor = details.color;
                } else {
                    portEl.className = `port port-output port-type-${fromPort.type}`;
                }
            }
        }

        // Logic for List Node Type Updates
        const updateListNode = (node, thisPort, otherPort) => {
            let elType = null;
            if (thisPort.key === 'list' && otherPort.type.startsWith('list:')) {
                elType = otherPort.type.substring(5);
            } else if (otherPort.type.startsWith('list:') && (thisPort.key === 'list' || node.type === 'list_create')) {
                elType = otherPort.type.substring(5);
            } else if (node.type.startsWith('list_') && (thisPort.key === 'value' || thisPort.id.includes('_in_')) && otherPort.type !== 'exec' && !otherPort.type.startsWith('list:')) {
                elType = otherPort.type;
            }

            if (node.type.startsWith('list_') && elType && elType !== 'any_not_exec' && elType !== 'any') {
                if (node.params.element_type !== elType) {
                    node.params.element_type = elType;
                    const details = window.typeDB.getTypeDetails(elType);
                    let baseTitle = node.type.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
                    node.title = baseTitle + " (" + details.name + ")";
                    const listType = 'list:' + elType;
                    if (node.type === 'list_create') {
                        node.outputs[0].type = listType;
                        node.inputs.forEach(i => { if (i.id.includes('_in_')) i.type = elType; });
                    } else if (node.type === 'list_get') {
                        node.inputs[0].type = listType;
                        node.outputs[0].type = elType;
                    } else if (node.type === 'list_set') {
                        node.inputs[1].type = listType;
                        node.inputs[3].type = elType;
                        node.outputs[1].type = listType;
                    } else if (node.type === 'list_add') {
                        node.inputs[1].type = listType;
                        node.inputs[2].type = elType;
                        node.outputs[1].type = listType;
                    } else if (node.type === 'list_remove_at') {
                        node.inputs[1].type = listType;
                        node.outputs[1].type = listType;
                    }
                    if (node.element) {
                        const header = node.element.querySelector('.node-header');
                        if (header) header.innerText = node.title;
                    }
                    this.refreshNodePorts(node);
                }
            }
        };

        const updateMapNode = (node, thisPort, otherPort) => {
            if (!node.type.startsWith('map_')) return;
            let keyType = node.params.key_type || 'string';
            let valType = node.params.value_type || 'any_not_exec';
            let changed = false;

            const parseMap = (mt) => {
                if (!mt || !mt.startsWith('map:')) return null;
                const rest = mt.substring(4);
                let k, v;
                if (rest.startsWith('struct:')) {
                    const parts = rest.split(':');
                    k = parts[0] + ':' + parts[1];
                    v = parts.slice(2).join(':') || 'any_not_exec';
                } else {
                    const idx = rest.indexOf(':');
                    if (idx !== -1) {
                        k = rest.substring(0, idx);
                        v = rest.substring(idx + 1);
                    } else {
                        k = rest;
                        v = 'any_not_exec';
                    }
                }
                return { key: k, val: v };
            };

            if (thisPort.key === 'map' && otherPort.type.startsWith('map:')) {
                const parsed = parseMap(otherPort.type);
                if (parsed && (parsed.key !== keyType || parsed.val !== valType)) {
                    keyType = parsed.key;
                    valType = parsed.val;
                    changed = true;
                }
            } else if (thisPort.key === 'key' && otherPort.type !== 'exec' && !otherPort.type.startsWith('map:')) {
                if (keyType !== otherPort.type && otherPort.type !== 'any_not_exec') {
                    keyType = otherPort.type;
                    changed = true;
                }
            } else if (thisPort.key === 'value' && otherPort.type !== 'exec' && !otherPort.type.startsWith('map:')) {
                if (valType !== otherPort.type && otherPort.type !== 'any_not_exec') {
                    valType = otherPort.type;
                    changed = true;
                }
            } else if (otherPort.type.startsWith('map:') && (thisPort.key === 'map' || node.type === 'map_create')) {
                const parsed = parseMap(otherPort.type);
                if (parsed && (parsed.key !== keyType || parsed.val !== valType)) {
                    keyType = parsed.key;
                    valType = parsed.val;
                    changed = true;
                }
            }

            if (changed && keyType && valType) {
                node.params.key_type = keyType;
                node.params.value_type = valType;
                const newMapType = `map:${keyType}:${valType}`;
                const details = window.typeDB.getTypeDetails(newMapType);
                let baseTitle = node.type.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
                node.title = baseTitle + " (" + details.name.replace('Map of ', '') + ")";
                if (node.type === 'map_create') {
                    node.outputs[0].type = newMapType;
                } else if (node.type === 'map_get') {
                    node.inputs[0].type = newMapType;
                    node.inputs[1].type = keyType;
                    node.outputs[0].type = valType;
                } else if (node.type === 'map_set') {
                    node.inputs[1].type = newMapType;
                    node.inputs[2].type = keyType;
                    node.inputs[3].type = valType;
                    node.outputs[1].type = newMapType;
                } else if (node.type === 'map_remove') {
                    node.inputs[1].type = newMapType;
                    node.inputs[2].type = keyType;
                    node.outputs[1].type = newMapType;
                }
                if (node.element) {
                    const header = node.element.querySelector('.node-header');
                    if (header) header.innerText = node.title;
                }
                this.refreshNodePorts(node);
            }
        };

        updateMapNode(toNode, toPort, fromPort);
        updateMapNode(fromNode, fromPort, toPort);
        updateListNode(toNode, toPort, fromPort);
        updateListNode(fromNode, fromPort, toPort);

        // Dynamic List Make: Add new pin if connecting to last one
        if (toNode.type === 'list_make' && toPort.key && toPort.key.startsWith('in_')) {
            const idx = parseInt(toPort.key.replace('in_', ''));
            // Check if this is the last input
            if (idx === toNode.inputs.length - 1) {
                const newIdx = idx + 1;
                const key = `in_${newIdx}`;
                const elType = toNode.params.element_type || 'any_not_exec';

                toNode.inputs.push({
                    label: `Item ${newIdx}`,
                    type: elType,
                    key: key,
                    id: `${toNode.id}_${key}`
                });
                this.refreshNodePorts(toNode);
            }
        }

        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("class", "connection-line");

        const style = getComputedStyle(document.documentElement);
        // Use the resolved type for color
        let color = '#fff';
        if (window.typeDB) {
            color = window.typeDB.getTypeDetails(fromPort.type).color;
        } else {
            color = style.getPropertyValue(`--type-${fromPort.type}`).trim() || '#fff';
        }
        path.style.stroke = color;
        path.style.filter = `drop-shadow(0 0 8px ${color}66)`;

        const hitArea = document.createElementNS("http://www.w3.org/2000/svg", "path");
        hitArea.setAttribute("fill", "none");
        hitArea.setAttribute("stroke", "rgba(255, 255, 255, 0.01)");
        hitArea.setAttribute("stroke-width", "16");
        hitArea.setAttribute("pointer-events", "stroke");
        hitArea.style.cursor = "pointer";

        hitArea.onmouseenter = (e) => {
            this.hoveredConnection = conn;
            path.style.strokeWidth = "5";
            path.style.opacity = "1";
            path.style.filter = `drop-shadow(0 0 12px ${color})`;
            if (!this.isCreatingConnection) {
                this.showTooltip(e.clientX, e.clientY, fromPort.type);
            }
        };
        hitArea.onmousemove = (e) => {
            if (this.tooltipEl && this.tooltipEl.classList.contains('active')) {
                this.tooltipEl.style.left = (e.clientX + 10) + 'px';
                this.tooltipEl.style.top = (e.clientY + 10) + 'px';
            }
        };
        hitArea.onmouseleave = () => {
            if (this.hoveredConnection === conn) {
                this.hoveredConnection = null;
                path.style.strokeWidth = "";
                path.style.opacity = "";
                path.style.filter = `drop-shadow(0 0 8px ${color}66)`;
            }
            this.hideTooltip();
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

        // Reset to any_not_exec if it was a wildcard port
        const nodeDef = this.nodeRegistry.find(n => n.type === conn.toNode.type);
        if (nodeDef) {
            let isWildcard = false;
            const portDef = nodeDef.inputs?.find(i => i.key === conn.toPort.key);
            if (portDef && (portDef.type === 'any_not_exec' || portDef.type === 'any')) {
                isWildcard = true;
            } else if (conn.toNode.type === 'string_format' && conn.toPort.key?.startsWith('arg')) {
                // Dynamic ports for string_format
                isWildcard = true;
            }

            if (isWildcard) {
                conn.toPort.type = 'any_not_exec';
                const portEl = document.getElementById(conn.toPort.id);
                if (portEl) {
                    portEl.className = `port port-input port-type-any_not_exec`;
                }
                if (conn.toNode.type.includes('variable')) {
                    this.onVariableTypeChanged(conn.toNode.params.name, 'any_not_exec');
                }
            }
        }

        // Also check fromPort if it was a wildcard (e.g. Get Variable)
        const fromNodeDef = this.nodeRegistry.find(n => n.type === conn.fromNode.type);
        if (fromNodeDef) {
            const portDef = fromNodeDef.outputs?.find(o => o.label === conn.fromPort.label);
            if (portDef && (portDef.type === 'any_not_exec' || portDef.type === 'any')) {
                // Only reset if NO MORE connections are using this output
                const otherConns = this.connections.filter(c => c !== conn && c.fromPort.id === conn.fromPort.id);
                if (otherConns.length === 0) {
                    let targetType = 'any_not_exec';
                    if (conn.fromNode.type === 'get_variable' && conn.fromNode.params.name) {
                        const setNode = this.nodes.find(n => n.type === 'set_variable' && n.params.name === conn.fromNode.params.name);
                        if (setNode) {
                            const valPort = setNode.inputs.find(i => i.key === 'value');
                            if (valPort) targetType = valPort.type;
                        }
                    }

                    conn.fromPort.type = targetType;
                    const portEl = document.getElementById(conn.fromPort.id);
                    if (portEl) {
                        portEl.className = `port port-output port-type-${targetType}`;
                    }
                }
            }
        }

        this.connections = this.connections.filter(c => c !== conn);

        // Reset List/Map nodes if no more specialized connections exist
        const resetDynamicNode = (node) => {
            if (!node || !node.type) return;
            const isList = node.type.startsWith('list_');
            const isMap = node.type.startsWith('map_');
            if (!isList && !isMap) return;

            // Check if ANY non-exec ports have remaining connections
            const hasConnections = this.connections.some(c =>
                (c.fromNode === node && c.fromPort.type !== 'exec') ||
                (c.toNode === node && c.toPort.type !== 'exec')
            );

            if (!hasConnections) {
                if (isList) {
                    node.params.element_type = 'any_not_exec';
                    // Re-run the update logic to reset ports and title
                    const updateProto = NodeGraph.prototype.updateListNode || this.updateListNode;
                    // We don't have updateListNode on prototype in the same way, but it's used in addConnection
                    // Let's just manually trigger it by a fake connection or just re-run the logic
                    // Actually, let's just use onNodeParamChanged if it's available or similar
                    if (this.onNodeParamChanged) {
                        this.onNodeParamChanged(node, 'element_type', 'any_not_exec');
                    }
                } else if (isMap) {
                    node.params.key_type = 'string';
                    node.params.value_type = 'any_not_exec';
                    if (this.onNodeParamChanged) {
                        this.onNodeParamChanged(node, 'key_type', 'string');
                    }
                }
            }
        };

        resetDynamicNode(conn.toNode);
        resetDynamicNode(conn.fromNode);

        // Prune List Make pins
        if (conn.toNode.type === 'list_make') {
            const node = conn.toNode;
            let maxConnected = -1;
            this.connections.forEach(c => {
                if (c.toNode === node && c.toPort.key && c.toPort.key.startsWith('in_')) {
                    const idx = parseInt(c.toPort.key.replace('in_', ''));
                    if (idx > maxConnected) maxConnected = idx;
                }
            });
            let targetSize = maxConnected + 2;
            if (targetSize < 1) targetSize = 1;

            if (node.inputs.length > targetSize) {
                node.inputs = node.inputs.slice(0, targetSize);
                this.refreshNodePorts(node);
            }
        }

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

class TypeEditor {
    constructor(typeDatabase) {
        this.db = typeDatabase;
        this.selectedStructId = null;
        this.selectedEnumId = null;
        this.db.addChangedListener(() => this.render());

        this.container = document.getElementById('type-list-container');
        this.searchField = document.getElementById('type-search');

        // Struct Editor Elements
        this.structEditorSection = document.getElementById('struct-editor-section');
        this.structNameInput = document.getElementById('struct-name-input');
        this.structTagInput = document.getElementById('struct-tag-input');
        this.fieldsList = document.getElementById('struct-fields-list');

        // Enum Editor Elements
        this.enumEditorSection = document.getElementById('enum-editor-section');
        this.enumNameInput = document.getElementById('enum-name-input');
        this.enumTagInput = document.getElementById('enum-tag-input');
        this.enumValuesList = document.getElementById('enum-values-list');
    }

    createNewStruct() {
        const s = this.db.addStruct("NewStructure");
        this.selectStruct(s.id);
    }

    createNewEnum() {
        const e = this.db.addEnum("NewEnum");
        this.selectEnum(e.id);
    }

    selectStruct(id) {
        this.selectedStructId = id;
        this.selectedEnumId = null;
        this.render();
    }

    selectEnum(id) {
        this.selectedEnumId = id;
        this.selectedStructId = null;
        this.render();
    }

    deleteCurrentStruct() {
        if (this.selectedStructId) {
            this.db.deleteStruct(this.selectedStructId);
            this.selectedStructId = null;
            this.render();
        }
    }

    deleteCurrentEnum() {
        if (this.selectedEnumId) {
            this.db.deleteEnum(this.selectedEnumId);
            this.selectedEnumId = null;
            this.render();
        }
    }

    onStructNameChange(newName) {
        if (this.selectedStructId) {
            this.db.updateStruct(this.selectedStructId, { name: newName });
        }
    }

    onStructTagChange(newTag) {
        if (this.selectedStructId) {
            this.db.updateStruct(this.selectedStructId, { tag: newTag });
        }
    }

    onEnumNameChange(newName) {
        if (this.selectedEnumId) {
            this.db.updateEnum(this.selectedEnumId, { name: newName });
        }
    }

    onEnumTagChange(newTag) {
        if (this.selectedEnumId) {
            this.db.updateEnum(this.selectedEnumId, { tag: newTag });
        }
    }

    addFieldToCurrent() {
        if (this.selectedStructId) {
            this.db.addField(this.selectedStructId, "newField", "string");
        }
    }

    addEnumValueToCurrent() {
        if (this.selectedEnumId) {
            // Auto-increment value
            const e = this.db.getEnum(this.selectedEnumId);
            let nextVal = 0;
            if (e && e.values.length > 0) {
                const max = Math.max(...e.values.map(v => v.value));
                nextVal = max + 1;
            }
            this.db.addEnumValue(this.selectedEnumId, "NewOption", nextVal);
        }
    }

    render() {
        if (!this.container) return;

        const query = this.searchField ? this.searchField.value.toLowerCase() : "";
        this.container.innerHTML = '';

        // Render Primitives
        this.db.getPrimitives().forEach(p => {
            if (query && !p.name.toLowerCase().includes(query)) return;
            this.container.appendChild(this.createTypeItem(p, 'primitive'));
        });

        // Render Structs
        this.db.getStructs().forEach(s => {
            if (query && !s.name.toLowerCase().includes(query)) return;
            this.container.appendChild(this.createTypeItem(s, 'struct'));
        });

        // Render Enums
        // Enums not implemented on typeDB yet? I need to check type_system.js
        // Wait, I updated type_system.js in Step 39 to add getEnums().
        if (this.db.getEnums) {
            this.db.getEnums().forEach(e => {
                if (query && !e.name.toLowerCase().includes(query)) return;
                this.container.appendChild(this.createTypeItem(e, 'enum'));
            });
        }

        // Update Editors
        if (this.selectedStructId) {
            this.showStructEditor();
        } else if (this.selectedEnumId) {
            this.showEnumEditor();
        } else {
            if (this.structEditorSection) this.structEditorSection.style.display = 'none';
            if (this.enumEditorSection) this.enumEditorSection.style.display = 'none';
        }
    }

    showStructEditor() {
        if (this.enumEditorSection) this.enumEditorSection.style.display = 'none';

        const s = this.db.getStruct(this.selectedStructId);
        if (s && this.structEditorSection) {
            this.structEditorSection.style.display = 'block';
            this.structNameInput.value = s.name;
            if (this.structTagInput) this.structTagInput.value = s.tag || '';
            this.renderFields(s);
        } else {
            if (this.structEditorSection) this.structEditorSection.style.display = 'none';
        }
    }

    showEnumEditor() {
        if (this.structEditorSection) this.structEditorSection.style.display = 'none';

        const e = this.db.getEnum(this.selectedEnumId);
        if (e && this.enumEditorSection) {
            this.enumEditorSection.style.display = 'block';
            this.enumNameInput.value = e.name;
            if (this.enumTagInput) this.enumTagInput.value = e.tag || '';
            this.renderEnumValues(e);
        } else {
            if (this.enumEditorSection) this.enumEditorSection.style.display = 'none';
        }
    }

    createTypeItem(type, kind) {
        const div = document.createElement('div');
        let isSelected = false;
        if (kind === 'struct' && this.selectedStructId === type.id) isSelected = true;
        if (kind === 'enum' && this.selectedEnumId === type.id) isSelected = true;

        div.className = `type-item ${isSelected ? 'selected' : ''}`;

        const dot = document.createElement('div');
        dot.className = 'type-dot';
        if (kind === 'primitive') dot.style.backgroundColor = type.color || '#808080';
        else if (kind === 'struct') dot.style.backgroundColor = '#2196F3';
        else if (kind === 'enum') dot.style.backgroundColor = '#FF9800';
        div.appendChild(dot);

        const name = document.createElement('span');
        name.textContent = type.name;
        div.appendChild(name);

        if (kind === 'struct') {
            div.onclick = () => this.selectStruct(type.id);
        } else if (kind === 'enum') {
            div.onclick = () => this.selectEnum(type.id);
        }

        return div;
    }

    renderFields(struct) {
        this.fieldsList.innerHTML = '';
        struct.fields.forEach((field, index) => {
            const row = document.createElement('div');
            row.className = 'field-row';
            row.style.alignItems = 'flex-start';

            const nameInput = document.createElement('input');
            nameInput.className = 'io-name';
            nameInput.style.width = '100px';
            nameInput.value = field.name;
            nameInput.onchange = (e) => {
                field.name = e.target.value;
                this.db.updateStruct(struct.id, { fields: struct.fields });
            };
            row.appendChild(nameInput);

            // Use the complex type selector
            const typeSelector = this.createComplexTypeSelector(field.type, (newType) => {
                field.type = newType;
                this.db.updateStruct(struct.id, { fields: struct.fields });
            });
            typeSelector.style.flex = "1";
            row.appendChild(typeSelector);

            const controlsDiv = document.createElement('div');
            controlsDiv.style.display = 'flex';
            controlsDiv.style.flexDirection = 'column';
            controlsDiv.style.gap = '2px';

            const upBtn = document.createElement('button');
            upBtn.className = 'field-btn';
            upBtn.textContent = '↑';
            upBtn.onclick = () => this.db.moveField(struct.id, index, index - 1);
            controlsDiv.appendChild(upBtn);

            const downBtn = document.createElement('button');
            downBtn.className = 'field-btn';
            downBtn.textContent = '↓';
            downBtn.onclick = () => this.db.moveField(struct.id, index, index + 1);
            controlsDiv.appendChild(downBtn);

            const delBtn = document.createElement('button');
            delBtn.className = 'field-btn';
            delBtn.textContent = '✕';
            delBtn.style.color = 'var(--danger)';
            delBtn.onclick = () => this.db.removeField(struct.id, index);
            controlsDiv.appendChild(delBtn);

            row.appendChild(controlsDiv);
            this.fieldsList.appendChild(row);
        });
    }

    renderEnumValues(enumObj) {
        this.enumValuesList.innerHTML = '';
        enumObj.values.forEach((val, index) => {
            const row = document.createElement('div');
            row.className = 'field-row';
            row.style.alignItems = 'center';

            // Name
            const nameInput = document.createElement('input');
            nameInput.className = 'io-name';
            nameInput.style.width = '120px'; // Slightly larger for labels
            nameInput.value = val.name;
            nameInput.onchange = (e) => {
                this.db.updateEnumValue(enumObj.id, index, { name: e.target.value });
            };
            row.appendChild(nameInput);

            // Value (Number)
            const valInput = document.createElement('input');
            valInput.type = 'number';
            valInput.className = 'io-name';
            valInput.style.width = '60px'; // Smaller for integer
            valInput.value = val.value;
            valInput.onchange = (e) => {
                this.db.updateEnumValue(enumObj.id, index, { value: parseInt(e.target.value) });
            };
            row.appendChild(valInput);

            const controlsDiv = document.createElement('div');
            controlsDiv.style.display = 'flex';
            controlsDiv.style.gap = '2px';
            controlsDiv.style.marginLeft = 'auto';

            const delBtn = document.createElement('button');
            delBtn.className = 'field-btn';
            delBtn.textContent = '✕';
            delBtn.style.color = 'var(--danger)';
            delBtn.onclick = () => this.db.removeEnumValue(enumObj.id, index);
            controlsDiv.appendChild(delBtn);

            row.appendChild(controlsDiv);
            this.enumValuesList.appendChild(row);
        });
    }

    createComplexTypeSelector(currentType, onChange) {
        const container = document.createElement('div');
        container.style.display = 'flex';
        container.style.flexDirection = 'column';
        container.style.width = '100%';

        let activeType = currentType;

        const refresh = () => {
            container.innerHTML = '';
            container.appendChild(renderSelector(activeType, (newType) => {
                activeType = newType;
                onChange(newType);
                refresh();
            }));
        };

        const renderSelector = (targetType, onUpdate) => {
            const row = document.createElement('div');
            row.style.display = 'flex';
            row.style.flexDirection = 'column';
            row.style.gap = '4px';
            row.style.width = '100%';

            const topRow = document.createElement('div');
            topRow.style.display = 'flex';
            topRow.style.gap = '2px';
            topRow.style.width = '100%';
            row.appendChild(topRow);

            let baseType = targetType;
            let modifier = 'none';
            let mapValueType = 'string';

            if (targetType.startsWith('list:')) {
                modifier = 'list';
                baseType = targetType.substring(5);
            } else if (targetType.startsWith('map:')) {
                modifier = 'map';
                const rest = targetType.substring(4);
                if (rest.startsWith('struct:')) {
                    const parts = rest.split(':');
                    baseType = parts[0] + ':' + parts[1];
                    mapValueType = parts.slice(2).join(':') || 'string';
                } else if (rest.startsWith('enum:')) {
                    const parts = rest.split(':');
                    baseType = parts[0] + ':' + parts[1];
                    mapValueType = parts.slice(2).join(':') || 'string';
                } else {
                    const idx = rest.indexOf(':');
                    if (idx !== -1) {
                        baseType = rest.substring(0, idx);
                        mapValueType = rest.substring(idx + 1);
                    } else {
                        baseType = rest;
                        mapValueType = 'string';
                    }
                }
            }

            const primitives = this.db.primitives.filter(p => !['exec', 'any', 'any_not_exec'].includes(p.id));
            const structs = this.db.getStructs().map(s => `struct:${s.id}`);
            const enums = this.db.getEnums ? this.db.getEnums().map(e => `enum:${e.id}`) : [];
            const allBase = [...primitives.map(p => p.id), ...structs, ...enums];

            // MAIN TYPE SELECTOR
            const typeSelect = document.createElement('select');
            typeSelect.className = 'io-type';
            typeSelect.style.flex = "1";
            typeSelect.style.width = "0"; // Allow flex shrink

            allBase.forEach(tStr => {
                const details = this.db.getTypeDetails(tStr);
                const opt = document.createElement('option');
                opt.value = tStr;
                opt.textContent = details.name;
                if (tStr === baseType) opt.selected = true;
                typeSelect.appendChild(opt);
            });

            // MODIFIER SELECTOR
            const modSelect = document.createElement('select');
            modSelect.className = 'io-type';
            modSelect.style.width = '50px';
            [['none', '-'], ['list', '[]'], ['map', '{}']].forEach(([m, label]) => {
                const opt = document.createElement('option');
                opt.value = m;
                opt.textContent = label;
                if (m === modifier) opt.selected = true;
                modSelect.appendChild(opt);
            });

            typeSelect.onchange = (e) => {
                const newBase = e.target.value;
                if (modifier === 'list') onUpdate(`list:${newBase}`);
                else if (modifier === 'map') onUpdate(`map:${newBase}:${mapValueType}`);
                else onUpdate(newBase);
            };

            modSelect.onchange = (e) => {
                const newMod = e.target.value;
                if (newMod === 'list') onUpdate(`list:${baseType}`);
                else if (newMod === 'map') onUpdate(`map:${baseType}:${mapValueType}`);
                else onUpdate(baseType);
            };

            topRow.appendChild(typeSelect);
            topRow.appendChild(modSelect);

            if (modifier === 'list') {
                const subContainer = document.createElement('div');
                subContainer.style.marginLeft = '10px';
                subContainer.style.borderLeft = '1px solid var(--node-border)';
                subContainer.style.paddingLeft = '6px';

                // Show label "of"
                const lbl = document.createElement('div');
                lbl.innerText = 'of';
                lbl.style.fontSize = '9px'; lbl.style.color = '#777';
                subContainer.appendChild(lbl);

                subContainer.appendChild(renderSelector(baseType, (newInner) => {
                    onUpdate(`list:${newInner}`);
                }));
                row.appendChild(subContainer);
            } else if (modifier === 'map') {
                const subContainer = document.createElement('div');
                subContainer.style.marginLeft = '10px';
                subContainer.style.borderLeft = '1px solid var(--node-border)';
                subContainer.style.paddingLeft = '6px';

                // Show label "value"
                const lbl = document.createElement('div');
                lbl.innerText = 'value';
                lbl.style.fontSize = '9px'; lbl.style.color = '#777';
                subContainer.appendChild(lbl);

                subContainer.appendChild(renderSelector(mapValueType, (newVal) => {
                    onUpdate(`map:${baseType}:${newVal}`);
                }));
                row.appendChild(subContainer);
            }
            return row;
        };

        refresh();
        return container;
    }
}

window.TypeEditor = TypeEditor;

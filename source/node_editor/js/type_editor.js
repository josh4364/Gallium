class TypeEditor {
    constructor(typeDatabase) {
        this.db = typeDatabase;
        this.selectedStructId = null;
        this.db.addChangedListener(() => this.render());

        this.container = document.getElementById('type-list-container');
        this.searchField = document.getElementById('type-search');
        this.structEditorSection = document.getElementById('struct-editor-section');
        this.structNameInput = document.getElementById('struct-name-input');
        this.fieldsList = document.getElementById('struct-fields-list');
    }

    createNewStruct() {
        const s = this.db.addStruct("NewStructure");
        this.selectStruct(s.id);
    }

    selectStruct(id) {
        this.selectedStructId = id;
        this.render();
    }

    deleteCurrentStruct() {
        if (this.selectedStructId) {
            this.db.deleteStruct(this.selectedStructId);
            this.selectedStructId = null;
            this.render();
        }
    }

    onStructNameChange(newName) {
        if (this.selectedStructId) {
            this.db.updateStruct(this.selectedStructId, { name: newName });
        }
    }

    addFieldToCurrent() {
        if (this.selectedStructId) {
            this.db.addField(this.selectedStructId, "newField", "string");
        }
    }

    render() {
        if (!this.container) return;

        const query = this.searchField ? this.searchField.value.toLowerCase() : "";
        this.container.innerHTML = '';

        // Render Primitives
        this.db.getPrimitives().forEach(p => {
            if (query && !p.name.toLowerCase().includes(query)) return;
            this.container.appendChild(this.createTypeItem(p, false));
        });

        // Render Structs
        this.db.getStructs().forEach(s => {
            if (query && !s.name.toLowerCase().includes(query)) return;
            this.container.appendChild(this.createTypeItem(s, true));
        });

        // Update struct editor
        if (this.selectedStructId) {
            const s = this.db.getStruct(this.selectedStructId);
            if (s) {
                this.structEditorSection.style.display = 'block';
                this.structNameInput.value = s.name;
                this.renderFields(s);
            } else {
                this.structEditorSection.style.display = 'none';
            }
        } else {
            this.structEditorSection.style.display = 'none';
        }
    }

    createTypeItem(type, isStruct) {
        const div = document.createElement('div');
        div.className = `type-item ${isStruct && this.selectedStructId === type.id ? 'selected' : ''}`;

        const dot = document.createElement('div');
        dot.className = 'type-dot';
        dot.style.backgroundColor = isStruct ? '#2196F3' : (type.color || '#808080');
        div.appendChild(dot);

        const name = document.createElement('span');
        name.textContent = type.name;
        div.appendChild(name);

        if (isStruct) {
            div.onclick = () => this.selectStruct(type.id);
        }

        return div;
    }

    renderFields(struct) {
        this.fieldsList.innerHTML = '';
        struct.fields.forEach((field, index) => {
            const row = document.createElement('div');
            row.className = 'field-row';

            const nameInput = document.createElement('input');
            nameInput.className = 'io-name';
            nameInput.value = field.name;
            nameInput.onchange = (e) => {
                field.name = e.target.value;
                this.db.notifyChanged();
            };
            row.appendChild(nameInput);

            const typeSelect = document.createElement('select');
            typeSelect.className = 'io-type';
            typeSelect.style.flex = "1";

            // Determine current base type and modifiers
            let baseType = field.type;
            let modifier = 'none';
            let mapValueType = 'string';

            if (field.type.startsWith('list:')) {
                modifier = 'list';
                baseType = field.type.substring(5);
            } else if (field.type.startsWith('map:')) {
                modifier = 'map';
                const parts = field.type.substring(4).split(':');
                baseType = parts[0];
                mapValueType = parts[1] || 'string';
            }

            const updateFieldType = () => {
                if (modifier === 'list') {
                    field.type = `list:${baseType}`;
                } else if (modifier === 'map') {
                    field.type = `map:${baseType}:${mapValueType}`;
                } else {
                    field.type = baseType;
                }
                this.db.notifyChanged();
            };

            // Populate base types
            const availableTypes = this.db.primitives.filter(p => p.id !== 'exec' && p.id !== 'any_not_exec' && p.id !== 'any');
            const structTypes = this.db.getStructs().filter(sid => sid.id !== struct.id).map(s => `struct:${s.id}`);

            const allBase = [...availableTypes.map(p => p.id), ...structTypes];
            allBase.forEach(tStr => {
                const details = this.db.getTypeDetails(tStr);
                const opt = document.createElement('option');
                opt.value = tStr;
                opt.textContent = details.name;
                if (tStr === baseType) opt.selected = true;
                typeSelect.appendChild(opt);
            });

            typeSelect.onchange = (e) => {
                baseType = e.target.value;
                updateFieldType();
            };
            row.appendChild(typeSelect);

            // Modifier select
            const modSelect = document.createElement('select');
            modSelect.className = 'io-type';
            modSelect.style.width = "60px";
            ['none', 'list', 'map'].forEach(m => {
                const opt = document.createElement('option');
                opt.value = m;
                opt.textContent = m.charAt(0).toUpperCase() + m.slice(1);
                if (m === modifier) opt.selected = true;
                modSelect.appendChild(opt);
            });
            modSelect.onchange = (e) => {
                modifier = e.target.value;
                updateFieldType();
                this.renderFields(struct); // Re-render to show/hide map value select
            };
            row.appendChild(modSelect);

            if (modifier === 'map') {
                const mapValSelect = document.createElement('select');
                mapValSelect.className = 'io-type';
                mapValSelect.style.flex = "1";
                allBase.forEach(tStr => {
                    const details = this.db.getTypeDetails(tStr);
                    const opt = document.createElement('option');
                    opt.value = tStr;
                    opt.textContent = details.name;
                    if (tStr === mapValueType) opt.selected = true;
                    mapValSelect.appendChild(opt);
                });
                mapValSelect.onchange = (e) => {
                    mapValueType = e.target.value;
                    updateFieldType();
                };
                row.appendChild(mapValSelect);
            }

            const upBtn = document.createElement('button');
            upBtn.className = 'field-btn';
            upBtn.textContent = '↑';
            upBtn.onclick = () => this.db.moveField(struct.id, index, index - 1);
            row.appendChild(upBtn);

            const downBtn = document.createElement('button');
            downBtn.className = 'field-btn';
            downBtn.textContent = '↓';
            downBtn.onclick = () => this.db.moveField(struct.id, index, index + 1);
            row.appendChild(downBtn);

            const delBtn = document.createElement('button');
            delBtn.className = 'field-btn';
            delBtn.textContent = '✕';
            delBtn.style.color = 'var(--danger)';
            delBtn.onclick = () => this.db.removeField(struct.id, index);
            row.appendChild(delBtn);

            this.fieldsList.appendChild(row);
        });
    }
}

window.TypeEditor = TypeEditor;

class TypeDatabase {
    constructor() {
        this.primitives = [
            { id: 'exec', name: 'Exec', color: '#ffffff', description: 'Execution Flow' },
            { id: 'string', name: 'String', color: '#f25fbc', description: 'Text data' },
            { id: 'number', name: 'Number', color: '#76ea59', description: 'Numeric values' },
            { id: 'boolean', name: 'Boolean', color: '#ef5350', description: 'True/False' },
            { id: 'any', name: 'Any', color: '#808080', description: 'Any type' },
            { id: 'any_not_exec', name: 'Any (No Exec)', color: '#808080', description: 'Any data type except execution flow' }
        ];

        this.structs = []; // User defined structures
        // Example struct: { id: 'struct_1', name: 'Person', fields: [{ name: 'name', type: 'string' }, { name: 'age', type: 'number' }] }

        this.onChangedCallbacks = [];
    }

    addChangedListener(cb) {
        this.onChangedCallbacks.push(cb);
    }

    notifyChanged() {
        this.onChangedCallbacks.forEach(cb => cb());
    }

    getPrimitives() {
        return this.primitives;
    }

    getStructs() {
        return this.structs;
    }

    getStruct(id) {
        return this.structs.find(s => s.id === id);
    }

    addStruct(name) {
        const id = 'struct_' + Math.random().toString(36).substr(2, 9);
        const newStruct = {
            id: id,
            name: name || 'NewStruct',
            fields: []
        };
        this.structs.push(newStruct);
        this.notifyChanged();
        return newStruct;
    }

    deleteStruct(id) {
        this.structs = this.structs.filter(s => s.id !== id);
        this.notifyChanged();
    }

    updateStruct(id, updates) {
        const s = this.getStruct(id);
        if (s) {
            Object.assign(s, updates);
            this.notifyChanged();
        }
    }

    addField(structId, name, typeStr) {
        const s = this.getStruct(structId);
        if (s) {
            s.fields.push({ name: name || 'newField', type: typeStr || 'string' });
            this.notifyChanged();
        }
    }

    removeField(structId, fieldIndex) {
        const s = this.getStruct(structId);
        if (s && s.fields[fieldIndex]) {
            s.fields.splice(fieldIndex, 1);
            this.notifyChanged();
        }
    }

    moveField(structId, fromIndex, toIndex) {
        const s = this.getStruct(structId);
        if (s && s.fields[fromIndex] && s.fields[toIndex] !== undefined) {
            const field = s.fields.splice(fromIndex, 1)[0];
            s.fields.splice(toIndex, 0, field);
            this.notifyChanged();
        }
    }

    // Type strings: "string", "number", "boolean", "list:string", "map:string:number", "struct:struct_id"
    getTypeDetails(typeStr) {
        if (!typeStr) return { name: 'Unknown', color: '#808080' };

        if (typeStr.startsWith('list:')) {
            const inner = this.getTypeDetails(typeStr.substring(5));
            return {
                name: `List of ${inner.name}`,
                color: '#FFC107', // Gold for lists? Or maybe inner color with a pattern?
                inner: inner
            };
        }

        if (typeStr.startsWith('map:')) {
            const rest = typeStr.substring(4);
            let keyStr, valStr;
            if (rest.startsWith('struct:')) {
                const parts = rest.split(':');
                keyStr = parts[0] + ':' + parts[1];
                valStr = parts.slice(2).join(':') || 'any';
            } else {
                const idx = rest.indexOf(':');
                if (idx !== -1) {
                    keyStr = rest.substring(0, idx);
                    valStr = rest.substring(idx + 1);
                } else {
                    keyStr = rest;
                    valStr = 'any';
                }
            }
            const key = this.getTypeDetails(keyStr);
            const val = this.getTypeDetails(valStr);
            return {
                name: `Map of ${key.name} -> ${val.name}`,
                color: '#9C27B0', // Purple for maps
                key: key,
                val: val
            };
        }

        if (typeStr.startsWith('struct:')) {
            const sid = typeStr.substring(7);
            const s = this.getStruct(sid);
            return {
                name: s ? s.name : 'MissingStruct',
                color: '#2196F3', // Blue for structs
                struct: s
            };
        }

        const p = this.primitives.find(p => p.id === typeStr);
        if (p) return p;

        return { name: typeStr, color: '#808080' };
    }

    getAllTypeStrings() {
        const types = this.primitives.map(p => p.id);
        this.structs.forEach(s => {
            types.push(`struct:${s.id}`);
        });

        // We can't really list all possible combinations of lists and maps
        // But we can offer common ones or a dynamic adder in the UI
        return types;
    }

    serialize() {
        return {
            structs: this.structs
        };
    }

    load(data) {
        if (data && data.structs) {
            this.structs = data.structs;
            this.notifyChanged();
        }
    }
}

window.TypeDatabase = TypeDatabase;

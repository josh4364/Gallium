Object.assign(NodeGraph.prototype, {
    async saveHistory(actionName = 'Action') {
        if (this.isRestoring) return;

        const json = await this.serialize();
        const compressed = await this.compress(json);

        // Remove future logic if we are branching
        if (this.historyIndex < this.history.length - 1) {
            this.history = this.history.slice(0, this.historyIndex + 1);
        }

        this.history.push({ data: compressed, action: actionName });
        this.historyIndex++;

        // Limit history size? (Optional, user said "global undo buffer" suggests unlimited but dangerous)
        if (this.history.length > 50) {
            this.history.shift();
            this.historyIndex--;
        }
    },

    async undo() {
        if (this.historyIndex > 0) {
            this.historyIndex--;
            const state = this.history[this.historyIndex];
            await this.restoreState(state.data, false); // Don't restore view on undo
            this.showNotification(`Undo: ${this.history[this.historyIndex + 1].action}`);
        }
    },

    async redo() {
        if (this.historyIndex < this.history.length - 1) {
            this.historyIndex++;
            const state = this.history[this.historyIndex];
            await this.restoreState(state.data, false); // Don't restore view on redo
            this.showNotification(`Redo: ${state.action}`);
        }
    }
});

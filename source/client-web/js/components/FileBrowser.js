export class FileBrowser {
    constructor(containerId, client) {
        // containerId might be the ID of the view or a specific container
        this.container = document.getElementById(containerId);
        this.client = client;
        this.currentPath = "/";
        if (this.container) this.render();
    }

    render() {
        this.container.innerHTML = `
            <div class="file-browser-bar">
                <button id="fb-up" class="btn btn-sm">Up</button>
                <div id="fb-path" class="path-display">${this.currentPath}</div>
                <button id="fb-refresh" class="btn btn-sm">Refresh</button>
            </div>
            <div id="file-list" class="file-list">Loading...</div>
            <div id="file-content-view" class="file-content-view" style="display:none">
                <div class="file-toolbar">
                     <span id="file-name-display"></span>
                     <button id="fb-close" class="btn btn-sm">Close</button>
                </div>
                <pre><code id="file-code"></code></pre>
            </div>
        `;

        this.listContainer = this.container.querySelector('#file-list');
        this.codeContainer = this.container.querySelector('#file-code');
        this.contentView = this.container.querySelector('#file-content-view');
        this.pathDisplay = this.container.querySelector('#fb-path');
        this.fileNameDisplay = this.container.querySelector('#file-name-display');

        this.container.querySelector('#fb-up').addEventListener('click', () => this.goUp());
        this.container.querySelector('#fb-refresh').addEventListener('click', () => this.refresh());
        this.container.querySelector('#fb-close').addEventListener('click', () => this.closeFile());

        // Initial load
        this.refresh();
    }

    refresh() {
        if (this.client) {
            this.client.send(13, { path: this.currentPath }); // 13 = LIST_FILES
        }
    }

    goUp() {
        if (this.currentPath === '/' || this.currentPath === '') return;
        const parts = this.currentPath.split('/').filter(p => p);
        parts.pop();
        this.currentPath = parts.length ? '/' + parts.join('/') : '/';
        this.pathDisplay.textContent = this.currentPath;
        this.refresh();
    }

    setFiles(files) {
        this.listContainer.innerHTML = '';
        if (!files) return;

        files.sort((a, b) => {
            if (a.is_dir && !b.is_dir) return -1;
            if (!a.is_dir && b.is_dir) return 1;
            return a.name.localeCompare(b.name);
        });

        files.forEach(file => {
            const div = document.createElement('div');
            div.className = 'file-entry ' + (file.is_dir ? 'is-dir' : 'is-file');
            div.innerHTML = `<span class="icon">${file.is_dir ? '📁' : '📄'}</span> ${file.name}`;

            div.addEventListener('click', () => {
                if (file.is_dir) {
                    this.currentPath = (this.currentPath === '/' ? '' : this.currentPath) + '/' + file.name;
                    this.pathDisplay.textContent = this.currentPath;
                    this.refresh();
                } else {
                    this.openFile((this.currentPath === '/' ? '' : this.currentPath) + '/' + file.name);
                }
            });
            this.listContainer.appendChild(div);
        });
    }

    openFile(path) {
        console.log("Opening", path);
        if (this.client) {
            this.client.send(15, { path: path }); // 15 = READ_FILE
        }
    }

    showContent(path, content) {
        this.contentView.style.display = 'flex';
        this.listContainer.style.display = 'none';

        // Simple Syntax Highlighting
        const escaped = content
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");

        const keywords = /\b(return|if|else|for|while|const|let|var|function|class|import|export|static|void|int|char|include|struct)\b/g;
        const highlighted = escaped.replace(keywords, '<span style="color:#bd00ff">$1</span>');

        this.codeContainer.innerHTML = highlighted;
        this.fileNameDisplay.textContent = path;
    }

    closeFile() {
        this.contentView.style.display = 'none';
        this.listContainer.style.display = 'block';
        this.codeContainer.textContent = '';
    }
}

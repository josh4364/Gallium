export class TaskTree {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.tasks = [];
    }

    setTasks(tasks) {
        this.tasks = tasks;
        this.render();
    }

    updateTask(taskUpdate) {
        // taskUpdate: { id, name, status, ... }
        const index = this.tasks.findIndex(t => t.id === taskUpdate.id);
        if (index !== -1) {
            this.tasks[index] = { ...this.tasks[index], ...taskUpdate };
        } else {
            this.tasks.push(taskUpdate);
        }
        this.render();
    }

    render() {
        if (!this.tasks || this.tasks.length === 0) {
            this.container.innerHTML = '<div class="empty-state">No tasks available</div>';
            return;
        }

        this.container.innerHTML = '';
        const list = document.createElement('div');
        list.className = 'task-list';

        this.tasks.forEach(task => {
            const node = this.createTaskNode(task);
            list.appendChild(node);
        });

        this.container.appendChild(list);
    }

    createTaskNode(task) {
        const div = document.createElement('div');
        div.className = `task-node ${task.status || 'pending'}`;
        if (task.active) div.classList.add('active');
        div.dataset.id = task.id;

        const header = document.createElement('div');
        header.className = 'task-header';

        const statusIndicator = document.createElement('span');
        statusIndicator.className = 'status-indicator';

        const title = document.createElement('span');
        title.className = 'task-title';
        title.textContent = task.name || `Task ${task.id}`;

        header.appendChild(statusIndicator);
        header.appendChild(title);
        div.appendChild(header);

        return div;
    }
}

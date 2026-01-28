export class Waterfall {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.events = [];
    }

    addEvent(event) {
        this.events.push(event);
        const entry = document.createElement('div');
        entry.className = 'log-entry';

        const time = new Date(event.timestamp || Date.now()).toLocaleTimeString();
        entry.innerHTML = `<span class="timestamp">[${time}]</span> <span class="source">${event.source || 'SYS'}</span>: ${event.data || JSON.stringify(event)}`;

        this.container.appendChild(entry);
        this.scrollToBottom();
    }

    setEvents(events) {
        // Start fresh or append? Usually setEvents is for initial load
        this.events = events;
        this.container.innerHTML = '';
        events.forEach(e => this.addEvent(e));
    }

    scrollToBottom() {
        this.container.scrollTop = this.container.scrollHeight;
    }
}

import { TaskTree } from './components/TaskTree.js';
import { Waterfall } from './components/Waterfall.js';
import { Chat } from './components/Chat.js';
import { FileBrowser } from './components/FileBrowser.js';

const PROTOCOL = 'gallium-protocol';
const RECONNECT_DELAY = 1000;

const GALLIUM_MSG = {
    INIT: 1,
    TASK_UPDATE: 2,
    EVENT_LOG: 3,
    USER_INPUT: 4,
    HEARTBEAT: 5,
    ERROR: 6,
    NOTIFICATION: 7,
    PANIC: 8,
    GET_EVENTS: 9,
    EVENT_LIST: 10,
    GET_TASKS: 11,
    TASK_LIST: 12,
    LIST_FILES: 13,
    FILE_LIST: 14,
    READ_FILE: 15,
    FILE_CONTENT: 16
};

class GalliumClient {
    constructor() {
        this.ws = null;
        this.taskTree = new TaskTree('task-tree-container');
        this.waterfall = new Waterfall('waterfall-container');
        this.chat = new Chat('chat-container', this);
        this.fileBrowser = new FileBrowser('file-browser-container', this);

        this.setupNavigation();
        this.connect();
    }

    setupNavigation() {
        const links = document.querySelectorAll('.nav-links a');
        links.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const targetId = link.getAttribute('href').substring(1);
                this.switchView(targetId);

                document.querySelectorAll('.nav-links li').forEach(li => li.classList.remove('active'));
                link.parentElement.classList.add('active');
            });
        });
    }

    switchView(viewName) {
        document.querySelectorAll('.view').forEach(view => view.classList.remove('active'));
        const view = document.getElementById(`view-${viewName}`);
        if (view) {
            view.classList.add('active');
            if (viewName === 'files') this.fileBrowser.refresh();
        }
    }

    connect() {
        // If we are serving from file://, default to localhost:8080
        const host = window.location.protocol === 'file:' ? 'localhost:8080' : window.location.host;
        const url = `ws://${host}`;
        console.log(`Connecting to ${url}...`);

        try {
            this.ws = new WebSocket(url, PROTOCOL);
            this.ws.binaryType = 'arraybuffer';

            this.ws.onopen = () => {
                console.log('Connected to Gallium Server');
                this.updateStatus('Online', 'success');
                // Request initial state on connection
                this.send(GALLIUM_MSG.GET_TASKS, {});
                this.send(GALLIUM_MSG.GET_EVENTS, {});
            };

            this.ws.onmessage = (event) => {
                this.handleMessage(event.data);
            };

            this.ws.onclose = () => {
                console.log('Connection closed');
                this.updateStatus('Disconnected', 'error');
                setTimeout(() => this.connect(), RECONNECT_DELAY);
            };

            this.ws.onerror = (error) => {
                console.error('WebSocket error:', error);
                this.ws.close();
            };

        } catch (e) {
            console.error('Connection failed:', e);
            setTimeout(() => this.connect(), RECONNECT_DELAY);
        }
    }

    handleMessage(data) {
        if (data instanceof ArrayBuffer) {
            this.parsePacket(data);
        } else {
            console.log("Received text:", data);
        }
    }

    parsePacket(buffer) {
        if (buffer.byteLength < 6) return;

        const view = new DataView(buffer);
        const msgId = view.getUint16(0, false);
        const length = view.getUint32(2, false);

        if (buffer.byteLength < 6 + length) return;

        const decoder = new TextDecoder('utf-8');
        const jsonStr = decoder.decode(buffer.slice(6, 6 + length));

        try {
            const payload = JSON.parse(jsonStr);
            this.processPacket(msgId, payload);
        } catch (e) {
            console.error("Failed to parse JSON payload", e);
        }
    }

    processPacket(msgId, payload) {
        switch (msgId) {
            case GALLIUM_MSG.INIT:
                // Handshake ack
                break;
            case GALLIUM_MSG.TASK_UPDATE:
                this.taskTree.updateTask(payload);
                break;
            case GALLIUM_MSG.TASK_LIST:
                this.taskTree.setTasks(payload.tasks || []);
                break;
            case GALLIUM_MSG.EVENT_LOG:
                this.waterfall.addEvent(payload);
                break;
            case GALLIUM_MSG.EVENT_LIST:
                this.waterfall.setEvents(payload.events || payload);
                break;
            case GALLIUM_MSG.FILE_LIST:
                this.fileBrowser.setFiles(payload);
                break;
            case GALLIUM_MSG.FILE_CONTENT:
                this.fileBrowser.showContent(payload.path, payload.content);
                break;
            case GALLIUM_MSG.USER_INPUT:
                this.chat.handleInputRequest(payload);
                break;
            default:
                console.log(`Unhandled MsgID ${msgId}`, payload);
        }
    }

    send(msgId, jsonObject) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

        const jsonStr = JSON.stringify(jsonObject);
        const encoder = new TextEncoder();
        const jsonBytes = encoder.encode(jsonStr);

        const buffer = new ArrayBuffer(6 + jsonBytes.length);
        const view = new DataView(buffer);

        view.setUint16(0, msgId, false);
        view.setUint32(2, jsonBytes.length, false);

        const payloadView = new Uint8Array(buffer, 6);
        payloadView.set(jsonBytes);

        this.ws.send(buffer);
    }

    updateStatus(text, type) {
        const el = document.getElementById('connection-status');
        if (el) {
            el.textContent = text;
            el.className = `badge ${type}`;
            if (type === 'success') el.style.color = '#00ff00';
            else if (type === 'error') el.style.color = '#ff4d4d';
        }
    }
}

const client = new GalliumClient();

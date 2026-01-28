export class Chat {
    constructor(containerId, client) {
        this.container = document.getElementById(containerId);
        this.client = client;
        this.render();
    }

    render() {
        this.container.innerHTML = `
            <div class="chat-messages" id="chat-messages"></div>
            <div class="chat-input-area">
                <input type="text" id="chat-input" placeholder="Type instructions..." />
                <button id="chat-send" class="btn">Send</button>
            </div>
        `;

        this.messagesContainer = this.container.querySelector('#chat-messages');
        this.input = this.container.querySelector('#chat-input');
        this.sendBtn = this.container.querySelector('#chat-send');

        this.sendBtn.addEventListener('click', () => this.sendMessage());
        this.input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendMessage();
        });
    }

    sendMessage() {
        const text = this.input.value.trim();
        if (!text) return;

        // Echo user message
        this.addMessage('You', text);

        // Send to server (MsgID 4 = GALLIUM_MSG_USER_INPUT)
        if (this.client) {
            this.client.send(4, { text: text });
        }

        this.input.value = '';
    }

    addMessage(sender, text, type = 'user') {
        const div = document.createElement('div');
        div.className = `chat-message ${type}`;
        div.innerHTML = `<span class="chat-sender">${sender}:</span> <span class="chat-text">${text}</span>`;
        this.messagesContainer.appendChild(div);
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }

    handleInputRequest(payload) {
        if (payload.prompt) {
            this.addMessage('System', payload.prompt, 'system');
            this.input.focus();
            this.input.parentElement.classList.add('highlight-input');
            setTimeout(() => this.input.parentElement.classList.remove('highlight-input'), 1000);
        }
    }
}

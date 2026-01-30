import threading
import asyncio
import logging
import json
import webbrowser
from pathlib import Path
from queue import Queue
from aiohttp import web
from source.function_manager import FunctionManager

logger = logging.getLogger("web_server")

class GalliumWebServer:
    def __init__(self, host="127.0.0.1", port=8080):
        self.host = host
        self.port = port
        self.app = web.Application()
        self.app.router.add_get('/', self.handle_index)
        self.app.router.add_get('/ws', self.handle_websocket)
        
        # Serve node_editor static files
        node_editor_path = Path(__file__).parent / "node_editor"
        self.app.router.add_static('/node_editor', path=str(node_editor_path), show_index=True)

        self.msg_queue = Queue()
        self.loop = None
        self.runner = None
        self.site = None
        self.server_thread = None
        self.running = False
        self.websockets = set()
        self.func_manager = FunctionManager()

    async def _broadcast_async(self, message):
        if not self.websockets:
            return
        
        # Prepare the message once
        if isinstance(message, dict):
            msg_str = json.dumps(message)
        else:
            msg_str = str(message)
            
        # Send to all connected clients
        # Use simple iteration, avoiding modification during iteration issues if needed
        # but for set it's generally fine provided we don't await inside the loop in a way that modifies the set?
        # Actually ws.send_str is async, so we must be careful if removal happens concurrently.
        # Copying the set is safer.
        for ws in list(self.websockets):
            try:
                await ws.send_str(msg_str)
            except Exception as e:
                logger.error(f"Error broadcasting to client: {e}")

    def broadcast(self, message):
        """Thread-safe broadcast to all clients."""
        if self.loop and self.running:
            asyncio.run_coroutine_threadsafe(self._broadcast_async(message), self.loop)

    async def handle_index(self, request):
        path = Path(__file__).parent / "index.html"
        if not path.exists():
            return web.Response(text="<h1>Error: index.html not found</h1>", content_type='text/html')
        return web.FileResponse(path)

    async def handle_websocket(self, request):
        ws = web.WebSocketResponse()
        await ws.prepare(request)
        
        self.websockets.add(ws)
        # logger.info("Web socket connection established")

        try:
            async for msg in ws:
                if msg.type == web.WSMsgType.TEXT:
                    # Put message into the thread-safe queue
                    try:
                        data = json.loads(msg.data)
                        
                        # Forward all messages to main loop
                        self.msg_queue.put(data)
                    except json.JSONDecodeError:
                        self.msg_queue.put(msg.data)
                elif msg.type == web.WSMsgType.ERROR:
                    logger.error('ws connection closed with exception %s', ws.exception())
        except Exception as e:
            logger.error(f"WebSocket Error: {e}")
        finally:
            self.websockets.remove(ws) # Connection closed

        return ws

    def _run_server(self):
        self.loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self.loop)
        
        self.runner = web.AppRunner(self.app)
        self.loop.run_until_complete(self.runner.setup())
        self.site = web.TCPSite(self.runner, self.host, self.port)
        
        try:
            self.loop.run_until_complete(self.site.start())
            self.running = True
            self.loop.run_forever()
        except Exception as e:
            logger.error(f"Server loop error: {e}")
        finally:
            if self.runner:
                self.loop.run_until_complete(self.runner.cleanup())

    def start(self):
        """Starts the server in a separate thread and returns the URL."""
        self.server_thread = threading.Thread(target=self._run_server, daemon=True)
        self.server_thread.start()
        url = f"http://{self.host}:{self.port}"
        return url

    def get_messages(self):
        """Non-blocking get of all pending messages."""
        msgs = []
        while not self.msg_queue.empty():
            msgs.append(self.msg_queue.get())
        return msgs

    def stop(self):
        if self.loop:
            self.loop.call_soon_threadsafe(self.loop.stop)
        if self.server_thread:
            self.server_thread.join(timeout=2)

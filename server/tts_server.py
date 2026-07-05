import asyncio
import http.server
import json
import socketserver
import sys
import edge_tts

DEFAULT_VOICE = "en-GB-SoniaNeural"
DEFAULT_RATE = "+0%"
DEFAULT_CALM_RATE = "-20%"
PORT = 8765


class TTSHandler(http.server.BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass

    def _send_json(self, status, data):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())

    def _send_audio(self, audio_bytes):
        self.send_response(200)
        self.send_header("Content-Type", "audio/mpeg")
        self.send_header("Content-Length", str(len(audio_bytes)))
        self.end_headers()
        self.wfile.write(audio_bytes)

    async def _generate_audio(self, text, voice, rate):
        communicate = edge_tts.Communicate(text, voice, rate=rate)
        audio = b""
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio += chunk["data"]
        return audio

    def do_POST(self):
        if self.path != "/tts":
            self._send_json(404, {"error": "Not found"})
            return

        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length)

        try:
            data = json.loads(body)
        except json.JSONDecodeError:
            self._send_json(400, {"error": "Invalid JSON"})
            return

        text = data.get("text", "").strip()
        if not text:
            self._send_json(400, {"error": "No text provided"})
            return

        voice = data.get("voice", DEFAULT_VOICE)
        calm = data.get("calm", False)
        rate = DEFAULT_CALM_RATE if calm else DEFAULT_RATE

        try:
            audio = asyncio.run(self._generate_audio(text, voice, rate))
            self._send_audio(audio)
        except Exception as e:
            self._send_json(500, {"error": str(e)})


def run():
    port = PORT
    if len(sys.argv) > 1:
        try:
            port = int(sys.argv[1])
        except ValueError:
            pass

    with socketserver.TCPServer(("127.0.0.1", port), TTSHandler) as httpd:
        print(f"edge-tts server running on 127.0.0.1:{port}", flush=True)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    run()

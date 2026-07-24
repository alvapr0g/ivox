#!/usr/bin/env python3
"""VOX local backend: serves health checks and transcribes audio with local Whisper."""

from __future__ import annotations

import json
import os
import pathlib
import shutil
import subprocess
import tempfile
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HOST = os.getenv("VOX_HOST", "127.0.0.1")
PORT = int(os.getenv("VOX_PORT", "8787"))
MODEL = os.getenv("VOX_MODEL", "large-v3")
WHISPER_MODEL_PATH = os.getenv("VOX_WHISPER_MODEL_PATH", "")

MODE_PROMPTS = {
    "dictar": "Corrige puntuación y errores evidentes sin cambiar el significado ni el tono.",
    "prompt": "Convierte el texto en un prompt claro, específico y accionable. Conserva todos los datos importantes.",
    "ordenar": "Organiza el texto en párrafos y listas cuando ayude. Elimina repeticiones sin perder ideas.",
}


class VoxHandler(BaseHTTPRequestHandler):
    server_version = "VOX/0.1"

    def _headers(self, status: int = 200):
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-VOX-Provider, X-VOX-Model, X-VOX-API-Key")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.end_headers()

    def _json(self, payload: dict, status: int = 200):
        self._headers(status)
        self.wfile.write(json.dumps(payload, ensure_ascii=False).encode("utf-8"))

    def do_OPTIONS(self):
        self._headers(204)

    def do_GET(self):
        if self.path == "/api/health":
            engine = detect_engine()
            self._json({"ok": True, "engine": engine, "model": MODEL, "local": True})
        else:
            self._json({"error": "Ruta no encontrada"}, 404)

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path != "/api/transcribe":
            self._json({"error": "Ruta no encontrada"}, 404)
            return
        length = int(self.headers.get("Content-Length", "0"))
        if not length or length > 50 * 1024 * 1024:
            self._json({"error": "Audio vacío o demasiado grande (máximo 50 MB)."}, 400)
            return
        mode = urllib.parse.parse_qs(parsed.query).get("mode", ["dictar"])[0]
        content_type = self.headers.get("Content-Type", "audio/webm")
        suffix = ".wav" if "wav" in content_type else ".mp4" if "mp4" in content_type else ".webm"
        try:
            with tempfile.TemporaryDirectory(prefix="vox-") as tmp:
                source = pathlib.Path(tmp) / f"voice{suffix}"
                source.write_bytes(self.rfile.read(length))
                transcript = transcribe(source, pathlib.Path(tmp))
                provider = self.headers.get("X-VOX-Provider", "none")
                api_key = self.headers.get("X-VOX-API-Key", "")
                model = self.headers.get("X-VOX-Model", "")
                result = phrase(transcript, mode, provider, model, api_key) if provider != "none" and api_key else transcript
                self._json({"text": result.strip(), "raw": transcript.strip(), "mode": mode, "local": True})
        except RuntimeError as exc:
            self._json({"error": str(exc)}, 503)
        except Exception as exc:
            self._json({"error": f"Error inesperado: {exc}"}, 500)

    def log_message(self, fmt, *args):
        print(f"[VOX] {self.address_string()} - {fmt % args}")


def detect_engine() -> str:
    if os.getenv("VOX_WHISPER_COMMAND"):
        return "custom"
    if shutil.which("whisper"):
        return "openai-whisper"
    if shutil.which("whisper-cli") and WHISPER_MODEL_PATH:
        return "whisper.cpp"
    return "not-configured"


def transcribe(source: pathlib.Path, workdir: pathlib.Path) -> str:
    custom = os.getenv("VOX_WHISPER_COMMAND")
    if custom:
        output = workdir / "transcript.txt"
        command = custom.format(input=str(source), output=str(output), model=MODEL)
        completed = subprocess.run(command, shell=True, capture_output=True, text=True)
        if completed.returncode:
            raise RuntimeError(completed.stderr.strip() or "El comando Whisper falló.")
        return output.read_text("utf-8") if output.exists() else completed.stdout

    whisper = shutil.which("whisper")
    if whisper:
        command = [
            whisper, str(source), "--model", MODEL, "--language", "Spanish",
            "--task", "transcribe", "--output_format", "txt", "--output_dir", str(workdir),
        ]
        completed = subprocess.run(command, capture_output=True, text=True)
        if completed.returncode:
            raise RuntimeError(completed.stderr.strip() or "Whisper no pudo transcribir el audio.")
        output = workdir / f"{source.stem}.txt"
        if not output.exists():
            raise RuntimeError("Whisper terminó, pero no generó una transcripción.")
        return output.read_text("utf-8")

    whisper_cpp = shutil.which("whisper-cli")
    if whisper_cpp and WHISPER_MODEL_PATH:
        wav = workdir / "voice.wav"
        ffmpeg = shutil.which("ffmpeg")
        if not ffmpeg:
            raise RuntimeError("whisper.cpp necesita ffmpeg para convertir el audio del navegador.")
        convert = subprocess.run([ffmpeg, "-y", "-i", str(source), "-ar", "16000", "-ac", "1", str(wav)], capture_output=True, text=True)
        if convert.returncode:
            raise RuntimeError("No se pudo convertir el audio a WAV.")
        output_base = workdir / "transcript"
        completed = subprocess.run([whisper_cpp, "-m", WHISPER_MODEL_PATH, "-f", str(wav), "-l", "es", "-otxt", "-of", str(output_base)], capture_output=True, text=True)
        if completed.returncode:
            raise RuntimeError(completed.stderr.strip() or "whisper.cpp no pudo transcribir.")
        return output_base.with_suffix(".txt").read_text("utf-8")

    raise RuntimeError(
        "Whisper local no está configurado. Instala openai-whisper o define "
        "VOX_WHISPER_MODEL_PATH para whisper.cpp. Consulta README.md."
    )


def phrase(text: str, mode: str, provider: str, model: str, api_key: str) -> str:
    instruction = MODE_PROMPTS.get(mode, MODE_PROMPTS["dictar"])
    if provider == "openai":
        data = {
            "model": model or "gpt-4.1-mini",
            "messages": [
                {"role": "system", "content": f"Eres el phraser de VOX. Responde solo con el texto final. {instruction}"},
                {"role": "user", "content": text},
            ],
        }
        request = urllib.request.Request(
            "https://api.openai.com/v1/chat/completions",
            data=json.dumps(data).encode(),
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        )
        with urllib.request.urlopen(request, timeout=45) as response:
            return json.load(response)["choices"][0]["message"]["content"]
    if provider == "anthropic":
        data = {
            "model": model or "claude-3-5-haiku-latest",
            "max_tokens": 1800,
            "system": f"Eres el phraser de VOX. Responde solo con el texto final. {instruction}",
            "messages": [{"role": "user", "content": text}],
        }
        request = urllib.request.Request(
            "https://api.anthropic.com/v1/messages",
            data=json.dumps(data).encode(),
            headers={"x-api-key": api_key, "anthropic-version": "2023-06-01", "Content-Type": "application/json"},
        )
        with urllib.request.urlopen(request, timeout=45) as response:
            return json.load(response)["content"][0]["text"]
    return text


if __name__ == "__main__":
    print(f"VOX local backend → http://{HOST}:{PORT}")
    print(f"Whisper engine: {detect_engine()} · model: {MODEL}")
    ThreadingHTTPServer((HOST, PORT), VoxHandler).serve_forever()

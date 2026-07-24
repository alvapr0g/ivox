# VOX local

## 1. Motor de transcripción

Opción simple con OpenAI Whisper:

```bash
python3 -m pip install -U openai-whisper
```

Whisper usa `ffmpeg`. En macOS:

```bash
brew install ffmpeg
```

El backend usa `large-v3` por defecto. Puedes cambiarlo:

```bash
VOX_MODEL=medium python3 local_backend.py
```

Para usar whisper.cpp, instala `whisper-cli`, descarga el modelo Large v3 y ejecuta:

```bash
VOX_WHISPER_MODEL_PATH=/ruta/ggml-large-v3.bin python3 local_backend.py
```

## 2. Iniciar VOX

En una terminal:

```bash
python3 local_backend.py
```

En otra:

```bash
npm run dev
```

Abre la dirección mostrada por el servidor web. El indicador superior debe decir “Motor local conectado”.

## Phraser opcional

En Configuración puedes elegir OpenAI o Anthropic y entregar tu propia API key. La key no se guarda en el navegador; solo se envía al backend local durante la transcripción.

## Comando Whisper personalizado

También puedes definir un comando completo. Están disponibles `{input}`, `{output}` y `{model}`:

```bash
VOX_WHISPER_COMMAND='mi-whisper --input "{input}" --output "{output}" --model "{model}"' python3 local_backend.py
```

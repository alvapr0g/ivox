# VOX — Vox Imperii

> Habla. Piensa en grande.

VOX es una experiencia open source de dictado por voz con procesamiento local,
diseñada para escribir mensajes, ordenar ideas y crear prompts hablando de forma
natural.

## Qué incluye

- Interfaz imperial en negro y dorado.
- Grabación real desde el micrófono.
- Modos **Dictar**, **Prompt** y **Ordenar**.
- Historial persistente en el dispositivo.
- Atajos de teclado.
- Backend local sin login.
- Integración con Whisper Large v3.
- Phraser opcional mediante una API key del usuario.
- Diseño responsive.

## Arquitectura

- **Frontend:** TypeScript, React, Next.js y vinext.
- **Voz a texto:** Whisper Large v3 ejecutado localmente.
- **Backend:** servidor HTTP local escrito en Python.
- **Phraser opcional:** OpenAI o Anthropic. Solo se usa cuando el usuario lo
  configura.

El audio no necesita salir del equipo. Las preferencias y el historial se
guardan en el navegador mediante almacenamiento local.

## Inicio rápido

Requisitos:

- Node.js 22.13 o superior.
- Python 3.10 o superior.
- Una instalación compatible de Whisper.

```bash
pnpm install
pnpm dev
```

En otra terminal:

```bash
python3 local_backend.py
```

Abre la URL indicada por el frontend. VOX espera el backend en
`http://127.0.0.1:8787`.

La configuración completa de Whisper, los modelos compatibles y las variables
opcionales están en [LOCAL_SETUP.md](LOCAL_SETUP.md).

## Privacidad

- No existe login ni autenticación.
- La API key del phraser no se guarda.
- Whisper procesa el audio localmente.
- El phraser es completamente opcional.

## Desarrollo

```bash
pnpm build
python3 -m py_compile local_backend.py
```

## Licencia

MIT. Consulta [LICENSE](LICENSE).

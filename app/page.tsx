"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Tab = "dictar" | "modos" | "historial" | "atajos" | "configuracion";
type Mode = "dictar" | "prompt" | "ordenar";
type HistoryItem = { id: string; text: string; mode: Mode; createdAt: string };

const nav: { id: Tab; label: string; icon: string }[] = [
  { id: "dictar", label: "Dictar", icon: "◉" },
  { id: "modos", label: "Modos", icon: "✦" },
  { id: "historial", label: "Historial", icon: "◷" },
  { id: "atajos", label: "Atajos", icon: "⌘" },
  { id: "configuracion", label: "Configuración", icon: "⚙" },
];

const modeCopy: Record<Mode, { label: string; description: string }> = {
  dictar: { label: "Dictar", description: "Transcripción fiel, rápida y natural." },
  prompt: { label: "Prompt", description: "Convierte ideas habladas en instrucciones claras." },
  ordenar: { label: "Ordenar", description: "Transforma discurso libre en texto estructurado." },
};

export default function Home() {
  const [tab, setTab] = useState<Tab>("dictar");
  const [mode, setMode] = useState<Mode>("dictar");
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [backendOnline, setBackendOnline] = useState(false);
  const [backendUrl, setBackendUrl] = useState("http://127.0.0.1:8787");
  const [provider, setProvider] = useState("none");
  const [model, setModel] = useState("gpt-4.1-mini");
  const [apiKey, setApiKey] = useState("");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);

  useEffect(() => {
    const saved = localStorage.getItem("vox-settings");
    const savedHistory = localStorage.getItem("vox-history");
    if (saved) {
      const settings = JSON.parse(saved);
      setBackendUrl(settings.backendUrl || "http://127.0.0.1:8787");
      setProvider(settings.provider || "none");
      setModel(settings.model || "gpt-4.1-mini");
    }
    if (savedHistory) setHistory(JSON.parse(savedHistory));
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${backendUrl}/api/health`, { signal: controller.signal })
      .then((response) => response.ok && setBackendOnline(true))
      .catch(() => setBackendOnline(false));
    return () => controller.abort();
  }, [backendUrl]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.code === "Space") {
        event.preventDefault();
        void toggleRecording();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  });

  const status = useMemo(() => {
    if (processing) return "Procesando localmente…";
    if (recording) return "Escuchando…";
    return backendOnline ? "Listo para dictar" : "Backend desconectado";
  }, [processing, recording, backendOnline]);

  async function toggleRecording() {
    if (processing) return;
    if (recording) {
      recorder.current?.stop();
      setRecording(false);
      return;
    }
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      recorder.current = mediaRecorder;
      chunks.current = [];
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size) chunks.current.push(event.data);
      };
      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        await transcribe(new Blob(chunks.current, { type: mediaRecorder.mimeType || "audio/webm" }));
      };
      mediaRecorder.start();
      setRecording(true);
      setText("");
    } catch {
      setError("No pude acceder al micrófono. Revisa el permiso del navegador.");
    }
  }

  async function transcribe(audio: Blob) {
    setProcessing(true);
    try {
      const response = await fetch(`${backendUrl}/api/transcribe?mode=${mode}`, {
        method: "POST",
        headers: {
          "Content-Type": audio.type || "audio/webm",
          "X-VOX-Provider": provider,
          "X-VOX-Model": model,
          ...(apiKey ? { "X-VOX-API-Key": apiKey } : {}),
        },
        body: audio,
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "No se pudo transcribir.");
      setText(payload.text);
      const item: HistoryItem = {
        id: crypto.randomUUID(),
        text: payload.text,
        mode,
        createdAt: new Date().toISOString(),
      };
      const next = [item, ...history].slice(0, 50);
      setHistory(next);
      localStorage.setItem("vox-history", JSON.stringify(next));
      setBackendOnline(true);
    } catch (cause) {
      setBackendOnline(false);
      setError(cause instanceof Error ? cause.message : "El backend local no respondió.");
    } finally {
      setProcessing(false);
    }
  }

  function saveSettings() {
    localStorage.setItem("vox-settings", JSON.stringify({ backendUrl, provider, model }));
    setError("");
    fetch(`${backendUrl}/api/health`)
      .then((response) => setBackendOnline(response.ok))
      .catch(() => setBackendOnline(false));
  }

  function clearHistory() {
    setHistory([]);
    localStorage.removeItem("vox-history");
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => setTab("dictar")} aria-label="Ir a dictado">
          <span className="crest"><span>V</span></span>
          <span className="wordmark">VOX</span>
        </button>
        <p className="nav-label">TU ESPACIO</p>
        <nav>
          {nav.map((item) => (
            <button
              key={item.id}
              className={tab === item.id ? "nav-item active" : "nav-item"}
              onClick={() => setTab(item.id)}
            >
              <span>{item.icon}</span>{item.label}
            </button>
          ))}
        </nav>
        <div className="side-footer">
          <strong>Vox Imperii</strong>
          <span>Local · Privado · Open source</span>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <span className="eyebrow">SALA DE COMANDO</span>
            <p>Convierte tu voz en acción.</p>
          </div>
          <div className={backendOnline ? "local-status online" : "local-status"}>
            <span className="status-dot" />
            {backendOnline ? "Motor local conectado" : "Conecta el motor local"}
          </div>
        </header>

        {tab === "dictar" && (
          <>
            <section className="hero">
              <div className="hero-copy">
                <span className="eyebrow">VOX IMPERII</span>
                <h1>Habla.<br /><em>Piensa en grande.</em></h1>
                <p>El sistema de voz privado para trabajar con IA. Dicta en español, mezcla términos técnicos y deja que VOX ordene tus ideas.</p>
                <div className="hero-actions">
                  <button className={recording ? "record-button stop" : "record-button"} onClick={() => void toggleRecording()}>
                    <span>{recording ? "■" : "●"}</span>
                    {recording ? "Detener dictado" : "Comenzar a dictar"}
                  </button>
                  <button className="ghost-button" onClick={() => setTab("atajos")}>⌘ Ver atajos</button>
                </div>
              </div>
              <button
                className={`voice-orb ${recording ? "recording" : ""} ${processing ? "processing" : ""}`}
                onClick={() => void toggleRecording()}
                aria-label={recording ? "Detener dictado" : "Comenzar dictado"}
              >
                <span className="orbit orbit-one" />
                <span className="orbit orbit-two" />
                <span className="orb-core">{recording ? "■" : "●"}</span>
                <small>{status}</small>
              </button>
            </section>

            <section className="transcription">
              <div className="panel-head">
                <strong>Transcripción</strong>
                <span className={`live-status ${recording || processing ? "active" : ""}`}>
                  <span className="status-dot" />{status}
                </span>
              </div>
              <div className="editor">
                {text ? <p>{text}</p> : <p className="placeholder">{processing ? "Whisper está procesando tu voz…" : "Tu voz aparecerá aquí…"}</p>}
                {error && <p className="error">{error}</p>}
              </div>
              <div className="panel-controls">
                <div className="mode-switcher">
                  {(Object.keys(modeCopy) as Mode[]).map((key) => (
                    <button key={key} className={mode === key ? "mode selected" : "mode"} onClick={() => setMode(key)}>
                      {modeCopy[key].label}
                    </button>
                  ))}
                </div>
                <span className="engine">Whisper Large v3 · Local</span>
              </div>
            </section>
          </>
        )}

        {tab === "modos" && (
          <Page title="Modos de voz" kicker="PHRASER CONTEXTUAL" description="Elige cómo VOX debe transformar tus palabras.">
            <div className="card-grid">
              {(Object.keys(modeCopy) as Mode[]).map((key) => (
                <button key={key} className={mode === key ? "feature-card selected-card" : "feature-card"} onClick={() => { setMode(key); setTab("dictar"); }}>
                  <span className="card-icon">{key === "dictar" ? "◉" : key === "prompt" ? "✦" : "≡"}</span>
                  <h3>{modeCopy[key].label}</h3>
                  <p>{modeCopy[key].description}</p>
                  <small>Usar este modo →</small>
                </button>
              ))}
            </div>
          </Page>
        )}

        {tab === "historial" && (
          <Page title="Historial local" kicker="ÚLTIMAS TRANSCRIPCIONES" description="Guardado únicamente en este navegador.">
            <div className="history-head"><span>{history.length} elementos</span><button className="text-button" onClick={clearHistory}>Limpiar historial</button></div>
            <div className="history-list">
              {history.length === 0 && <div className="empty-state">Aún no tienes transcripciones. Tu próximo dictado aparecerá aquí.</div>}
              {history.map((item) => (
                <article key={item.id} className="history-item">
                  <div><span className="history-mode">{modeCopy[item.mode].label}</span><time>{new Date(item.createdAt).toLocaleString("es")}</time></div>
                  <p>{item.text}</p>
                  <button className="text-button" onClick={() => navigator.clipboard.writeText(item.text)}>Copiar</button>
                </article>
              ))}
            </div>
          </Page>
        )}

        {tab === "atajos" && (
          <Page title="Atajos" kicker="TRABAJA SIN INTERRUMPIRTE" description="Mantén las manos donde está el trabajo.">
            <div className="shortcut-list">
              <Shortcut label="Comenzar o detener dictado" keys={["⌘", "⇧", "Espacio"]} />
              <Shortcut label="Copiar última transcripción" keys={["⌘", "C"]} />
              <Shortcut label="Cambiar al modo Prompt" keys={["⌘", "2"]} />
              <Shortcut label="Cambiar al modo Ordenar" keys={["⌘", "3"]} />
            </div>
          </Page>
        )}

        {tab === "configuracion" && (
          <Page title="Configuración" kicker="TODO BAJO TU CONTROL" description="VOX funciona localmente y no necesita una cuenta.">
            <div className="settings">
              <label>Dirección del backend local<input value={backendUrl} onChange={(e) => setBackendUrl(e.target.value)} /></label>
              <label>Proveedor del phraser
                <select value={provider} onChange={(e) => setProvider(e.target.value)}>
                  <option value="none">Sin phraser</option><option value="openai">OpenAI</option><option value="anthropic">Anthropic</option>
                </select>
              </label>
              <label>Modelo<input value={model} onChange={(e) => setModel(e.target.value)} /></label>
              <label>API key — no se guarda<input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="Opcional" /></label>
              <button className="record-button" onClick={saveSettings}>Guardar y comprobar</button>
              <p className="privacy-note">La API key permanece en memoria y solo se envía al backend que configuraste.</p>
            </div>
          </Page>
        )}
      </section>
    </main>
  );
}

function Page({ title, kicker, description, children }: { title: string; kicker: string; description: string; children: React.ReactNode }) {
  return <section className="page-view"><span className="eyebrow">{kicker}</span><h2>{title}</h2><p className="page-description">{description}</p>{children}</section>;
}

function Shortcut({ label, keys }: { label: string; keys: string[] }) {
  return <div className="shortcut-row"><span>{label}</span><div>{keys.map((key) => <kbd key={key}>{key}</kbd>)}</div></div>;
}

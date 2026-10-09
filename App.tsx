"use client";

import { useRef, useState } from "react";
import { AudioLines, Guitar, Upload } from "lucide-react";
import { AlphaTabViewer } from "./AlphaTabViewer";
import { useGuitarStore } from "./useGuitarStore";
import { useTargetPitchValidator } from "./useTargetPitchValidator";
import "./app.css";

export default function App() {
  const [isAudioInitialized, setIsAudioInitialized] = useState(false);
  const [file, setFile] = useState<Uint8Array | null>(null);
  const [fileName, setFileName] = useState("");
  const [fileError, setFileError] = useState<string | null>(null);
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const fileRevisionRef = useRef(0);
  const isWaitMode = useGuitarStore((state) => state.isWaitMode);
  const setIsWaitMode = useGuitarStore((state) => state.setIsWaitMode);
  const audioInput = useTargetPitchValidator();

  async function startPractice() {
    if (!file || isLoadingFile) return;
    if (await audioInput.start()) setIsAudioInitialized(true);
  }

  return (
    <main className="practice-app" style={{ minHeight: "100dvh", backgroundColor: "#111315", color: "#eef0ec" }}>
      <header className="app-header">
        <div className="app-brand"><Guitar size={24} aria-hidden="true" /><h1>Guitar Practice</h1></div>
        <button type="button" className="mode-toggle" role="switch"
          aria-checked={isWaitMode} onClick={() => setIsWaitMode(!isWaitMode)}>
          <span>Wait mode</span><span className="switch-track" aria-hidden="true"><span /></span>
        </button>
      </header>

      {!isAudioInitialized ? (
        <section className="start-screen" aria-label="Start practice">
          <AudioLines size={48} className="start-icon" aria-hidden="true" />
          <h2>Practice Session</h2>
          <label className="file-picker">
            <Upload size={18} aria-hidden="true" />
            <span>{isLoadingFile ? "Loading file..." : fileName || "Choose Guitar Pro file"}</span>
            <input type="file" accept=".gp,.gp3,.gp4,.gp5,.gpx" disabled={audioInput.status === "starting"}
              onChange={async (event) => {
                const selected = event.target.files?.[0];
                if (!selected) return;
                const revision = ++fileRevisionRef.current;
                setIsLoadingFile(true);
                setFile(null);
                setFileName(selected.name);
                setFileError(null);
                try {
                  const bytes = new Uint8Array(await selected.arrayBuffer());
                  if (revision === fileRevisionRef.current) setFile(bytes);
                } catch {
                  if (revision === fileRevisionRef.current) setFileError("Unable to read this file.");
                } finally {
                  if (revision === fileRevisionRef.current) setIsLoadingFile(false);
                }
              }} />
          </label>
          <button type="button" className="start-button" disabled={!file || isLoadingFile || audioInput.status === "starting"}
            onClick={() => void startPractice()}>
            <AudioLines size={20} aria-hidden="true" />
            {audioInput.status === "starting" ? "Connecting audio..." : "Start Audio & Practice"}
          </button>
          {(fileError || audioInput.error) && <p className="error-message" role="alert">{fileError || audioInput.error}</p>}
        </section>
      ) : file && (
        <section className="session">
          <div className="session-heading"><h2>{fileName}</h2><span>Session active</span></div>
          <AlphaTabViewer file={file} audioInput={audioInput} assetBaseUrl="/" />
        </section>
      )}
    </main>
  );
}
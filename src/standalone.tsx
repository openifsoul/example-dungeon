import { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { createHTTPTransport, type BridgeHistory } from "@ifsoul/adapter-sdk";
import { createExampleSession, type ExampleSession } from "./adapter.js";
import { Button } from "./ui/button.js";
import "./standalone.css";
function App() {
  const host = useRef<HTMLDivElement>(null),
    session = useRef<ExampleSession | null>(null);
  const [run, setRun] = useState(0),
    [mode, setMode] = useState("scenario"),
    [paused, setPaused] = useState(false),
    [status, setStatus] = useState("Opening the game…"),
    [speech, setSpeech] = useState(""),
    [draft, setDraft] = useState(""),
    [chatPending, setChatPending] = useState(false),
    [chatError, setChatError] = useState(""),
    [transcript, setTranscript] = useState<{ role: string; text: string }[]>(
      [],
    ),
    [events, setEvents] = useState<BridgeHistory[]>([]),
    [theme, setTheme] = useState("light");
  useEffect(() => {
    const controller = new AbortController();
    setEvents([]);
    setSpeech("");
    setTranscript([]);
    setChatPending(false);
    setChatError("");
    setPaused(false);
    setStatus("Opening the game…");
    void createExampleSession(host.current!, {
      signal: controller.signal,
      transport:
        mode === "local" ? createHTTPTransport("/api/demo/bridge") : undefined,
      onObservation(event) {
        if (!controller.signal.aborted)
          setEvents((old) => [event, ...old].slice(0, 6));
      },
      onSpeech(reply) {
        if (!controller.signal.aborted) {
          setSpeech(`${reply.source}: ${reply.speech}`);
          setTranscript((old) =>
            [
              ...old,
              { role: `Companion (${reply.source})`, text: reply.speech },
            ].slice(-12),
          );
        }
      },
    })
      .then((game) => {
        if (controller.signal.aborted) game.destroy();
        else {
          session.current = game;
          setStatus(
            mode === "scenario"
              ? "Scenario · no model or account"
              : "Local IfSoul connection · fallback is labeled",
          );
        }
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setStatus(
            "The game could not start. Reload or try another browser with WebGL enabled.",
          );
      });
    return () => {
      controller.abort();
      session.current?.destroy();
      session.current = null;
    };
  }, [run, mode]);
  async function sendChat() {
    const current = session.current,
      text = draft.trim();
    if (!current || !text || chatPending) return;
    setChatPending(true);
    setChatError("");
    setTranscript((old) => [...old, { role: "You", text }].slice(-12));
    try {
      await current.chat(text);
      if (session.current === current) setDraft("");
    } catch {
      if (session.current === current)
        setChatError(
          "Message unavailable. Your draft is preserved; try again.",
        );
    } finally {
      if (session.current === current) setChatPending(false);
    }
  }
  return (
    <main data-theme={theme}>
      <header>
        <p className="eyebrow">Independent original game host</p>
        <h1>The Hollow Warden</h1>
        <p>
          The game owns its mechanics. IfSoul supplies bounded choices and
          requested speech.
        </p>
      </header>
      <section className="toolbar" aria-label="Session controls">
        <label>
          Connection
          <select value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="scenario">Scenario · no network</option>
            <option value="local">Local IfSoul proxy</option>
          </select>
        </label>
        <Button
          onClick={() => {
            if (paused) session.current?.resume();
            else session.current?.pause();
            setPaused(!paused);
          }}
        >
          {paused ? "Resume session" : "Pause session"}
        </Button>
        <Button variant="outline" onClick={() => setRun((v) => v + 1)}>
          Restart game
        </Button>
        <Button
          variant="ghost"
          onClick={() => setTheme((v) => (v === "light" ? "dark" : "light"))}
        >
          {theme === "light" ? "Dark theme" : "Light theme"}
        </Button>
      </section>
      <p role="status">{status}</p>
      <div className="playfield" ref={host} />
      <section aria-label="Companion dialogue">
        <h2>Companion</h2>
        <div className="transcript" aria-live="polite">
          {transcript.length ? (
            transcript.map((message, index) => (
              <p key={index}>
                <strong>{message.role}: </strong>
                {message.text}
              </p>
            ))
          ) : (
            <p>
              {speech ||
                "Talk with your companion here. Game outcomes share this session's bounded history."}
            </p>
          )}
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void sendChat();
          }}
        >
          <label htmlFor="chat-draft">Message your companion</label>
          <textarea
            id="chat-draft"
            value={draft}
            maxLength={600}
            onChange={(event) => setDraft(event.target.value)}
            rows={3}
          />
          <Button disabled={!draft.trim() || chatPending} type="submit">
            {chatPending ? "Sending…" : "Send message"}
          </Button>
          {chatError && <p role="alert">{chatError}</p>}
        </form>
      </section>
      <section aria-label="Observed outcomes">
        <h2>Observed outcomes</h2>
        {events.length ? (
          <ul>
            {events.map((event) => (
              <li key={event.id}>{event.summary}</li>
            ))}
          </ul>
        ) : (
          <p>No completed host actions reported yet.</p>
        )}
      </section>
      <footer>
        Local example. No account, model key or backend is required for scenario
        play.
      </footer>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

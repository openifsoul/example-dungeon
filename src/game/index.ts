import type { GameMountOptions, MountedGame } from "@ifsoul/adapter-sdk";
import {
  chooseRole,
  createDungeon,
  drainDungeonEvents,
  enterNextRoom,
  HEIGHT,
  ROOM_NAMES,
  stepDungeon,
  WIDTH,
  type DungeonInput,
  type Role,
} from "./simulation.js";
import "./style.css";

/** Self-contained browser host. Models can speak, never select mechanics. */
export async function mount(
  container: HTMLElement,
  options: GameMountOptions,
): Promise<MountedGame> {
  const inert: MountedGame = { pause() {}, resume() {}, destroy() {} };
  if (options.signal.aborted) return inert;
  const [{ default: Phaser }, { DungeonScene }] = await Promise.all([
    import("phaser"),
    import("./scene.js"),
  ]);
  if (options.signal.aborted) return inert;
  const lifetime = new AbortController();
  const root = document.createElement("section");
  root.className = "ifsoul-dungeon";
  root.setAttribute("aria-label", "Hollow Warden dungeon game");
  root.innerHTML = `
    <div class="dg-heading"><div><h2>The Hollow Warden</h2><p class="dg-subtitle">Three chambers. One guardian. Stay together.</p></div><span class="dg-status"></span></div>
    <div class="dg-vitals"><div><label><span class="dg-player-label">You</span><span class="dg-player-hp"></span></label><progress class="dg-player-bar" max="100" value="100" aria-label="Your health"></progress></div><div class="dg-companion"><label><span class="dg-companion-label"></span><span class="dg-companion-hp"></span></label><progress class="dg-companion-bar" max="100" value="100" aria-label="Companion health"></progress></div></div>
    <div class="dg-stage" tabindex="0" role="group" aria-label="Dungeon controls. WASD or arrow keys move. Hold Space to attack. Shift uses your ability."><div class="dg-canvas"></div><div class="dg-paused" hidden>Paused · progress preserved</div><div class="dg-overlay"><div><h3 class="dg-overlay-title"></h3><p class="dg-overlay-copy"></p><div class="dg-options"></div></div></div></div>
    <div class="dg-speech" role="status" aria-live="polite"><span class="dg-speaker"></span><span class="dg-line">Choose your role to begin.</span></div>
    <div class="dg-controls"><div class="dg-dpad" aria-label="Movement"><button class="dg-up" data-control="up" aria-label="Move up">↑</button><button class="dg-left" data-control="left" aria-label="Move left">←</button><button class="dg-down" data-control="down" aria-label="Move down">↓</button><button class="dg-right" data-control="right" aria-label="Move right">→</button></div><div class="dg-actions"><button data-control="attack">Attack · Space</button><button data-control="skill" class="dg-skill">Ability · Shift</button><button class="dg-pause">Pause</button></div></div>
    <p class="dg-hint">Move with WASD / arrows. Hold attack; aim is automatic. Leave red circles before they strike. Tank guards; Healer restores nearby allies. Tap the arena to focus keyboard controls.</p>`;
  container.appendChild(root);
  for (const button of root.querySelectorAll<HTMLButtonElement>("button"))
    button.type = "button";
  function element<T extends HTMLElement>(selector: string): T {
    const found = root.querySelector<T>(selector);
    if (!found) throw new Error(`Missing dungeon element: ${selector}`);
    return found;
  }
  const stage = element<HTMLDivElement>(".dg-stage");
  const overlay = element<HTMLDivElement>(".dg-overlay");
  const overlayTitle = element(".dg-overlay-title");
  const overlayCopy = element(".dg-overlay-copy");
  const choices = element(".dg-options");
  const status = element(".dg-status");
  const subtitle = element(".dg-subtitle");
  const line = element(".dg-line");
  const speaker = element(".dg-speaker");
  const playerLabel = element(".dg-player-label");
  const companionLabel = element(".dg-companion-label");
  const playerHp = element(".dg-player-hp");
  const companionHp = element(".dg-companion-hp");
  const playerBar = element<HTMLProgressElement>(".dg-player-bar");
  const companionBar = element<HTMLProgressElement>(".dg-companion-bar");
  const skillButton = element<HTMLButtonElement>(".dg-skill");
  const pauseButton = element<HTMLButtonElement>(".dg-pause");
  const pausedLabel = element(".dg-paused");
  speaker.textContent = options.character.name;
  let state = createDungeon();
  let paused = false;
  let disposed = false;
  let hudClock = 0;
  let overlayPhase = "";
  let speechVersion = 0;
  let run = 1;
  const session =
    globalThis.crypto?.randomUUID?.() ??
    `session-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const held = new Set<string>();
  const pointers = new Map<number, string>();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const report = (
    id: string,
    summary: string,
    kind: "progress" | "outcome",
  ) => {
    if (disposed || options.signal.aborted) return;
    try {
      options.bridge.report({ id: `${session}-${run}-${id}`, summary, kind });
    } catch {
      /* Reporting never takes control of the host. */
    }
  };
  function flushEvents() {
    for (const event of drainDungeonEvents(state))
      report(event.id, event.summary, event.kind);
  }
  function requestSpeech() {
    if (disposed || options.signal.aborted) return;
    const version = ++speechVersion;
    const room = state.room;
    const requestId = `${session}-${run}-room-${room}-speech`;
    speaker.textContent = `${options.character.name} · preparing a remark`;
    line.textContent = "Your companion is thinking. You can keep playing.";
    let settled = false;
    const timer = setTimeout(() => {
      timers.delete(timer);
      if (disposed || version !== speechVersion || settled) return;
      settled = true;
      speaker.textContent = options.character.name;
      line.textContent = "No remark arrived in time. The expedition continues.";
    }, 8500);
    timers.add(timer);
    const context = `This is an original fictional dungeon. You are the player's ${state.companion.role} companion. Your temperament is ${options.character.temperament}. The party just entered ${ROOM_NAMES[room]} (chamber ${room + 1}/4). ${room === 3 ? "The Hollow Warden is present; its attacks are telegraphed." : "Reinforcements will arrive while the party fights."} The player is a ${state.player.role} with ${Math.ceil(state.player.hp)} health; your companion body has ${Math.ceil(state.companion.hp)} health. Say one brief in-character line, at most two sentences. Do not claim any foe has already been defeated or any action has occurred. You supply speech only; the game owns movement, combat and decisions.`;
    void Promise.resolve()
      .then(() => {
        if (disposed || version !== speechVersion) return;
        return options.bridge.speak({ requestId, context });
      })
      .then((result) => {
        if (!result || disposed || version !== speechVersion || settled) return;
        settled = true;
        clearTimeout(timer);
        timers.delete(timer);
        const speech =
          typeof result.speech === "string"
            ? result.speech.trim().slice(0, 450)
            : "";
        speaker.textContent = `${options.character.name} · ${result.source === "llm" ? "model speech" : result.source === "scenario" ? "scenario speech" : "fallback speech"}`;
        line.textContent = speech || "Your companion stays quiet.";
        if (speech)
          report(
            `${requestId}-delivered`,
            `${options.character.name} said in ${ROOM_NAMES[room]}: ${speech}`,
            "progress",
          );
      })
      .catch(() => {
        if (disposed || version !== speechVersion || settled) return;
        settled = true;
        clearTimeout(timer);
        timers.delete(timer);
        speaker.textContent = options.character.name;
        line.textContent =
          "Your companion is quiet; dialogue is unavailable. Combat continues locally.";
      });
  }
  function button(label: string, onClick: () => void) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.addEventListener("click", onClick, { signal: lifetime.signal });
    choices.appendChild(b);
  }
  function begin(role: Role) {
    if (paused || disposed) return;
    chooseRole(state, role);
    held.clear();
    flushEvents();
    requestSpeech();
    updateHud();
    stage.focus({ preventScroll: true });
  }
  function updateHud() {
    const current = state.phase;
    subtitle.textContent =
      state.room < 0
        ? "Three chambers. One guardian. Stay together."
        : `Chamber ${state.room + 1} / 4 · ${ROOM_NAMES[state.room]}`;
    status.textContent =
      state.room < 0
        ? "2–4 minute expedition"
        : `${Math.floor(state.elapsed / 60)}:${String(Math.floor(state.elapsed % 60)).padStart(2, "0")} · ${state.phase === "combat" ? `${state.enemies.length} foes · wave ${state.wave}/4` : state.phase === "won" ? "Expedition complete" : state.phase === "lost" ? "Expedition ended" : "Chamber clear"}`;
    playerLabel.textContent = `You · ${state.player.role}`;
    companionLabel.textContent = `${options.character.name} · ${state.companion.role}`;
    playerHp.textContent = `${Math.ceil(state.player.hp)} / ${state.player.maxHp}`;
    companionHp.textContent = `${Math.ceil(state.companion.hp)} / ${state.companion.maxHp}`;
    playerBar.max = state.player.maxHp;
    playerBar.value = state.player.hp;
    companionBar.max = state.companion.maxHp;
    companionBar.value = state.companion.hp;
    const skillName = state.player.role === "tank" ? "Guard burst" : "Restore";
    skillButton.textContent =
      state.player.skillCooldown > 0
        ? `${skillName} · ${state.player.skillCooldown.toFixed(1)}s`
        : `${skillName} · Shift`;
    skillButton.disabled = paused || state.phase !== "combat";
    if (current === overlayPhase) return;
    overlayPhase = current;
    choices.replaceChildren();
    overlay.hidden = current === "combat";
    if (current === "choose") {
      overlayTitle.textContent = "Choose your role";
      overlayCopy.textContent =
        "You and your companion enter together. Tank fights up close and guards; Healer strikes from range and restores both allies.";
      button("Play Tank · companion heals", () => begin("tank"));
      button("Play Healer · companion tanks", () => begin("healer"));
    } else if (current === "cleared") {
      overlayTitle.textContent = `${ROOM_NAMES[state.room]} cleared`;
      overlayCopy.textContent =
        "The ward opens. Catch your breath; entering the next chamber restores some health.";
      button(
        state.room === 2 ? "Face the Hollow Warden" : "Enter next chamber",
        () => {
          if (paused || disposed) return;
          if (enterNextRoom(state)) {
            held.clear();
            flushEvents();
            requestSpeech();
            updateHud();
            stage.focus({ preventScroll: true });
          }
        },
      );
    } else if (current === "won" || current === "lost") {
      overlayTitle.textContent =
        current === "won"
          ? "The lanterns burn again"
          : "The expedition ends here";
      overlayCopy.textContent =
        current === "won"
          ? `Together you defeated the Hollow Warden. ${state.defeated} foes defeated; you survived as ${state.player.role}.`
          : `You fell in ${ROOM_NAMES[state.room]}. Keep moving out of red circles, use your ability and stay close enough to heal.`;
      button("Start a new expedition", () => {
        if (paused || disposed) return;
        speechVersion++;
        run++;
        state = createDungeon();
        held.clear();
        line.textContent = "Choose a role for a new expedition.";
        speaker.textContent = options.character.name;
        updateHud();
      });
    }
  }
  const input = (): DungeonInput => ({
    x: Number(held.has("right")) - Number(held.has("left")),
    y: Number(held.has("down")) - Number(held.has("up")),
    attack: held.has("attack"),
    skill: held.has("skill"),
  });
  const scene = new DungeonScene(
    () => state,
    (seconds) => {
      if (disposed || paused) return;
      stepDungeon(state, input(), seconds);
      flushEvents();
      hudClock += seconds;
      if (hudClock > 0.1 || state.phase !== overlayPhase) {
        hudClock = 0;
        updateHud();
      }
    },
  );
  let game: InstanceType<typeof Phaser.Game>;
  try {
    game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: element(".dg-canvas"),
      width: WIDTH,
      height: HEIGHT,
      backgroundColor: "#101c26",
      audio: { noAudio: true },
      input: { keyboard: false, mouse: false, touch: false },
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
      scene: [scene],
    });
  } catch (error) {
    root.remove();
    lifetime.abort();
    throw error;
  }
  function clearInput() {
    held.clear();
    pointers.clear();
    for (const b of root.querySelectorAll<HTMLElement>("[data-held]"))
      delete b.dataset.held;
  }
  const keyMap: Record<string, string> = {
    KeyW: "up",
    ArrowUp: "up",
    KeyS: "down",
    ArrowDown: "down",
    KeyA: "left",
    ArrowLeft: "left",
    KeyD: "right",
    ArrowRight: "right",
    Space: "attack",
    ShiftLeft: "skill",
    ShiftRight: "skill",
  };
  stage.addEventListener(
    "keydown",
    (event) => {
      if (event.target !== stage || paused) return;
      const control = keyMap[event.code];
      if (control) {
        event.preventDefault();
        held.add(control);
      }
    },
    { signal: lifetime.signal },
  );
  window.addEventListener(
    "keyup",
    (event) => {
      const control = keyMap[event.code];
      if (control) held.delete(control);
    },
    { signal: lifetime.signal },
  );
  window.addEventListener("blur", clearInput, { signal: lifetime.signal });
  stage.addEventListener("blur", clearInput, { signal: lifetime.signal });
  stage.addEventListener(
    "pointerdown",
    (event) => {
      if (!(event.target instanceof HTMLButtonElement))
        stage.focus({ preventScroll: true });
    },
    { signal: lifetime.signal },
  );
  for (const b of root.querySelectorAll<HTMLButtonElement>("[data-control]")) {
    const control = b.dataset.control!;
    b.addEventListener(
      "pointerdown",
      (event) => {
        if (paused || state.phase !== "combat") return;
        event.preventDefault();
        pointers.set(event.pointerId, control);
        held.add(control);
        b.dataset.held = "true";
        b.setPointerCapture(event.pointerId);
      },
      { signal: lifetime.signal },
    );
    const release = (event: PointerEvent) => {
      pointers.delete(event.pointerId);
      if (![...pointers.values()].includes(control)) held.delete(control);
      delete b.dataset.held;
    };
    b.addEventListener("pointerup", release, { signal: lifetime.signal });
    b.addEventListener("pointercancel", release, { signal: lifetime.signal });
    b.addEventListener("lostpointercapture", release, {
      signal: lifetime.signal,
    });
    b.addEventListener(
      "keydown",
      (event) => {
        if (event.code === "Space" || event.code === "Enter") {
          event.preventDefault();
          if (!paused) held.add(control);
        }
      },
      { signal: lifetime.signal },
    );
    b.addEventListener("keyup", () => held.delete(control), {
      signal: lifetime.signal,
    });
    b.addEventListener("blur", () => held.delete(control), {
      signal: lifetime.signal,
    });
  }
  const mounted: MountedGame = {
    pause() {
      if (disposed || paused) return;
      paused = true;
      clearInput();
      game.pause();
      pausedLabel.hidden = false;
      pauseButton.textContent = "Resume";
      updateHud();
    },
    resume() {
      if (disposed || !paused) return;
      paused = false;
      game.resume();
      pausedLabel.hidden = true;
      pauseButton.textContent = "Pause";
      updateHud();
    },
    destroy() {
      if (disposed) return;
      disposed = true;
      speechVersion++;
      clearInput();
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
      lifetime.abort();
      options.signal.removeEventListener("abort", mounted.destroy);
      game.destroy(true);
      root.remove();
    },
  };
  pauseButton.addEventListener(
    "click",
    () => {
      if (paused) mounted.resume();
      else mounted.pause();
    },
    { signal: lifetime.signal },
  );
  options.signal.addEventListener("abort", mounted.destroy, { once: true });
  updateHud();
  if (options.signal.aborted) mounted.destroy();
  return mounted;
}

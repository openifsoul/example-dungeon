import { exampleScenarioResponse } from "./scenario.js";
import {
  createGameBridge,
  type GameCharacter,
  type BridgeTransport,
  type BridgeHistory,
  type BridgeResponse,
  type MountGame,
  type MountedGame,
} from "@ifsoul/adapter-sdk";

export interface ExampleSessionOptions {
  signal: AbortSignal;
  character?: GameCharacter;
  transport?: BridgeTransport;
  onObservation?: (event: BridgeHistory) => void;
  onSpeech?: (reply: BridgeResponse) => void;
}
export interface ExampleSession extends MountedGame {
  chat(message: string): Promise<BridgeResponse>;
}
/** This adapter owns bridge lifetime only. The independent game owns every mechanic. */
export async function createExampleSession(
  container: HTMLElement,
  options: ExampleSessionOptions,
  mountGame: MountGame = async (container, options) =>
    (await import("./game/index.js")).mount(container, options),
): Promise<ExampleSession> {
  const history: BridgeHistory[] = [];
  function remember(event: BridgeHistory) {
    history.push(event);
    if (history.length > 48) history.shift();
  }
  const character = options.character ?? {
    id: "example-companion",
    name: "Mira",
    temperament: "curious",
  };
  const controller = new AbortController();
  const signal = AbortSignal.any([controller.signal, options.signal]);
  const bridge = createGameBridge({
    hostId: "dungeon",
    character,
    transport:
      options.transport ??
      (async (request) => exampleScenarioResponse(request)),
    fallback: exampleScenarioResponse,
    signal,
    history: () => history,
    onObservation(event) {
      remember(event);
      options.onObservation?.(event);
    },
    onSpeech(reply, request) {
      if (request.operation === "chat") game?.say?.(reply.speech);
      if (request.operation === "chat")
        remember({
          id: crypto.randomUUID(),
          hostId: "dungeon",
          kind: "agent",
          summary: reply.speech.slice(0, 300),
        });
      options.onSpeech?.(reply);
    },
  });
  let game: MountedGame | undefined,
    destroyed = false;
  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    controller.abort();
    bridge.dispose();
    game?.destroy();
    options.signal.removeEventListener("abort", destroy);
  };
  options.signal.addEventListener("abort", destroy, { once: true });
  if (options.signal.aborted) {
    destroy();
    return {
      pause() {},
      resume() {},
      destroy,
      async chat() {
        throw new DOMException("Session disconnected", "AbortError");
      },
    };
  }
  try {
    game = await mountGame(container, { bridge, character, signal });
    if (destroyed) game.destroy();
  } catch (error) {
    destroy();
    throw error;
  }
  return {
    pause() {
      if (!destroyed) game?.pause();
    },
    resume() {
      if (!destroyed) game?.resume();
    },
    destroy,
    async chat(message: string) {
      if (destroyed)
        throw new DOMException("Session disconnected", "AbortError");
      const text = message.trim();
      if (!text || text.length > 600) throw new Error("Use 1–600 characters.");
      remember({
        id: crypto.randomUUID(),
        hostId: "dungeon",
        kind: "user",
        summary: text.slice(0, 300),
      });
      return bridge.chat(text);
    },
  };
}

import test from "node:test";
import assert from "node:assert/strict";
import { createExampleSession } from "../src/adapter";
import type { GameMountOptions, MountedGame } from "@ifsoul/adapter-sdk";
const container = {} as HTMLElement;
test("abort while mount is pending disposes bridge and destroys late mounted game", async () => {
  const controller = new AbortController();
  let finish!: (game: MountedGame) => void;
  let supplied!: GameMountOptions;
  let destroyed = 0;
  const result = createExampleSession(
    container,
    { signal: controller.signal },
    async (_node, options) => {
      supplied = options;
      return new Promise((resolve) => {
        finish = resolve;
      });
    },
  );
  controller.abort();
  assert.equal(supplied.signal.aborted, true);
  await assert.rejects(
    supplied.bridge.speak({ requestId: "late", context: "A cancelled visit" }),
    { name: "AbortError" },
  );
  finish({
    pause() {},
    resume() {},
    destroy() {
      destroyed++;
    },
  });
  const session = await result;
  session.destroy();
  assert.equal(destroyed, 1);
});
test("session pause/resume delegate only while alive and destroy is idempotent", async () => {
  const controller = new AbortController();
  let pauses = 0,
    resumes = 0,
    destroys = 0;
  const session = await createExampleSession(
    container,
    { signal: controller.signal },
    async () => ({
      pause() {
        pauses++;
      },
      resume() {
        resumes++;
      },
      destroy() {
        destroys++;
      },
    }),
  );
  session.pause();
  session.resume();
  session.destroy();
  session.pause();
  session.resume();
  session.destroy();
  assert.deepEqual(
    { pauses, resumes, destroys },
    { pauses: 1, resumes: 1, destroys: 1 },
  );
});
test("failed mount cancels bridge and pre-aborted session never mounts", async () => {
  let signal!: AbortSignal;
  await assert.rejects(
    createExampleSession(
      container,
      { signal: new AbortController().signal },
      async (_node, options) => {
        signal = options.signal;
        throw Error("renderer unavailable");
      },
    ),
    /renderer unavailable/,
  );
  assert.equal(signal.aborted, true);
  const controller = new AbortController();
  controller.abort();
  let called = false;
  const session = await createExampleSession(
    container,
    { signal: controller.signal },
    async () => {
      called = true;
      throw Error("must not mount");
    },
  );
  session.destroy();
  assert.equal(called, false);
});

test("chat shares observed host history and records bounded user/agent exchanges", async () => {
  let host!: GameMountOptions;
  const inputs: import("@ifsoul/adapter-sdk").BridgeRequest[] = [];
  const session = await createExampleSession(
    container,
    {
      signal: new AbortController().signal,
      transport: async (input) => {
        inputs.push(input);
        return {
          choiceId: "",
          speech: "The host reported one watered plant.",
          source: "scenario",
        };
      },
    },
    async (_node, options) => {
      host = options;
      return { pause() {}, resume() {}, destroy() {} };
    },
  );
  try {
    host.bridge.report({ id: "watered", summary: "One plant watered." });
    await session.chat("What happened?");
    await session.chat("Thanks.");
    assert.ok(
      inputs[0].history.some(
        (event) =>
          event.kind === "observation" &&
          event.summary === "One plant watered.",
      ),
    );
    assert.ok(
      inputs[1].history.some(
        (event) => event.kind === "user" && event.summary === "What happened?",
      ),
    );
    assert.ok(
      inputs[1].history.some(
        (event) =>
          event.kind === "agent" && event.summary.includes("watered plant"),
      ),
    );
    await assert.rejects(session.chat("x".repeat(601)), /600/);
  } finally {
    session.destroy();
  }
});
test("destroy cancels pending chat even when transport ignores abort and prevents late dialogue", async () => {
  let finish!: (response: import("@ifsoul/adapter-sdk").BridgeResponse) => void;
  let speeches = 0;
  const session = await createExampleSession(
    container,
    {
      signal: new AbortController().signal,
      onSpeech() {
        speeches++;
      },
      transport: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    },
    async () => ({ pause() {}, resume() {}, destroy() {} }),
  );
  const pending = session.chat("Are you there?");
  session.destroy();
  await assert.rejects(pending, { name: "AbortError" });
  finish({ choiceId: "", speech: "A late reply.", source: "llm" });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(speeches, 0);
});

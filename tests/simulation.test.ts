import assert from "node:assert/strict";
import test from "node:test";
import {
  chooseRole,
  createDungeon,
  drainDungeonEvents,
  EMPTY_INPUT,
  enterNextRoom,
  stepDungeon,
  type DungeonState,
  type Role,
} from "../src/game/simulation";

function frame(state: DungeonState, count: number, input = EMPTY_INPUT) {
  for (let i = 0; i < count; i++) stepDungeon(state, input, 0.05);
}

/** Fixed host-side test driver, independent of models or bridge choices. */
function finishExpedition(role: Role) {
  const state = createDungeon();
  chooseRole(state, role);
  for (
    let i = 0;
    i < 8000 && state.phase !== "won" && state.phase !== "lost";
    i++
  ) {
    if (state.phase === "cleared") {
      assert.equal(enterNextRoom(state), true);
      continue;
    }
    const target = state.enemies
      .slice()
      .sort(
        (a, b) =>
          Math.hypot(a.x - state.player.x, a.y - state.player.y) -
          Math.hypot(b.x - state.player.x, b.y - state.player.y),
      )[0];
    let x = target ? target.x - state.player.x : 0;
    let y = target ? target.y - state.player.y : 0;
    const warning = state.warnings.find(
      (w) =>
        Math.hypot(w.x - state.player.x, w.y - state.player.y) < w.radius + 28,
    );
    if (warning) {
      x = state.player.x - warning.x || 1;
      y = state.player.y - warning.y || 0.7;
    } else if (role === "healer" && target && Math.hypot(x, y) < 190) {
      x = -x;
      y = -y;
    } else if (target && Math.hypot(x, y) < (role === "tank" ? 65 : 240)) {
      x = 0;
      y = 0;
    }
    const length = Math.hypot(x, y) || 1;
    stepDungeon(
      state,
      { x: x / length, y: y / length, attack: true, skill: true },
      0.05,
    );
  }
  return state;
}

test("role choice is one-time and always gives the companion the complementary role", () => {
  for (const role of ["tank", "healer"] as const) {
    const state = createDungeon();
    assert.equal(enterNextRoom(state), false);
    assert.equal(chooseRole(state, role), true);
    assert.equal(state.player.role, role);
    assert.notEqual(state.companion.role, role);
    assert.equal(state.room, 0);
    assert.equal(chooseRole(state, role), false);
    assert.equal(enterNextRoom(state), false, "a live room cannot be skipped");
  }
});

test("keyboard and touch vectors share normalized bounded movement without tab-time jumps", () => {
  const cardinal = createDungeon(),
    diagonal = createDungeon();
  chooseRole(cardinal, "healer");
  chooseRole(diagonal, "healer");
  const origin = { ...cardinal.player };
  frame(cardinal, 1, { ...EMPTY_INPUT, x: 1 });
  frame(diagonal, 1, { ...EMPTY_INPUT, x: 1, y: 1 });
  assert.ok(
    Math.abs(
      Math.hypot(diagonal.player.x - origin.x, diagonal.player.y - origin.y) -
        (cardinal.player.x - origin.x),
    ) < 1e-8,
  );
  const before = cardinal.player.x;
  stepDungeon(cardinal, { ...EMPTY_INPUT, x: 1 }, 100);
  assert.ok(
    cardinal.player.x - before < 10,
    "suspended frames are bounded to 50ms",
  );
  frame(diagonal, 200, { ...EMPTY_INPUT, x: 1, y: 1 });
  assert.ok(diagonal.player.x <= 906 && diagonal.player.y <= 546);
  stepDungeon(diagonal, { ...EMPTY_INPUT, x: NaN, y: Infinity }, 0.05);
  assert.ok(
    Number.isFinite(diagonal.player.x) && Number.isFinite(diagonal.player.y),
  );
});

test("telegraphed strikes wait, then only damage bodies still inside", () => {
  const state = createDungeon();
  chooseRole(state, "tank");
  state.enemies = [];
  state.wave = 1;
  state.warnings = [
    {
      x: state.player.x,
      y: state.player.y,
      radius: 44,
      remaining: 0.7,
      duration: 0.7,
      damage: 20,
    },
  ];
  const hp = state.player.hp;
  frame(state, 5);
  assert.equal(state.player.hp, hp);
  frame(state, 12, { ...EMPTY_INPUT, x: 1 });
  assert.equal(state.player.hp, hp, "moving clear avoids damage");
  state.warnings = [
    {
      x: state.player.x,
      y: state.player.y,
      radius: 44,
      remaining: 0.05,
      duration: 0.7,
      damage: 20,
    },
  ];
  frame(state, 1);
  assert.equal(state.player.hp, hp - 20);
});

test("healing can revive the nearby tank companion and respects cooldown", () => {
  const state = createDungeon();
  chooseRole(state, "healer");
  state.player.hp -= 50;
  state.companion.hp = 0;
  frame(state, 1, { ...EMPTY_INPUT, skill: true });
  assert.equal(state.player.hp, state.player.maxHp - 18);
  assert.equal(state.companion.hp, 42);
  assert.ok(state.player.skillCooldown > 4);
  frame(state, 1, { ...EMPTY_INPUT, skill: true });
  assert.equal(state.companion.hp, 42);
});

test("tank guard mitigates incoming damage and deals an actual nearby burst", () => {
  const state = createDungeon();
  chooseRole(state, "tank");
  state.companion.cooldown = 9;
  state.enemies = [
    {
      id: 1000,
      kind: "crawler",
      x: state.player.x + 60,
      y: state.player.y,
      hp: 100,
      maxHp: 100,
      cooldown: 9,
      flash: 0,
    },
  ];
  state.warnings = [
    {
      x: state.player.x,
      y: state.player.y,
      radius: 44,
      remaining: 0.05,
      duration: 0.7,
      damage: 20,
    },
  ];
  frame(state, 1, { ...EMPTY_INPUT, skill: true });
  assert.equal(state.enemies[0].hp, 58);
  assert.equal(state.player.hp, state.player.maxHp - 7);
  assert.ok(state.guard > 2);
});

test("the companion makes host-owned combat decisions without a model", () => {
  const state = createDungeon();
  chooseRole(state, "healer");
  const originalX = state.companion.x;
  frame(state, 20);
  assert.notEqual(state.companion.x, originalX);
  assert.ok(
    state.effects.length > 0 || state.enemies.some((e) => e.hp < e.maxHp),
  );
});

for (const role of ["tank", "healer"] as const) {
  test(`${role} can complete three reinforcement rooms and the boss without inference`, () => {
    const state = finishExpedition(role);
    assert.equal(state.phase, "won");
    assert.equal(state.room, 3);
    assert.equal(state.defeated, 40);
    assert.ok(
      state.elapsed > 120 && state.elapsed < 240,
      `combat duration ${state.elapsed}`,
    );
    assert.equal(state.enemies.length, 0);
    const events = drainDungeonEvents(state);
    assert.equal(
      events.filter((e) => e.summary.startsWith("Entered")).length,
      4,
    );
    assert.equal(
      events.filter((e) => e.summary.startsWith("Cleared")).length,
      3,
    );
    assert.equal(events.filter((e) => e.kind === "outcome").length, 1);
    assert.match(events.at(-1)!.summary, /defeated the Hollow Warden/);
    assert.deepEqual(drainDungeonEvents(state), []);
    const snapshot = JSON.stringify(state);
    frame(state, 20, { x: 1, y: 1, attack: true, skill: true });
    assert.equal(
      JSON.stringify(state),
      snapshot,
      "finished games do not keep fighting",
    );
  });
}

test("the same inputs produce the same host outcomes", () => {
  assert.deepEqual(finishExpedition("tank"), finishExpedition("tank"));
});

test("loss is reported once, cannot advance, and is never a claimed victory", () => {
  const state = createDungeon();
  chooseRole(state, "tank");
  drainDungeonEvents(state);
  state.player.hp = 1;
  state.companion.hp = 0;
  state.warnings = [
    {
      x: state.player.x,
      y: state.player.y,
      radius: 44,
      remaining: 0.01,
      duration: 0.7,
      damage: 20,
    },
  ];
  frame(state, 20);
  assert.equal(state.phase, "lost");
  assert.equal(enterNextRoom(state), false);
  const events = drainDungeonEvents(state);
  assert.equal(events.length, 1);
  assert.equal(events[0].kind, "outcome");
  assert.match(events[0].summary, /Warden was not defeated/);
  frame(state, 5);
  assert.deepEqual(drainDungeonEvents(state), []);
});

test("between-room waits preserve simulation and next-room entry restores the party", () => {
  const state = createDungeon();
  chooseRole(state, "tank");
  state.wave = 4;
  state.enemies = [];
  state.player.hp = 70;
  state.companion.hp = 0;
  frame(state, 1);
  assert.equal(state.phase, "cleared");
  const snapshot = JSON.stringify(state);
  frame(state, 100, { x: 1, y: 0, attack: true, skill: true });
  assert.equal(JSON.stringify(state), snapshot);
  assert.equal(enterNextRoom(state), true);
  assert.equal(state.room, 1);
  assert.equal(state.player.hp, 105);
  assert.ok(state.companion.hp >= state.companion.maxHp * 0.6);
});

test("a simultaneous Warden kill and player death reports both actual outcomes", () => {
  const state = createDungeon();
  chooseRole(state, "tank");
  state.room = 3;
  state.wave = 4;
  state.player.hp = 1;
  state.companion.hp = 0;
  state.enemies = [
    {
      id: 999,
      kind: "warden",
      x: state.player.x + 30,
      y: state.player.y,
      hp: 1,
      maxHp: 2700,
      cooldown: 2,
      flash: 0,
    },
  ];
  state.warnings = [
    {
      x: state.player.x,
      y: state.player.y,
      radius: 44,
      remaining: 0.01,
      duration: 1.1,
      damage: 26,
    },
  ];
  drainDungeonEvents(state);
  frame(state, 1, { ...EMPTY_INPUT, attack: true });
  assert.equal(state.phase, "lost");
  assert.equal(state.enemies.length, 0);
  const events = drainDungeonEvents(state);
  assert.equal(events.length, 1);
  assert.match(events[0].summary, /Warden also fell/);
  assert.doesNotMatch(events[0].summary, /Warden was not defeated/);
});

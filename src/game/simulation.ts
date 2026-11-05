/** Original deterministic dungeon host. No provider or bridge can mutate these rules. */
export type Role = "tank" | "healer";
export type DungeonPhase = "choose" | "combat" | "cleared" | "won" | "lost";
export interface Body {
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  role: Role;
  cooldown: number;
  skillCooldown: number;
  flash: number;
}
export interface Enemy {
  id: number;
  kind: "crawler" | "wisp" | "warden";
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  cooldown: number;
  flash: number;
}
export interface Warning {
  x: number;
  y: number;
  radius: number;
  remaining: number;
  duration: number;
  damage: number;
}
export interface Effect {
  x: number;
  y: number;
  radius: number;
  remaining: number;
  kind: "hit" | "heal" | "guard";
}
export interface DungeonEvent {
  id: string;
  kind: "progress" | "outcome";
  summary: string;
}
export interface DungeonInput {
  x: number;
  y: number;
  attack: boolean;
  skill: boolean;
}
export interface DungeonState {
  phase: DungeonPhase;
  room: number;
  elapsed: number;
  roomTime: number;
  wave: number;
  player: Body;
  companion: Body;
  enemies: Enemy[];
  warnings: Warning[];
  effects: Effect[];
  defeated: number;
  guard: number;
  nextId: number;
  events: DungeonEvent[];
}
export const WIDTH = 960;
export const HEIGHT = 600;
export const ROOM_NAMES = [
  "Mosslight Gate",
  "The Broken Library",
  "Ember Crossing",
  "The Hollow Warden",
];
export const EMPTY_INPUT: DungeonInput = {
  x: 0,
  y: 0,
  attack: false,
  skill: false,
};
const distance = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (value: number, low: number, high: number) =>
  Math.max(low, Math.min(high, value));
function body(role: Role, x: number, y: number): Body {
  const maxHp = role === "tank" ? 220 : 145;
  return {
    role,
    x,
    y,
    hp: maxHp,
    maxHp,
    cooldown: 0,
    skillCooldown: 0,
    flash: 0,
  };
}
export function createDungeon(): DungeonState {
  return {
    phase: "choose",
    room: -1,
    elapsed: 0,
    roomTime: 0,
    wave: 0,
    player: body("tank", 420, 320),
    companion: body("healer", 510, 350),
    enemies: [],
    warnings: [],
    effects: [],
    defeated: 0,
    guard: 0,
    nextId: 1,
    events: [],
  };
}
function emit(
  state: DungeonState,
  summary: string,
  kind: DungeonEvent["kind"] = "progress",
) {
  state.events.push({ id: `dungeon-${state.nextId++}`, summary, kind });
}
export function drainDungeonEvents(state: DungeonState): DungeonEvent[] {
  return state.events.splice(0);
}
export function chooseRole(state: DungeonState, role: Role): boolean {
  if (state.phase !== "choose") return false;
  state.player = body(role, 420, 320);
  state.companion = body(role === "tank" ? "healer" : "tank", 510, 350);
  state.phase = "cleared";
  return enterNextRoom(state);
}
export function enterNextRoom(state: DungeonState): boolean {
  if (state.phase !== "cleared" || state.room >= 3) return false;
  state.room++;
  state.roomTime = 0;
  state.wave = 0;
  state.phase = "combat";
  state.warnings = [];
  state.effects = [];
  state.enemies = [];
  state.player.x = 420;
  state.player.y = 335;
  state.companion.x = 520;
  state.companion.y = 350;
  state.player.hp = Math.min(state.player.maxHp, state.player.hp + 35);
  state.companion.hp = Math.min(
    state.companion.maxHp,
    Math.max(state.companion.maxHp * 0.6, state.companion.hp + 40),
  );
  state.player.skillCooldown = 0;
  emit(
    state,
    `Entered ${ROOM_NAMES[state.room]}. Player is ${state.player.role}; companion is ${state.companion.role}.`,
  );
  spawnWave(state);
  return true;
}
function spawnWave(state: DungeonState) {
  if (state.room === 3) {
    state.enemies.push({
      id: state.nextId++,
      kind: "warden",
      x: 480,
      y: 150,
      hp: 2700,
      maxHp: 2700,
      cooldown: 1.8,
      flash: 0,
    });
    state.wave = 4;
    return;
  }
  const count = state.wave === 3 ? 4 : 3;
  for (let i = 0; i < count; i++) {
    const side = (state.wave + i) % 4;
    const x = side === 0 ? 85 : side === 2 ? 875 : 250 + i * 190;
    const y = side === 1 ? 100 : side === 3 ? 505 : 180 + i * 100;
    const hp = 68 + state.room * 16;
    state.enemies.push({
      id: state.nextId++,
      kind: (i + state.wave) % 3 === 0 ? "wisp" : "crawler",
      x,
      y,
      hp,
      maxHp: hp,
      cooldown: 1.2 + i * 0.3,
      flash: 0,
    });
  }
  state.wave++;
}
function moveToward(
  actor: { x: number; y: number },
  target: { x: number; y: number },
  amount: number,
  stop: number,
) {
  const d = distance(actor, target);
  if (d <= stop) return;
  const travel = Math.min(amount, d - stop);
  actor.x = clamp(
    actor.x + ((target.x - actor.x) / d) * travel,
    54,
    WIDTH - 54,
  );
  actor.y = clamp(
    actor.y + ((target.y - actor.y) / d) * travel,
    66,
    HEIGHT - 54,
  );
}
function nearest(state: DungeonState, actor: Body): Enemy | undefined {
  return state.enemies
    .filter((e) => e.hp > 0)
    .sort((a, b) => distance(actor, a) - distance(actor, b))[0];
}
function attack(state: DungeonState, actor: Body, isPlayer: boolean) {
  if (actor.hp <= 0 || actor.cooldown > 0) return;
  const target = nearest(state, actor);
  const reach = actor.role === "tank" ? 97 : 310;
  if (!target || distance(actor, target) > reach) return;
  actor.cooldown = actor.role === "tank" ? 0.55 : 0.46;
  const damage = isPlayer
    ? actor.role === "tank"
      ? 29
      : 23
    : actor.role === "tank"
      ? 16
      : 12;
  for (const enemy of state.enemies) {
    if (
      enemy === target ||
      (actor.role === "tank" && distance(actor, enemy) <= reach)
    ) {
      enemy.hp -= damage;
      enemy.flash = 0.12;
    }
  }
  state.effects.push({
    x: actor.role === "tank" ? actor.x : target.x,
    y: actor.role === "tank" ? actor.y : target.y,
    radius: actor.role === "tank" ? 94 : 28,
    remaining: 0.16,
    kind: "hit",
  });
}
function skill(state: DungeonState, actor: Body) {
  if (actor.hp <= 0 || actor.skillCooldown > 0) return;
  actor.skillCooldown = actor.role === "tank" ? 6 : 5;
  if (actor.role === "tank") {
    state.guard = 2.8;
    for (const enemy of state.enemies) {
      if (distance(actor, enemy) < 145) {
        enemy.hp -= 42;
        enemy.flash = 0.15;
      }
    }
    state.effects.push({
      x: actor.x,
      y: actor.y,
      radius: 145,
      remaining: 0.35,
      kind: "guard",
    });
  } else {
    actor.hp = Math.min(actor.maxHp, actor.hp + 32);
    const other = actor === state.player ? state.companion : state.player;
    if (distance(actor, other) < 280)
      other.hp = Math.min(other.maxHp, other.hp + 42);
    state.effects.push({
      x: actor.x,
      y: actor.y,
      radius: 150,
      remaining: 0.45,
      kind: "heal",
    });
  }
}
/** A frame advances at most 50ms, avoiding telegraph skips after a suspended tab. */
export function stepDungeon(
  state: DungeonState,
  input: DungeonInput,
  seconds: number,
): void {
  if (state.phase !== "combat" || !Number.isFinite(seconds) || seconds <= 0)
    return;
  const dt = Math.min(seconds, 0.05);
  state.elapsed += dt;
  state.roomTime += dt;
  state.guard = Math.max(0, state.guard - dt);
  for (const actor of [state.player, state.companion]) {
    actor.cooldown = Math.max(0, actor.cooldown - dt);
    actor.skillCooldown = Math.max(0, actor.skillCooldown - dt);
    actor.flash = Math.max(0, actor.flash - dt);
  }
  const x = Number.isFinite(input.x) ? clamp(input.x, -1, 1) : 0;
  const y = Number.isFinite(input.y) ? clamp(input.y, -1, 1) : 0;
  const length = Math.max(1, Math.hypot(x, y));
  state.player.x = clamp(
    state.player.x + (x / length) * 195 * dt,
    54,
    WIDTH - 54,
  );
  state.player.y = clamp(
    state.player.y + (y / length) * 195 * dt,
    66,
    HEIGHT - 54,
  );
  if (input.attack) attack(state, state.player, true);
  if (input.skill) skill(state, state.player);
  const companion = state.companion;
  if (companion.hp > 0) {
    const target = nearest(state, companion);
    const danger = state.warnings.find(
      (warning) => distance(companion, warning) < warning.radius + 24,
    );
    if (danger) {
      const dx = companion.x - danger.x || (companion.x > WIDTH / 2 ? -1 : 1);
      const dy = companion.y - danger.y || (companion.y > HEIGHT / 2 ? -1 : 1);
      const length = Math.hypot(dx, dy);
      moveToward(
        companion,
        {
          x: companion.x + (dx / length) * 200,
          y: companion.y + (dy / length) * 200,
        },
        185 * dt,
        0,
      );
    } else if (companion.role === "tank" && target)
      moveToward(companion, target, 145 * dt, 65);
    else moveToward(companion, state.player, 155 * dt, 105);
    attack(state, companion, false);
    if (
      companion.role === "healer" &&
      (state.player.hp < state.player.maxHp * 0.83 ||
        companion.hp < companion.maxHp * 0.65)
    )
      skill(state, companion);
    if (
      companion.role === "tank" &&
      target &&
      distance(companion, target) < 130
    )
      skill(state, companion);
  }
  for (const enemy of state.enemies) {
    if (enemy.hp <= 0) continue;
    enemy.flash = Math.max(0, enemy.flash - dt);
    enemy.cooldown -= dt;
    const target =
      companion.hp > 0 && companion.role === "tank" ? companion : state.player;
    moveToward(
      enemy,
      target,
      (enemy.kind === "warden" ? 65 : enemy.kind === "wisp" ? 58 : 78) * dt,
      enemy.kind === "wisp" ? 205 : 48,
    );
    if (
      enemy.cooldown <= 0 &&
      distance(enemy, target) <
        (enemy.kind === "wisp" ? 320 : enemy.kind === "warden" ? 170 : 80)
    ) {
      const duration = enemy.kind === "warden" ? 1.1 : 0.7;
      state.warnings.push({
        x: target.x,
        y: target.y,
        radius: enemy.kind === "warden" ? 108 : enemy.kind === "wisp" ? 43 : 44,
        remaining: duration,
        duration,
        damage: enemy.kind === "warden" ? 26 : 12,
      });
      enemy.cooldown = enemy.kind === "warden" ? 2.1 : 2.5;
      if (enemy.kind === "warden" && enemy.hp < enemy.maxHp * 0.5)
        state.warnings.push({
          x: state.player.x,
          y: state.player.y,
          radius: 72,
          remaining: 1.35,
          duration: 1.35,
          damage: 20,
        });
    }
  }
  for (const warning of state.warnings) {
    warning.remaining -= dt;
    if (warning.remaining <= 0) {
      for (const actor of [state.player, companion]) {
        if (distance(actor, warning) < warning.radius + 14) {
          actor.hp = Math.max(
            0,
            actor.hp - warning.damage * (state.guard > 0 ? 0.35 : 1),
          );
          actor.flash = 0.2;
        }
      }
    }
  }
  state.warnings = state.warnings.filter((w) => w.remaining > 0);
  state.effects.forEach((effect) => (effect.remaining -= dt));
  state.effects = state.effects.filter((effect) => effect.remaining > 0);
  const killed = state.enemies.filter((enemy) => enemy.hp <= 0).length;
  state.defeated += killed;
  state.enemies = state.enemies.filter((enemy) => enemy.hp > 0);
  if (state.player.hp <= 0) {
    state.phase = "lost";
    const wardenDefeated =
      state.room === 3 &&
      !state.enemies.some((enemy) => enemy.kind === "warden");
    emit(
      state,
      `The expedition ended in ${ROOM_NAMES[state.room]} after defeating ${state.defeated} foes. The player fell; ${wardenDefeated ? "the Warden also fell, but the player did not survive" : "the Warden was not defeated"}.`,
      "outcome",
    );
    return;
  }
  if (state.wave < 4 && state.roomTime >= state.wave * 8) spawnWave(state);
  if (state.wave === 4 && state.enemies.length === 0) {
    state.phase = state.room === 3 ? "won" : "cleared";
    emit(
      state,
      state.phase === "won"
        ? `The party defeated the Hollow Warden and completed all four chambers. ${state.defeated} foes defeated; player survived as ${state.player.role}.`
        : `Cleared ${ROOM_NAMES[state.room]} with ${Math.ceil(state.player.hp)} player health and ${Math.ceil(companion.hp)} companion health.`,
      state.phase === "won" ? "outcome" : "progress",
    );
    state.warnings = [];
  }
}

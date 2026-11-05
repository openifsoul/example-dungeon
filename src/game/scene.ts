import Phaser from "phaser";
import { HEIGHT, WIDTH, type Body, type DungeonState } from "./simulation.js";

/** Phaser owns disposable drawing only; the host simulation owns every decision. */
export class DungeonScene extends Phaser.Scene {
  private floor!: Phaser.GameObjects.Graphics;
  private ink!: Phaser.GameObjects.Graphics;
  private drawnRoom = -9;
  constructor(
    private readonly read: () => DungeonState,
    private readonly frame: (seconds: number) => void,
  ) {
    super({ key: "ifsoul-dungeon" });
  }
  create() {
    this.floor = this.add.graphics();
    this.ink = this.add.graphics();
    this.game.canvas.setAttribute(
      "aria-label",
      "Dungeon arena. Use the nearby controls to move, attack and use your role ability.",
    );
  }
  update(_time: number, delta: number) {
    this.frame(delta / 1000);
    const state = this.read();
    if (this.drawnRoom !== state.room) {
      this.background(state.room);
      this.drawnRoom = state.room;
    }
    const g = this.ink;
    g.clear();
    const unlocked = state.phase === "cleared" || state.phase === "won";
    g.fillStyle(unlocked ? 0x91e1bb : 0xa4754c, 0.2);
    g.fillCircle(480, 57, unlocked ? 55 : 35);
    g.lineStyle(4, unlocked ? 0x9ee8c3 : 0xa4754c, 0.95);
    g.strokeRoundedRect(446, 17, 68, 65, 22);
    for (const w of state.warnings) {
      g.fillStyle(0xf8806b, 0.12 + (1 - w.remaining / w.duration) * 0.18);
      g.fillCircle(w.x, w.y, w.radius);
      g.lineStyle(3, 0xffaf8f, 0.85);
      g.strokeCircle(w.x, w.y, w.radius);
      g.lineStyle(3, 0xffd6b5, 0.8);
      g.beginPath();
      g.arc(
        w.x,
        w.y,
        w.radius - 6,
        -Math.PI / 2,
        -Math.PI / 2 + Math.PI * 2 * (1 - w.remaining / w.duration),
        false,
      );
      g.strokePath();
    }
    const actors = [
      {
        y: state.player.y,
        draw: () => this.hero(state.player, true, state.guard > 0),
      },
      {
        y: state.companion.y,
        draw: () => this.hero(state.companion, false, state.guard > 0),
      },
      ...state.enemies.map((enemy) => ({
        y: enemy.y,
        draw: () => {
          const boss = enemy.kind === "warden";
          const r = boss ? 38 : enemy.kind === "wisp" ? 17 : 20;
          g.fillStyle(0x050d15, 0.35);
          g.fillEllipse(enemy.x, enemy.y + r * 0.9, r * 2.2, 13);
          g.fillStyle(
            enemy.flash > 0
              ? 0xffffff
              : boss
                ? 0x776581
                : enemy.kind === "wisp"
                  ? 0xd9a358
                  : 0xba755f,
          );
          if (enemy.kind === "wisp") {
            g.fillTriangle(
              enemy.x,
              enemy.y - r,
              enemy.x + r,
              enemy.y,
              enemy.x,
              enemy.y + r,
            );
            g.fillTriangle(
              enemy.x,
              enemy.y - r,
              enemy.x - r,
              enemy.y,
              enemy.x,
              enemy.y + r,
            );
          } else {
            g.fillRoundedRect(
              enemy.x - r,
              enemy.y - r,
              r * 2,
              r * 1.8,
              boss ? 12 : 7,
            );
            g.fillStyle(boss ? 0xae93ac : 0xefb384);
            g.fillTriangle(
              enemy.x - r,
              enemy.y - 8,
              enemy.x - r - 12,
              enemy.y - 30,
              enemy.x - 9,
              enemy.y - r,
            );
            g.fillTriangle(
              enemy.x + r,
              enemy.y - 8,
              enemy.x + r + 12,
              enemy.y - 30,
              enemy.x + 9,
              enemy.y - r,
            );
          }
          g.fillStyle(0xffefd0);
          g.fillRect(enemy.x - r * 0.5, enemy.y - 6, 6, 5);
          g.fillRect(enemy.x + r * 0.3, enemy.y - 6, 6, 5);
          g.fillStyle(0x101a24);
          g.fillRoundedRect(enemy.x - r, enemy.y - r - 14, r * 2, 5, 2);
          g.fillStyle(0xe4a47a);
          g.fillRoundedRect(
            enemy.x - r,
            enemy.y - r - 14,
            r * 2 * Math.max(0, enemy.hp / enemy.maxHp),
            5,
            2,
          );
        },
      })),
    ].sort((a, b) => a.y - b.y);
    actors.forEach((actor) => actor.draw());
    for (const effect of state.effects) {
      g.lineStyle(
        effect.kind === "hit" ? 4 : 6,
        effect.kind === "heal"
          ? 0x9ce3b0
          : effect.kind === "guard"
            ? 0x88c8f3
            : 0xffe4a8,
        Math.min(1, effect.remaining * 3),
      );
      g.strokeCircle(
        effect.x,
        effect.y,
        effect.radius * (1.15 - effect.remaining),
      );
    }
  }
  private hero(actor: Body, player: boolean, guard: boolean) {
    const g = this.ink;
    const { x, y } = actor;
    g.fillStyle(0x050d15, 0.4);
    g.fillEllipse(x, y + 21, 42, 14);
    if (actor.hp <= 0) {
      g.lineStyle(4, 0xc6a5a5);
      g.lineBetween(x - 10, y - 10, x + 10, y + 10);
      g.lineBetween(x + 10, y - 10, x - 10, y + 10);
      return;
    }
    if (player) {
      g.lineStyle(2, 0xe4e9d5, 0.8);
      g.strokeEllipse(x, y + 20, 43, 17);
    }
    if (guard && actor.role === "tank") {
      g.lineStyle(3, 0x8cd1ff, 0.7);
      g.strokeCircle(x, y, 33);
    }
    const color =
      actor.flash > 0 ? 0xffffff : actor.role === "tank" ? 0x6a9bc7 : 0x77b8a7;
    g.fillStyle(color);
    g.fillTriangle(x, y - 15, x - 20, y + 18, x + 20, y + 18);
    g.fillRoundedRect(x - 13, y - 8, 26, 26, 6);
    g.fillStyle(0xead2a5);
    g.fillCircle(x, y - 17, 10);
    g.fillStyle(actor.role === "tank" ? 0x344f71 : 0x386c65);
    g.fillRoundedRect(x - 11, y - 27, 22, 10, 4);
    if (actor.role === "tank") {
      g.fillStyle(0xb7cbd0);
      g.fillTriangle(x - 24, y - 8, x - 8, y - 5, x - 19, y + 20);
      g.lineStyle(4, 0xe5d5a3);
      g.lineBetween(x + 15, y + 8, x + 29, y - 19);
      g.fillStyle(0xf0e7cd);
      g.fillTriangle(x + 26, y - 17, x + 32, y - 29, x + 34, y - 14);
    } else {
      g.lineStyle(4, 0xbba580);
      g.lineBetween(x + 19, y + 18, x + 24, y - 22);
      g.fillStyle(0xc5f3bc);
      g.fillCircle(x + 24, y - 23, 7);
    }
    if (!player) {
      g.fillStyle(0xe5b8f3);
      g.fillCircle(x, y - 40, 4);
    }
  }
  private background(room: number) {
    const g = this.floor;
    g.clear();
    g.fillStyle(0x101c26);
    g.fillRect(0, 0, WIDTH, HEIGHT);
    const accent = [0x5d9e87, 0x8b85ae, 0xb18761, 0x9b6b82][Math.max(0, room)];
    for (let y = 45; y < HEIGHT - 30; y += 55)
      for (let x = 35; x < WIDTH - 30; x += 74) {
        g.fillStyle(
          (Math.floor(x / 74) + Math.floor(y / 55)) % 3 === 0
            ? 0x22323e
            : 0x1d2c37,
        );
        g.fillRoundedRect(x + 2, y + 2, 70, 51, 4);
        g.lineStyle(1, 0x344551, 0.5);
        g.lineBetween(x + 9, y + 5, x + 58, y + 5);
      }
    g.lineStyle(28, 0x0b1520);
    g.strokeRoundedRect(20, 30, WIDTH - 40, HEIGHT - 50, 20);
    g.lineStyle(2, accent, 0.5);
    g.strokeRoundedRect(38, 48, WIDTH - 76, HEIGHT - 86, 15);
    for (const x of [70, WIDTH - 70])
      for (const y of [88, HEIGHT - 75]) {
        g.fillStyle(0x0a1520, 0.6);
        g.fillEllipse(x, y + 12, 58, 20);
        g.fillStyle(0x40505b);
        g.fillRoundedRect(x - 18, y - 22, 36, 42, 7);
        g.fillStyle(accent);
        g.fillRect(x - 20, y - 24, 40, 9);
        g.fillStyle(0xedcb88);
        g.fillCircle(x, y - 31, 6);
        g.fillStyle(0xf5ca75, 0.07);
        g.fillCircle(x, y - 31, 35);
      }
    g.lineStyle(2, accent, 0.15);
    g.strokeCircle(480, 300, 98);
    g.strokeCircle(480, 300, 116);
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      g.lineBetween(
        480 + Math.cos(a) * 100,
        300 + Math.sin(a) * 100,
        480 + Math.cos(a) * 113,
        300 + Math.sin(a) * 113,
      );
    }
  }
}

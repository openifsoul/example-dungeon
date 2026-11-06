import Phaser from "phaser";
import { HEIGHT, WIDTH, type Body, type DungeonState } from "./simulation.js";
import { DUNGEON_SPRITES, type DungeonSpriteKey } from "./sprite-keys.js";
import type { DungeonArt } from "./art.js";
import { companionSprite } from "./appearance.js";

/** Disposable presentation only. Host simulation owns combat, warnings and outcomes. */
export class DungeonScene extends Phaser.Scene {
  private ground!: Phaser.GameObjects.Image;
  private ink!: Phaser.GameObjects.Graphics;
  private shadows!: Phaser.GameObjects.Graphics;
  private props!: Phaser.GameObjects.Container;
  private player!: Phaser.GameObjects.Image;
  private companion!: Phaser.GameObjects.Image;
  private gate!: Phaser.GameObjects.Image;
  private mobs = new Map<number, Phaser.GameObjects.Image>();
  private drawnRoom = -9;
  private reducedMotion = false;
  constructor(
    private readonly read: () => DungeonState,
    private readonly frame: (seconds: number) => void,
    private readonly character: { id: string; name: string },
    private readonly art: DungeonArt,
  ) {
    super({ key: "ifsoul-dungeon" });
  }
  private frameIndex(key: DungeonSpriteKey) {
    return DUNGEON_SPRITES.indexOf(key);
  }
  private image(key: DungeonSpriteKey, x: number, y: number, size: number) {
    return this.add
      .image(x, y, "dungeon-art", this.frameIndex(key))
      .setOrigin(0.5, 236 / 256)
      .setDisplaySize(size, size);
  }
  create() {
    this.textures.addSpriteSheet("dungeon-art", this.art.atlas, {
      frameWidth: 256,
      frameHeight: 256,
    });
    this.textures.addImage("dungeon-floor", this.art.floor);
    this.ground = this.add
      .image(WIDTH / 2, HEIGHT / 2, "dungeon-floor")
      .setDisplaySize(WIDTH, HEIGHT)
      .setDepth(-100);
    this.props = this.add.container(0, 0).setDepth(-10);
    this.gate = this.image("portal", 480, 100, 110).setDepth(-5);
    this.player = this.image("player-tank", 420, 342, 84);
    this.companion = this.image("mira-healer", 510, 372, 84);
    this.shadows = this.add.graphics().setDepth(-1);
    this.ink = this.add.graphics().setDepth(2000);
    this.reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
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
    this.shadows.clear();
    const unlocked = state.phase === "cleared" || state.phase === "won";
    this.gate.setTint(unlocked ? 0xb4ffdc : 0x9c9b92);
    // Warning geometry remains the exact host-authored danger area, above the art.
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
    this.hero(state.player, this.player, true, state.guard > 0, state.elapsed);
    this.hero(
      state.companion,
      this.companion,
      false,
      state.guard > 0,
      state.elapsed,
    );
    const alive = new Set(state.enemies.map((e) => e.id));
    for (const [id, image] of this.mobs)
      if (!alive.has(id)) {
        image.destroy();
        this.mobs.delete(id);
      }
    for (const enemy of state.enemies) {
      const boss = enemy.kind === "warden";
      const size = boss ? 154 : enemy.kind === "wisp" ? 70 : 76;
      let image = this.mobs.get(enemy.id);
      if (!image) {
        image = this.image(enemy.kind, enemy.x, enemy.y + 20, size);
        this.mobs.set(enemy.id, image);
      }
      image
        .setPosition(
          enemy.x,
          enemy.y +
            20 +
            (enemy.kind === "wisp" && !this.reducedMotion
              ? Math.sin(state.elapsed * 3 + enemy.id) * 3
              : 0),
        )
        .setDepth(enemy.y);
      image.setTint(enemy.flash > 0 ? 0xffd3bc : 0xffffff);
      const barWidth = boss ? 90 : 38,
        barY = enemy.y - (boss ? 112 : 58);
      this.shadows.fillStyle(0x050d15, 0.28);
      this.shadows.fillEllipse(
        enemy.x,
        enemy.y + 20,
        boss ? 85 : 38,
        boss ? 22 : 12,
      );
      g.fillStyle(0x101a24, 0.95);
      g.fillRoundedRect(enemy.x - barWidth / 2, barY, barWidth, 5, 2);
      g.fillStyle(0xe4a47a);
      g.fillRoundedRect(
        enemy.x - barWidth / 2,
        barY,
        barWidth * Math.max(0, enemy.hp / enemy.maxHp),
        5,
        2,
      );
    }
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
  private hero(
    actor: Body,
    image: Phaser.GameObjects.Image,
    player: boolean,
    guard: boolean,
    elapsed: number,
  ) {
    const { x, y } = actor,
      g = this.ink;
    const key: DungeonSpriteKey = player
      ? `player-${actor.role}`
      : companionSprite(this.character, actor.role);
    image
      .setFrame(this.frameIndex(key))
      .setPosition(x, y + 22)
      .setDepth(y)
      .setVisible(actor.hp > 0);
    image.setTint(actor.flash > 0 ? 0xffd3bc : 0xffffff);
    image.setRotation(
      !this.reducedMotion && actor.cooldown > 0.3
        ? Math.sin(elapsed * 9) * 0.025
        : 0,
    );
    this.shadows.fillStyle(0x050d15, 0.3);
    this.shadows.fillEllipse(x, y + 21, 42, 14);
    if (actor.hp <= 0) {
      g.lineStyle(4, 0xc6a5a5);
      g.lineBetween(x - 10, y - 10, x + 10, y + 10);
      g.lineBetween(x + 10, y - 10, x - 10, y + 10);
      return;
    }
    if (player) {
      g.lineStyle(2, 0xe4e9d5, 0.8);
      g.strokeEllipse(x, y + 21, 43, 17);
    } else {
      g.fillStyle(0xe5b8f3);
      g.fillCircle(x, y - 57, 3);
    }
    if (guard && actor.role === "tank") {
      g.lineStyle(3, 0x8cd1ff, 0.7);
      g.strokeCircle(x, y, 33);
    }
  }
  private background(room: number) {
    this.props.removeAll(true);
    this.ground.setTint(
      [0xe5f1df, 0xe2deef, 0xf1dfc5, 0xe7d0dc][Math.max(0, room)],
    );
    for (const x of [63, WIDTH - 63])
      for (const y of [131, HEIGHT - 50])
        this.props.add(this.image("pillar", x, y, 94));
    this.props.add(this.image("chest", 155, 111, 66));
    for (const [x, y, size] of [
      [46, 306, 73],
      [918, 354, 73],
      [231, 565, 54],
      [752, 68, 58],
    ])
      this.props.add(this.image("rock", x, y, size));
  }
}

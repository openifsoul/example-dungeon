import assert from "node:assert/strict";
import test from "node:test";
import { companionSprite } from "../src/game/appearance";
import { DUNGEON_SPRITES } from "../src/game/sprite-keys";

test("each companion keeps its identity in both complementary roles", () => {
  for (const id of ["mira", "rook", "pip"])
    for (const role of ["healer", "tank"] as const) {
      const sprite = companionSprite(
        { id, name: "Different display name" },
        role,
      );
      assert.equal(sprite, `${id}-${role}`);
      assert.ok(DUNGEON_SPRITES.includes(sprite));
    }
  assert.equal(
    companionSprite({ id: "standalone-session", name: "Pip" }, "tank"),
    "pip-tank",
  );
});
test("unrecognized characters use neutral role art instead of another companion identity", () => {
  assert.equal(
    companionSprite({ id: "custom", name: "Original visitor" }, "healer"),
    "player-healer",
  );
  assert.equal(
    companionSprite({ id: "custom", name: "Original visitor" }, "tank"),
    "player-tank",
  );
});

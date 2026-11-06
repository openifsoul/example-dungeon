import type { Role } from "./simulation.js";
import type { DungeonSpriteKey } from "./sprite-keys.js";

export function companionSprite(
  character: { id: string; name: string },
  role: Role,
): DungeonSpriteKey {
  const id = character.id.toLowerCase();
  const name = character.name.toLowerCase();
  const known = ["mira", "rook", "pip"];
  const identity = known.includes(id) ? id : known.includes(name) ? name : null;
  return identity
    ? (`${identity}-${role}` as DungeonSpriteKey)
    : `player-${role}`;
}

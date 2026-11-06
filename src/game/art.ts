import atlasURL from "./assets/dungeon-atlas.webp";
import floorURL from "./assets/dungeon-floor.webp";

export interface DungeonArt {
  atlas: HTMLImageElement;
  floor: HTMLImageElement;
}
export async function loadDungeonArt(): Promise<DungeonArt> {
  const decode = async (url: string) => {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image;
  };
  const [atlas, floor] = await Promise.all([
    decode(atlasURL),
    decode(floorURL),
  ]);
  return { atlas, floor };
}

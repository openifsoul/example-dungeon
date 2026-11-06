# Hollow Warden artwork

Original hand-painted assets generated with the built-in ImageGen tool on 2026-11-06.
The [prompt record](generation.json) and normalized PNGs in `sprites/` are source
art. The set includes Mira, Rook and Pip as both healer and tank, two neutral
player bodies, crawler, wisp, Warden, pillar, gate, chest, rocks and the floor.

The three companion identities match the portraits and gardener outfits in the
other first-party examples. Role changes select a different body for the same
identity. Unknown custom characters use neutral role art. All figures currently
use a single idle pose with small presentation motion, not an animation strip.

Frames are 256 × 256 with a shared bottom-center origin `(128, 236)` and four
columns in the WebP atlas. A separate 960 × 600 WebP supplies the floor. Phaser
textures are owned by the mounted game and released on destruction. Artwork does
not change hit areas, enemy attacks, navigation, resource rules or model authority.
The exit tint follows the host's cleared state; decorative props have no invented
interaction or loot behavior. Exact danger telegraphs remain visible above sprites.

Ordinary builds consume the prepared atlas; no image service or art tools run as
part of a build. To explicitly repack normalized PNGs locally, install ImageMagick
and `cwebp`, then run `node scripts/pack-sprites.mjs`. The command performs no
remote execution or deployment. The PNGs and prompts are original project assets,
distributed under the repository license.

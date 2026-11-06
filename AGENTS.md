# Independent example ownership

This repository owns its original game, host simulation, renderer, adapter and
standalone React/TypeScript/shadcn panel. The IfSoul SDK is a package dependency;
never import another checkout or copy SDK/runtime/auth implementation here.
The host owns all mechanics; IfSoul returns bounded plans or requested speech.
No credentials, conversations, third-party characters or game assets in source.

Run pnpm install --frozen-lockfile, pnpm check locally. The owner authorized
manual public GitHub repository creation, commit and push on 2026-11-06. No remote
CI, automatic builds, npm publication or deployment is configured or authorized.
Future publication remains an explicit owner action. Browser tests are headless,
use task-specific sessions with 300000ms idle timeout and explicitly close only
owned sessions. Respect reduced motion and keyboard/mobile accessibility.

## Authorized release on 2026-11-06

The owner authorized preparation, reviewed Git commits/pushes, and manual production
publication through private Cloud after coordinator review and local gates. This
supersedes the split-only deployment restriction for this release. Checks and builds
remain local; no npm publication, automatic remote execution, settings changes,
secret operation or data migration is authorized. A Git push does not deploy.

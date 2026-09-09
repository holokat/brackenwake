# Contributing to Brackenwake

Fork the repository, create a branch and keep each pull request focused on one change. Explain the player-visible result and include screenshots or a short recording for visual changes.

Install with `npm ci`. Run `npm test` and `npm run build` before submitting. For welcome-page changes, also run `npm run build:marketing` and check the hero on narrow and short screens, keyboard navigation and reduced-motion settings.

Keep modules focused and reuse shared behavior. Preserve multiplayer wire formats and server authority when changing networking. Add a regression test when fixing a behavior that can be tested reliably.

Never commit credentials, player saves, dependencies or build outputs. Include source and license information with third-party assets. Contributions should be compatible with the repository's MIT license; retain any existing third-party notices.

For models, armor, farm collections and visual effects, start with the companion [asset library](https://github.com/holokat/game-assets). Keep asset tooling changes in that repository and game integration changes here.

Search the library before creating another model. Reuse an existing asset or add a variant when it fits the area. Add new reusable props to a named library collection with source files, previews, stable IDs and placement or animation requirements. The [Haven meadow kit](https://github.com/holokat/game-assets/tree/main/site/collections/farm/haven-meadow) contains the town-to-beach props, their Blender source, collision guidance and motion helper.

# Third-party sources

FAF Template Workshop is an independent personal utility. It is not an official FAF or Supreme Commander product.

The catalog and unit icons come from the official FAF unit database:

- https://faforever.github.io/etfreeman-db/
- https://github.com/FAForever/etfreeman-db
- https://faforever.github.io/etfreeman-db/data/index.json

Unit blueprint placement sizes and categories were read from the FAF game repository, `deploy/faf` branch, game version 3839:

- https://github.com/FAForever/fa/tree/deploy/faf/units

Saved-template behavior was checked against the FAF implementation:

- https://github.com/FAForever/fa/blob/develop/lua/ui/game/build_templates.lua
- https://github.com/FAForever/fa/blob/develop/lua/ui/templates_factory.lua
- https://github.com/FAForever/fa/blob/develop/lua/ui/templateUtils.lua
- https://github.com/FAForever/fa/blob/develop/lua/ui/game/construction.lua

Shield coverage, production/maintenance bonuses, and artillery timing were checked against FAF 3839, source commit `36701ed9e184818bc264ec0b325676356c1ed743`:

- https://github.com/FAForever/fa/blob/deploy/faf/lua/sim/AdjacencyBuffs.lua
- https://github.com/FAForever/fa/blob/deploy/faf/lua/sim/AdjacencyBuffFunctions.lua
- https://github.com/FAForever/fa/blob/deploy/faf/lua/sim/Buff.lua
- https://github.com/FAForever/fa/blob/deploy/faf/lua/sim/Unit.lua
- https://github.com/FAForever/fa/blob/deploy/faf/lua/sim/units/StructureUnit.lua
- https://github.com/FAForever/fa/blob/deploy/faf/lua/sim/weapons/DefaultProjectileWeapon.lua
- https://github.com/FAForever/fa/blob/deploy/faf/lua/shield.lua
- https://wiki.faforever.com/en/Play/Learning/Adjacency-Bonus
- https://github.com/FAForever/wiki-pages/blob/main/Play/Learning/Adjacency-Bonus.md

The wiki was used for context. Numerical simulation coefficients come from the matching game source, including when older wiki examples differ.

Supreme Commander, Forged Alliance, faction names, unit names, and game artwork belong to their respective rights holders. Original artwork is credited to Gas Powered Games and the game's publishers; FAF additions and changes are credited to their contributors. Bundled third-party catalog material and artwork retain their original rights and are excluded from the application-source MIT license. See the linked repositories for their applicable notices.

The original code written for this editor is covered by LICENSE.txt. No separate repository-wide license file was present in the inspected FAF game or unit database source roots; attribution here does not relicense their content.

Factory build rates, buildable category lists and differential upgrade costs were read from the FAF 3839 unit blueprints. Compatibility uses the ordered building-prefix alternatives and whole-template validation in `lua/ui/game/construction.lua` at that version.

The four faction SVG paths in `docs/factions` are derived from the official FAF client’s `src/main/resources/theme/icons.css`:

- https://github.com/FAForever/downlords-faf-client/blob/develop/src/main/resources/theme/icons.css
- https://github.com/FAForever/downlords-faf-client/blob/develop/LICENSE

They retain the upstream artwork rights and license. The upstream license text is included in `third_party/FAF_Client_LICENSE.txt`; these assets are excluded from this utility’s original-source MIT grant.

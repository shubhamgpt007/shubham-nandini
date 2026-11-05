/* scenes/index.js — the scene barrel.
 *
 * js/main.js imports this file exactly once. Importing a scene module is all it takes
 * to install it: each one calls kit.defineScene() (and kit.defineTransition()) at
 * module scope, and js/fx/kit.js flushes the whole queue against the live stage the
 * moment boot dispatches `stage:ready`.
 *
 * ORDER HERE IS COSMETIC — it matches data/scenes.json `order` for readability only.
 * The engine drives sequence from that file; nothing here can change it.
 *
 * Adding a scene is one line here + js/scenes/<slug>.js + css/scenes/<slug>.css
 * (imported by css/scenes.css). No other file in the template needs to change.
 */

import "./cover.js?v=21";
import "./names.js?v=13";
import "./mayra-mehendi.js?v=13";
import "./cocktail.js?v=13";
import "./haldi.js?v=14";
import "./wedding.js?v=16";
import "./reception.js?v=1";
import "./last.js?v=14";
import "./map.js?v=2";

import { Game } from './Game.js';

try {
    const game = new Game();
} catch (e) {
    console.error(e);
    alert("Game Init Error: " + e.message + "\n" + e.stack);
}

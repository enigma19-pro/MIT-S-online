'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

test('disconnect is surfaced in both BUILD and BATTLE screens', () => {
    const buildStart = html.indexOf("{gameState === 'BUILD' && (");
    const battleStart = html.indexOf("{(gameState === 'BATTLE' || gameState === 'GAMEOVER') && (", buildStart);

    assert.notEqual(buildStart, -1, 'BUILD screen must exist');
    assert.notEqual(battleStart, -1, 'BATTLE screen must exist after BUILD');

    const buildMarkup = html.slice(buildStart, battleStart);
    const battleMarkup = html.slice(battleStart);

    assert.match(buildMarkup, /JUGADOR DESCONECTADO/);
    assert.match(buildMarkup, /Regresar al lobby/);
    assert.match(battleMarkup, /PARTIDA TERMINADA/);
    assert.match(battleMarkup, /Regresar al lobby/);
});

test('a terminal player_left state records the departed player and preserves the current screen', () => {
    assert.match(html, /if \(currentRoomStatus === 'player_left'\)/);
    assert.match(html, /setDisconnectedPlayer\(departedPlayer\)/);
    assert.match(html, /setWinnerPlayer\(sanitizeOnlinePlayerNumber\(room\.winner\)\)/);
    assert.match(html, /stopOnlinePresenceListener\(true\)/);
});

test('opponent presence changes are checked after the 2.5 second grace period', () => {
    assert.match(html, /const ONLINE_PRESENCE_GRACE_MS = 2500;/);
    assert.match(html, /\}, ONLINE_PRESENCE_GRACE_MS\)/);
});

test('public room listings are checked against room state and host presence', () => {
    assert.match(html, /MITSOnlineRoomLifecycle\.isPublicRoomAvailable\(\s*listing, room, Date\.now\(\), ONLINE_ROOM_TTL_MS\s*\)/);
    assert.match(html, /hostPresenceSnapshot\.exists\(\)/);
    assert.match(html, /setInterval\(refreshPublicRooms, 15000\)/);
});

test('cancelled waiting rooms eject the connected guest to the lobby', () => {
    const cancelBranch = html.indexOf("if (currentRoomStatus === 'cancelled')");
    assert.notEqual(cancelBranch, -1);
    const cancelEnd = html.indexOf("if (currentRoomStatus === 'gameover'", cancelBranch);
    const cancelMarkup = html.slice(cancelBranch, cancelEnd);

    assert.match(cancelMarkup, /exitClosedOnlineRoom\(code, message, room\.isPublic === true\)/);
});

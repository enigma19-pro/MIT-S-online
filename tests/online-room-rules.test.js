'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const rules = require('../database.rules.json');

const room = rules.rules.rooms.$roomId;
const publicRoom = rules.rules.publicRooms.$roomId;

test('public room reads require a live, public, unclaimed room and host presence', () => {
    const rule = room['.read'];
    assert.match(rule, /status.*waiting/);
    assert.match(rule, /isPublic.*true/);
    assert.match(rule, /guestUid.*exists/);
    assert.match(rule, /expiresAt.*> now/);
    assert.match(rule, /presence.*player1.*exists/);
});

test('guest claims require an unexpired waiting room and a connected host', () => {
    const write = room['.write'];
    const validate = room['.validate'];
    assert.match(write, /status.*waiting/);
    assert.match(write, /expiresAt.*> now/);
    assert.match(write, /presence.*player1.*exists/);
    assert.match(write, /newData.*guestUid.*auth\.uid/);
    assert.match(validate, /newData.*guestUid.*auth\.uid/);
    assert.match(validate, /presence.*player1.*exists/);
});

test('waiting guest can release only their own seat; host can release an absent guest', () => {
    const validate = room['.validate'];
    assert.match(validate, /data\.child\('guestUid'\)\.val\(\) == auth\.uid/);
    assert.match(validate, /data\.child\('hostUid'\)\.val\(\) == auth\.uid/);
    assert.match(validate, /presence.*player2.*exists/);
    assert.match(validate, /newData\.child\('guestUid'\)\.exists\(\)/);
});

test('a waiting guest cannot cancel a room while the host is present', () => {
    const validate = room['.validate'];
    assert.match(validate, /status.*cancelled/);
    assert.match(validate, /data\.child\('guestUid'\)\.val\(\) == auth\.uid/);
    assert.match(validate, /presence.*player1.*exists/);
});

test('player_left transitions identify the reporter and distinguish voluntary exit from timeout', () => {
    const validate = room['.validate'];
    assert.match(validate, /status.*player_left/);
    assert.match(validate, /closedBy.*auth\.uid/);
    assert.match(validate, /closeReason.*player_exit/);
    assert.match(validate, /gameover_exit/);
    assert.match(validate, /gameover_disconnect/);
    assert.match(validate, /disconnectedPlayer/);
});

test('expired and stale public listings can be retired without opening room writes', () => {
    const write = publicRoom['.write'];
    assert.match(write, /!newData\.exists\(\)/);
    assert.match(write, /status.*waiting/);
    assert.match(write, /presence.*player1.*exists/);
    assert.match(write, /expiresAt.*<= now/);
    assert.match(write, /createdAt/);
    assert.match(write, /hostUid/);
});

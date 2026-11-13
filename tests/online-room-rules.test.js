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
    assert.match(validate, /disconnectedPlayer/);
    assert.match(validate, /auth\.uid.*disconnectedPlayer|disconnectedPlayer.*auth\.uid/);
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



test('room participants cannot spoof or erase the other player presence', () => {
    const validate = room['.validate'];
    assert.match(validate, /auth\.uid == data\.child\('hostUid'\)\.val\(\).*presence.*player2.*exists/);
    assert.match(validate, /auth\.uid == data\.child\('guestUid'\)\.val\(\).*presence.*player1.*exists/);
    assert.match(validate, /newData\.child\('presence'\)\.child\('player2'\)\.exists\(\) == data\.child\('presence'\)\.child\('player2'\)\.exists\(\)/);
    assert.match(validate, /newData\.child\('presence'\)\.child\('player1'\)\.exists\(\) == data\.child\('presence'\)\.child\('player1'\)\.exists\(\)/);
});


test('disconnect-based player_left transitions require the missing opponent presence and a known reason', () => {
    const validate = room['.validate'];
    assert.match(validate, /closeReason.*disconnect/);
    assert.match(validate, /gameover_disconnect/);
    assert.match(validate, /!data\.child\('presence'\)\.child\('player1'\)\.exists\(\)/);
    assert.match(validate, /!data\.child\('presence'\)\.child\('player2'\)\.exists\(\)/);
});

test('cancelled rooms require an authorized close reason and immutable terminal metadata', () => {
    const validate = room['.validate'];
    assert.match(validate, /host_cancelled/);
    assert.match(validate, /host_disconnect/);
    assert.match(validate, /room_expired/);
    assert.match(validate, /host_setup_failed/);
    assert.match(validate, /data\.child\('status'\)\.val\(\) == 'cancelled'/);
    assert.match(validate, /newData\.child\('closeReason'\)\.val\(\) == data\.child\('closeReason'\)\.val\(\)/);
});


test('a room cannot be marked expired before the Firebase server deadline', () => {
    const validate = room['.validate'];
    assert.match(validate, /closeReason.*room_expired/);
    assert.match(validate, /data\.child\('expiresAt'\)\.val\(\) <= now/);
    assert.match(validate, /!data\.child\('expiresAt'\)\.isNumber\(\)/);
});

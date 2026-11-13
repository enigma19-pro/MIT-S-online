'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Lifecycle = require('../online-room-lifecycle.js');

const HOST = 'host-uid';
const GUEST = 'guest-uid';

function waitingRoom(overrides = {}) {
    return {
        hostUid: HOST,
        guestUid: GUEST,
        status: 'waiting',
        isPublic: true,
        player1Name: 'Host',
        player2Name: 'Guest',
        createdAt: 1_000,
        expiresAt: 1_801_000,
        ...overrides
    };
}

test('host explicitly leaving a waiting room closes it', () => {
    assert.deepEqual(Lifecycle.explicitExitPatch(waitingRoom(), HOST), {
        status: 'cancelled',
        closeReason: 'host_cancelled',
        closedBy: HOST
    });
});

test('guest explicitly leaving a waiting room releases only the guest seat', () => {
    assert.deepEqual(Lifecycle.explicitExitPatch(waitingRoom(), GUEST), {
        guestUid: null,
        player2Name: ''
    });
});

test('a waiting-room exit from a non-member cannot mutate the room', () => {
    assert.equal(Lifecycle.explicitExitPatch(waitingRoom(), 'stranger'), null);
});

test('leaving during building closes the session without inventing a winner', () => {
    assert.deepEqual(Lifecycle.explicitExitPatch(waitingRoom({ status: 'building' }), GUEST), {
        status: 'player_left',
        disconnectedPlayer: 2,
        closeReason: 'player_exit',
        closedBy: GUEST
    });
});

test('leaving during battle records the opponent as winner', () => {
    assert.deepEqual(Lifecycle.explicitExitPatch(waitingRoom({ status: 'battle' }), GUEST), {
        status: 'player_left',
        disconnectedPlayer: 2,
        closeReason: 'player_exit',
        closedBy: GUEST,
        winner: 1
    });
});

test('leaving during Berserker rebuild records the opponent as winner', () => {
    assert.deepEqual(Lifecycle.explicitExitPatch(waitingRoom({ status: 'berserker_build' }), HOST), {
        status: 'player_left',
        disconnectedPlayer: 1,
        closeReason: 'player_exit',
        closedBy: HOST,
        winner: 2
    });
});

test('leaving the gameover screen atomically transitions to player_left', () => {
    assert.deepEqual(Lifecycle.explicitExitPatch(waitingRoom({ status: 'gameover', winner: 1 }), HOST), {
        status: 'player_left',
        disconnectedPlayer: 1,
        closeReason: 'gameover_exit',
        closedBy: HOST
    });
});

test('a terminal room cannot be reopened by an explicit exit', () => {
    assert.equal(Lifecycle.explicitExitPatch(waitingRoom({ status: 'cancelled' }), HOST), null);
    assert.equal(Lifecycle.explicitExitPatch(waitingRoom({ status: 'player_left' }), GUEST), null);
});

test('guest presence timeout releases the seat but preserves the waiting room', () => {
    assert.deepEqual(Lifecycle.presenceTimeoutPatch(waitingRoom(), 1, 2), {
        guestUid: null,
        player2Name: ''
    });
});

test('host presence timeout cancels the waiting room', () => {
    assert.deepEqual(Lifecycle.presenceTimeoutPatch(waitingRoom(), 2, 1), {
        status: 'cancelled',
        closeReason: 'host_disconnect',
        closedBy: 'presence_timeout'
    });
});

test('presence timeout during a battle records the remaining player as winner', () => {
    assert.deepEqual(Lifecycle.presenceTimeoutPatch(waitingRoom({ status: 'battle' }), 1, 2), {
        status: 'player_left',
        disconnectedPlayer: 2,
        closeReason: 'disconnect',
        closedBy: HOST,
        winner: 1
    });
});

test('presence timeout during gameover closes the result without replacing its winner', () => {
    assert.deepEqual(Lifecycle.presenceTimeoutPatch(waitingRoom({ status: 'gameover', winner: 2 }), 1, 2), {
        status: 'player_left',
        disconnectedPlayer: 2,
        closeReason: 'gameover_disconnect',
        closedBy: HOST
    });
});

test('presence timeout during building does not invent a winner', () => {
    assert.deepEqual(Lifecycle.presenceTimeoutPatch(waitingRoom({ status: 'building' }), 1, 2), {
        status: 'player_left',
        disconnectedPlayer: 2,
        closeReason: 'disconnect',
        closedBy: HOST
    });
});

test('presence timeout does nothing when the opponent seat is already empty', () => {
    assert.equal(Lifecycle.presenceTimeoutPatch(waitingRoom({ guestUid: null }), 1, 2), null);
});

test('public-room validation requires a matching live, public, waiting, unclaimed room', () => {
    const room = waitingRoom({ guestUid: null });
    const listing = {
        hostUid: HOST,
        hostName: 'Host',
        name: 'Sala',
        createdAt: room.createdAt,
        expiresAt: room.expiresAt,
        status: 'waiting'
    };
    assert.equal(Lifecycle.isPublicRoomAvailable(listing, room, 10_000), true);
    assert.equal(Lifecycle.isPublicRoomAvailable(listing, { ...room, status: 'battle' }, 10_000), false);
    assert.equal(Lifecycle.isPublicRoomAvailable(listing, { ...room, status: 'cancelled' }, 10_000), false);
    assert.equal(Lifecycle.isPublicRoomAvailable(listing, { ...room, guestUid: GUEST }, 10_000), false);
    assert.equal(Lifecycle.isPublicRoomAvailable(listing, { ...room, isPublic: false }, 10_000), false);
    assert.equal(Lifecycle.isPublicRoomAvailable(listing, { ...room, hostUid: 'other-host' }, 10_000), false);
    assert.equal(Lifecycle.isPublicRoomAvailable(listing, { ...room, expiresAt: 2_000 }, 10_000), false);
    assert.equal(Lifecycle.isPublicRoomAvailable({ ...listing, createdAt: 2_000 }, room, 10_000), false);
});

test('public-room validation rejects expired, future-dated and overlong lifetimes', () => {
    const room = waitingRoom({ guestUid: null });
    const listing = {
        hostUid: HOST,
        createdAt: room.createdAt,
        expiresAt: room.expiresAt,
        status: 'waiting'
    };
    assert.equal(Lifecycle.isPublicRoomAvailable(listing, room, room.expiresAt), false);
    assert.equal(Lifecycle.isPublicRoomAvailable(listing, { ...room, createdAt: 20_000 }, 10_000), false);
    assert.equal(
        Lifecycle.isPublicRoomAvailable(
            { ...listing, expiresAt: room.createdAt + 3_600_000 },
            { ...room, expiresAt: room.createdAt + 3_600_000 },
            10_000
        ),
        false
    );
});

test('waiting rooms without an expiry are considered expired', () => {
    assert.equal(Lifecycle.isWaitingRoomExpired(waitingRoom({ expiresAt: undefined }), 10_000), true);
    assert.equal(Lifecycle.isWaitingRoomExpired(waitingRoom({ expiresAt: 9_999 }), 10_000), true);
    assert.equal(Lifecycle.isWaitingRoomExpired(waitingRoom({ expiresAt: 10_001 }), 10_000), false);
    assert.equal(Lifecycle.isWaitingRoomExpired(waitingRoom({ status: 'battle', expiresAt: 1 }), 10_000), false);
});

'use strict';

const ACTIVE_ROOM_STATUSES = Object.freeze(['building', 'battle', 'berserker_build', 'gameover']);

function isPlayerNumber(value) {
    return value === 1 || value === 2;
}

function getPlayerNumber(room, uid) {
    if (!room || typeof uid !== 'string' || !uid) return null;
    if (room.hostUid === uid) return 1;
    if (room.guestUid === uid) return 2;
    return null;
}

/**
 * Returns the minimal room patch for a member deliberately leaving.
 * A waiting guest releases their seat; only the host closes a waiting room.
 */
function hasPlayerPresence(room, playerNum) {
    const presence = room?.presence?.[`player${playerNum}`];
    return !!presence && typeof presence === 'object' && !Array.isArray(presence) && Object.keys(presence).length > 0;
}

function explicitExitPatch(room, uid) {
    const playerNum = getPlayerNumber(room, uid);
    if (!playerNum || hasPlayerPresence(room, playerNum)) return null;

    if (room.status === 'waiting') {
        if (playerNum === 1) {
            return { status: 'cancelled', closeReason: 'host_cancelled', closedBy: uid };
        }
        return { guestUid: null, player2Name: '' };
    }

    if (['building', 'battle', 'berserker_build'].includes(room.status)) {
        const patch = {
            status: 'player_left',
            disconnectedPlayer: playerNum,
            closeReason: 'player_exit',
            closedBy: uid
        };
        if (room.status === 'battle' || room.status === 'berserker_build') {
            patch.winner = playerNum === 1 ? 2 : 1;
        }
        return patch;
    }

    if (room.status === 'gameover') {
        return {
            status: 'player_left',
            disconnectedPlayer: playerNum,
            closeReason: 'gameover_exit',
            closedBy: uid
        };
    }

    return null;
}

/**
 * Returns the room patch after the opponent's presence has been absent for
 * the grace period. The caller must apply this inside a room transaction and
 * re-check that the opponent presence collection is still empty.
 */
function presenceTimeoutPatch(room, localPlayerNum, opponentPlayerNum) {
    if (!isPlayerNumber(localPlayerNum) || !isPlayerNumber(opponentPlayerNum) ||
        localPlayerNum === opponentPlayerNum || !room) return null;

    if (room.status === 'waiting') {
        if (!room.guestUid) return null;
        if (localPlayerNum === 1 && opponentPlayerNum === 2) {
            // The guest left: keep the host's room alive and release the seat.
            return { guestUid: null, player2Name: '' };
        }
        if (localPlayerNum === 2 && opponentPlayerNum === 1) {
            // The host left: the waiting room cannot continue without its owner.
            return {
                status: 'cancelled',
                closeReason: 'host_disconnect',
                closedBy: localPlayerNum === 1 ? room.hostUid : room.guestUid
            };
        }
        return null;
    }

    if (!ACTIVE_ROOM_STATUSES.includes(room.status)) return null;

    const patch = {
        status: 'player_left',
        disconnectedPlayer: opponentPlayerNum,
        closeReason: room.status === 'gameover' ? 'gameover_disconnect' : 'disconnect',
        closedBy: localPlayerNum === 1 ? room.hostUid : room.guestUid
    };
    if (room.status === 'battle' || room.status === 'berserker_build') {
        patch.winner = localPlayerNum;
    }
    return patch;
}

function waitingRoomExpiryPatch(room, uid, now = Date.now()) {
    if (!room || room.status !== 'waiting' || typeof uid !== 'string' || !uid || room.hostUid !== uid) return null;
    if (!isWaitingRoomExpired(room, now)) return null;
    return { status: 'cancelled', closeReason: 'room_expired', closedBy: uid };
}

function isWaitingRoomExpired(room, now = Date.now()) {
    if (!room || room.status !== 'waiting') return false;
    const expiresAt = room.expiresAt;
    return typeof expiresAt !== 'number' || !Number.isFinite(expiresAt) || expiresAt <= now;
}

function isPublicRoomAvailable(listing, room, now = Date.now(), ttlMs = 30 * 60 * 1000) {
    if (!listing || !room || typeof listing !== 'object' || typeof room !== 'object') return false;
    if (listing.status !== 'waiting' || room.status !== 'waiting' || room.isPublic !== true) return false;
    if (listing.guestUid || room.guestUid) return false;
    if (typeof listing.hostUid !== 'string' || !listing.hostUid || listing.hostUid !== room.hostUid) return false;
    if (typeof room.createdAt !== 'number' || !Number.isSafeInteger(room.createdAt) || room.createdAt <= 0) return false;
    if (typeof room.expiresAt !== 'number' || !Number.isSafeInteger(room.expiresAt)) return false;
    if (typeof listing.createdAt !== 'number' || listing.createdAt !== room.createdAt) return false;
    if (typeof listing.expiresAt !== 'number' || listing.expiresAt !== room.expiresAt) return false;
    if (room.createdAt > now || room.expiresAt <= now) return false;
    if (room.expiresAt <= room.createdAt || room.expiresAt > room.createdAt + ttlMs) return false;
    return true;
}

const api = Object.freeze({
    ACTIVE_ROOM_STATUSES,
    explicitExitPatch,
    getPlayerNumber,
    isPublicRoomAvailable,
    isWaitingRoomExpired,
    presenceTimeoutPatch,
    waitingRoomExpiryPatch
});

if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.MITSOnlineRoomLifecycle = api;

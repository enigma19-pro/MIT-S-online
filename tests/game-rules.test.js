'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    isSuccessfulAttack,
    resolveDefense,
    findAvailableMitIndex,
    resolveMitDefeat
} = require('../game-rules.js');

test('an attack succeeds only when the rolled face is in attackNums', () => {
    assert.equal(isSuccessfulAttack([1, 3, 5], 3), true);
    assert.equal(isSuccessfulAttack([1, 3, 5], 4), false);
});

test('attack number strings are normalized without changing the game rule', () => {
    assert.equal(isSuccessfulAttack(['2', '6'], 6), true);
});

test('attack rolls outside the six-sided die range cannot hit', () => {
    assert.equal(isSuccessfulAttack([0, 7], 0), false);
    assert.equal(isSuccessfulAttack([0, 7], 7), false);
    assert.equal(isSuccessfulAttack([1, 1.5], 1.5), false);
});

test('non-numeric values cannot be coerced into successful attack faces', () => {
    assert.equal(isSuccessfulAttack([true, null, 1], true), false);
    assert.equal(isSuccessfulAttack([true, null, 1], 1), true);
    assert.equal(isSuccessfulAttack([1], null), false);
});

test('an explicit evade face reduces damage by the defense roll', () => {
    assert.deepEqual(
        resolveDefense({ attackDamage: 5, defenseRoll: 3, evadeNums: [1, 3] }),
        { isEvadeNumber: true, finalDamageTaken: 2 }
    );
});

test('a defense face outside evadeNums receives full damage', () => {
    assert.deepEqual(
        resolveDefense({ attackDamage: 5, defenseRoll: 3, evadeNums: [1, 2] }),
        { isEvadeNumber: false, finalDamageTaken: 5 }
    );
});

test('defense rolls outside the six-sided die range cannot evade', () => {
    assert.deepEqual(
        resolveDefense({ attackDamage: 5, defenseRoll: 7, evadeNums: [7] }),
        { isEvadeNumber: false, finalDamageTaken: 5 }
    );
});

test('invalid values in evadeNums cannot become valid evade faces', () => {
    assert.deepEqual(
        resolveDefense({ attackDamage: 5, defenseRoll: 1, evadeNums: [true, null] }),
        { isEvadeNumber: false, finalDamageTaken: 5 }
    );
});

test('damage cannot become negative when the evade roll exceeds damage', () => {
    assert.deepEqual(
        resolveDefense({ attackDamage: 2, defenseRoll: 5, evadeNums: [5] }),
        { isEvadeNumber: true, finalDamageTaken: 0 }
    );
});

test('invalid or missing evade arrays do not accidentally grant evasion', () => {
    assert.deepEqual(
        resolveDefense({ attackDamage: 4, defenseRoll: 2, evadeNums: null }),
        { isEvadeNumber: false, finalDamageTaken: 4 }
    );
});

test('invalid damage is treated as zero rather than propagating NaN', () => {
    assert.deepEqual(
        resolveDefense({ attackDamage: 'invalid', defenseRoll: 2, evadeNums: [2] }),
        { isEvadeNumber: true, finalDamageTaken: 0 }
    );
    assert.deepEqual(
        resolveDefense({ attackDamage: true, defenseRoll: 2, evadeNums: [2] }),
        { isEvadeNumber: true, finalDamageTaken: 0 }
    );
});

test('the player who loses a MIT with a reserve receives the next turn', () => {
    assert.deepEqual(
        resolveMitDefeat({ defeatedPlayer: 1, hasReserve: true }),
        { isGameOver: false, winner: null, nextPlayer: 1 }
    );
    assert.deepEqual(
        resolveMitDefeat({ defeatedPlayer: 2, hasReserve: true }),
        { isGameOver: false, winner: null, nextPlayer: 2 }
    );
});

test('the opponent wins when the defeated player has no reserve MIT', () => {
    assert.deepEqual(
        resolveMitDefeat({ defeatedPlayer: 1, hasReserve: false }),
        { isGameOver: true, winner: 2, nextPlayer: null }
    );
    assert.deepEqual(
        resolveMitDefeat({ defeatedPlayer: 2, hasReserve: false }),
        { isGameOver: true, winner: 1, nextPlayer: null }
    );
});

test('invalid defeated player numbers do not produce a turn transition', () => {
    assert.equal(resolveMitDefeat({ defeatedPlayer: 3, hasReserve: true }), null);
    assert.equal(resolveMitDefeat({ defeatedPlayer: 1 }), null);
    assert.equal(resolveMitDefeat({ defeatedPlayer: true, hasReserve: true }), null);
    assert.equal(resolveMitDefeat({ defeatedPlayer: null, hasReserve: true }), null);
});

test('a living reserve MIT can be selected regardless of its slot', () => {
    const mits = [
        { currentHp: 0 },
        { currentHp: 12 }
    ];
    assert.equal(findAvailableMitIndex(mits, 0), 1);
    assert.equal(findAvailableMitIndex(mits, 1), null);
});

test('a defeated reserve MIT is never selectable', () => {
    assert.equal(
        findAvailableMitIndex([{ currentHp: 10 }, { currentHp: 0 }], 0),
        null
    );
});

test('reserve lookup rejects invalid lists and active indices', () => {
    assert.equal(findAvailableMitIndex(null, 0), null);
    assert.equal(findAvailableMitIndex([{ currentHp: 5 }], 2), null);
    assert.equal(findAvailableMitIndex([{ currentHp: 5 }], -1), null);
});

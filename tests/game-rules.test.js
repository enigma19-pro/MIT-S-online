'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { isSuccessfulAttack, resolveDefense } = require('../game-rules.js');

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
});

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    isSuccessfulAttack,
    resolveDefense,
    resolveHpAfterDamage,
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

test('normal defense can fully nullify damage when the A face meets the attack damage', () => {
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


const {
    PASSIVE_CLASS_IDS, createPassiveState, normalizePassiveState, beginPassiveAttackTurn,
    resolvePassiveAttack, resolvePassiveDefense, applyPassiveDamageConsequences,
    advancePassiveTurn, activateBerserkerSecondPhase, clearTemporaryPassiveEffects
} = require('../game-rules.js');

test('passive state starts with empty Technical bonus counters', () => {
    const state = createPassiveState(PASSIVE_CLASS_IDS.TECNICO);
    assert.equal(state.technicalAttackBonus, 0);
    assert.equal(state.technicalDefenseBonus, 0);
    assert.equal(state.ultraCharges, 0);
});

test('passive state trusts the current MIT class and clamps corrupted counters', () => {
    const mit = {
        classData: { id: PASSIVE_CLASS_IDS.EVASIVO },
        attackNums: [2, 5],
        passiveState: {
            passiveClassId: PASSIVE_CLASS_IDS.DESTRUCTOR,
            ultraCharges: '999',
            technicalAttackBonus: 'yes'
        }
    };
    const result = resolvePassiveAttack({ attacker: mit, roll: 1, random: () => 0.9 });
    assert.equal(result.unstoppable, true);
    assert.equal(result.roll, 5);
    assert.equal(result.damage, 6);
    assert.equal(result.state.ultraCharges, 0);
    assert.equal(result.state.technicalAttackBonus, 0);
});

test('Ultra Impulso random selection stays inside the assigned faces at random=1', () => {
    const mit = {
        classData: { id: PASSIVE_CLASS_IDS.EVASIVO },
        attackNums: [2, 5],
        passiveState: { ...createPassiveState(PASSIVE_CLASS_IDS.EVASIVO), ultraCharges: 3 }
    };
    const result = resolvePassiveAttack({ attacker: mit, roll: 1, random: () => 1 });
    assert.equal(result.roll, 5);
    assert.equal(result.damage, 6);
});

test('Technical always gains one attack and defense stack at each own turn', () => {
    const mit = { classData: { id: PASSIVE_CLASS_IDS.TECNICO }, passiveState: createPassiveState(PASSIVE_CLASS_IDS.TECNICO) };
    const result = beginPassiveAttackTurn(mit, () => 0.99);
    assert.equal(result.state.technicalAttackBonus, 1);
    assert.equal(result.state.technicalDefenseBonus, 1);
});

test('Technical attack and defense stacks accumulate independently up to three', () => {
    const mit = { classData: { id: PASSIVE_CLASS_IDS.TECNICO }, passiveState: { ...createPassiveState(PASSIVE_CLASS_IDS.TECNICO), technicalAttackBonus: 2, technicalDefenseBonus: 3 } };
    const result = beginPassiveAttackTurn(mit);
    assert.equal(result.state.technicalAttackBonus, 3);
    assert.equal(result.state.technicalDefenseBonus, 3);
    assert.deepEqual(result.events, ['Técnico acumuló Ataque +1 (3/3)']);
});

test('Technical normalizes legacy boolean bonuses and clamps invalid stacks', () => {
    const mit = { classData: { id: PASSIVE_CLASS_IDS.TECNICO }, passiveState: { technicalAttackBonus: true, technicalDefenseBonus: 99 } };
    const result = normalizePassiveState(mit);
    assert.equal(result.technicalAttackBonus, 1);
    assert.equal(result.technicalDefenseBonus, 3);
});

test('Technical consumes its accumulated attack bonus after applying it', () => {
    const mit = { classData: { id: PASSIVE_CLASS_IDS.TECNICO }, attackNums: [4], passiveState: { ...createPassiveState(PASSIVE_CLASS_IDS.TECNICO), technicalAttackBonus: 3 } };
    const result = resolvePassiveAttack({ attacker: mit, roll: 4 });
    assert.equal(result.damage, 7);
    assert.equal(result.state.technicalAttackBonus, 0);
});

test('Technical consumes its defense stack after reducing damage without dropping below one', () => {
    const attacker = { classData: { id: 'other' }, passiveState: createPassiveState('other') };
    const defender = { classData: { id: PASSIVE_CLASS_IDS.TECNICO }, evadeNums: [], passiveState: { ...createPassiveState(PASSIVE_CLASS_IDS.TECNICO), technicalDefenseBonus: 3 } };
    const result = resolvePassiveDefense({ attacker, defender, attackDamage: 5, defenseRoll: 2 });
    assert.equal(result.damage, 2);
    assert.equal(result.state.technicalDefenseBonus, 0);
});


test('Evasivo can fully nullify damage when its A face matches or exceeds the attack damage', () => {
    const attacker = { passiveState: createPassiveState('other') };
    const defender = {
        classData: { id: PASSIVE_CLASS_IDS.EVASIVO },
        evadeNums: [1, 2, 3, 4],
        passiveState: createPassiveState(PASSIVE_CLASS_IDS.EVASIVO)
    };
    const result = resolvePassiveDefense({ attacker, defender, attackDamage: 2, defenseRoll: 4 });
    assert.equal(result.damage, 0);
    assert.equal(result.fullyDodged, false);
    assert.equal(result.state.ultraCharges, 1);
});

test('Evasivo only gains a charge when normal defense leaves zero or one damage', () => {
    const attacker = { passiveState: createPassiveState('other') };
    const defender = {
        classData: { id: PASSIVE_CLASS_IDS.EVASIVO },
        evadeNums: [3, 4, 5],
        passiveState: createPassiveState(PASSIVE_CLASS_IDS.EVASIVO)
    };
    const twoDamage = resolvePassiveDefense({ attacker, defender, attackDamage: 5, defenseRoll: 3 });
    assert.equal(twoDamage.damage, 2);
    assert.equal(twoDamage.state.ultraCharges, 0);

    const oneDamage = resolvePassiveDefense({ attacker, defender, attackDamage: 5, defenseRoll: 4 });
    assert.equal(oneDamage.damage, 1);
    assert.equal(oneDamage.state.ultraCharges, 1);

    const zeroDamage = resolvePassiveDefense({ attacker, defender, attackDamage: 5, defenseRoll: 5 });
    assert.equal(zeroDamage.damage, 0);
    assert.equal(zeroDamage.state.ultraCharges, 1);
});

test('Berserker phase two can also completely nullify damage with an A face', () => {
    const attacker = { passiveState: createPassiveState('other') };
    const defender = {
        classData: { id: PASSIVE_CLASS_IDS.BERSERKER },
        evadeNums: [1, 2, 3, 4, 5],
        passiveState: { ...createPassiveState(PASSIVE_CLASS_IDS.BERSERKER), berserkerPhase: 2 }
    };
    const result = resolvePassiveDefense({ attacker, defender, attackDamage: 5, defenseRoll: 4 });
    assert.equal(result.damage, 0);
    assert.equal(result.fullyDodged, true);
});

test('Evasivo only gains Ultra Impulso charge when normal defense leaves zero or one damage', () => {
    const attacker = { passiveState: createPassiveState('other') };
    const defender = {
        classData: { id: PASSIVE_CLASS_IDS.EVASIVO },
        evadeNums: [3, 4, 5],
        passiveState: createPassiveState(PASSIVE_CLASS_IDS.EVASIVO)
    };

    const twoDamage = resolvePassiveDefense({ attacker, defender, attackDamage: 5, defenseRoll: 3 });
    assert.equal(twoDamage.damage, 2);
    assert.equal(twoDamage.state.ultraCharges, 0);

    const oneDamage = resolvePassiveDefense({ attacker, defender, attackDamage: 5, defenseRoll: 4 });
    assert.equal(oneDamage.damage, 1);
    assert.equal(oneDamage.state.ultraCharges, 1);

    const zeroDamage = resolvePassiveDefense({
        attacker,
        defender: { ...defender, passiveState: { ...defender.passiveState, ultraCharges: 1 } },
        attackDamage: 5,
        defenseRoll: 5
    });
    assert.equal(zeroDamage.damage, 0);
    assert.equal(zeroDamage.state.ultraCharges, 2);
});

test('Ultra Impulso cannot activate from three stale charges without an unstoppable attack result', () => {
    const attacker = {
        classData: { id: PASSIVE_CLASS_IDS.EVASIVO },
        passiveState: { ...createPassiveState(PASSIVE_CLASS_IDS.EVASIVO), ultraCharges: 3 }
    };
    const defender = {
        classData: { id: PASSIVE_CLASS_IDS.MOVIL },
        evadeNums: [6],
        passiveState: createPassiveState(PASSIVE_CLASS_IDS.MOVIL)
    };
    const result = resolvePassiveDefense({
        attacker, defender, attackDamage: 4, defenseRoll: 6
    });
    assert.equal(result.damage, 0);
    assert.equal(result.state.shadowInvulnerableTurns, 2);
});
 
test('HP resolution clamps malformed HP and never heals from invalid damage', () => {
    assert.deepEqual(resolveHpAfterDamage({ currentHp: 20, maxHp: 10, damage: 3 }), {
        currentHp: 7, hpLost: 3, defeated: false
    });
    assert.deepEqual(resolveHpAfterDamage({ currentHp: -5, maxHp: 10, damage: 0 }), {
        currentHp: 0, hpLost: 0, defeated: true
    });
    assert.deepEqual(resolveHpAfterDamage({ currentHp: 10, maxHp: 10, damage: -50 }), {
        currentHp: 10, hpLost: 0, defeated: false
    });
    assert.deepEqual(resolveHpAfterDamage({ currentHp: 'invalid', maxHp: 10, damage: 2 }), {
        currentHp: 0, hpLost: 0, defeated: true
    });
});

test('Ultra Impulso selects one assigned attack face, adds one damage and consumes three charges', () => {
    const mit = { classData: { id: PASSIVE_CLASS_IDS.EVASIVO }, attackNums: [2, 5], passiveState: { ...createPassiveState(PASSIVE_CLASS_IDS.EVASIVO), ultraCharges: 3 } };
    const result = resolvePassiveAttack({ attacker: mit, roll: 1, random: () => 0.9 });
    assert.equal(result.hit, true);
    assert.equal(result.roll, 5);
    assert.equal(result.damage, 6);
    assert.equal(result.unstoppable, true);
    assert.equal(result.state.ultraCharges, 0);
});

test('Ultra Impulso bypasses evasion and invulnerability but still leaves target-specific damage rules downstream', () => {
    const attacker = { classData: { id: PASSIVE_CLASS_IDS.EVASIVO }, passiveState: { ...createPassiveState(PASSIVE_CLASS_IDS.EVASIVO), ultraCharges: 3 } };
    const defender = { classData: { id: PASSIVE_CLASS_IDS.MOVIL }, evadeNums: [6], passiveState: { ...createPassiveState(PASSIVE_CLASS_IDS.MOVIL), shadowInvulnerableTurns: 1 } };
    const result = resolvePassiveDefense({ attacker, defender, attackDamage: 6, defenseRoll: 6, unstoppable: true });
    assert.equal(result.damage, 6);
    assert.equal(result.shadowNullified, false);
});

test('Ultra Impulso charges after a successful assigned-face evade, including a complete nullification', () => {
    const attacker = { passiveState: createPassiveState('other') };
    const defender = {
        classData: { id: PASSIVE_CLASS_IDS.EVASIVO },
        evadeNums: [6],
        passiveState: { ...createPassiveState(PASSIVE_CLASS_IDS.EVASIVO), ultraCharges: 1 }
    };

    const blocked = resolvePassiveDefense({
        attacker, defender, attackDamage: 5, defenseRoll: 6
    });
    assert.equal(blocked.damage, 0);
    assert.equal(blocked.state.ultraCharges, 2);

    const damaged = resolvePassiveDefense({
        attacker, defender: {
            ...defender,
            passiveState: { ...defender.passiveState, ultraCharges: 1 }
        },
        attackDamage: 7, defenseRoll: 6
    });
    assert.equal(damaged.damage, 1);
    // Evasivo only charges when the normal defense result is 0 or 1 damage.
    assert.equal(damaged.state.ultraCharges, 2);

    const missedA = resolvePassiveDefense({
        attacker, defender: {
            ...defender,
            evadeNums: [5],
            passiveState: { ...defender.passiveState, ultraCharges: 1 }
        },
        attackDamage: 5, defenseRoll: 6
    });
    assert.equal(missedA.damage, 5);
    assert.equal(missedA.state.ultraCharges, 1);
});

test('Resetting Muralla progression never changes its HP', () => {
    const mit = {
        currentHp: 7,
        classData: { id: PASSIVE_CLASS_IDS.MURALLA },
        passiveState: { ...createPassiveState(PASSIVE_CLASS_IDS.MURALLA), murallaHits: 4 }
    };
    let state = mit.passiveState;
    for (let i = 0; i < 3; i++) {
        state = advancePassiveTurn({ ...mit, passiveState: state }, { opponentTurnEnded: true }).state;
    }
    assert.equal(state.murallaHits, 0);
    assert.equal(mit.currentHp, 7);
});

test('Sombra only activates after a complete dodge', () => {
    const attacker = { classData: { id: 'other' }, passiveState: createPassiveState('other') };
    const defender = { classData: { id: PASSIVE_CLASS_IDS.MOVIL }, evadeNums: [3, 6], passiveState: createPassiveState(PASSIVE_CLASS_IDS.MOVIL) };

    const partial = resolvePassiveDefense({ attacker, defender, attackDamage: 4, defenseRoll: 3 });
    assert.equal(partial.damage, 1);
    assert.equal(partial.state.shadowInvulnerableTurns, 0);
    assert.equal(partial.state.shadowCooldownTurns, 0);

    const complete = resolvePassiveDefense({
        attacker,
        defender: { ...defender, passiveState: createPassiveState(PASSIVE_CLASS_IDS.MOVIL) },
        attackDamage: 4,
        defenseRoll: 6
    });
    assert.equal(complete.damage, 0);
    assert.equal(complete.state.shadowInvulnerableTurns, 2);
    assert.equal(complete.state.shadowCooldownTurns, 2);
});

test('Adaptabilidad consumes two charges and prevents exactly two damage', () => {
    const attacker = { passiveState: createPassiveState('other') };
    const defender = { classData: { id: PASSIVE_CLASS_IDS.VERSATIL }, evadeNums: [], passiveState: { ...createPassiveState(PASSIVE_CLASS_IDS.VERSATIL), adaptabilityCharges: 2 } };
    const result = resolvePassiveDefense({ attacker, defender, attackDamage: 3, defenseRoll: 1 });
    assert.equal(result.damage, 1);
    assert.equal(result.state.adaptabilityCharges, 0);
});

test('Muralla progresses only after HP loss and reaches three points of reduction', () => {
    const mit = { classData: { id: PASSIVE_CLASS_IDS.MURALLA }, passiveState: { ...createPassiveState(PASSIVE_CLASS_IDS.MURALLA), murallaHits: 4 } };
    const result = applyPassiveDamageConsequences({ attacker: {}, defender: mit, hpLost: 1 });
    assert.equal(result.defenderState.murallaHits, 4);
    assert.equal(result.defenderState.murallaQuietTurns, 0);
});

test('Muralla loses progression after three opponent attack turns, not own turns', () => {
    let mit = { classData: { id: PASSIVE_CLASS_IDS.MURALLA }, passiveState: { ...createPassiveState(PASSIVE_CLASS_IDS.MURALLA), murallaHits: 3 } };
    mit = { ...mit, passiveState: advancePassiveTurn(mit, { ownTurnEnded: true }).state };
    assert.equal(mit.passiveState.murallaHits, 3);
    mit = { ...mit, passiveState: advancePassiveTurn(mit, { opponentTurnEnded: true }).state };
    assert.equal(mit.passiveState.murallaHits, 3);
    mit = { ...mit, passiveState: advancePassiveTurn(mit, { ownTurnEnded: true }).state };
    mit = { ...mit, passiveState: advancePassiveTurn(mit, { opponentTurnEnded: true }).state };
    assert.equal(mit.passiveState.murallaHits, 3);
    mit = { ...mit, passiveState: advancePassiveTurn(mit, { ownTurnEnded: true }).state };
    mit = { ...mit, passiveState: advancePassiveTurn(mit, { opponentTurnEnded: true }).state };
    assert.equal(mit.passiveState.murallaHits, 0);
});

test('Destructor grows only when it actually removes HP', () => {
    const attacker = { classData: { id: PASSIVE_CLASS_IDS.DESTRUCTOR }, passiveState: createPassiveState(PASSIVE_CLASS_IDS.DESTRUCTOR) };
    assert.equal(applyPassiveDamageConsequences({ attacker, defender: {}, hpLost: 0 }).attackerState.destructorBonus, 0);
    assert.equal(applyPassiveDamageConsequences({ attacker, defender: {}, hpLost: 1 }).attackerState.destructorBonus, 1);
});

test('Berserker transforms once with exactly one attack face and five evade faces', () => {
    const mit = { classData: { id: PASSIVE_CLASS_IDS.BERSERKER }, passiveState: createPassiveState(PASSIVE_CLASS_IDS.BERSERKER) };
    const phase2 = activateBerserkerSecondPhase(mit, [6], [1,2,3,4,5]);
    assert.equal(phase2.currentHp, 3);
    assert.equal(phase2.passiveState.berserkerPhase, 2);
    assert.equal(activateBerserkerSecondPhase(phase2, [1], [2,3,4,5,6]), null);
});

test('Berserker rejects overlapping or incomplete die distributions', () => {
    const mit = { classData: { id: PASSIVE_CLASS_IDS.BERSERKER }, passiveState: createPassiveState(PASSIVE_CLASS_IDS.BERSERKER) };
    assert.equal(activateBerserkerSecondPhase(mit, [1], [1,2,3,4,5]), null);
    assert.equal(activateBerserkerSecondPhase(mit, [1], [2,3,4]), null);
});

test('Berserker phase 2 fully negates any hit when its A face is rolled', () => {
    const attacker = {
        classData: { id: 'other' },
        passiveState: createPassiveState('other')
    };
    const defender = {
        classData: { id: PASSIVE_CLASS_IDS.BERSERKER },
        evadeNums: [1,2,3,4,5],
        passiveState: {
            ...createPassiveState(PASSIVE_CLASS_IDS.BERSERKER),
            berserkerPhase: 2
        }
    };

    const lowFace = resolvePassiveDefense({
        attacker, defender, attackDamage: 6, defenseRoll: 1
    });
    const highFace = resolvePassiveDefense({
        attacker, defender, attackDamage: 6, defenseRoll: 5
    });

    assert.equal(lowFace.damage, 0);
    assert.equal(highFace.damage, 0);
    assert.equal(lowFace.fullyDodged, true);
    assert.equal(highFace.fullyDodged, true);
});

test('Berserker phase 2 still receives damage when the rolled face is not A', () => {
    const attacker = {
        classData: { id: 'other' },
        passiveState: createPassiveState('other')
    };
    const defender = {
        classData: { id: PASSIVE_CLASS_IDS.BERSERKER },
        evadeNums: [1,2,3,4,5],
        passiveState: {
            ...createPassiveState(PASSIVE_CLASS_IDS.BERSERKER),
            berserkerPhase: 2
        }
    };

    const result = resolvePassiveDefense({
        attacker, defender, attackDamage: 6, defenseRoll: 6
    });

    assert.equal(result.damage, 6);
    assert.equal(result.fullyDodged, false);
});

test('Ultra Impulso bypasses Berserker phase 2 perfect evasion', () => {
    const attacker = {
        classData: { id: PASSIVE_CLASS_IDS.EVASIVO },
        passiveState: {
            ...createPassiveState(PASSIVE_CLASS_IDS.EVASIVO),
            ultraCharges: 3
        }
    };
    const defender = {
        classData: { id: PASSIVE_CLASS_IDS.BERSERKER },
        evadeNums: [1,2,3,4,5],
        passiveState: {
            ...createPassiveState(PASSIVE_CLASS_IDS.BERSERKER),
            berserkerPhase: 2
        }
    };

    const result = resolvePassiveDefense({
        attacker, defender, attackDamage: 6, defenseRoll: 5, unstoppable: true
    });

    assert.equal(result.damage, 6);
    assert.equal(result.fullyDodged, false);
});

test('Duelista only triggers from its own successful defense and reduces a blocked hit to zero or one', () => {
    const attacker = { passiveState: createPassiveState('other') };
    const defender = { classData: { id: PASSIVE_CLASS_IDS.DUELISTA }, passiveState: createPassiveState(PASSIVE_CLASS_IDS.DUELISTA), evadeNums: [6] };

    const blocked = resolvePassiveDefense({ attacker, defender, attackDamage: 3, defenseRoll: 6 });
    assert.equal(blocked.damage, 0);
    assert.equal(blocked.triggersCounter, true);

    const reduced = resolvePassiveDefense({ attacker, defender, attackDamage: 8, defenseRoll: 6 });
    assert.equal(reduced.damage, 1);
    assert.equal(reduced.triggersCounter, true);

    const failedDefense = resolvePassiveDefense({ attacker, defender, attackDamage: 1, defenseRoll: 1 });
    assert.equal(failedDefense.damage, 1);
    assert.equal(failedDefense.triggersCounter, false);
});


test('Technical attack bonus remains accumulated when the attack misses', () => {
    const mit = { classData: { id: PASSIVE_CLASS_IDS.TECNICO }, attackNums: [1], passiveState: { ...createPassiveState(PASSIVE_CLASS_IDS.TECNICO), technicalAttackBonus: true } };
    const result = resolvePassiveAttack({ attacker: mit, roll: 6 });
    assert.equal(result.hit, false);
    assert.equal(result.state.technicalAttackBonus, 1);
});

test('Technical attack charge is consumed after a successful hit', () => {
    const attacker = { classData: { id: PASSIVE_CLASS_IDS.TECNICO }, attackNums: [4], passiveState: { ...createPassiveState(PASSIVE_CLASS_IDS.TECNICO), technicalAttackBonus: 3 } };
    const result = resolvePassiveAttack({ attacker, roll: 4 });
    assert.equal(result.damage, 7);
    assert.equal(result.state.technicalAttackBonus, 0);
});

test('Technical defense charge is consumed after a successful defense action', () => {
    const attacker = { passiveState: createPassiveState('other') };
    const defender = { classData: { id: PASSIVE_CLASS_IDS.TECNICO }, evadeNums: [], passiveState: { ...createPassiveState(PASSIVE_CLASS_IDS.TECNICO), technicalDefenseBonus: 3 } };
    const result = resolvePassiveDefense({ attacker, defender, attackDamage: 4, defenseRoll: 1 });
    assert.equal(result.damage, 1);
    assert.equal(result.state.technicalDefenseBonus, 0);
});

test('Technical charges are not consumed by unsuccessful actions', () => {
    const attacker = { classData: { id: PASSIVE_CLASS_IDS.TECNICO }, attackNums: [4], passiveState: { ...createPassiveState(PASSIVE_CLASS_IDS.TECNICO), technicalAttackBonus: 3 } };
    const miss = resolvePassiveAttack({ attacker, roll: 6 });
    assert.equal(miss.state.technicalAttackBonus, 3);

    const defender = { classData: { id: PASSIVE_CLASS_IDS.TECNICO }, evadeNums: [], passiveState: { ...createPassiveState(PASSIVE_CLASS_IDS.TECNICO), technicalDefenseBonus: 3 } };
    const zeroDamage = resolvePassiveDefense({ attacker: { passiveState: createPassiveState('other') }, defender, attackDamage: 0, defenseRoll: 1 });
    assert.equal(zeroDamage.state.technicalDefenseBonus, 3);
});



test('Ultra Impulso respects Muralla vulnerability and reduction', () => {
    const attacker = { classData: { id: PASSIVE_CLASS_IDS.EVASIVO }, passiveState: { ...createPassiveState(PASSIVE_CLASS_IDS.EVASIVO), ultraCharges: 3 } };
    const defender = { classData: { id: PASSIVE_CLASS_IDS.MURALLA }, evadeNums: [], passiveState: { ...createPassiveState(PASSIVE_CLASS_IDS.MURALLA), murallaHits: 4 } };
    const result = resolvePassiveDefense({ attacker, defender, attackDamage: 6, defenseRoll: 1, unstoppable: true });
    assert.equal(result.damage, 3);
});

test('Sombra lasts two opponent turns and cooldown starts only after Sombra ends', () => {
    const mit = { classData: { id: PASSIVE_CLASS_IDS.MOVIL }, passiveState: { ...createPassiveState(PASSIVE_CLASS_IDS.MOVIL), shadowInvulnerableTurns: 2, shadowCooldownTurns: 2 } };
    let state = advancePassiveTurn(mit, { ownTurnEnded: true }).state;
    assert.equal(state.shadowInvulnerableTurns, 2);
    assert.equal(state.shadowCooldownTurns, 2);
    state = advancePassiveTurn({ ...mit, passiveState: state }, { opponentTurnEnded: true }).state;
    assert.equal(state.shadowInvulnerableTurns, 1);
    state = advancePassiveTurn({ ...mit, passiveState: state }, { ownTurnEnded: true }).state;
    assert.equal(state.shadowCooldownTurns, 2);
    state = advancePassiveTurn({ ...mit, passiveState: state }, { opponentTurnEnded: true }).state;
    assert.equal(state.shadowInvulnerableTurns, 0);
    state = advancePassiveTurn({ ...mit, passiveState: state }, { ownTurnEnded: true }).state;
    assert.equal(state.shadowCooldownTurns, 1);
    state = advancePassiveTurn({ ...mit, passiveState: state }, { ownTurnEnded: true }).state;
    assert.equal(state.shadowCooldownTurns, 0);
});

test('Sombra cannot reactivate during its own invulnerability window', () => {
    const attacker = { passiveState: createPassiveState('other') };
    const defender = {
        classData: { id: PASSIVE_CLASS_IDS.MOVIL },
        evadeNums: [6],
        passiveState: { ...createPassiveState(PASSIVE_CLASS_IDS.MOVIL), shadowInvulnerableTurns: 1, shadowCooldownTurns: 0 }
    };
    const result = resolvePassiveDefense({ attacker, defender, attackDamage: 6, defenseRoll: 6 });
    assert.equal(result.damage, 0);
    assert.equal(result.state.shadowInvulnerableTurns, 1);
    assert.equal(result.state.shadowCooldownTurns, 0);
});

test('Duelista counter cooldown expires after one opponent turn', () => {
    const mit = { classData: { id: PASSIVE_CLASS_IDS.DUELISTA }, passiveState: { ...createPassiveState(PASSIVE_CLASS_IDS.DUELISTA), counterCooldownTurns: 1 } };
    assert.equal(advancePassiveTurn(mit, { ownTurnEnded: true }).state.counterCooldownTurns, 1);
    assert.equal(advancePassiveTurn(mit, { opponentTurnEnded: true }).state.counterCooldownTurns, 0);
});

test('Muralla receives at least one damage even when its A face exceeds incoming damage', () => {
    const attacker = { passiveState: createPassiveState('other') };
    const defender = { classData: { id: PASSIVE_CLASS_IDS.MURALLA }, evadeNums: [6], passiveState: createPassiveState(PASSIVE_CLASS_IDS.MURALLA) };
    const result = resolvePassiveDefense({ attacker, defender, attackDamage: 2, defenseRoll: 6 });
    assert.equal(result.damage, 0);
});


test('Muralla does not count the turn in which it was damaged toward its decay', () => {
    const mit = { classData: { id: PASSIVE_CLASS_IDS.MURALLA }, passiveState: createPassiveState(PASSIVE_CLASS_IDS.MURALLA) };
    const consequence = applyPassiveDamageConsequences({ attacker: {}, defender: mit, hpLost: 1 });
    const afterDamageTurn = advancePassiveTurn({ ...mit, passiveState: consequence.defenderState }, { opponentTurnEnded: true }).state;
    assert.equal(afterDamageTurn.murallaQuietTurns, 0);
    assert.equal(afterDamageTurn.murallaDamagedThisTurn, false);
    let state = afterDamageTurn;
    for (let i = 0; i < 2; i++) state = advancePassiveTurn({ ...mit, passiveState: state }, { opponentTurnEnded: true }).state;
    assert.equal(state.murallaHits, 1);
    state = advancePassiveTurn({ ...mit, passiveState: state }, { opponentTurnEnded: true }).state;
    assert.equal(state.murallaHits, 0);
});


test('Destructor starts at one damage and adds its permanent accumulation', () => {
    const base = { classData: { id: PASSIVE_CLASS_IDS.DESTRUCTOR }, attackNums: [4], passiveState: createPassiveState(PASSIVE_CLASS_IDS.DESTRUCTOR) };
    assert.equal(resolvePassiveAttack({ attacker: base, roll: 4 }).damage, 1);
    const enraged = { ...base, passiveState: { ...base.passiveState, destructorBonus: 3 } };
    assert.equal(resolvePassiveAttack({ attacker: enraged, roll: 4 }).damage, 4);
});

test('Duelista counter chains can be explicitly suppressed for counterattacks', () => {
    const attacker = { passiveState: createPassiveState('other') };
    const defender = { classData: { id: PASSIVE_CLASS_IDS.DUELISTA }, evadeNums: [6], passiveState: createPassiveState(PASSIVE_CLASS_IDS.DUELISTA) };
    assert.equal(resolvePassiveDefense({ attacker, defender, attackDamage: 3, defenseRoll: 6, allowCounterTrigger: false }).triggersCounter, false);
});

test('Duelista first counterattack bypasses dice defense and invulnerability', () => {
    const attacker = { passiveState: createPassiveState(PASSIVE_CLASS_IDS.DUELISTA) };
    const defender = { classData: { id: PASSIVE_CLASS_IDS.MOVIL }, evadeNums: [6], passiveState: { ...createPassiveState(PASSIVE_CLASS_IDS.MOVIL), shadowInvulnerableTurns: 1 } };
    const result = resolvePassiveDefense({ attacker, defender, attackDamage: 3, forceHit: true, allowCounterTrigger: false });
    assert.equal(result.damage, 3);
    assert.equal(result.shadowNullified, false);
});


test('Adaptabilidad can reduce the last point of damage to zero and consumes its charges', () => {
    const attacker = { passiveState: createPassiveState('other') };
    const defender = { classData: { id: PASSIVE_CLASS_IDS.VERSATIL }, evadeNums: [], passiveState: { ...createPassiveState(PASSIVE_CLASS_IDS.VERSATIL), adaptabilityCharges: 2 } };
    const result = resolvePassiveDefense({ attacker, defender, attackDamage: 2, defenseRoll: 6 });
    assert.equal(result.damage, 0);
    assert.equal(result.state.adaptabilityCharges, 0);
});

test('Ultra Impulso still respects Versatil damage protection', () => {
    const attacker = {
        classData: { id: PASSIVE_CLASS_IDS.EVASIVO },
        passiveState: { ...createPassiveState(PASSIVE_CLASS_IDS.EVASIVO), ultraCharges: 0 }
    };
    const defender = {
        classData: { id: PASSIVE_CLASS_IDS.VERSATIL },
        evadeNums: [],
        passiveState: { ...createPassiveState(PASSIVE_CLASS_IDS.VERSATIL), adaptabilityCharges: 2 }
    };
    const result = resolvePassiveDefense({
        attacker, defender, attackDamage: 5, defenseRoll: 1, unstoppable: true
    });
    assert.equal(result.damage, 3);
    assert.equal(result.state.adaptabilityCharges, 0);
});

test('Ultra Impulso still applies Technical defense and consumes it', () => {
    const attacker = { classData: { id: PASSIVE_CLASS_IDS.EVASIVO }, passiveState: { ...createPassiveState(PASSIVE_CLASS_IDS.EVASIVO), ultraCharges: 3 } };
    const defender = { classData: { id: PASSIVE_CLASS_IDS.TECNICO }, evadeNums: [], passiveState: { ...createPassiveState(PASSIVE_CLASS_IDS.TECNICO), technicalDefenseBonus: true } };
    const result = resolvePassiveDefense({ attacker, defender, attackDamage: 5, defenseRoll: 1, unstoppable: true });
    assert.equal(result.damage, 4);
    assert.equal(result.state.technicalDefenseBonus, 0);
});


test('Berserker cleanse removes rival charges and temporary effects but preserves permanent Destructor damage and Berserker phase', () => {
    const mit = {
        classData: { id: PASSIVE_CLASS_IDS.DESTRUCTOR },
        passiveState: {
            ...createPassiveState(PASSIVE_CLASS_IDS.DESTRUCTOR),
            ultraCharges: 2,
            shadowInvulnerableTurns: 1,
            shadowCooldownTurns: 1,
            technicalAttackBonus: true,
            technicalDefenseBonus: true,
            adaptabilityCharges: 2,
            murallaHits: 3,
            murallaQuietTurns: 2,
            murallaDamagedThisTurn: true,
            counterCooldownTurns: 1,
            counterSequence: { phase: 'FIRST' },
            destructorBonus: 7,
            berserkerPhase: 2
        }
    };
    const clean = clearTemporaryPassiveEffects(mit);
    assert.equal(clean.passiveState.ultraCharges, 0);
    assert.equal(clean.passiveState.shadowInvulnerableTurns, 0);
    assert.equal(clean.passiveState.technicalAttackBonus, 0);
    assert.equal(clean.passiveState.adaptabilityCharges, 0);
    assert.equal(clean.passiveState.murallaHits, 0);
    assert.equal(clean.passiveState.counterSequence, null);
    assert.equal(clean.passiveState.destructorBonus, 7);
    assert.equal(clean.passiveState.berserkerPhase, 2);
});



test('Berserker phase-two faces are normalized before uniqueness is checked', () => {
    const berserker = {
        classData: { id: PASSIVE_CLASS_IDS.BERSERKER },
        passiveState: createPassiveState(PASSIVE_CLASS_IDS.BERSERKER)
    };
    assert.equal(
        activateBerserkerSecondPhase(berserker, ['1'], [1, 2, 3, 4, 5]),
        null
    );
    const valid = activateBerserkerSecondPhase(berserker, ['1'], ['2', '3', '4', '5', '6']);
    assert.deepEqual(valid.attackNums, [1]);
    assert.deepEqual(valid.evadeNums, [2, 3, 4, 5, 6]);
});

test('corrupted passive counters do not coerce booleans or null into charges', () => {
    const mit = {
        classData: { id: PASSIVE_CLASS_IDS.EVASIVO },
        passiveState: { ultraCharges: true, destructorBonus: null, murallaHits: false }
    };
    const state = normalizePassiveState(mit);
    assert.equal(state.ultraCharges, 0);
    assert.equal(state.destructorBonus, 0);
    assert.equal(state.murallaHits, 0);
});

test('Ultra Impulso cannot turn an invalid attack distribution into NaN damage', () => {
    const mit = {
        classData: { id: PASSIVE_CLASS_IDS.EVASIVO },
        attackNums: [0, 7],
        passiveState: { ...createPassiveState(PASSIVE_CLASS_IDS.EVASIVO), ultraCharges: 3 }
    };
    const result = resolvePassiveAttack({ attacker: mit, roll: NaN });
    assert.equal(result.hit, false);
    assert.equal(result.damage, 0);
    assert.equal(result.unstoppable, false);
    assert.equal(result.state.ultraCharges, 3);
});

test('Duelista forced first counterattack bypasses passive damage reductions', () => {
    const attacker = { passiveState: createPassiveState('other') };
    const muralla = {
        classData: { id: PASSIVE_CLASS_IDS.MURALLA },
        passiveState: { ...createPassiveState(PASSIVE_CLASS_IDS.MURALLA), murallaHits: 4 }
    };
    const result = resolvePassiveDefense({
        attacker, defender: muralla, attackDamage: 5, forceHit: true, allowCounterTrigger: false
    });
    assert.equal(result.damage, 5);
    assert.equal(result.state.murallaHits, 4);

    const versatil = {
        classData: { id: PASSIVE_CLASS_IDS.VERSATIL },
        passiveState: { ...createPassiveState(PASSIVE_CLASS_IDS.VERSATIL), adaptabilityCharges: 2 }
    };
    const protectedResult = resolvePassiveDefense({
        attacker, defender: versatil, attackDamage: 5, forceHit: true, allowCounterTrigger: false
    });
    assert.equal(protectedResult.damage, 5);
    assert.equal(protectedResult.state.adaptabilityCharges, 2);
});

test('non-finite incoming damage is clamped instead of reaching HP resolution', () => {
    assert.deepEqual(
        resolveDefense({ attackDamage: Infinity, defenseRoll: 2, evadeNums: [2] }),
        { isEvadeNumber: true, finalDamageTaken: 0 }
    );
});


test('Ultra Impulso bypasses Duelista counter-trigger defenses even for a one-point hit', () => {
    const attacker = {
        classData: { id: PASSIVE_CLASS_IDS.EVASIVO },
        passiveState: createPassiveState(PASSIVE_CLASS_IDS.EVASIVO)
    };
    const defender = {
        classData: { id: PASSIVE_CLASS_IDS.DUELISTA },
        passiveState: createPassiveState(PASSIVE_CLASS_IDS.DUELISTA)
    };
    const result = resolvePassiveDefense({
        attacker, defender, attackDamage: 1, defenseRoll: 1, unstoppable: true
    });
    assert.equal(result.damage, 1);
    assert.equal(result.triggersCounter, false);
});


test('Muralla scales impact damage as +1, neutral, then reduction up to three', () => {
    const expectedDamage = [6, 5, 4, 3, 2];
    for (let hits = 0; hits <= 4; hits++) {
        const defender = {
            classData: { id: PASSIVE_CLASS_IDS.MURALLA },
            evadeNums: [],
            passiveState: { ...createPassiveState(PASSIVE_CLASS_IDS.MURALLA), murallaHits: hits }
        };
        const result = resolvePassiveDefense({
            attacker: {},
            defender,
            attackDamage: 5,
            defenseRoll: 6
        });
        assert.equal(result.damage, expectedDamage[hits], `murallaHits=${hits}`);
    }
});


test('fractional damage is rejected instead of reaching the HP system', () => {
    assert.deepEqual(
        resolveDefense({ attackDamage: 2.5, defenseRoll: 1, evadeNums: [1] }),
        { isEvadeNumber: true, finalDamageTaken: 0 }
    );
});

test('a malformed reserve HP value is not treated as a living MIT', () => {
    assert.equal(
        findAvailableMitIndex([{ currentHp: 10 }, { currentHp: true }], 0),
        null
    );
    assert.equal(
        findAvailableMitIndex([{ currentHp: 10 }, { currentHp: '2.5' }], 0),
        null
    );
});

test('random generators that return non-numbers or throw are safely neutralized', () => {
    const mit = { classData: { id: PASSIVE_CLASS_IDS.TECNICO }, passiveState: createPassiveState(PASSIVE_CLASS_IDS.TECNICO) };
    const result = beginPassiveAttackTurn(mit, () => { throw new Error('broken random source'); });
    assert.equal(result.state.technicalAttackBonus, 1);
    assert.equal(result.state.technicalDefenseBonus, 1);
});

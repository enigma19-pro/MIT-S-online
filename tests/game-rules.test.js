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


const {
    PASSIVE_CLASS_IDS, createPassiveState, normalizePassiveState, beginPassiveAttackTurn,
    resolvePassiveAttack, resolvePassiveDefense, applyPassiveDamageConsequences,
    advancePassiveTurn, activateBerserkerSecondPhase, clearTemporaryPassiveEffects
} = require('../game-rules.js');

test('passive state starts with clean counters and independent Technical slots', () => {
    const state = createPassiveState(PASSIVE_CLASS_IDS.TECNICO);
    assert.equal(state.technicalAttackBonus, false);
    assert.equal(state.technicalDefenseBonus, false);
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
    assert.equal(result.state.technicalAttackBonus, false);
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

test('Technical has a 50 percent proc followed by a 50/50 bonus type', () => {
    const mit = { classData: { id: PASSIVE_CLASS_IDS.TECNICO }, passiveState: createPassiveState(PASSIVE_CLASS_IDS.TECNICO) };
    const result = beginPassiveAttackTurn(mit, () => 0.1);
    assert.equal(result.state.technicalAttackBonus, true);
    assert.equal(result.state.technicalDefenseBonus, false);
});

test('Technical can store one attack and one defense bonus independently', () => {
    const mit = { classData: { id: PASSIVE_CLASS_IDS.TECNICO }, passiveState: { ...createPassiveState(PASSIVE_CLASS_IDS.TECNICO), technicalDefenseBonus: true } };
    const result = beginPassiveAttackTurn(mit, (() => { const values = [0.1, 0.1]; return () => values.shift(); })());
    assert.equal(result.state.technicalAttackBonus, true);
    assert.equal(result.state.technicalDefenseBonus, true);
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
    const result = resolvePassiveDefense({ attacker, defender, attackDamage: 6, defenseRoll: 6 });
    assert.equal(result.damage, 6);
    assert.equal(result.shadowNullified, false);
});

test('Ultra Impulso only charges after a complete assigned-face dodge', () => {
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
    // A partial reduction is not a complete dodge, so Ultra Impulso does not charge.
    assert.equal(damaged.state.ultraCharges, 1);

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
        state = advancePassiveTurn({ ...mit, passiveState: state }).state;
    }
    assert.equal(state.murallaHits, 0);
    assert.equal(mit.currentHp, 7);
});

test('Sombra nullifies a normal hit and activates its one-turn shield', () => {
    const attacker = { classData: { id: 'other' }, passiveState: createPassiveState('other') };
    const defender = { classData: { id: PASSIVE_CLASS_IDS.MOVIL }, evadeNums: [6], passiveState: createPassiveState(PASSIVE_CLASS_IDS.MOVIL) };
    const result = resolvePassiveDefense({ attacker, defender, attackDamage: 4, defenseRoll: 6 });
    assert.equal(result.damage, 0);
    assert.equal(result.state.shadowInvulnerableTurns, 2);
    assert.equal(result.state.shadowCooldownTurns, 1);
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

test('Muralla loses progression after three quiet turns', () => {
    let mit = { classData: { id: PASSIVE_CLASS_IDS.MURALLA }, passiveState: { ...createPassiveState(PASSIVE_CLASS_IDS.MURALLA), murallaHits: 3 } };
    mit = { ...mit, passiveState: advancePassiveTurn(mit).state };
    mit = { ...mit, passiveState: advancePassiveTurn(mit).state };
    mit = { ...mit, passiveState: advancePassiveTurn(mit).state };
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

test('Duelista counter triggers only when it receives zero or one damage', () => {
    const attacker = { passiveState: createPassiveState('other') };
    const defender = { classData: { id: PASSIVE_CLASS_IDS.DUELISTA }, passiveState: createPassiveState(PASSIVE_CLASS_IDS.DUELISTA), evadeNums: [6] };
    assert.equal(resolvePassiveDefense({ attacker, defender, attackDamage: 3, defenseRoll: 6 }).triggersCounter, true);
    assert.equal(resolvePassiveDefense({ attacker, defender, attackDamage: 3, defenseRoll: 1 }).triggersCounter, false);
});


test('Technical attack bonus is consumed even when the attack misses', () => {
    const mit = { classData: { id: PASSIVE_CLASS_IDS.TECNICO }, attackNums: [1], passiveState: { ...createPassiveState(PASSIVE_CLASS_IDS.TECNICO), technicalAttackBonus: true } };
    const result = resolvePassiveAttack({ attacker: mit, roll: 6 });
    assert.equal(result.hit, false);
    assert.equal(result.state.technicalAttackBonus, false);
});

test('Technical defense bonus is consumed after defense and cannot reduce damage below one', () => {
    const attacker = { passiveState: createPassiveState('other') };
    const defender = { classData: { id: PASSIVE_CLASS_IDS.TECNICO }, evadeNums: [], passiveState: { ...createPassiveState(PASSIVE_CLASS_IDS.TECNICO), technicalDefenseBonus: true } };
    const result = resolvePassiveDefense({ attacker, defender, attackDamage: 1, defenseRoll: 1 });
    assert.equal(result.damage, 1);
    assert.equal(result.state.technicalDefenseBonus, false);
});

test('Ultra Impulso still applies Muralla vulnerability but ignores its reduction', () => {
    const attacker = { classData: { id: PASSIVE_CLASS_IDS.EVASIVO }, passiveState: { ...createPassiveState(PASSIVE_CLASS_IDS.EVASIVO), ultraCharges: 3 } };
    const defender = { classData: { id: PASSIVE_CLASS_IDS.MURALLA }, evadeNums: [], passiveState: { ...createPassiveState(PASSIVE_CLASS_IDS.MURALLA), murallaHits: 4 } };
    const result = resolvePassiveDefense({ attacker, defender, attackDamage: 6, defenseRoll: 1, unstoppable: true });
    assert.equal(result.damage, 6);
});

test('Sombra duration and cooldown tick on the correct players turns', () => {
    const mit = { classData: { id: PASSIVE_CLASS_IDS.MOVIL }, passiveState: { ...createPassiveState(PASSIVE_CLASS_IDS.MOVIL), shadowInvulnerableTurns: 2, shadowCooldownTurns: 1 } };
    let state = advancePassiveTurn(mit, { opponentTurnEnded: true }).state;
    assert.equal(state.shadowInvulnerableTurns, 1);
    assert.equal(state.shadowCooldownTurns, 1);
    state = advancePassiveTurn({ ...mit, passiveState: state }, { ownTurnEnded: true }).state;
    assert.equal(state.shadowInvulnerableTurns, 1);
    assert.equal(state.shadowCooldownTurns, 0);
    state = advancePassiveTurn({ ...mit, passiveState: state }, { opponentTurnEnded: true }).state;
    assert.equal(state.shadowInvulnerableTurns, 0);
});

test('Duelista counter cooldown expires after one opponent turn', () => {
    const mit = { classData: { id: PASSIVE_CLASS_IDS.DUELISTA }, passiveState: { ...createPassiveState(PASSIVE_CLASS_IDS.DUELISTA), counterCooldownTurns: 1 } };
    assert.equal(advancePassiveTurn(mit, { ownTurnEnded: true }).state.counterCooldownTurns, 1);
    assert.equal(advancePassiveTurn(mit, { opponentTurnEnded: true }).state.counterCooldownTurns, 0);
});

test('Muralla does not add vulnerability to a fully dodged zero-damage attack', () => {
    const attacker = { passiveState: createPassiveState('other') };
    const defender = { classData: { id: PASSIVE_CLASS_IDS.MURALLA }, evadeNums: [6], passiveState: createPassiveState(PASSIVE_CLASS_IDS.MURALLA) };
    const result = resolvePassiveDefense({ attacker, defender, attackDamage: 2, defenseRoll: 6 });
    assert.equal(result.damage, 0);
});


test('Muralla does not count the turn in which it was damaged toward its decay', () => {
    const mit = { classData: { id: PASSIVE_CLASS_IDS.MURALLA }, passiveState: createPassiveState(PASSIVE_CLASS_IDS.MURALLA) };
    const consequence = applyPassiveDamageConsequences({ attacker: {}, defender: mit, hpLost: 1 });
    const afterDamageTurn = advancePassiveTurn({ ...mit, passiveState: consequence.defenderState }).state;
    assert.equal(afterDamageTurn.murallaQuietTurns, 0);
    assert.equal(afterDamageTurn.murallaDamagedThisTurn, false);
    let state = afterDamageTurn;
    for (let i = 0; i < 2; i++) state = advancePassiveTurn({ ...mit, passiveState: state }).state;
    assert.equal(state.murallaHits, 1);
    state = advancePassiveTurn({ ...mit, passiveState: state }).state;
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


test('Adaptabilidad keeps its charges if a dodge already nullified all damage', () => {
    const attacker = { passiveState: createPassiveState('other') };
    const defender = { classData: { id: PASSIVE_CLASS_IDS.VERSATIL }, evadeNums: [6], passiveState: { ...createPassiveState(PASSIVE_CLASS_IDS.VERSATIL), adaptabilityCharges: 2 } };
    const result = resolvePassiveDefense({ attacker, defender, attackDamage: 2, defenseRoll: 6 });
    assert.equal(result.damage, 0);
    assert.equal(result.state.adaptabilityCharges, 2);
});

test('Ultra Impulso consumes Technical defense bonus without allowing its reduction', () => {
    const attacker = { classData: { id: PASSIVE_CLASS_IDS.EVASIVO }, passiveState: { ...createPassiveState(PASSIVE_CLASS_IDS.EVASIVO), ultraCharges: 3 } };
    const defender = { classData: { id: PASSIVE_CLASS_IDS.TECNICO }, evadeNums: [], passiveState: { ...createPassiveState(PASSIVE_CLASS_IDS.TECNICO), technicalDefenseBonus: true } };
    const result = resolvePassiveDefense({ attacker, defender, attackDamage: 5, defenseRoll: 1, unstoppable: true });
    assert.equal(result.damage, 5);
    assert.equal(result.state.technicalDefenseBonus, false);
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
    assert.equal(clean.passiveState.technicalAttackBonus, false);
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

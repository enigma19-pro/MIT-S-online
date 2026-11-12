(function (root, factory) {
    const rules = factory();

    if (typeof module === 'object' && module.exports) {
        module.exports = rules;
    }

    if (root) {
        root.MITSGameRules = rules;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    // Accept numeric values and numeric strings, but never coerce booleans,
    // null, arrays, or objects into die faces.
    function parseDieFace(value) {
        if (typeof value !== 'number' && typeof value !== 'string') return null;
        if (typeof value === 'string' && value.trim() === '') return null;

        const number = Number(value);
        return Number.isInteger(number) && number >= 1 && number <= 6
            ? number
            : null;
    }

    function isSuccessfulAttack(attackNums, roll) {
        const rolledNumber = parseDieFace(roll);

        if (!Array.isArray(attackNums) || rolledNumber === null) {
            return false;
        }

        return attackNums.some(number => parseDieFace(number) === rolledNumber);
    }

    function resolveDefense({ attackDamage, defenseRoll, evadeNums } = {}) {
        const rawDamage = (
            typeof attackDamage === 'number' ||
            (typeof attackDamage === 'string' && attackDamage.trim() !== '')
        ) ? Number(attackDamage) : NaN;
        const damage = Number.isFinite(rawDamage) ? Math.max(0, rawDamage) : 0;
        const roll = parseDieFace(defenseRoll);
        const evadeNumbers = Array.isArray(evadeNums)
            ? evadeNums.map(parseDieFace).filter(number => number !== null)
            : [];
        const isEvadeNumber = roll !== null && evadeNumbers.includes(roll);

        return {
            isEvadeNumber,
            finalDamageTaken: isEvadeNumber ? Math.max(0, damage - roll) : damage
        };
    }

    function findAvailableMitIndex(mits, activeIndex) {
        if (!Array.isArray(mits) || !Number.isInteger(activeIndex) ||
            activeIndex < 0 || activeIndex >= mits.length) {
            return null;
        }

        const availableIndex = mits.findIndex((mit, index) => {
            if (index === activeIndex || !mit || typeof mit !== 'object') return false;
            const hp = Number(mit.currentHp);
            return Number.isFinite(hp) && hp > 0;
        });

        return availableIndex === -1 ? null : availableIndex;
    }

    function resolveMitDefeat({ defeatedPlayer, hasReserve } = {}) {
        const player = (
            typeof defeatedPlayer === 'number' ||
            (typeof defeatedPlayer === 'string' && defeatedPlayer.trim() !== '')
        ) ? Number(defeatedPlayer) : NaN;

        if ((player !== 1 && player !== 2) || typeof hasReserve !== 'boolean') return null;

        if (hasReserve) {
            return {
                isGameOver: false,
                winner: null,
                nextPlayer: player
            };
        }

        return {
            isGameOver: true,
            winner: player === 1 ? 2 : 1,
            nextPlayer: null
        };
    }


    const PASSIVE_CLASS_IDS = Object.freeze({
        EVASIVO: 'Agil1', MOVIL: 'Agil2', TECNICO: 'Normal1',
        VERSATIL: 'Normal2', BERSERKER: 'Resistente1', MURALLA: 'Resistente2',
        DESTRUCTOR: 'Dano1', DUELISTA: 'Dano2'
    });

    function createPassiveState(classId) {
        return {
            passiveClassId: classId || null,
            ultraCharges: 0,
            shadowInvulnerableTurns: 0,
            shadowCooldownTurns: 0,
            technicalAttackBonus: false,
            technicalDefenseBonus: false,
            adaptabilityCharges: 0,
            berserkerPhase: 1,
            murallaHits: 0,
            murallaQuietTurns: 0,
            murallaDamagedThisTurn: false,
            destructorBonus: 0,
            counterCooldownTurns: 0,
            counterSequence: null
        };
    }

    function passiveState(mit) {
        const defaults = createPassiveState(mit?.classData?.id);
        return { ...defaults, ...(mit?.passiveState || {}) };
    }

    function beginPassiveAttackTurn(mit, random = Math.random) {
        const state = passiveState(mit);
        const next = { ...state };
        const events = [];
        if (state.passiveClassId === PASSIVE_CLASS_IDS.TECNICO && random() < 0.5) {
            const type = random() < 0.5 ? 'attack' : 'defense';
            const key = type === 'attack' ? 'technicalAttackBonus' : 'technicalDefenseBonus';
            if (!next[key]) {
                next[key] = true;
                events.push(type === 'attack' ? 'Técnico guardó Ataque +1' : 'Técnico guardó Defensa +1');
            }
        }
        return { state: next, events };
    }

    function resolvePassiveAttack({ attacker, roll, random = Math.random } = {}) {
        const state = passiveState(attacker);
        const faces = Array.isArray(attacker?.attackNums) ? attacker.attackNums : [];
        const ultra = state.passiveClassId === PASSIVE_CLASS_IDS.EVASIVO && state.ultraCharges >= 3;
        const selectedRoll = ultra && faces.length
            ? faces[Math.floor(random() * faces.length)]
            : roll;
        const hit = ultra || isSuccessfulAttack(faces, selectedRoll);
        let damage = hit ? Number(selectedRoll) : 0;
        const events = [];
        const next = { ...state };
        if (ultra) {
            damage += 1;
            next.ultraCharges = 0;
            events.push('Ultra Impulso activado');
        }
        if (state.passiveClassId === PASSIVE_CLASS_IDS.TECNICO && next.technicalAttackBonus) {
            if (hit) damage += 1;
            next.technicalAttackBonus = false;
            events.push(hit ? 'Técnico consumió Ataque +1' : 'Técnico perdió Ataque +1 tras fallar');
        }
        if (hit && state.passiveClassId === PASSIVE_CLASS_IDS.DESTRUCTOR) {
            damage = 1 + Math.max(0, Number(state.destructorBonus) || 0);
        }
        return { hit, roll: selectedRoll, damage, state: next, events, unstoppable: ultra };
    }

    function resolvePassiveDefense({ attacker, defender, attackDamage, defenseRoll, unstoppable = false, allowCounterTrigger = true, forceHit = false, random = Math.random } = {}) {
        const attackState = passiveState(attacker);
        const state = passiveState(defender);
        const events = [];
        const isUltra = unstoppable || (attackState.passiveClassId === PASSIVE_CLASS_IDS.EVASIVO && attackState.ultraCharges >= 3);
        const shadow = state.passiveClassId === PASSIVE_CLASS_IDS.MOVIL && state.shadowInvulnerableTurns > 0 && !isUltra && !forceHit;
        const base = resolveDefense({
            attackDamage,
            defenseRoll,
            evadeNums: isUltra || shadow || forceHit ? [] : defender?.evadeNums
        });
        let damage = isUltra ? Math.max(0, Number(attackDamage) || 0) : (shadow ? 0 : base.finalDamageTaken);
        let next = { ...state };
        let fullyDodged = !isUltra && (shadow || (base.isEvadeNumber && damage === 0));
        if (shadow) events.push('Sombra anuló el ataque');
        if (isUltra) events.push('Ultra Impulso ignoró defensas y estados de evasión');
        if (!shadow && damage > 0 && state.passiveClassId === PASSIVE_CLASS_IDS.MURALLA) {
            const vulnerability = state.murallaHits === 0 ? 2 : state.murallaHits === 1 ? 1 : 0;
            const reduction = isUltra ? 0 : Math.min(3, Math.max(0, state.murallaHits - 1));
            damage = Math.max(0, damage + vulnerability - reduction);
        }
        if (!isUltra && !shadow && damage > 0 && state.passiveClassId === PASSIVE_CLASS_IDS.VERSATIL && state.adaptabilityCharges >= 2) {
            damage = Math.max(0, damage - 2);
            next.adaptabilityCharges = 0;
            events.push('Adaptabilidad consumió 2 cargas y redujo 2 de daño');
        }
        if (!forceHit && state.passiveClassId === PASSIVE_CLASS_IDS.TECNICO && next.technicalDefenseBonus) {
            if (!isUltra && !shadow && damage > 0) damage = Math.max(1, damage - 1);
            next.technicalDefenseBonus = false;
            events.push(isUltra ? 'Técnico consumió Defensa +1 (ignorada por Ultra Impulso)' : 'Técnico consumió Defensa +1');
        }
        if (fullyDodged && state.passiveClassId === PASSIVE_CLASS_IDS.EVASIVO) {
            next.ultraCharges = Math.min(3, state.ultraCharges + 1);
            events.push(`Ultra Impulso: ${next.ultraCharges}/3 cargas`);
        }
        if (fullyDodged && state.passiveClassId === PASSIVE_CLASS_IDS.MOVIL && state.shadowCooldownTurns <= 0) {
            next.shadowInvulnerableTurns = 2;
            next.shadowCooldownTurns = 1;
            events.push('Sombra activada: invulnerable durante el próximo turno rival');
        }
        const triggersCounter = allowCounterTrigger && state.passiveClassId === PASSIVE_CLASS_IDS.DUELISTA &&
            !state.counterSequence && state.counterCooldownTurns <= 0 && damage <= 1;
        return {
            damage, fullyDodged, isEvadeNumber: base.isEvadeNumber,
            state: next, events, triggersCounter,
            shadowNullified: shadow,
            attackerState: attackState
        };
    }

    function applyPassiveDamageConsequences({ attacker, defender, damage, hpLost, fullyDodged, shadowNullified } = {}) {
        const attackerState = passiveState(attacker);
        const defenderState = passiveState(defender);
        const nextAttacker = { ...attackerState };
        const nextDefender = { ...defenderState };
        const events = [];
        const actualLoss = Math.max(0, Number(hpLost) || 0);
        if (actualLoss > 0 && attackerState.passiveClassId === PASSIVE_CLASS_IDS.DESTRUCTOR && !shadowNullified) {
            nextAttacker.destructorBonus = Math.max(0, Number(attackerState.destructorBonus) || 0) + 1;
            events.push(`Enfurecimiento: daño permanente +${nextAttacker.destructorBonus}`);
        }
        if (actualLoss > 0 && defenderState.passiveClassId === PASSIVE_CLASS_IDS.VERSATIL) {
            nextDefender.adaptabilityCharges = Math.min(2, defenderState.adaptabilityCharges + 1);
            events.push(`Adaptabilidad: ${nextDefender.adaptabilityCharges}/2 cargas`);
        }
        if (actualLoss > 0 && defenderState.passiveClassId === PASSIVE_CLASS_IDS.MURALLA) {
            nextDefender.murallaHits = Math.min(4, defenderState.murallaHits + 1);
            nextDefender.murallaQuietTurns = 0;
            nextDefender.murallaDamagedThisTurn = true;
            events.push(`Revestimiento: ${nextDefender.murallaHits}/4 impactos`);
        }
        if (actualLoss === 0 && fullyDodged && defenderState.passiveClassId === PASSIVE_CLASS_IDS.EVASIVO) {
            // The dodge charge is awarded in resolvePassiveDefense.
        }
        return { attackerState: nextAttacker, defenderState: nextDefender, events };
    }

    function advancePassiveTurn(mit, { tookDamage = false, opponentTurnEnded = false, ownTurnEnded = false } = {}) {
        const state = passiveState(mit);
        const next = { ...state };
        const events = [];
        if (state.passiveClassId === PASSIVE_CLASS_IDS.MURALLA) {
            if (tookDamage || state.murallaDamagedThisTurn) {
                next.murallaQuietTurns = 0;
                next.murallaDamagedThisTurn = false;
            } else {
                next.murallaQuietTurns = Math.max(0, state.murallaQuietTurns) + 1;
                if (next.murallaQuietTurns >= 3 && state.murallaHits > 0) {
                    next.murallaHits = 0;
                    next.murallaQuietTurns = 0;
                    events.push('Revestimiento perdió su progreso por 3 turnos sin recibir daño');
                }
            }
        }
        if (opponentTurnEnded && state.shadowInvulnerableTurns > 0) next.shadowInvulnerableTurns = Math.max(0, state.shadowInvulnerableTurns - 1);
        if (ownTurnEnded && state.shadowCooldownTurns > 0) next.shadowCooldownTurns = Math.max(0, state.shadowCooldownTurns - 1);
        if (opponentTurnEnded && state.counterCooldownTurns > 0) next.counterCooldownTurns = Math.max(0, state.counterCooldownTurns - 1);
        return { state: next, events };
    }

    function clearTemporaryPassiveEffects(mit) {
        const state = passiveState(mit);
        return {
            ...mit,
            passiveState: {
                ...state,
                ultraCharges: 0,
                shadowInvulnerableTurns: 0,
                shadowCooldownTurns: 0,
                technicalAttackBonus: false,
                technicalDefenseBonus: false,
                adaptabilityCharges: 0,
                murallaHits: 0,
                murallaQuietTurns: 0,
                murallaDamagedThisTurn: false,
                counterCooldownTurns: 0,
                counterSequence: null
            }
        };
    }

    function activateBerserkerSecondPhase(mit, attackNums, evadeNums) {
        const state = passiveState(mit);
        if (state.passiveClassId !== PASSIVE_CLASS_IDS.BERSERKER || state.berserkerPhase !== 1) return null;
        if (!Array.isArray(attackNums) || attackNums.length !== 1 ||
            !Array.isArray(evadeNums) || evadeNums.length !== 5) return null;
        const all = [...attackNums, ...evadeNums];
        if (new Set(all).size !== 6 || all.some(face => parseDieFace(face) === null)) return null;
        return {
            ...mit,
            name: 'MIT Berserker · Fase 2',
            maxHp: 3,
            currentHp: 3,
            attackNums: [...attackNums],
            evadeNums: [...evadeNums],
            classData: { ...(mit.classData || {}), hp: 3, d: 1, a: 5 },
            passiveState: { ...state, berserkerPhase: 2, ultraCharges: 0,
                shadowInvulnerableTurns: 0, technicalAttackBonus: false,
                technicalDefenseBonus: false, adaptabilityCharges: 0,
                murallaHits: 0, murallaQuietTurns: 0, murallaDamagedThisTurn: false, destructorBonus: 0,
                counterCooldownTurns: 0, counterSequence: null }
        };
    }

    return Object.freeze({
        isSuccessfulAttack,
        resolveDefense,
        findAvailableMitIndex,
        resolveMitDefeat,
        PASSIVE_CLASS_IDS,
        createPassiveState,
        beginPassiveAttackTurn,
        resolvePassiveAttack,
        resolvePassiveDefense,
        applyPassiveDamageConsequences,
        advancePassiveTurn,
        clearTemporaryPassiveEffects,
        activateBerserkerSecondPhase
    });
}));

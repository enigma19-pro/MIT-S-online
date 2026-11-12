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

    function parseDamage(value) {
        if (typeof value !== 'number' && typeof value !== 'string') return 0;
        if (typeof value === 'string' && value.trim() === '') return 0;
        const number = Number(value);
        return Number.isSafeInteger(number)
            ? Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, number))
            : 0;
    }

    function resolveDefense({ attackDamage, defenseRoll, evadeNums } = {}) {
        const damage = parseDamage(attackDamage);
        const roll = parseDieFace(defenseRoll);
        const evadeNumbers = Array.isArray(evadeNums)
            ? evadeNums.map(parseDieFace).filter(number => number !== null)
            : [];
        const isEvadeNumber = roll !== null && evadeNumbers.includes(roll);

        return {
            isEvadeNumber,
            finalDamageTaken: isEvadeNumber && damage > 0 ? Math.max(0, damage - roll) : damage
        };
    }

    function findAvailableMitIndex(mits, activeIndex) {
        if (!Array.isArray(mits) || !Number.isInteger(activeIndex) ||
            activeIndex < 0 || activeIndex >= mits.length) {
            return null;
        }

        const availableIndex = mits.findIndex((mit, index) => {
            if (index === activeIndex || !mit || typeof mit !== 'object') return false;
            const rawHp = mit.currentHp;
            if (typeof rawHp !== 'number' && typeof rawHp !== 'string') return false;
            if (typeof rawHp === 'string' && rawHp.trim() === '') return false;
            const hp = Number(rawHp);
            return Number.isSafeInteger(hp) && hp > 0;
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
            technicalAttackBonus: 0,
            technicalDefenseBonus: 0,
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

    function safeRandom(random) {
        let value;
        try {
            value = typeof random === 'function' ? random() : 0.5;
        } catch (error) {
            return 0.5;
        }
        if (typeof value !== 'number' || !Number.isFinite(value)) return 0.5;
        return Math.min(1 - Number.EPSILON, Math.max(0, value));
    }

    function safeCounter(value, min, max, fallback = min) {
        if (typeof value !== 'number' && typeof value !== 'string') return fallback;
        if (typeof value === 'string' && value.trim() === '') return fallback;
        const number = Number(value);
        if (!Number.isSafeInteger(number)) return fallback;
        return Math.min(max, Math.max(min, number));
    }

    function passiveState(mit) {
        const raw = mit?.passiveState && typeof mit.passiveState === 'object'
            ? mit.passiveState
            : {};
        const classId = mit?.classData?.id || raw.passiveClassId || null;
        const defaults = createPassiveState(classId);
        const phase = raw.counterSequence?.phase;
        const rawOpponentPlayer = raw.counterSequence?.opponentPlayer;
        const opponentPlayer = (
            typeof rawOpponentPlayer === 'number' ||
            (typeof rawOpponentPlayer === 'string' && rawOpponentPlayer.trim() !== '')
        ) ? Number(rawOpponentPlayer) : NaN;
        const counterSequence = (phase === 'FIRST' || phase === 'SECOND')
            ? {
                phase,
                ...(opponentPlayer === 1 || opponentPlayer === 2 ? { opponentPlayer } : {})
            }
            : null;

        return {
            ...defaults,
            passiveClassId: classId,
            ultraCharges: safeCounter(raw.ultraCharges, 0, 3),
            shadowInvulnerableTurns: safeCounter(raw.shadowInvulnerableTurns, 0, 2),
            shadowCooldownTurns: safeCounter(raw.shadowCooldownTurns, 0, 1),
            technicalAttackBonus: raw.technicalAttackBonus === true ? 1 : safeCounter(raw.technicalAttackBonus, 0, 3),
            technicalDefenseBonus: raw.technicalDefenseBonus === true ? 1 : safeCounter(raw.technicalDefenseBonus, 0, 3),
            adaptabilityCharges: safeCounter(raw.adaptabilityCharges, 0, 2),
            berserkerPhase: raw.berserkerPhase === 2 ? 2 : 1,
            murallaHits: safeCounter(raw.murallaHits, 0, 4),
            murallaQuietTurns: safeCounter(raw.murallaQuietTurns, 0, 3),
            murallaDamagedThisTurn: raw.murallaDamagedThisTurn === true,
            destructorBonus: safeCounter(raw.destructorBonus, 0, Number.MAX_SAFE_INTEGER - 1),
            counterCooldownTurns: safeCounter(raw.counterCooldownTurns, 0, 1),
            counterSequence
        };
    }

    function beginPassiveAttackTurn(mit, random = Math.random) {
        const state = passiveState(mit);
        const next = { ...state };
        const events = [];
        if (state.passiveClassId === PASSIVE_CLASS_IDS.TECNICO) {
            next.technicalAttackBonus = Math.min(3, state.technicalAttackBonus + 1);
            next.technicalDefenseBonus = Math.min(3, state.technicalDefenseBonus + 1);
            if (next.technicalAttackBonus > state.technicalAttackBonus) events.push(`Técnico acumuló Ataque +1 (${next.technicalAttackBonus}/3)`);
            if (next.technicalDefenseBonus > state.technicalDefenseBonus) events.push(`Técnico acumuló Defensa +1 (${next.technicalDefenseBonus}/3)`);
        }
        return { state: next, events };
    }

    function resolvePassiveAttack({ attacker, roll, random = Math.random } = {}) {
        const state = passiveState(attacker);
        const faces = Array.isArray(attacker?.attackNums)
            ? attacker.attackNums.map(parseDieFace).filter(face => face !== null)
            : [];
        // Ultra Impulso solo puede activarse si conserva al menos una cara D
        // válida. Nunca convierte una distribución corrupta en un golpe NaN.
        const ultra = state.passiveClassId === PASSIVE_CLASS_IDS.EVASIVO &&
            state.ultraCharges >= 3 && faces.length > 0;
        const selectedRoll = ultra
            ? faces[Math.floor(safeRandom(random) * faces.length)]
            : parseDieFace(roll);
        const hit = ultra || isSuccessfulAttack(faces, selectedRoll);
        let damage = hit && selectedRoll !== null ? selectedRoll : 0;
        const events = [];
        const next = { ...state };
        if (ultra) {
            damage += 1;
            next.ultraCharges = 0;
            events.push('Ultra Impulso activado');
        }
        if (state.passiveClassId === PASSIVE_CLASS_IDS.TECNICO && next.technicalAttackBonus > 0) {
            const bonus = next.technicalAttackBonus;
            if (hit) {
                damage += bonus;
                events.push(`Técnico aplicó Ataque +${bonus}`);
            }
        }
        if (hit && state.passiveClassId === PASSIVE_CLASS_IDS.DESTRUCTOR) {
            const bonus = safeCounter(state.destructorBonus, 0, Number.MAX_SAFE_INTEGER - 1);
            damage = Math.min(Number.MAX_SAFE_INTEGER, 1 + bonus);
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
        const rawAttackDamage = parseDamage(attackDamage);
        const berserkerPhaseTwoDodge = !isUltra && !shadow && !forceHit
            && state.passiveClassId === PASSIVE_CLASS_IDS.BERSERKER
            && state.berserkerPhase === 2
            && base.isEvadeNumber
            && rawAttackDamage > 0;
        let damage = isUltra
            ? rawAttackDamage
            : shadow
                ? 0
                : berserkerPhaseTwoDodge
                    ? 0
                    : base.finalDamageTaken;
        let next = { ...state };
        if (berserkerPhaseTwoDodge) {
            events.push('Berserker Fase 2: esquive perfecto');
        }
        // Ultra Impulso only charges from a real, complete die-based dodge:
        // the defender must actually roll an assigned A face and reduce a
        // positive incoming hit to zero. Invulnerability is not a dodge.
        // Una cara A exitosa reduce el daño, pero nunca lo anula por completo.
        // La anulación total pertenece exclusivamente al Berserker en Fase 2.
        const successfulEvade = !isUltra && !shadow && !forceHit &&
            base.isEvadeNumber && rawAttackDamage > 0;
        const fullyDodged = berserkerPhaseTwoDodge;
        if (shadow) events.push('Sombra anuló el ataque');
        if (isUltra) events.push('Ultra Impulso ignoró defensas y estados de evasión');
        if (!forceHit && !shadow && damage > 0 && state.passiveClassId === PASSIVE_CLASS_IDS.MURALLA) {
            // La primera recepción añade +1; la segunda queda neutra.
            // Desde el tercer impacto se resta 1 por escalón, hasta un máximo de 3.
            const vulnerability = state.murallaHits === 0 ? 1 : 0;
            const reduction = isUltra ? 0 : Math.min(3, Math.max(0, state.murallaHits - 1));
            damage = Math.max(0, damage + vulnerability - reduction);
        }
        if (!forceHit && !isUltra && !shadow && damage > 0 && state.passiveClassId === PASSIVE_CLASS_IDS.VERSATIL && state.adaptabilityCharges >= 2) {
            damage = Math.max(0, damage - 2);
            next.adaptabilityCharges = 0;
            events.push('Adaptabilidad consumió 2 cargas y redujo 2 de daño');
        }
        if (!forceHit && state.passiveClassId === PASSIVE_CLASS_IDS.TECNICO && next.technicalDefenseBonus > 0) {
            const bonus = next.technicalDefenseBonus;
            if (!isUltra && !shadow && damage > 0) {
                damage = Math.max(1, damage - bonus);
                events.push(`Técnico aplicó Defensa +${bonus}`);
            } else if (isUltra) {
                events.push(`Técnico conserva Defensa +${bonus} (ignorada por Ultra Impulso)`);
            }
        }
        // Evasivo uses the normal damage calculation. It only gains a charge
        // when that normal calculation leaves it with 0 or 1 damage.
        const evasivoChargeEligible = successfulEvade &&
            state.passiveClassId === PASSIVE_CLASS_IDS.EVASIVO &&
            base.finalDamageTaken <= 1;
        if (evasivoChargeEligible) {
            next.ultraCharges = Math.min(3, Math.max(0, Number(state.ultraCharges) || 0) + 1);
            events.push(`Ultra Impulso: ${next.ultraCharges}/3 cargas`);
        }
        if (successfulEvade && state.passiveClassId === PASSIVE_CLASS_IDS.MOVIL && state.shadowCooldownTurns <= 0) {
            next.shadowInvulnerableTurns = 2;
            next.shadowCooldownTurns = 1;
            events.push('Sombra activada: invulnerable durante el próximo turno rival');
        }
        // Ultra Impulso no puede activar una defensa de contraataque:
        // el primer golpe del Duelista tampoco puede encadenar otra secuencia.
        const triggersCounter = allowCounterTrigger && !isUltra && !forceHit &&
            state.passiveClassId === PASSIVE_CLASS_IDS.DUELISTA &&
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
        const actualLoss = parseDamage(hpLost);
        if (actualLoss > 0 && attackerState.passiveClassId === PASSIVE_CLASS_IDS.DESTRUCTOR && !shadowNullified) {
            nextAttacker.destructorBonus = Math.min(
                Number.MAX_SAFE_INTEGER - 1,
                safeCounter(attackerState.destructorBonus, 0, Number.MAX_SAFE_INTEGER - 1) + 1
            );
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
                technicalAttackBonus: 0,
                technicalDefenseBonus: 0,
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
        const normalizedAttackNums = attackNums.map(parseDieFace);
        const normalizedEvadeNums = evadeNums.map(parseDieFace);
        const all = [...normalizedAttackNums, ...normalizedEvadeNums];
        if (all.some(face => face === null) || new Set(all).size !== 6) return null;
        return {
            ...mit,
            name: 'MIT Berserker · Fase 2',
            maxHp: 3,
            currentHp: 3,
            attackNums: normalizedAttackNums,
            evadeNums: normalizedEvadeNums,
            classData: { ...(mit.classData || {}), hp: 3, d: 1, a: 5 },
            passiveState: { ...state, berserkerPhase: 2, ultraCharges: 0,
                shadowInvulnerableTurns: 0, technicalAttackBonus: 0,
                technicalDefenseBonus: 0, adaptabilityCharges: 0,
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
        normalizePassiveState: passiveState,
        beginPassiveAttackTurn,
        resolvePassiveAttack,
        resolvePassiveDefense,
        applyPassiveDamageConsequences,
        advancePassiveTurn,
        clearTemporaryPassiveEffects,
        activateBerserkerSecondPhase
    });
}));

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

    function resolveHpAfterDamage({ currentHp, maxHp, damage } = {}) {
        const safeMaxHp = safeCounter(maxHp, 0, Number.MAX_SAFE_INTEGER);
        const rawHp = (typeof currentHp === 'number' || typeof currentHp === 'string')
            ? Number(currentHp)
            : NaN;
        const normalizedHp = Number.isSafeInteger(rawHp)
            ? Math.min(safeMaxHp, Math.max(0, rawHp))
            : 0;
        const safeDamage = parseDamage(damage);
        const nextHp = Math.max(0, normalizedHp - safeDamage);
        return {
            currentHp: nextHp,
            hpLost: normalizedHp - nextHp,
            defeated: nextHp === 0
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

    const ACTIVE_ABILITY_IDS = Object.freeze({
        EVASIVO: 'vector_fantasma', MOVIL: 'impulso_cinetico',
        TECNICO: 'reescritura_parametros', VERSATIL: 'cambio_protocolo',
        BERSERKER: 'sobrecarga', MURALLA: 'anclaje',
        DESTRUCTOR: 'ruptura', DUELISTA: 'replica'
    });

    const ACTIVE_ABILITY_NAMES = Object.freeze({
        vector_fantasma: 'Vector Fantasma',
        impulso_cinetico: 'Impulso Cinético',
        reescritura_parametros: 'Reescritura de Parámetros',
        cambio_protocolo: 'Cambio de Protocolo',
        sobrecarga: 'Sobrecarga',
        anclaje: 'Anclaje',
        ruptura: 'Ruptura',
        replica: 'Réplica'
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
            counterSequence: null,
            activeAbilityReady: null,
            activeAbilityInProgress: null,
            activeAbilityCooldownTurns: 0,
            activeLastRollType: null,
            activeAttackBonus: 0,
            activeDamageReduction: 0,
            activeIncomingRisk: 0,
            activePierce: 0,
            activeChain: 0,
            activeChainPendingEnd: false,
            activeCounterBonus: 0,
            versatileSwap: null
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
            shadowCooldownTurns: safeCounter(raw.shadowCooldownTurns, 0, 2),
            technicalAttackBonus: raw.technicalAttackBonus === true ? 1 : safeCounter(raw.technicalAttackBonus, 0, 3),
            technicalDefenseBonus: raw.technicalDefenseBonus === true ? 1 : safeCounter(raw.technicalDefenseBonus, 0, 3),
            adaptabilityCharges: safeCounter(raw.adaptabilityCharges, 0, 2),
            berserkerPhase: raw.berserkerPhase === 2 ? 2 : 1,
            murallaHits: safeCounter(raw.murallaHits, 0, 4),
            murallaQuietTurns: safeCounter(raw.murallaQuietTurns, 0, 3),
            murallaDamagedThisTurn: raw.murallaDamagedThisTurn === true,
            destructorBonus: safeCounter(raw.destructorBonus, 0, Number.MAX_SAFE_INTEGER - 1),
            counterCooldownTurns: safeCounter(raw.counterCooldownTurns, 0, 1),
            counterSequence,
            activeAbilityReady: isExpectedActiveAbility(classId, raw.activeAbilityReady) ? raw.activeAbilityReady : null,
            activeAbilityInProgress: isExpectedActiveAbility(classId, raw.activeAbilityInProgress) ? raw.activeAbilityInProgress : null,
            activeAbilityCooldownTurns: safeCounter(raw.activeAbilityCooldownTurns, 0, 2),
            activeLastRollType: raw.activeLastRollType === 'D' || raw.activeLastRollType === 'A' ? raw.activeLastRollType : null,
            activeAttackBonus: safeCounter(raw.activeAttackBonus, 0, 20),
            activeDamageReduction: safeCounter(raw.activeDamageReduction, 0, 20),
            activeIncomingRisk: safeCounter(raw.activeIncomingRisk, 0, 20),
            activePierce: safeCounter(raw.activePierce, 0, 6),
            activeChain: safeCounter(raw.activeChain, 0, 1),
            activeChainPendingEnd: raw.activeChainPendingEnd === true,
            activeCounterBonus: safeCounter(raw.activeCounterBonus, 0, 20),
            versatileSwap: normalizeVersatileSwap(raw.versatileSwap)
        };
    }

    function activeAbilityForClass(classId) {
        const key = Object.keys(PASSIVE_CLASS_IDS).find(name => PASSIVE_CLASS_IDS[name] === classId);
        return key ? ACTIVE_ABILITY_IDS[key] : null;
    }

    function isExpectedActiveAbility(classId, value) {
        return !!value && value === activeAbilityForClass(classId);
    }

    function normalizeVersatileSwap(raw) {
        if (!raw || typeof raw !== 'object') return null;
        const parseFaces = values => Array.isArray(values) ? values.map(parseDieFace).filter(value => value !== null) : [];
        const originalAttackNums = parseFaces(raw.originalAttackNums);
        const originalEvadeNums = parseFaces(raw.originalEvadeNums);
        const all = [...originalAttackNums, ...originalEvadeNums];
        const remainingRolls = safeCounter(raw.remainingRolls, 0, 2);
        if (originalAttackNums.length < 1 || originalEvadeNums.length < 1 ||
            all.length !== 6 || new Set(all).size !== 6 || remainingRolls < 1) return null;
        return { originalAttackNums, originalEvadeNums, remainingRolls };
    }

    function grantActiveAbility(state, events) {
        const abilityId = activeAbilityForClass(state.passiveClassId);
        if (!abilityId || state.activeAbilityReady || state.activeAbilityInProgress ||
            state.activeAbilityCooldownTurns > 0) return false;
        state.activeAbilityReady = abilityId;
        if (Array.isArray(events)) events.push(`${ACTIVE_ABILITY_NAMES[abilityId]}: oportunidad disponible`);
        return true;
    }

    function registerVersatileRoll(state, mit, roll, events) {
        if (state.passiveClassId !== PASSIVE_CLASS_IDS.VERSATIL) return;
        const face = parseDieFace(roll);
        if (face === null) return;
        const attackFaces = Array.isArray(mit?.attackNums) ? mit.attackNums.map(parseDieFace) : [];
        const evadeFaces = Array.isArray(mit?.evadeNums) ? mit.evadeNums.map(parseDieFace) : [];
        const type = evadeFaces.includes(face) ? 'A' : attackFaces.includes(face) ? 'D' : null;
        if (!type) return;
        if (state.activeLastRollType && state.activeLastRollType !== type) {
            grantActiveAbility(state, events);
        }
        state.activeLastRollType = type;
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
        if (!ultra) registerVersatileRoll(next, attacker, roll, events);
        if (!ultra && hit && next.passiveClassId === PASSIVE_CLASS_IDS.TECNICO &&
            faces.length > 0 && selectedRoll === Math.max(...faces)) {
            grantActiveAbility(next, events);
        }
        const currentHp = Number(attacker?.currentHp);
        const maxHp = Number(attacker?.maxHp);
        if (!ultra && hit && next.passiveClassId === PASSIVE_CLASS_IDS.BERSERKER &&
            Number.isFinite(currentHp) && Number.isFinite(maxHp) && maxHp > 0 &&
            currentHp <= maxHp / 2) {
            grantActiveAbility(next, events);
        }
        if (ultra) {
            damage += 1;
            next.ultraCharges = 0;
            events.push('Ultra Impulso activado');
        }
        if (state.passiveClassId === PASSIVE_CLASS_IDS.TECNICO && next.technicalAttackBonus > 0 && hit) {
            const bonus = next.technicalAttackBonus;
            damage += bonus;
            next.technicalAttackBonus = 0;
            events.push(`Técnico aplicó Ataque +${bonus} y gastó sus cargas`);
        }
        if (hit && next.passiveClassId === PASSIVE_CLASS_IDS.DESTRUCTOR) {
            const bonus = safeCounter(next.destructorBonus, 0, Number.MAX_SAFE_INTEGER - 1);
            damage = Math.min(Number.MAX_SAFE_INTEGER, 1 + bonus);
        }
        if (hit && next.activeAttackBonus > 0) {
            damage = Math.min(Number.MAX_SAFE_INTEGER, damage + next.activeAttackBonus);
            events.push(`Habilidad activa: Ataque +${next.activeAttackBonus}`);
            next.activeAttackBonus = 0;
        }
        if (hit && next.counterSequence?.phase === 'FIRST' && next.activeCounterBonus > 0) {
            damage = Math.min(Number.MAX_SAFE_INTEGER, damage + next.activeCounterBonus);
            events.push(`Réplica: contraataque +${next.activeCounterBonus}`);
            next.activeCounterBonus = 0;
        }
        if (hit && next.activeChain > 0) {
            next.activeChain = 0;
            next.activeChainPendingEnd = true;
            events.push('Impulso Cinético: turno adicional preparado');
        }
        return { hit, roll: selectedRoll, damage, state: next, events, unstoppable: ultra };
    }

    function resolvePassiveDefense({ attacker, defender, attackDamage, defenseRoll, unstoppable = false, allowCounterTrigger = true, forceHit = false, random = Math.random } = {}) {
        const attackState = passiveState(attacker);
        const state = passiveState(defender);
        const events = [];
        const nextAttacker = { ...attackState };
        const next = { ...state };
        if (!forceHit) registerVersatileRoll(next, defender, defenseRoll, events);
        const isUltra = unstoppable === true;
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
        const duelistaDefense = !isUltra && !shadow && !forceHit
            && state.passiveClassId === PASSIVE_CLASS_IDS.DUELISTA
            && base.isEvadeNumber
            && rawAttackDamage > 0;
        let normalDamage = isUltra
            ? rawAttackDamage
            : shadow
                ? 0
                : berserkerPhaseTwoDodge
                    ? 0
                    : base.finalDamageTaken;
        if (!isUltra && !shadow && !forceHit && !berserkerPhaseTwoDodge &&
            base.isEvadeNumber && nextAttacker.activePierce > 0) {
            const face = parseDieFace(defenseRoll);
            normalDamage = Math.max(0, rawAttackDamage - Math.max(0, face - nextAttacker.activePierce));
            events.push(`Ruptura atravesó ${nextAttacker.activePierce} puntos de esquive`);
            nextAttacker.activePierce = 0;
        }
        let damage = duelistaDefense ? Math.min(1, normalDamage) : normalDamage;
        if (berserkerPhaseTwoDodge) {
            events.push('Berserker Fase 2: esquive perfecto');
        }
        // Ultra Impulso only charges from a real, complete die-based dodge:
        // the defender must actually roll an assigned A face and reduce a
        // positive incoming hit to zero. Invulnerability is not a dodge.
        // Evasivo, Móvil y las demás clases usan la fórmula normal de defensa.
        // La anulación total especial e independiente del valor de A pertenece
        // exclusivamente al Berserker en Fase 2.
        const successfulEvade = !isUltra && !shadow && !forceHit &&
            base.isEvadeNumber && rawAttackDamage > 0;
        const fullyDodged = berserkerPhaseTwoDodge;
        if (shadow) events.push('Sombra anuló el ataque');
        if (isUltra) events.push('Ultra Impulso ignoró defensas y estados de evasión');
        if (!forceHit && !shadow && damage > 0 && state.passiveClassId === PASSIVE_CLASS_IDS.MURALLA) {
            // La primera recepción añade +1; la segunda queda neutra.
            // Desde el tercer impacto se resta 1 por escalón, hasta un máximo de 3.
            const vulnerability = state.murallaHits === 0 ? 1 : 0;
            const reduction = Math.min(3, Math.max(0, state.murallaHits - 1));
            damage = Math.max(0, damage + vulnerability - reduction);
        }
        if (!forceHit && !shadow && damage > 0 && state.passiveClassId === PASSIVE_CLASS_IDS.VERSATIL && state.adaptabilityCharges >= 2) {
            damage = Math.max(0, damage - 2);
            next.adaptabilityCharges = 0;
            events.push('Adaptabilidad consumió 2 cargas y redujo 2 de daño');
        }
        if (!forceHit && state.passiveClassId === PASSIVE_CLASS_IDS.TECNICO && next.technicalDefenseBonus > 0) {
            const bonus = next.technicalDefenseBonus;
            if (!shadow && damage > 0) {
                damage = Math.max(0, damage - bonus);
                next.technicalDefenseBonus = 0;
                events.push(`Técnico aplicó Defensa +${bonus} y gastó sus cargas`);
            }
        }
        if (!forceHit && !shadow && damage > 0 && next.activeDamageReduction > 0) {
            const reduction = next.activeDamageReduction;
            damage = Math.max(0, damage - reduction);
            next.activeDamageReduction = 0;
            events.push(`Habilidad activa: Anclaje/reestructuración redujo ${reduction} de daño`);
        }
        if (!forceHit && !shadow && damage > 0 && next.activeIncomingRisk > 0) {
            const risk = next.activeIncomingRisk;
            damage = Math.min(Number.MAX_SAFE_INTEGER, damage + risk);
            next.activeIncomingRisk = 0;
            events.push(`Sobrecarga: el impacto aumentó ${risk} de daño`);
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
        if (successfulEvade && state.passiveClassId === PASSIVE_CLASS_IDS.MOVIL && damage === 0 && state.shadowCooldownTurns <= 0) {
            next.shadowInvulnerableTurns = 2;
            next.shadowCooldownTurns = 2;
            events.push('Sombra activada: invulnerable durante 2 turnos rivales; el cooldown de 2 turnos propios empezará al terminar Sombra');
        }
        if (successfulEvade && state.passiveClassId === PASSIVE_CLASS_IDS.EVASIVO && damage <= 1) {
            grantActiveAbility(next, events);
        }
        if (successfulEvade && state.passiveClassId === PASSIVE_CLASS_IDS.MOVIL && damage === 0) {
            grantActiveAbility(next, events);
        }
        // Ultra Impulso no puede activar una defensa de contraataque:
        // el primer golpe del Duelista tampoco puede encadenar otra secuencia.
        const triggersCounter = allowCounterTrigger && !isUltra && !forceHit &&
            state.passiveClassId === PASSIVE_CLASS_IDS.DUELISTA &&
            duelistaDefense && !state.counterSequence && state.counterCooldownTurns <= 0 && damage <= 1;
        if (triggersCounter) grantActiveAbility(next, events);
        return {
            damage, fullyDodged, isEvadeNumber: base.isEvadeNumber,
            state: next, events, triggersCounter,
            shadowNullified: shadow,
            attackerState: nextAttacker
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
            grantActiveAbility(nextAttacker, events);
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
            grantActiveAbility(nextDefender, events);
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
            // El desgaste de Muralla se mide en turnos de ataque del rival,
            // no en cada cambio de turno. Así, el turno propio de Muralla
            // nunca consume uno de sus 3 turnos de tolerancia.
            if (opponentTurnEnded) {
                if (tookDamage || state.murallaDamagedThisTurn) {
                    next.murallaQuietTurns = 0;
                } else {
                    next.murallaQuietTurns = Math.max(0, state.murallaQuietTurns) + 1;
                    if (next.murallaQuietTurns >= 3 && state.murallaHits > 0) {
                        next.murallaHits = 0;
                        next.murallaQuietTurns = 0;
                        events.push('Revestimiento perdió su progreso por 3 turnos de ataque rival sin recibir daño');
                    }
                }
                next.murallaDamagedThisTurn = false;
            } else if (tookDamage) {
                // Conserva la marca hasta que termine el turno de ataque rival.
                next.murallaDamagedThisTurn = true;
                next.murallaQuietTurns = 0;
            }
        }
        if (opponentTurnEnded && state.shadowInvulnerableTurns > 0) next.shadowInvulnerableTurns = Math.max(0, state.shadowInvulnerableTurns - 1);
        if (ownTurnEnded && state.shadowInvulnerableTurns <= 0 && state.shadowCooldownTurns > 0) next.shadowCooldownTurns = Math.max(0, state.shadowCooldownTurns - 1);
        if (opponentTurnEnded && state.counterCooldownTurns > 0) next.counterCooldownTurns = Math.max(0, state.counterCooldownTurns - 1);
        if (ownTurnEnded && state.activeAbilityCooldownTurns > 0) next.activeAbilityCooldownTurns = Math.max(0, state.activeAbilityCooldownTurns - 1);
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
                counterSequence: null,
                activeAbilityReady: null,
                activeAbilityInProgress: null,
                activeAbilityCooldownTurns: 0,
                activeLastRollType: null,
                activeAttackBonus: 0,
                activeDamageReduction: 0,
                activeIncomingRisk: 0,
                activePierce: 0,
                activeChain: 0,
                activeChainPendingEnd: false,
                activeCounterBonus: 0,
                versatileSwap: null
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


    function beginActiveAbility(mit) {
        const state = passiveState(mit);
        if (!state.activeAbilityReady || state.activeAbilityCooldownTurns > 0 || state.activeAbilityInProgress) return null;
        return { ...mit, passiveState: { ...state, activeAbilityInProgress: state.activeAbilityReady, activeAbilityReady: null } };
    }

    function declineActiveAbility(mit) {
        const state = passiveState(mit);
        if (!state.activeAbilityReady) return mit;
        return { ...mit, passiveState: { ...state, activeAbilityReady: null } };
    }

    function completeActiveAbility(mit, result, choice = null) {
        const state = passiveState(mit);
        const abilityId = state.activeAbilityInProgress;
        if (!abilityId || !['perfecto', 'parcial', 'fallo'].includes(result)) return { ok: false, mit, events: [] };
        const next = { ...state, activeAbilityInProgress: null, activeAbilityCooldownTurns: 2 };
        const amount = result === 'perfecto' ? 2 : result === 'parcial' ? 1 : 0;
        const events = [];
        if (result === 'fallo') {
            events.push(`${ACTIVE_ABILITY_NAMES[abilityId]}: oportunidad perdida`);
            return { ok: true, mit: { ...mit, passiveState: next }, events };
        }

        if (abilityId === ACTIVE_ABILITY_IDS.EVASIVO) {
            next.activeAttackBonus = Math.min(20, next.activeAttackBonus + amount);
        } else if (abilityId === ACTIVE_ABILITY_IDS.MOVIL) {
            if (result === 'perfecto') next.activeChain = 1;
            else next.activeAttackBonus = Math.min(20, next.activeAttackBonus + 1);
        } else if (abilityId === ACTIVE_ABILITY_IDS.TECNICO) {
            if (choice?.kind === 'attack') next.activeAttackBonus = Math.min(20, next.activeAttackBonus + amount);
            else if (choice?.kind === 'defense') next.activeDamageReduction = Math.min(20, next.activeDamageReduction + amount);
            else return { ok: false, mit, events: [] };
        } else if (abilityId === ACTIVE_ABILITY_IDS.VERSATIL) {
            const attackNums = Array.isArray(mit.attackNums) ? mit.attackNums.map(parseDieFace).filter(face => face !== null) : [];
            const evadeNums = Array.isArray(mit.evadeNums) ? mit.evadeNums.map(parseDieFace).filter(face => face !== null) : [];
            const dFace = parseDieFace(choice?.dFace);
            const aFace = parseDieFace(choice?.aFace);
            const all = [...attackNums, ...evadeNums];
            if (!attackNums.includes(dFace) || !evadeNums.includes(aFace) || all.length !== 6 || new Set(all).size !== 6) {
                return { ok: false, mit, events: [] };
            }
            next.versatileSwap = {
                originalAttackNums: [...attackNums],
                originalEvadeNums: [...evadeNums],
                remainingRolls: result === 'perfecto' ? 2 : 1
            };
            mit = {
                ...mit,
                attackNums: attackNums.filter(face => face !== dFace).concat(aFace).sort((a,b) => a-b),
                evadeNums: evadeNums.filter(face => face !== aFace).concat(dFace).sort((a,b) => a-b)
            };
        } else if (abilityId === ACTIVE_ABILITY_IDS.BERSERKER) {
            next.activeAttackBonus = Math.min(20, next.activeAttackBonus + (result === 'perfecto' ? 3 : 1));
            if (result === 'perfecto') next.activeIncomingRisk = Math.min(20, next.activeIncomingRisk + 2);
        } else if (abilityId === ACTIVE_ABILITY_IDS.MURALLA) {
            next.activeDamageReduction = Math.min(20, next.activeDamageReduction + amount);
        } else if (abilityId === ACTIVE_ABILITY_IDS.DESTRUCTOR) {
            next.activePierce = Math.min(6, next.activePierce + amount);
        } else if (abilityId === ACTIVE_ABILITY_IDS.DUELISTA) {
            next.activeCounterBonus = Math.min(20, next.activeCounterBonus + amount);
        }
        events.push(`${ACTIVE_ABILITY_NAMES[abilityId]} ejecutada · ${result === 'perfecto' ? 'resultado perfecto' : 'resultado parcial'}`);
        return { ok: true, mit: { ...mit, passiveState: next }, events };
    }

    function consumeActiveAbilityRoll(mit) {
        const state = passiveState(mit);
        const swap = state.versatileSwap;
        if (!swap) return mit;
        if (swap.remainingRolls > 1) {
            return { ...mit, passiveState: { ...state, versatileSwap: { ...swap, remainingRolls: swap.remainingRolls - 1 } } };
        }
        return {
            ...mit,
            attackNums: [...swap.originalAttackNums],
            evadeNums: [...swap.originalEvadeNums],
            passiveState: { ...state, versatileSwap: null }
        };
    }

    return Object.freeze({
        isSuccessfulAttack,
        resolveDefense,
        resolveHpAfterDamage,
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
        activateBerserkerSecondPhase,
        ACTIVE_ABILITY_IDS,
        ACTIVE_ABILITY_NAMES,
        beginActiveAbility,
        declineActiveAbility,
        completeActiveAbility,
        consumeActiveAbilityRoll
    });
}));

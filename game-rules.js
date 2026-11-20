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
            activeAbilityAvailable: false,
            activeAbilityUsed: false,
            activeAbilityResolved: false,
            activeAbilityInProgress: false,
            activeAttackBonus: 0,
            activeDefenseReduction: 0,
            activeIncomingDamageBonus: 0,
            activeAttackReroll: false,
            activeCounterBonus: 0,
            activeLastSuccessfulAction: null,
            activeChoicePending: null
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
            activeAbilityUsed: raw.activeAbilityUsed === true,
            activeAbilityAvailable: raw.activeAbilityAvailable === true && raw.activeAbilityUsed !== true,
            activeAbilityResolved: raw.activeAbilityResolved === true,
            activeAbilityInProgress: raw.activeAbilityInProgress === true && raw.activeAbilityUsed === true && raw.activeAbilityResolved !== true,
            activeAttackBonus: safeCounter(raw.activeAttackBonus, 0, 20),
            activeDefenseReduction: safeCounter(raw.activeDefenseReduction, 0, 5),
            activeIncomingDamageBonus: safeCounter(raw.activeIncomingDamageBonus, 0, 5),
            activeAttackReroll: raw.activeAttackReroll === true,
            activeCounterBonus: safeCounter(raw.activeCounterBonus, 0, 20),
            activeLastSuccessfulAction: raw.activeLastSuccessfulAction === 'attackHit' || raw.activeLastSuccessfulAction === 'fullEvade'
                ? raw.activeLastSuccessfulAction
                : null,
            activeChoicePending: raw.activeChoicePending === 'perfecto' || raw.activeChoicePending === 'parcial'
                ? raw.activeChoicePending
                : null
        };
    }

    const ACTIVE_ABILITIES = Object.freeze({
        Agil1: Object.freeze({ name: 'Vector Fantasma', minigame: 'timing' }),
        Agil2: Object.freeze({ name: 'Impulso Cinético', minigame: 'tracking' }),
        Normal1: Object.freeze({ name: 'Reescritura de Parámetros', minigame: 'sequence' }),
        Normal2: Object.freeze({ name: 'Cambio de Protocolo', minigame: 'sequence' }),
        Resistente1: Object.freeze({ name: 'Sobrecarga', minigame: 'overload' }),
        Resistente2: Object.freeze({ name: 'Anclaje', minigame: 'timing' }),
        Dano1: Object.freeze({ name: 'Ruptura', minigame: 'precision' }),
        Dano2: Object.freeze({ name: 'Réplica', minigame: 'sequence' })
    });

    function getActiveAbilityInfo(classId) {
        return typeof classId === 'string' ? ACTIVE_ABILITIES[classId] || null : null;
    }

    function grantActiveAbility(state, events, reason) {
        if (!state.activeAbilityUsed && !state.activeAbilityAvailable) {
            state.activeAbilityAvailable = true;
            events.push(`Habilidad activa disponible: ${reason}`);
        }
    }

    function consumeActiveAbilityOpportunity(mit) {
        const state = passiveState(mit);
        if (!state.activeAbilityAvailable || state.activeAbilityUsed) return null;
        return {
            ...mit,
            passiveState: {
                ...state,
                activeAbilityAvailable: false,
                activeAbilityUsed: true,
                activeAbilityResolved: false,
                activeAbilityInProgress: true
            }
        };
    }

    function resolveActiveAbilityResult(mit, result) {
        const state = passiveState(mit);
        if (!state.activeAbilityUsed || !state.activeAbilityInProgress || state.activeAbilityResolved) return null;
        if (!['perfecto', 'parcial', 'fallo'].includes(result)) return null;

        const next = { ...state, activeAbilityResolved: true, activeAbilityInProgress: false };
        const events = [];
        const bonus = result === 'perfecto' ? 2 : result === 'parcial' ? 1 : 0;
        const classId = state.passiveClassId;

        if (result === 'fallo') {
            events.push(`${getActiveAbilityInfo(classId)?.name || 'Habilidad activa'} falló; la oportunidad se consumió`);
            return { state: next, events };
        }

        if (classId === PASSIVE_CLASS_IDS.EVASIVO) {
            next.activeAttackBonus = Math.min(20, next.activeAttackBonus + bonus);
            events.push(`Vector Fantasma: próximo ataque +${bonus}`);
        } else if (classId === PASSIVE_CLASS_IDS.MOVIL) {
            if (result === 'perfecto') {
                next.activeAttackReroll = true;
                events.push('Impulso Cinético: próximo ataque obtiene una segunda tirada si falla');
            } else {
                next.activeAttackBonus = Math.min(20, next.activeAttackBonus + 1);
                events.push('Impulso Cinético: próximo ataque +1');
            }
        } else if (classId === PASSIVE_CLASS_IDS.TECNICO) {
            next.activeChoicePending = result;
            events.push('Reescritura lista: elige ataque o defensa');
        } else if (classId === PASSIVE_CLASS_IDS.VERSATIL) {
            next.activeAttackBonus = Math.min(20, next.activeAttackBonus + 1);
            if (result === 'perfecto') {
                next.activeDefenseReduction = Math.min(5, next.activeDefenseReduction + 1);
                events.push('Cambio de Protocolo: próximo ataque +1 y próxima defensa −1 daño');
            } else {
                events.push('Cambio de Protocolo: próximo ataque +1');
            }
        } else if (classId === PASSIVE_CLASS_IDS.BERSERKER) {
            next.activeAttackBonus = Math.min(20, next.activeAttackBonus + (result === 'perfecto' ? 3 : 1));
            if (result === 'perfecto') {
                next.activeIncomingDamageBonus = Math.min(5, next.activeIncomingDamageBonus + 2);
                events.push('Sobrecarga: próximo ataque +3; siguiente impacto recibido +2 daño');
            } else {
                events.push('Sobrecarga parcial: próximo ataque +1 sin exposición adicional');
            }
        } else if (classId === PASSIVE_CLASS_IDS.MURALLA) {
            next.activeDefenseReduction = Math.min(5, next.activeDefenseReduction + bonus);
            events.push(`Anclaje: próximo impacto recibido −${bonus} daño`);
        } else if (classId === PASSIVE_CLASS_IDS.DESTRUCTOR) {
            next.activeAttackBonus = Math.min(20, next.activeAttackBonus + bonus);
            events.push(`Ruptura: próximo ataque +${bonus}`);
        } else if (classId === PASSIVE_CLASS_IDS.DUELISTA) {
            next.activeCounterBonus = Math.min(20, next.activeCounterBonus + bonus);
            events.push(`Réplica: segundo contraataque +${bonus}`);
        }

        return { state: next, events };
    }

    function chooseActiveAbilityOption(mit, choice) {
        const state = passiveState(mit);
        if (state.passiveClassId !== PASSIVE_CLASS_IDS.TECNICO ||
            !['perfecto', 'parcial'].includes(state.activeChoicePending) ||
            !['attack', 'defense'].includes(choice)) return null;
        const bonus = state.activeChoicePending === 'perfecto' ? 2 : 1;
        const next = { ...state, activeChoicePending: null };
        if (choice === 'attack') next.activeAttackBonus = Math.min(20, next.activeAttackBonus + bonus);
        else next.activeDefenseReduction = Math.min(5, next.activeDefenseReduction + bonus);
        return { ...mit, passiveState: next };
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
        let selectedRoll = ultra
            ? faces[Math.floor(safeRandom(random) * faces.length)]
            : parseDieFace(roll);
        let hit = ultra || isSuccessfulAttack(faces, selectedRoll);
        let damage = hit && selectedRoll !== null ? selectedRoll : 0;
        const events = [];
        const next = { ...state };

        if (next.activeAttackReroll) {
            next.activeAttackReroll = false;
            if (!hit) {
                selectedRoll = Math.floor(safeRandom(random) * 6) + 1;
                hit = isSuccessfulAttack(faces, selectedRoll);
                damage = hit && selectedRoll !== null ? selectedRoll : 0;
                events.push(hit
                    ? `Impulso Cinético repitió la tirada y acertó [${selectedRoll}]`
                    : `Impulso Cinético repitió la tirada y volvió a fallar [${selectedRoll}]`);
            } else {
                events.push('Impulso Cinético se consumió; el primer lanzamiento ya acertó');
            }
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
        if (hit && state.passiveClassId === PASSIVE_CLASS_IDS.DESTRUCTOR) {
            const bonus = safeCounter(state.destructorBonus, 0, Number.MAX_SAFE_INTEGER - 1);
            damage = Math.min(Number.MAX_SAFE_INTEGER, 1 + bonus);
        }

        if (state.passiveClassId === PASSIVE_CLASS_IDS.DUELISTA &&
            state.counterSequence?.phase === 'SECOND' && next.activeCounterBonus > 0) {
            const counterBonus = next.activeCounterBonus;
            next.activeCounterBonus = 0;
            if (hit) {
                damage = Math.min(Number.MAX_SAFE_INTEGER, damage + counterBonus);
                events.push(`Réplica añadió +${counterBonus} al segundo contraataque`);
            } else {
                events.push('Réplica se consumió porque el segundo contraataque falló');
            }
        }

        if (next.activeAttackBonus > 0) {
            const bonus = next.activeAttackBonus;
            next.activeAttackBonus = 0;
            if (hit) {
                damage = Math.min(Number.MAX_SAFE_INTEGER, damage + bonus);
                events.push(`Habilidad activa añadió +${bonus} al ataque`);
            } else {
                events.push('La bonificación de ataque se perdió al fallar la siguiente tirada');
            }
        }

        if (state.passiveClassId === PASSIVE_CLASS_IDS.TECNICO &&
            hit && faces.length > 0 && selectedRoll === Math.max(...faces)) {
            grantActiveAbility(next, events, 'Reescritura de Parámetros');
        }
        if (state.passiveClassId === PASSIVE_CLASS_IDS.BERSERKER && hit) {
            const hp = safeCounter(attacker?.currentHp, 0, Number.MAX_SAFE_INTEGER);
            const maxHp = safeCounter(attacker?.maxHp, 0, Number.MAX_SAFE_INTEGER);
            if (maxHp > 0 && hp > 0 && hp <= maxHp / 2) {
                grantActiveAbility(next, events, 'Sobrecarga');
            }
        }
        if (state.passiveClassId === PASSIVE_CLASS_IDS.VERSATIL) {
            if (hit && next.activeLastSuccessfulAction === 'fullEvade') {
                grantActiveAbility(next, events, 'Cambio de Protocolo');
            }
            next.activeLastSuccessfulAction = hit ? 'attackHit' : null;
        }

        return { hit, roll: selectedRoll, damage, state: next, events, unstoppable: ultra };
    }

    function resolvePassiveDefense({ attacker, defender, attackDamage, defenseRoll, unstoppable = false, allowCounterTrigger = true, forceHit = false, random = Math.random } = {}) {
        const attackState = passiveState(attacker);
        const state = passiveState(defender);
        const events = [];
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
        let damage = isUltra
            ? rawAttackDamage
            : shadow
                ? 0
                : berserkerPhaseTwoDodge
                    ? 0
                    : duelistaDefense
                        ? Math.min(1, base.finalDamageTaken)
                        : base.finalDamageTaken;
        let next = { ...state };
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
        if (!forceHit && !isUltra && damage > 0 && next.activeDefenseReduction > 0) {
            const bonus = next.activeDefenseReduction;
            damage = Math.max(0, damage - bonus);
            next.activeDefenseReduction = 0;
            events.push(`Habilidad activa redujo ${bonus} de daño recibido`);
        }
        if (damage > 0 && next.activeIncomingDamageBonus > 0) {
            const vulnerability = next.activeIncomingDamageBonus;
            damage = Math.min(Number.MAX_SAFE_INTEGER, damage + vulnerability);
            next.activeIncomingDamageBonus = 0;
            events.push(`Sobrecarga aumentó el siguiente impacto recibido en +${vulnerability}`);
        }

        if (!forceHit && state.passiveClassId === PASSIVE_CLASS_IDS.TECNICO && next.technicalDefenseBonus > 0) {
            const bonus = next.technicalDefenseBonus;
            if (!shadow && damage > 0) {
                damage = Math.max(0, damage - bonus);
                next.technicalDefenseBonus = 0;
                events.push(`Técnico aplicó Defensa +${bonus} y gastó sus cargas`);
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
        if (successfulEvade && state.passiveClassId === PASSIVE_CLASS_IDS.MOVIL && damage === 0 && state.shadowCooldownTurns <= 0) {
            next.shadowInvulnerableTurns = 2;
            next.shadowCooldownTurns = 2;
            events.push('Sombra activada: invulnerable durante 2 turnos rivales; el cooldown de 2 turnos propios empezará al terminar Sombra');
        }

        if (state.passiveClassId === PASSIVE_CLASS_IDS.EVASIVO && successfulEvade && base.finalDamageTaken <= 1) {
            grantActiveAbility(next, events, 'Vector Fantasma');
        }
        if (state.passiveClassId === PASSIVE_CLASS_IDS.MOVIL && successfulEvade && base.finalDamageTaken === 0) {
            grantActiveAbility(next, events, 'Impulso Cinético');
        }
        if (state.passiveClassId === PASSIVE_CLASS_IDS.VERSATIL) {
            if (successfulEvade && base.finalDamageTaken === 0) {
                if (next.activeLastSuccessfulAction === 'attackHit') {
                    grantActiveAbility(next, events, 'Cambio de Protocolo');
                }
                next.activeLastSuccessfulAction = 'fullEvade';
            } else {
                next.activeLastSuccessfulAction = null;
            }
        }
        // Ultra Impulso no puede activar una defensa de contraataque:
        // el primer golpe del Duelista tampoco puede encadenar otra secuencia.
        const triggersCounter = allowCounterTrigger && !isUltra && !forceHit &&
            state.passiveClassId === PASSIVE_CLASS_IDS.DUELISTA &&
            duelistaDefense && !state.counterSequence && state.counterCooldownTurns <= 0 && damage <= 1;
        if (triggersCounter) grantActiveAbility(next, events, 'Réplica');
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
            grantActiveAbility(nextAttacker, events, 'Ruptura');
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
            grantActiveAbility(nextDefender, events, 'Anclaje');
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
                activeAttackBonus: 0,
                activeDefenseReduction: 0,
                activeIncomingDamageBonus: 0,
                activeAttackReroll: false,
                activeCounterBonus: 0,
                activeLastSuccessfulAction: null
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
                counterCooldownTurns: 0, counterSequence: null,
                activeAbilityAvailable: false, activeAbilityUsed: false,
                activeAbilityResolved: false, activeAbilityInProgress: false,
                activeAttackBonus: 0, activeDefenseReduction: 0,
                activeIncomingDamageBonus: 0, activeAttackReroll: false,
                activeCounterBonus: 0, activeLastSuccessfulAction: null,
                activeChoicePending: null }
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
        ACTIVE_ABILITIES,
        getActiveAbilityInfo,
        consumeActiveAbilityOpportunity,
        resolveActiveAbilityResult,
        chooseActiveAbilityOption
    });
}));

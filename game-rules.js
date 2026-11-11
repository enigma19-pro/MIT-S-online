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

    function isSuccessfulAttack(attackNums, roll) {
        const rolledNumber = Number(roll);
        const isValidDieRoll = Number.isInteger(rolledNumber) && rolledNumber >= 1 && rolledNumber <= 6;

        if (!Array.isArray(attackNums) || !isValidDieRoll) {
            return false;
        }

        return attackNums.some(number => Number(number) === rolledNumber);
    }

    function resolveDefense({ attackDamage, defenseRoll, evadeNums } = {}) {
        const rawDamage = Number(attackDamage);
        const damage = Number.isFinite(rawDamage) ? Math.max(0, rawDamage) : 0;
        const roll = Number(defenseRoll);
        const validRoll = Number.isInteger(roll) && roll >= 1 && roll <= 6;
        const evadeNumbers = Array.isArray(evadeNums)
            ? evadeNums.map(Number).filter(Number.isInteger)
            : [];
        const isEvadeNumber = validRoll && evadeNumbers.includes(roll);

        return {
            isEvadeNumber,
            finalDamageTaken: isEvadeNumber ? Math.max(0, damage - roll) : damage
        };
    }

    function resolveMitDefeat({ defeatedPlayer, hasReserve } = {}) {
        const player = Number(defeatedPlayer);
        if (player !== 1 && player !== 2) return null;

        if (hasReserve === true) {
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

    return Object.freeze({
        isSuccessfulAttack,
        resolveDefense,
        resolveMitDefeat
    });
}));

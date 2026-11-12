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

    return Object.freeze({
        isSuccessfulAttack,
        resolveDefense,
        findAvailableMitIndex,
        resolveMitDefeat
    });
}));

const cronParser = require('cron-parser');

/**
 * Validate a schedule input and classify it as cron or date.
 *
 * @param {*} input         Raw input — Date, string, or anything else.
 * @param {string|null} expectedType  'cron' to force cron validation, 'date' to force date validation,
 *                                    null/undefined to auto-detect (legacy msg.inputDate path).
 * @returns {{ok: true, type: 'cron'|'date', value: string|Date}|{ok: false, errorType: 'InvalidCron'|'InvalidDate'}}
 */
function validateInput(input, expectedType) {
    if (input instanceof Date) {
        if (isNaN(input.getTime())) {
            return { ok: false, errorType: 'InvalidDate' };
        }
        if (expectedType === 'cron') {
            return { ok: false, errorType: 'InvalidCron' };
        }
        return { ok: true, type: 'date', value: input };
    }

    if (typeof input !== 'string') {
        return {
            ok: false,
            errorType: expectedType === 'cron' ? 'InvalidCron' : 'InvalidDate'
        };
    }

    if (expectedType === 'cron') {
        try {
            cronParser.parseExpression(input);
            return { ok: true, type: 'cron', value: input };
        } catch (_err) {
            return { ok: false, errorType: 'InvalidCron' };
        }
    }

    if (expectedType === 'date') {
        const d = new Date(input);
        if (isNaN(d.getTime())) {
            return { ok: false, errorType: 'InvalidDate' };
        }
        return { ok: true, type: 'date', value: d };
    }

    // Auto-detect (legacy msg.inputDate path): try cron first, then date.
    try {
        cronParser.parseExpression(input);
        return { ok: true, type: 'cron', value: input };
    } catch (_err) { /* not a cron, fall through */ }

    const d = new Date(input);
    if (!isNaN(d.getTime())) {
        return { ok: true, type: 'date', value: d };
    }

    // Both parsers failed. Pick the more likely intent for the error type
    // so legacy users get the message that matches their input.
    const looksLikeDate = /\bdate\b/i.test(input);
    return { ok: false, errorType: looksLikeDate ? 'InvalidDate' : 'InvalidCron' };
}

module.exports = { validateInput };

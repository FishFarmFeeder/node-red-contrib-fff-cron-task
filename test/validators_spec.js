const { validateInput } = require('../lib/validators');
require('should');

describe('validators.validateInput', function () {

    describe('Date inputs', function () {

        it('accepts a future Date object (no expected type)', function () {
            const future = new Date(Date.now() + 60000);
            const r = validateInput(future, null);
            r.should.have.property('ok', true);
            r.should.have.property('type', 'date');
            r.value.should.equal(future);
        });

        it('rejects an invalid Date object', function () {
            const r = validateInput(new Date('not-a-date'), null);
            r.should.have.property('ok', false);
            r.should.have.property('errorType', 'InvalidDate');
        });

        it('rejects a Date object when cron is expected', function () {
            const r = validateInput(new Date(Date.now() + 60000), 'cron');
            r.should.have.property('ok', false);
            r.should.have.property('errorType', 'InvalidCron');
        });
    });

    describe('Cron strings (expectedType=cron)', function () {

        it('accepts a valid 5-field cron', function () {
            const r = validateInput('*/5 * * * *', 'cron');
            r.should.have.property('ok', true);
            r.should.have.property('type', 'cron');
            r.value.should.equal('*/5 * * * *');
        });

        it('accepts a valid 6-field cron', function () {
            const r = validateInput('*/30 * * * * *', 'cron');
            r.should.have.property('ok', true);
            r.should.have.property('type', 'cron');
        });

        it('rejects an invalid cron with InvalidCron', function () {
            const r = validateInput('not a cron', 'cron');
            r.should.have.property('ok', false);
            r.should.have.property('errorType', 'InvalidCron');
        });

        it('rejects an ISO date string when cron is expected', function () {
            const r = validateInput('2099-12-31T10:00:00Z', 'cron');
            r.should.have.property('ok', false);
            r.should.have.property('errorType', 'InvalidCron');
        });
    });

    describe('Date strings (expectedType=date)', function () {

        it('accepts a valid ISO date string', function () {
            const r = validateInput('2099-12-31T10:00:00Z', 'date');
            r.should.have.property('ok', true);
            r.should.have.property('type', 'date');
            r.value.should.be.instanceof(Date);
        });

        it('rejects an unparseable date string', function () {
            const r = validateInput('definitely-not-a-date-xyz', 'date');
            r.should.have.property('ok', false);
            r.should.have.property('errorType', 'InvalidDate');
        });
    });

    describe('Auto-detection (legacy msg.inputDate path)', function () {

        it('detects a cron pattern', function () {
            const r = validateInput('*/5 * * * *', null);
            r.should.have.property('ok', true);
            r.should.have.property('type', 'cron');
        });

        it('detects a date string', function () {
            const r = validateInput('2099-12-25', null);
            r.should.have.property('ok', true);
            r.should.have.property('type', 'date');
        });

        it('reports InvalidDate when the string mentions "date"', function () {
            const r = validateInput('not a date', null);
            r.should.have.property('ok', false);
            r.should.have.property('errorType', 'InvalidDate');
        });

        it('reports InvalidCron otherwise', function () {
            const r = validateInput('totally bogus garbage', null);
            r.should.have.property('ok', false);
            r.should.have.property('errorType', 'InvalidCron');
        });
    });

    describe('Non-string, non-Date inputs', function () {

        it('rejects numbers as InvalidDate by default', function () {
            const r = validateInput(12345, null);
            r.should.have.property('ok', false);
            r.should.have.property('errorType', 'InvalidDate');
        });

        it('rejects numbers as InvalidCron when cron is expected', function () {
            const r = validateInput(12345, 'cron');
            r.should.have.property('ok', false);
            r.should.have.property('errorType', 'InvalidCron');
        });

        it('rejects null with the appropriate error type', function () {
            validateInput(null, null).errorType.should.equal('InvalidDate');
            validateInput(null, 'cron').errorType.should.equal('InvalidCron');
        });
    });
});

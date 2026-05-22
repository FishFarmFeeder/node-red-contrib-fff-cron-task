const persistence = require('../lib/persistence');
require('should');

/**
 * Build a fake Node-RED-ish node with a shared in-memory context store
 * so we can exercise save/restore round-trips without spinning up the helper.
 */
function fakeNode(opts) {
    opts = opts || {};
    const store = opts.store || {};
    const jobMeta = opts.jobMeta || {};

    return {
        persistent: opts.persistent !== false,
        jobMeta: jobMeta,
        jobs: {},
        _store: store,
        context: function () {
            return {
                get: function (key, cb) {
                    if (typeof cb === 'function') {
                        cb(null, store[key]);
                        return undefined;
                    }
                    return store[key];
                },
                set: function (key, value, cb) {
                    store[key] = value;
                    if (typeof cb === 'function') {
                        cb();
                    }
                }
            };
        },
        warn: function () {},
        error: function () {}
    };
}

describe('persistence', function () {

    describe('save', function () {

        it('writes jobMeta entries to context under scheduled_jobs', function () {
            const node = fakeNode({
                jobMeta: {
                    a: { scheduleInput: '*/5 * * * *', type: 'cron' },
                    b: { scheduleInput: '2099-12-25', type: 'date' }
                }
            });

            persistence.save(node);

            const saved = node._store[persistence.CONTEXT_KEY];
            saved.should.have.property('a');
            saved.should.have.property('b');
            saved.a.should.eql({ scheduleInput: '*/5 * * * *' });
            saved.b.should.eql({ scheduleInput: '2099-12-25' });
        });

        it('only persists scheduleInput, never the internal metadata', function () {
            const node = fakeNode({
                jobMeta: { x: { scheduleInput: 'cron', type: 'cron', createdAt: 123 } }
            });
            persistence.save(node);
            Object.keys(node._store[persistence.CONTEXT_KEY].x).should.eql(['scheduleInput']);
        });

        it('is a no-op when persistence is disabled', function () {
            const node = fakeNode({
                persistent: false,
                jobMeta: { a: { scheduleInput: 'cron' } }
            });
            persistence.save(node);
            Object.keys(node._store).should.have.length(0);
        });
    });

    describe('remove', function () {

        it('removes a single job from the persisted map', function () {
            const node = fakeNode();
            node._store[persistence.CONTEXT_KEY] = {
                a: { scheduleInput: 'cron-a' },
                b: { scheduleInput: 'cron-b' }
            };
            persistence.remove(node, 'a');
            node._store[persistence.CONTEXT_KEY].should.not.have.property('a');
            node._store[persistence.CONTEXT_KEY].should.have.property('b');
        });

        it('is a no-op when persistence is disabled', function () {
            const node = fakeNode({ persistent: false });
            node._store[persistence.CONTEXT_KEY] = { a: { scheduleInput: 'cron-a' } };
            persistence.remove(node, 'a');
            node._store[persistence.CONTEXT_KEY].should.have.property('a');
        });
    });

    describe('restore', function () {

        it('invokes scheduleJob for every persisted entry', function (done) {
            const node = fakeNode();
            node._store[persistence.CONTEXT_KEY] = {
                a: { scheduleInput: '*/5 * * * *' },
                b: { scheduleInput: '2099-12-25' }
            };

            const calls = [];
            persistence.restore(node, function (input, msg, opts) {
                calls.push({ input: input, msg: msg, opts: opts });
            }, function () {
                try {
                    calls.length.should.equal(2);
                    const ids = calls.map(function (c) { return c.opts.jobId; }).sort();
                    ids.should.eql(['a', 'b']);
                    calls.forEach(function (c) {
                        c.opts.isRestoring.should.equal(true);
                        c.opts.shouldSave.should.equal(false);
                    });
                    done();
                } catch (err) { done(err); }
            });
        });

        it('completes without scheduling when persistence is disabled', function (done) {
            const node = fakeNode({ persistent: false });
            let scheduled = 0;
            persistence.restore(node, function () { scheduled++; }, function () {
                try {
                    scheduled.should.equal(0);
                    done();
                } catch (err) { done(err); }
            });
        });

        it('completes without scheduling when there is no persisted state', function (done) {
            const node = fakeNode();
            let scheduled = 0;
            persistence.restore(node, function () { scheduled++; }, function () {
                try {
                    scheduled.should.equal(0);
                    done();
                } catch (err) { done(err); }
            });
        });
    });

    describe('save → restore round-trip', function () {

        it('preserves every job across a fresh node instance sharing the same store', function (done) {
            const sharedStore = {};

            // Session 1: schedule two jobs and persist
            const node1 = fakeNode({
                store: sharedStore,
                jobMeta: {
                    cron_job: { scheduleInput: '*/10 * * * *', type: 'cron' },
                    date_job: { scheduleInput: '2099-12-25T10:00:00Z', type: 'date' }
                }
            });
            persistence.save(node1);

            // Session 2: brand-new node with empty jobMeta, same context store
            const node2 = fakeNode({ store: sharedStore });
            const calls = [];
            persistence.restore(node2, function (input, msg, opts) {
                calls.push({ input: input, jobId: opts.jobId });
            }, function () {
                try {
                    calls.length.should.equal(2);
                    const map = {};
                    calls.forEach(function (c) { map[c.jobId] = c.input; });
                    map.cron_job.should.equal('*/10 * * * *');
                    map.date_job.should.equal('2099-12-25T10:00:00Z');
                    done();
                } catch (err) { done(err); }
            });
        });
    });
});

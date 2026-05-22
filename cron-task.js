module.exports = function (RED) {
    const { createScheduler } = require('./lib/scheduler');
    const persistence = require('./lib/persistence');

    function CronTaskNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;

        node.jobs = {};      // jobId -> scheduled object returned by node-schedule
        node.jobMeta = {};   // jobId -> { scheduleInput, type, createdAt }
        node.persistent = config.persistent || false;

        const scheduler = createScheduler(node, RED);

        persistence.restore(node, scheduler.scheduleJob, scheduler.updateNodeStatus);

        node.on('input', function (msg, send, done) {
            send = send || function () { node.send.apply(node, arguments); };
            done = done || function (err) {
                if (err) {
                    node.error(err, msg);
                }
            };

            if (msg.action === 'cancel') {
                scheduler.cancelJob(msg.job_id);
                done();
                return;
            }
            if (msg.action === 'cancelAll') {
                scheduler.cancelAllJobs();
                done();
                return;
            }
            if (msg.action === 'list') {
                send([{
                    payload: 'jobs',
                    jobs: scheduler.listJobs(),
                    timestamp: Date.now()
                }, null]);
                done();
                return;
            }

            let scheduleInput;
            let expectedType = null;

            if (msg.cron !== undefined && msg.cron !== null && msg.cron !== '') {
                scheduleInput = msg.cron;
                expectedType = 'cron';
            } else if (msg.date !== undefined && msg.date !== null && msg.date !== '') {
                scheduleInput = msg.date;
                expectedType = 'date';
            } else if (msg.inputDate !== undefined && msg.inputDate !== null && msg.inputDate !== '') {
                scheduleInput = msg.inputDate;
                expectedType = null; // auto-detect for legacy field
            } else {
                const message = RED._('cron-task.errors.missing_input');
                send([null, {
                    payload: message,
                    error: { type: 'MissingInput' }
                }]);
                node.warn(message);
                done();
                return;
            }

            scheduler.scheduleJob(scheduleInput, msg, {
                jobId: msg.job_id || null,
                expectedType: expectedType
            });
            done();
        });

        node.on('close', function (_removed, done) {
            for (const id of Object.keys(node.jobs)) {
                try {
                    if (node.jobs[id]) {
                        node.jobs[id].cancel();
                    }
                } catch (_err) { /* ignore */ }
                delete node.jobs[id];
                delete node.jobMeta[id];
            }
            scheduler.updateNodeStatus();
            if (typeof done === 'function') {
                done();
            }
        });
    }

    RED.nodes.registerType('fff-cron-task', CronTaskNode);
};

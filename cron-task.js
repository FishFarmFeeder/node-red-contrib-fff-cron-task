module.exports = function (RED) {
    const schedule = require('node-schedule');
    const cronParser = require('cron-parser');

    const STATUS_UPDATE_DELAY = 1000;

    function CronTaskNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;

        node.jobs = {};      // jobId -> scheduled object returned by node-schedule
        node.jobMeta = {};   // jobId -> { scheduleInput, type, createdAt }
        node.persistent = config.persistent || false;

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
                return { ok: false, errorType: expectedType === 'cron' ? 'InvalidCron' : 'InvalidDate' };
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

        function errorMessageFor(errorType, input) {
            if (errorType === 'InvalidCron') return `Invalid cron string: ${input}`;
            if (errorType === 'InvalidDate') return `Invalid date format: ${input}`;
            return `Invalid schedule input: ${input}`;
        }

        function sendError(type, payload, extras, msg, isRestoring) {
            if (isRestoring) return;
            const errorMsg = {
                payload,
                error: Object.assign({ type }, extras || {})
            };
            node.send([null, errorMsg]);
            node.error(payload, msg);
        }

        function updateNodeStatus() {
            const jobIds = Object.keys(node.jobs);
            if (jobIds.length === 0) {
                node.status({ fill: 'grey', shape: 'ring', text: 'no job' });
                return;
            }

            let next = null;
            for (const id of jobIds) {
                try {
                    const j = node.jobs[id];
                    if (j && typeof j.nextInvocation === 'function') {
                        const n = j.nextInvocation();
                        if (n && (!next || n < next)) next = n;
                    }
                } catch (_err) { /* ignore */ }
            }

            if (next) {
                const text = jobIds.length > 1
                    ? `${jobIds.length} jobs · ${next.toLocaleString()}`
                    : next.toLocaleString();
                node.status({ fill: 'blue', shape: 'dot', text });
            } else {
                node.status({ fill: 'grey', shape: 'ring', text: 'completed' });
            }
        }

        function getNextInvocationIso(jobId) {
            try {
                const j = node.jobs[jobId];
                if (j && typeof j.nextInvocation === 'function') {
                    const n = j.nextInvocation();
                    if (n) return n.toISOString();
                }
            } catch (_err) { /* ignore */ }
            return null;
        }

        function listJobs() {
            const out = [];
            for (const id of Object.keys(node.jobs)) {
                const meta = node.jobMeta[id] || {};
                out.push({
                    job_id: id,
                    schedule: meta.scheduleInput,
                    type: meta.type || null,
                    nextInvocation: getNextInvocationIso(id)
                });
            }
            return out;
        }

        function cancelAllJobs() {
            for (const id of Object.keys(node.jobs)) {
                try { if (node.jobs[id]) node.jobs[id].cancel(); } catch (_err) { /* ignore */ }
                delete node.jobs[id];
                delete node.jobMeta[id];
            }
            updateNodeStatus();
            saveJobsToContext();
        }

        function saveJobsToContext() {
            if (!node.persistent) return;
            const toSave = {};
            for (const id of Object.keys(node.jobMeta)) {
                toSave[id] = { scheduleInput: node.jobMeta[id].scheduleInput };
            }
            try {
                node.context().set('scheduled_jobs', toSave);
            } catch (err) {
                node.error('Failed to save context: ' + err.toString());
            }
        }

        function removeJobFromContext(jobId) {
            if (!node.persistent) return;
            try {
                const saved = node.context().get('scheduled_jobs') || {};
                if (saved[jobId]) {
                    delete saved[jobId];
                    node.context().set('scheduled_jobs', saved);
                }
            } catch (err) {
                node.error('Failed to update context: ' + err.toString());
            }
        }

        function restoreJobsFromContext() {
            if (!node.persistent) {
                updateNodeStatus();
                return;
            }
            node.context().get('scheduled_jobs', function (err, jobsData) {
                if (err) {
                    node.warn('Failed to get context: ' + err.toString());
                    updateNodeStatus();
                    return;
                }
                if (!jobsData) {
                    updateNodeStatus();
                    return;
                }
                for (const id of Object.keys(jobsData)) {
                    const entry = jobsData[id];
                    if (entry && entry.scheduleInput !== undefined) {
                        scheduleJob(entry.scheduleInput, null, {
                            isRestoring: true,
                            shouldSave: false,
                            jobId: id
                        });
                    }
                }
            });
        }

        function scheduleJob(scheduleInput, msg, opts) {
            opts = opts || {};
            const isRestoring = !!opts.isRestoring;
            const shouldSave = opts.shouldSave !== false;
            const expectedType = opts.expectedType || null;
            const jobId = opts.jobId || (msg && msg.job_id) || 'default';

            // Cancel existing job under this id, if any.
            if (node.jobs[jobId]) {
                try { node.jobs[jobId].cancel(); } catch (_err) { /* ignore */ }
                delete node.jobs[jobId];
                delete node.jobMeta[jobId];
            }

            const result = validateInput(scheduleInput, expectedType);
            if (!result.ok) {
                const statusText = result.errorType === 'InvalidCron' ? 'invalid cron' : 'invalid date';
                sendError(
                    result.errorType,
                    errorMessageFor(result.errorType, scheduleInput),
                    { input: scheduleInput },
                    msg,
                    isRestoring
                );
                node.status({ fill: 'red', shape: 'ring', text: statusText });
                return;
            }

            let scheduleConfig;
            if (result.type === 'date') {
                if (result.value <= new Date()) {
                    if (isRestoring) {
                        node.status({ fill: 'grey', shape: 'ring', text: 'past date (ignored)' });
                        removeJobFromContext(jobId);
                    } else {
                        sendError(
                            'PastDate',
                            `Date must be in the future: ${scheduleInput}`,
                            { input: scheduleInput, date: result.value.toISOString() },
                            msg,
                            false
                        );
                    }
                    return;
                }
                scheduleConfig = result.value;
            } else {
                scheduleConfig = result.value;
            }

            try {
                const scheduled = schedule.scheduleJob(scheduleConfig, function () {
                    node.send([{
                        payload: 'triggered',
                        original_payload: scheduleInput,
                        job_id: jobId,
                        timestamp: Date.now(),
                        nextInvocation: getNextInvocationIso(jobId)
                    }, null]);

                    node.status({ fill: 'green', shape: 'dot', text: 'triggered' });

                    if (result.type === 'date') {
                        removeJobFromContext(jobId);
                        delete node.jobs[jobId];
                        delete node.jobMeta[jobId];
                    }

                    setTimeout(updateNodeStatus, STATUS_UPDATE_DELAY);
                });

                if (scheduled) {
                    node.jobs[jobId] = scheduled;
                    node.jobMeta[jobId] = {
                        scheduleInput,
                        type: result.type,
                        createdAt: Date.now()
                    };
                    updateNodeStatus();
                    if (shouldSave) saveJobsToContext();
                } else {
                    sendError(
                        'ScheduleFailed',
                        `Failed to schedule job: ${scheduleInput}`,
                        { input: scheduleInput },
                        msg,
                        isRestoring
                    );
                    node.status({ fill: 'red', shape: 'ring', text: 'schedule failed' });
                }
            } catch (err) {
                sendError(
                    'ScheduleError',
                    `Error scheduling job: ${err.message}`,
                    { message: err.message, input: scheduleInput },
                    msg,
                    isRestoring
                );
                node.status({ fill: 'red', shape: 'dot', text: 'error' });
            }
        }

        function cancelJob(jobId) {
            jobId = jobId || 'default';
            if (node.jobs[jobId]) {
                try { node.jobs[jobId].cancel(); } catch (_err) { /* ignore */ }
                delete node.jobs[jobId];
                delete node.jobMeta[jobId];
                updateNodeStatus();
                saveJobsToContext();
            }
        }

        restoreJobsFromContext();

        node.on('input', function (msg, send, done) {
            send = send || function () { node.send.apply(node, arguments); };
            done = done || function (err) { if (err) node.error(err, msg); };

            if (msg.action === 'cancel') {
                cancelJob(msg.job_id);
                done();
                return;
            }

            if (msg.action === 'cancelAll') {
                cancelAllJobs();
                done();
                return;
            }

            if (msg.action === 'list') {
                send([{
                    payload: 'jobs',
                    jobs: listJobs(),
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
                const errorMsg = {
                    payload: 'No schedule input provided (msg.cron, msg.date or msg.inputDate)',
                    error: { type: 'MissingInput' }
                };
                send([null, errorMsg]);
                node.warn('No schedule input provided (msg.cron, msg.date or msg.inputDate)');
                done();
                return;
            }

            scheduleJob(scheduleInput, msg, {
                jobId: msg.job_id || null,
                expectedType
            });
            done();
        });

        node.on('close', function (_removed, done) {
            for (const id of Object.keys(node.jobs)) {
                try { if (node.jobs[id]) node.jobs[id].cancel(); } catch (_err) { /* ignore */ }
                delete node.jobs[id];
                delete node.jobMeta[id];
            }
            updateNodeStatus();
            if (typeof done === 'function') done();
        });
    }

    RED.nodes.registerType('fff-cron-task', CronTaskNode);
};

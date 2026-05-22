const schedule = require('node-schedule');
const { validateInput } = require('./validators');
const persistence = require('./persistence');

const STATUS_UPDATE_DELAY = 1000;

/**
 * Build the scheduling primitives for one node instance.
 *
 * Closures over `node` and `RED` so the rest of the file can stay plain functions.
 * Returns the public surface used by `cron-task.js`.
 */
function createScheduler(node, RED) {
    function _(key, params) {
        return RED._(key, params);
    }

    function errorMessageFor(errorType, input) {
        if (errorType === 'InvalidCron') {
            return _('cron-task.errors.invalid_cron', { input: input });
        }
        if (errorType === 'InvalidDate') {
            return _('cron-task.errors.invalid_date', { input: input });
        }
        return _('cron-task.errors.invalid_input', { input: input });
    }

    function sendError(type, payload, extras, msg, isRestoring) {
        if (isRestoring) {
            return;
        }
        const errorMsg = {
            payload: payload,
            error: Object.assign({ type: type }, extras || {})
        };
        node.send([null, errorMsg]);
        node.error(payload, msg);
    }

    function getNextInvocationIso(jobId) {
        try {
            const j = node.jobs[jobId];
            if (j && typeof j.nextInvocation === 'function') {
                const n = j.nextInvocation();
                if (n) {
                    return n.toISOString();
                }
            }
        } catch (_err) { /* ignore */ }
        return null;
    }

    function updateNodeStatus() {
        const jobIds = Object.keys(node.jobs);
        if (jobIds.length === 0) {
            node.status({ fill: 'grey', shape: 'ring', text: _('cron-task.status.no_job') });
            return;
        }

        let next = null;
        for (const id of jobIds) {
            try {
                const j = node.jobs[id];
                if (j && typeof j.nextInvocation === 'function') {
                    const n = j.nextInvocation();
                    if (n && (!next || n < next)) {
                        next = n;
                    }
                }
            } catch (_err) { /* ignore */ }
        }

        if (next) {
            const text = jobIds.length > 1
                ? _('cron-task.status.n_jobs_next', { count: jobIds.length, next: next.toLocaleString() })
                : next.toLocaleString();
            node.status({ fill: 'blue', shape: 'dot', text: text });
        } else {
            node.status({ fill: 'grey', shape: 'ring', text: _('cron-task.status.completed') });
        }
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

    function cancelJob(jobId) {
        jobId = jobId || 'default';
        if (node.jobs[jobId]) {
            try { node.jobs[jobId].cancel(); } catch (_err) { /* ignore */ }
            delete node.jobs[jobId];
            delete node.jobMeta[jobId];
            updateNodeStatus();
            persistence.save(node);
        }
    }

    function cancelAllJobs() {
        for (const id of Object.keys(node.jobs)) {
            try {
                if (node.jobs[id]) {
                    node.jobs[id].cancel();
                }
            } catch (_err) { /* ignore */ }
            delete node.jobs[id];
            delete node.jobMeta[id];
        }
        updateNodeStatus();
        persistence.save(node);
    }

    function scheduleJob(scheduleInput, msg, opts) {
        opts = opts || {};
        const isRestoring = !!opts.isRestoring;
        const shouldSave = opts.shouldSave !== false;
        const expectedType = opts.expectedType || null;
        const jobId = opts.jobId || (msg && msg.job_id) || 'default';

        // Cancel any existing job under this id before scheduling the new one.
        if (node.jobs[jobId]) {
            try { node.jobs[jobId].cancel(); } catch (_err) { /* ignore */ }
            delete node.jobs[jobId];
            delete node.jobMeta[jobId];
        }

        const result = validateInput(scheduleInput, expectedType);
        if (!result.ok) {
            const statusText = result.errorType === 'InvalidCron'
                ? _('cron-task.status.invalid_cron')
                : _('cron-task.status.invalid_date');
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
                    node.status({
                        fill: 'grey', shape: 'ring',
                        text: _('cron-task.status.past_date_ignored')
                    });
                    persistence.remove(node, jobId);
                } else {
                    sendError(
                        'PastDate',
                        _('cron-task.errors.past_date', { input: scheduleInput }),
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

                node.status({
                    fill: 'green', shape: 'dot',
                    text: _('cron-task.status.triggered')
                });

                if (result.type === 'date') {
                    persistence.remove(node, jobId);
                    delete node.jobs[jobId];
                    delete node.jobMeta[jobId];
                }

                setTimeout(updateNodeStatus, STATUS_UPDATE_DELAY);
            });

            if (scheduled) {
                node.jobs[jobId] = scheduled;
                node.jobMeta[jobId] = {
                    scheduleInput: scheduleInput,
                    type: result.type,
                    createdAt: Date.now()
                };
                updateNodeStatus();
                if (shouldSave) {
                    persistence.save(node);
                }
            } else {
                sendError(
                    'ScheduleFailed',
                    _('cron-task.errors.schedule_failed', { input: scheduleInput }),
                    { input: scheduleInput },
                    msg,
                    isRestoring
                );
                node.status({
                    fill: 'red', shape: 'ring',
                    text: _('cron-task.status.schedule_failed')
                });
            }
        } catch (err) {
            sendError(
                'ScheduleError',
                _('cron-task.errors.schedule_error', { message: err.message }),
                { message: err.message, input: scheduleInput },
                msg,
                isRestoring
            );
            node.status({
                fill: 'red', shape: 'dot',
                text: _('cron-task.status.error')
            });
        }
    }

    return {
        scheduleJob: scheduleJob,
        cancelJob: cancelJob,
        cancelAllJobs: cancelAllJobs,
        listJobs: listJobs,
        updateNodeStatus: updateNodeStatus
    };
}

module.exports = { createScheduler };

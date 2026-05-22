const CONTEXT_KEY = 'scheduled_jobs';

/**
 * Persist the current `node.jobMeta` map to the node context, keyed by job id.
 * Only the `scheduleInput` is stored — internal scheduler state stays out of context.
 */
function save(node) {
    if (!node.persistent) {
        return;
    }
    const toSave = {};
    for (const id of Object.keys(node.jobMeta)) {
        toSave[id] = { scheduleInput: node.jobMeta[id].scheduleInput };
    }
    try {
        node.context().set(CONTEXT_KEY, toSave);
    } catch (err) {
        node.error('Failed to save context: ' + err.toString());
    }
}

/**
 * Remove a single job id from the persisted context (used when a one-shot fires
 * or a job is cancelled). No-op when persistence is disabled.
 */
function remove(node, jobId) {
    if (!node.persistent) {
        return;
    }
    try {
        const saved = node.context().get(CONTEXT_KEY) || {};
        if (saved[jobId]) {
            delete saved[jobId];
            node.context().set(CONTEXT_KEY, saved);
        }
    } catch (err) {
        node.error('Failed to update context: ' + err.toString());
    }
}

/**
 * Restore previously persisted jobs by invoking `scheduleJob` for each entry
 * found in context. Calls `onComplete` once restoration is done (or skipped),
 * so the caller can refresh status afterwards.
 */
function restore(node, scheduleJob, onComplete) {
    const finish = typeof onComplete === 'function' ? onComplete : function () {};

    if (!node.persistent) {
        finish();
        return;
    }

    node.context().get(CONTEXT_KEY, function (err, jobsData) {
        if (err) {
            node.warn('Failed to get context: ' + err.toString());
            finish();
            return;
        }
        if (!jobsData) {
            finish();
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
        finish();
    });
}

module.exports = { save, remove, restore, CONTEXT_KEY };

module.exports = function(RED) {
    const schedule = require('node-schedule');
    const cronParser = require('cron-parser');

    // Constants
    const STATUS_UPDATE_DELAY = 1000;

    function CronTaskNode(config) {
        RED.nodes.createNode(this, config);
        var node = this;
        
        // Jobs map to support multiple jobs by ID
        node.jobs = {};
        
        // Configuration
        node.persistent = config.persistent || false;
        // timezone support removed; rely on Node-RED runtime timezone

        /**
         * Validates and parses a cron string
         */
        function isValidCron(cronString) {
            if (typeof cronString !== 'string') return false;
            
            try {
                cronParser.parseExpression(cronString);
                return true;
            } catch (e) {
                return false;
            }
        }

        /**
         * Determines if input is a cron string
         */
        function isCronString(input) {
            if (typeof input !== 'string') return false;
            
            // Basic check: cron has 5 or 6 fields
            const parts = input.trim().split(/\s+/);
            if (parts.length < 5 || parts.length > 6) return false;
            
            return isValidCron(input);
        }

        /**
         * Updates the node status based on current job
         */
        function updateNodeStatus() {
            const jobIds = Object.keys(node.jobs || {});
            if (!jobIds.length) {
                node.status({fill:"grey", shape:"ring", text:"no job"});
                return;
            }
            // Show next invocation for the earliest job if any
            let next = null;
            jobIds.forEach(id => {
                try {
                    const j = node.jobs[id];
                    if (j && j.nextInvocation) {
                        const n = j.nextInvocation();
                        if (n && (!next || n < next)) next = n;
                    }
                } catch (_err) { /* ignore */ }
            });
            if (next) {
                node.status({
                    fill:"blue", 
                    shape:"dot", 
                    text: next.toLocaleString()
                });
            } else {
                node.status({fill:"grey", shape:"ring", text:"completed"});
            }
        }

        /**
         * Explicitly save job to context
         * Called ONLY when a job is successfully scheduled
         */
        function saveJobsToContext() {
            if (!node.persistent) return;

            const toSave = {};
            Object.keys(node.jobs).forEach(id => {
                const job = node.jobs[id];
                if (job && job._scheduleInput) {
                    toSave[id] = { scheduleInput: job._scheduleInput };
                }
            });

            try {
                node.context().set('scheduled_jobs', toSave);
            } catch (err) {
                node.error("Failed to save context: " + err.toString());
            }
        }

        /**
         * Explicitly clear job from context
         * Called when job is cancelled or completed (non-cron)
         */
        /**
         * Remove a specific job from context
         */
        function removeJobFromContext(jobId) {
            if (!node.persistent) return;
            try {
                const saved = node.context().get('scheduled_jobs') || {};
                if (saved[jobId]) {
                    delete saved[jobId];
                    node.context().set('scheduled_jobs', saved);
                }
            } catch (err) {
                node.error("Failed to update context: " + err.toString());
            }
        }

        /**
         * Restore job from context if persistence is enabled
         */
        function restoreJobFromContext() {
            if (!node.persistent) {
                updateNodeStatus();
                return;
            }
            
            node.context().get('scheduled_jobs', function(err, jobsData) {
                if (err) {
                    node.warn("Failed to get context: " + err.toString());
                    updateNodeStatus();
                    return;
                }
                if (!jobsData) {
                    updateNodeStatus();
                    return;
                }

                Object.keys(jobsData).forEach(id => {
                    const jobData = jobsData[id];
                    if (jobData && jobData.scheduleInput !== undefined) {
                        scheduleJob(jobData.scheduleInput, null, true, false, id);
                    }
                });
            });
        }

        /**
         * Schedule a job
         * @param {*} scheduleInput - Date or cron string
         * @param {*} msg - Original message
         * @param {boolean} isRestoring - If true, suppress errors for past dates
         * @param {boolean} shouldSave - If true, save to context (default: true)
         */
        function scheduleJob(scheduleInput, msg, isRestoring = false, shouldSave = true, jobId = null) {
            // Cancel existing job if any
            jobId = jobId || (msg && msg.job_id) || 'default';
            if (!node.jobs) node.jobs = {};
            if (node.jobs[jobId]) {
                try { node.jobs[jobId].cancel(); } catch (_err) { /* ignore */ }
                node.jobs[jobId] = null;
                delete node.jobs[jobId];
            }

            var isCron;
            if (typeof scheduleInput === 'string') {
                // If the string looks like a date (ISO yyyy-mm-dd or numeric timestamp or contains 'T'), treat as date
                const looksLikeDate = /^\d{4}-\d{2}-\d{2}/.test(scheduleInput) || /^\d{13}$/.test(scheduleInput) || scheduleInput.indexOf('T') >= 0;
                if (looksLikeDate) {
                    isCron = false;
                } else {
                    // Heuristics to determine if it is a cron: contains cron-type characters, or 5+ parts
                    const looksLikeCronChars = /[*/,-]/.test(scheduleInput) || /(\*|\d)/.test(scheduleInput);
                    const parts = scheduleInput.trim().split(/\s+/);
                    const hasEnoughParts = parts.length >= 5 && parts.length <= 6;
                    const containsCronKeyword = /\bcron\b/i.test(scheduleInput);
                    const containsDateKeyword = /\bdate\b/i.test(scheduleInput);

                    if (containsCronKeyword || looksLikeCronChars || hasEnoughParts) {
                        isCron = true;
                    } else if (containsDateKeyword) {
                        isCron = false;
                    } else {
                        // Default to cron for ambiguous strings to ensure invalid cron errors for cron-like inputs
                        isCron = true;
                    }
                }
            } else {
                isCron = isCronString(scheduleInput);
            }
            var scheduleConfig = scheduleInput;

            if (!isCron) {
                // It's a date
                var date = new Date(scheduleInput);
                if (isNaN(date.getTime())) {
                    if (!isRestoring) {
                        const errorMsg = {
                            payload: `Invalid date format: ${scheduleInput}`,
                            error: { type: 'InvalidDate', input: scheduleInput }
                        };
                        node.send([null, errorMsg]);
                        node.error("Invalid date format: " + scheduleInput, msg);
                    }
                    node.status({fill:"red", shape:"ring", text:"invalid date"});
                    return;
                }
                
                if (date <= new Date()) {
                    if (!isRestoring) {
                        const errorMsg = {
                            payload: `Date must be in the future: ${scheduleInput}`,
                            error: { type: 'PastDate', input: scheduleInput, date: date.toISOString() }
                        };
                        node.send([null, errorMsg]);
                        node.error("Date must be in the future: " + scheduleInput, msg);
                    }
                    // If restoring and date is past, just show status but don't error output
                    // Also clear context since this job is dead
                    if (isRestoring) {
                        node.status({fill:"grey", shape:"ring", text:"past date (ignored)"});
                        removeJobFromContext(jobId);
                    }
                    return;
                }
                
                scheduleConfig = date;
            } else {
                // Validate cron
                if (!isValidCron(scheduleInput)) {
                    if (!isRestoring) {
                        const errorMsg = {
                            payload: `Invalid cron string: ${scheduleInput}`,
                            error: { type: 'InvalidCron', input: scheduleInput }
                        };
                        node.send([null, errorMsg]);
                        node.error("Invalid cron string: " + scheduleInput, msg);
                    }
                    node.status({fill:"red", shape:"ring", text:"invalid cron"});
                    return;
                }
            }

            try {
                // Schedule the job
                const scheduled = schedule.scheduleJob(scheduleConfig, function() {
                    node.send([{
                        payload: "triggered",
                        original_payload: scheduleInput,
                        job_id: jobId,
                        timestamp: Date.now()
                    }, null]);
                    
                    node.status({fill:"green", shape:"dot", text:"triggered"});
                    
                    // If it was a one-time date, clear from context after execution
                    if (!isCron) {
                        if (node.persistent) {
                            // remove this job from persisted store
                            removeJobFromContext(jobId);
                        }
                        if (node.jobs && node.jobs[jobId]) {
                            node.jobs[jobId] = null;
                            delete node.jobs[jobId];
                        }
                    }
                    
                    // Update status after a brief moment
                    setTimeout(function() {
                        updateNodeStatus();
                    }, STATUS_UPDATE_DELAY);
                });
                if (scheduled) {
                    scheduled._scheduleInput = scheduleInput;
                    scheduled._jobId = jobId;
                    node.jobs[jobId] = scheduled;
                    updateNodeStatus();
                    if (shouldSave) {
                        saveJobsToContext();
                    }
                } else {
                    if (!isRestoring) {
                        const errorMsg = {
                            payload: `Failed to schedule job: ${scheduleInput}`,
                            error: { type: 'ScheduleFailed', input: scheduleInput }
                        };
                        node.send([null, errorMsg]);
                        node.error("Failed to schedule: " + scheduleInput, msg);
                    }
                    node.status({fill:"red", shape:"ring", text:"schedule failed"});
                }
            } catch (err) {
                if (!isRestoring) {
                    const errorMsg = {
                        payload: `Error scheduling job: ${err.message}`,
                        error: { type: 'ScheduleError', message: err.message, input: scheduleInput }
                    };
                    node.send([null, errorMsg]);
                    node.error(err, msg);
                }
                node.status({fill:"red", shape:"dot", text:"error"});
            }
        }

        /**
         * Cancel the job
         */
        function cancelJob(jobId) {
            jobId = jobId || 'default';
            if (node.jobs && node.jobs[jobId]) {
                try { node.jobs[jobId].cancel(); } catch (_err) { /* ignore */ }
                node.jobs[jobId] = null;
                delete node.jobs[jobId];
                updateNodeStatus();
                // Persist the change
                saveJobsToContext();
            }
        }

        // Restore jobs on startup
        restoreJobFromContext();

        // Handle incoming messages
        node.on('input', function(msg) {
            // Check for cancel command
            if (msg.action === 'cancel') {
                cancelJob(msg.job_id);
                return;
            }

            var scheduleInput = msg.inputDate;
            
            if (!scheduleInput) {
                const errorMsg = {
                    payload: "No schedule input provided in msg.inputDate",
                    error: { type: 'MissingInput' }
                };
                node.send([null, errorMsg]);
                node.warn("No schedule input provided in msg.inputDate");
                return;
            }

            // Schedule new job and save to context
            scheduleJob(scheduleInput, msg, false, true, msg.job_id || null);
        });

        node.on('close', function(_removed, done) {
            // Cancel all jobs on close but DO NOT clear context (so it persists)
            if (node.jobs) {
                Object.keys(node.jobs).forEach(id => {
                    try { if (node.jobs[id]) node.jobs[id].cancel(); } catch (_err) { /* ignore */ }
                    node.jobs[id] = null;
                    delete node.jobs[id];
                });
            }
            updateNodeStatus();
            if (typeof done === 'function') done();
        });
    }
    
    RED.nodes.registerType("fff-cron-task", CronTaskNode);
}

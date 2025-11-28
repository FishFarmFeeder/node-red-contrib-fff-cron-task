const helper = require("node-red-node-test-helper");
const cronTaskNode = require("../cron-task.js");
require("should");

helper.init(require.resolve('node-red'));

describe('fff-cron-task Node', function () {

    beforeEach(function (done) {
        helper.startServer(done);
    });

    afterEach(function (done) {
        helper.unload();
        helper.stopServer(done);
    });

    it('should be loaded', function (done) {
        const flow = [{ id: "n1", type: "fff-cron-task", name: "test cron" }];
        helper.load(cronTaskNode, flow, function () {
            const n1 = helper.getNode("n1");
            try {
                n1.should.have.property('name', 'test cron');
                done();
            } catch(err) {
                done(err);
            }
        });
    });

    describe('Cron Validation', function() {
        
        it('should accept valid cron string', function (done) {
            const flow = [
                { id: "n1", type: "fff-cron-task", name: "test", wires: [["n2"], ["n3"]] },
                { id: "n2", type: "helper" },
                { id: "n3", type: "helper" }
            ];
            
            helper.load(cronTaskNode, flow, function () {
                const n1 = helper.getNode("n1");
                const n3 = helper.getNode("n3");
                
                let errorReceived = false;
                n3.on("input", function (_msg) {
                    errorReceived = true;
                });

                // Valid cron: every 5 seconds
                n1.receive({ inputDate: "*/5 * * * * *" });
                
                // Wait a moment to ensure no error
                setTimeout(function() {
                    errorReceived.should.equal(false);
                    done();
                }, 200);
            });
        });

        it('should reject invalid cron string', function (done) {
            const flow = [
                { id: "n1", type: "fff-cron-task", name: "test", wires: [["n2"], ["n3"]] },
                { id: "n2", type: "helper" },
                { id: "n3", type: "helper" }
            ];
            
            helper.load(cronTaskNode, flow, function () {
                const n1 = helper.getNode("n1");
                const n3 = helper.getNode("n3");
                
                n3.on("input", function (msg) {
                    try {
                        msg.should.have.property('error');
                        msg.error.should.have.property('type', 'InvalidCron');
                        done();
                    } catch(err) {
                        done(err);
                    }
                });

                // Invalid cron
                n1.receive({ inputDate: "invalid cron string" });
            });
        });
    });

    describe('Date Validation', function() {
        
        it('should accept future date', function (done) {
            const flow = [
                { id: "n1", type: "fff-cron-task", name: "test", wires: [["n2"], ["n3"]] },
                { id: "n2", type: "helper" },
                { id: "n3", type: "helper" }
            ];
            
            helper.load(cronTaskNode, flow, function () {
                const n1 = helper.getNode("n1");
                const n3 = helper.getNode("n3");
                
                let errorReceived = false;
                n3.on("input", function (_msg) {
                    errorReceived = true;
                });

                // Future date: 10 seconds from now
                const futureDate = new Date(Date.now() + 10000);
                n1.receive({ inputDate: futureDate });
                
                setTimeout(function() {
                    errorReceived.should.equal(false);
                    done();
                }, 200);
            });
        });

        it('should reject past date', function (done) {
            const flow = [
                { id: "n1", type: "fff-cron-task", name: "test", wires: [["n2"], ["n3"]] },
                { id: "n2", type: "helper" },
                { id: "n3", type: "helper" }
            ];
            
            helper.load(cronTaskNode, flow, function () {
                const n1 = helper.getNode("n1");
                const n3 = helper.getNode("n3");
                
                n3.on("input", function (msg) {
                    try {
                        msg.should.have.property('error');
                        msg.error.should.have.property('type', 'PastDate');
                        done();
                    } catch(err) {
                        done(err);
                    }
                });

                // Past date
                const pastDate = new Date(Date.now() - 10000);
                n1.receive({ inputDate: pastDate });
            });
        });

        it('should reject invalid date string', function (done) {
            const flow = [
                { id: "n1", type: "fff-cron-task", name: "test", wires: [["n2"], ["n3"]] },
                { id: "n2", type: "helper" },
                { id: "n3", type: "helper" }
            ];
            
            helper.load(cronTaskNode, flow, function () {
                const n1 = helper.getNode("n1");
                const n3 = helper.getNode("n3");
                
                n3.on("input", function (msg) {
                    try {
                        msg.should.have.property('error');
                        msg.error.should.have.property('type', 'InvalidDate');
                        done();
                    } catch(err) {
                        done(err);
                    }
                });

                n1.receive({ inputDate: "not a date" });
            });
        });

        it('should trigger at scheduled future date', function (done) {
            this.timeout(5000);
            
            const flow = [
                { id: "n1", type: "fff-cron-task", name: "test", wires: [["n2"], ["n3"]] },
                { id: "n2", type: "helper" },
                { id: "n3", type: "helper" }
            ];
            
            helper.load(cronTaskNode, flow, function () {
                const n1 = helper.getNode("n1");
                const n2 = helper.getNode("n2");
                
                n2.on("input", function (msg) {
                    try {
                        msg.should.have.property('payload', 'triggered');
                        msg.should.have.property('job_id', 'default');
                        msg.should.have.property('timestamp');
                        done();
                    } catch(err) {
                        done(err);
                    }
                });

                // Schedule for 2 seconds from now
                const futureDate = new Date(Date.now() + 2000);
                n1.receive({ inputDate: futureDate });
            });
        });
    });

    describe('Job Cancellation', function() {
        
        it('should cancel default job', function (done) {
            const flow = [
                { id: "n1", type: "fff-cron-task", name: "test", wires: [["n2"], ["n3"]] },
                { id: "n2", type: "helper" },
                { id: "n3", type: "helper" }
            ];
            
            helper.load(cronTaskNode, flow, function () {
                const n1 = helper.getNode("n1");
                const n2 = helper.getNode("n2");
                
                let triggerCount = 0;
                n2.on("input", function (_msg) {
                    triggerCount++;
                });
                
                // Schedule a job for 3 seconds
                const futureDate = new Date(Date.now() + 3000);
                n1.receive({ inputDate: futureDate });
                
                setTimeout(function() {
                    // Cancel it before it triggers
                    n1.receive({ action: "cancel" });
                    
                    // Wait to ensure it doesn't trigger
                    setTimeout(function() {
                        triggerCount.should.equal(0);
                        done();
                    }, 4000);
                }, 500);
            });
        }).timeout(6000);

        it('should cancel specific job by ID', function (done) {
            const flow = [
                { id: "n1", type: "fff-cron-task", name: "test", wires: [["n2"], ["n3"]] },
                { id: "n2", type: "helper" },
                { id: "n3", type: "helper" }
            ];
            
            helper.load(cronTaskNode, flow, function () {
                const n1 = helper.getNode("n1");
                const n2 = helper.getNode("n2");
                
                let triggeredJobs = [];
                n2.on("input", function (msg) {
                    triggeredJobs.push(msg.job_id);
                });
                
                // Schedule two jobs
                const futureDate1 = new Date(Date.now() + 5000);
                const futureDate2 = new Date(Date.now() + 2000);
                
                n1.receive({ inputDate: futureDate1, job_id: "job1" });
                n1.receive({ inputDate: futureDate2, job_id: "job2" });
                
                setTimeout(function() {
                    // Cancel job1
                    n1.receive({ action: "cancel", job_id: "job1" });
                    
                    // Wait for job2 to trigger but not job1
                    setTimeout(function() {
                        triggeredJobs.should.containEql("job2");
                        triggeredJobs.should.not.containEql("job1");
                        done();
                    }, 4000);
                }, 500);
            });
        }).timeout(7000);
    });

    describe('Multiple Jobs', function() {
        
        it('should manage multiple jobs with different IDs', function (done) {
            const flow = [
                { id: "n1", type: "fff-cron-task", name: "test", wires: [["n2"], ["n3"]] },
                { id: "n2", type: "helper" },
                { id: "n3", type: "helper" }
            ];
            
            helper.load(cronTaskNode, flow, function () {
                const n1 = helper.getNode("n1");
                
                // Schedule multiple jobs
                const futureDate1 = new Date(Date.now() + 10000);
                const futureDate2 = new Date(Date.now() + 15000);
                const futureDate3 = new Date(Date.now() + 20000);
                
                n1.receive({ inputDate: futureDate1, job_id: "job1" });
                n1.receive({ inputDate: futureDate2, job_id: "job2" });
                n1.receive({ inputDate: futureDate3, job_id: "job3" });
                
                setTimeout(function() {
                    // Check that node has jobs
                    Object.keys(n1.jobs).length.should.equal(3);
                    done();
                }, 200);
            });
        });

        it('should trigger jobs independently', function (done) {
            this.timeout(5000);
            
            const flow = [
                { id: "n1", type: "fff-cron-task", name: "test", wires: [["n2"], ["n3"]] },
                { id: "n2", type: "helper" },
                { id: "n3", type: "helper" }
            ];
            
            helper.load(cronTaskNode, flow, function () {
                const n1 = helper.getNode("n1");
                const n2 = helper.getNode("n2");
                
                let triggeredJobs = [];
                
                n2.on("input", function (msg) {
                    triggeredJobs.push(msg.job_id);
                    
                    if (triggeredJobs.length === 2) {
                        try {
                            triggeredJobs.should.containEql("job1");
                            triggeredJobs.should.containEql("job2");
                            done();
                        } catch(err) {
                            done(err);
                        }
                    }
                });

                // Schedule two jobs at different times
                const futureDate1 = new Date(Date.now() + 1000);
                const futureDate2 = new Date(Date.now() + 2000);
                
                n1.receive({ inputDate: futureDate1, job_id: "job1" });
                n1.receive({ inputDate: futureDate2, job_id: "job2" });
            });
        });
    });

    describe('Persistence', function() {
        
        it('should save jobs when persistence is enabled', function (done) {
            const flow = [
                { id: "n1", type: "fff-cron-task", name: "test", persistent: true, wires: [["n2"], ["n3"]] },
                { id: "n2", type: "helper" },
                { id: "n3", type: "helper" }
            ];
            
            helper.load(cronTaskNode, flow, function () {
                const n1 = helper.getNode("n1");
                
                // Schedule a job
                const futureDate = new Date(Date.now() + 10000);
                n1.receive({ inputDate: futureDate, job_id: "persistent_job" });
                
                setTimeout(function() {
                    // Check context
                    const savedJobs = n1.context().get('scheduled_jobs');
                    try {
                        savedJobs.should.have.property('persistent_job');
                        done();
                    } catch(err) {
                        done(err);
                    }
                }, 200);
            });
        });
    });

    // Timezone support removed in favor of the Node-RED runtime timezone.

    describe('Missing Input', function() {
        
        it('should send error when no inputDate provided', function (done) {
            const flow = [
                { id: "n1", type: "fff-cron-task", name: "test", wires: [["n2"], ["n3"]] },
                { id: "n2", type: "helper" },
                { id: "n3", type: "helper" }
            ];
            
            helper.load(cronTaskNode, flow, function () {
                const n1 = helper.getNode("n1");
                const n3 = helper.getNode("n3");
                
                n3.on("input", function (msg) {
                    try {
                        msg.should.have.property('error');
                        msg.error.should.have.property('type', 'MissingInput');
                        done();
                    } catch(err) {
                        done(err);
                    }
                });

                // Send message without inputDate
                n1.receive({ payload: "test" });
            });
        });
    });
});

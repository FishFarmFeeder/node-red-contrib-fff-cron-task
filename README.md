# node-red-contrib-fff-cron-task

[![npm version](https://img.shields.io/npm/v/node-red-contrib-fff-cron-task.svg)](https://www.npmjs.com/package/node-red-contrib-fff-cron-task)
[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)

A robust Node-RED node for scheduling tasks using specific Dates or Cron patterns with persistence support.

## ✨ Features

- 📅 **Flexible Scheduling**: Use Date objects, date strings, or Cron patterns
- ✅ **Robust Validation**: Powered by `cron-parser` for accurate cron validation
- 🚨 **Error Handling**: Dedicated error output port for better flow control
- 💾 **Persistence**: Optional saving of job across Node-RED restarts
- 📊 **Status Indicators**: Visual feedback on job status and next execution
- 🧪 **Well Tested**: Comprehensive test suite included

## 📦 Installation

To install from npm:

```powershell
cd %HOMEPATH%\.node-red
npm install node-red-contrib-fff-cron-task
```

After restarting Node-RED, you will find the node under **function** category with the label **cron-task**.

## ⚙️ Configuration

Configure the node through the editor:

| Field | Type | Description | Default |
|-------|------|-------------|---------|
| `name` | string | Label visible in the editor | `""` |
| `persistent` | boolean | Save job across restarts | `false` |

## 📥 Input

Control the node by sending messages with these properties:

### Schedule a Task

- **`msg.inputDate`** (required): Schedule definition
  - Date object or date string (e.g., `"2025-12-25 10:00:00"`) for one-time execution
  - Cron string (e.g., `"*/10 * * * * *"`) for recurring execution
  - **Note:** Dates must be in the future

### Cancel a Task

- **`msg.action`**: Set to `"cancel"` to stop the scheduled task
 - **`msg.job_id`**: Optional Job identifier to schedule multiple jobs in the same node (default is `"default"`)

> **Note:** Multiple jobs are supported; if you send `msg.job_id` the node will manage multiple schedules at the same time. If you do not supply `msg.job_id`, the node will use a `"default"` job id and that single job will be replaced when a new schedule is sent.

## 📤 Outputs

The node has **2 output ports**:

### Output 1: Triggered Events

Messages sent when a schedule fires:

```javascript
{
  payload: "triggered",
  original_payload: "...",      // Original schedule input
  job_id: "default",            // job id of the fired job
  timestamp: 1234567890         // Execution timestamp (ms)
}
```

## Persistence

When `persistent` is enabled, scheduled jobs are saved in Node-RED node context under the key `scheduled_jobs`. The object maps `job_id` to the schedule input and is restored automatically on node restart or redeploy.

### Output 2: Errors

Messages sent when validation fails or errors occur:

```javascript
{
  payload: "Error description",
  error: {
    type: "InvalidCron",        // Error type
    input: "invalid input",     // What caused the error
    // ... additional context
  }
}
```

**Error Types:**
- `MissingInput`: No `msg.inputDate` provided
- `InvalidDate`: Date string could not be parsed
- `PastDate`: Date is not in the future
- `InvalidCron`: Cron string is malformed
- `ScheduleFailed`: Scheduling failed  
- `ScheduleError`: Exception during scheduling

## 📚 Examples

### Basic: Schedule a Future Date

```javascript
msg.inputDate = new Date(Date.now() + 60000); // 1 minute from now
return msg;
```

### Recurring Cron Task

```javascript
// Every 5 minutes
msg.inputDate = "*/5 * * * *";
return msg;
```

### Cancel a Task

```javascript
msg.action = "cancel";
return msg;
```

### Example Flow

Import this flow to see the node in action:

```json
[
    {
        "id": "inject-future",
        "type": "inject",
        "name": "Future Date (+5s)",
        "props": [{"p": "payload"}],
        "repeat": "",
        "crontab": "",
        "once": false,
        "onceDelay": 0.1,
        "topic": "",
        "payload": "",
        "payloadType": "date",
        "wires": [["function-add-5s"]]
    },
    {
        "id": "function-add-5s",
        "type": "function",
        "name": "Add 5s",
        "func": "var date = new Date(msg.payload);\ndate.setSeconds(date.getSeconds() + 5);\nmsg.inputDate = date;\nreturn msg;",
        "outputs": 1,
        "wires": [["cron-task"]]
    },
    {
        "id": "inject-cron",
        "type": "inject",
        "name": "Cron (Every 5s)",
        "props": [{"p": "inputDate", "v": "*/5 * * * * *", "vt": "str"}],
        "repeat": "",
        "crontab": "",
        "once": false,
        "topic": "",
        "wires": [["cron-task"]]
    },
    {
        "id": "inject-cancel",
        "type": "inject",
        "name": "Cancel",
        "props": [{"p": "action", "v": "cancel", "vt": "str"}],
        "repeat": "",
        "topic": "",
        "wires": [["cron-task"]]
    },
    {
        "id": "cron-task",
        "type": "fff-cron-task",
        "name": "My Scheduler",
        "persistent": false,
        "wires": [["debug-success"], ["debug-error"]]
    },
    {
        "id": "debug-success",
        "type": "debug",
        "name": "Success",
        "active": true,
        "tosidebar": true,
        "console": false,
        "tostatus": false,
        "complete": "true",
        "targetType": "full"
    },
    {
        "id": "debug-error",
        "type": "debug",
        "name": "Errors",
        "active": true,
        "tosidebar": true,
        "console": false,
        "tostatus": false,
        "complete": "true",
        "targetType": "full"
    }
]
```

## 🕐 Cron Syntax

The node supports standard cron syntax (validated by `cron-parser`):

```
*    *    *    *    *    *
┬    ┬    ┬    ┬    ┬    ┬
│    │    │    │    │    │
│    │    │    │    │    └ day of week (0 - 7) (0 or 7 is Sun)
│    │    │    └───────── month (1 - 12)
│    │    └────────────── day of month (1 - 31)
│    └─────────────────── hour (0 - 23)
│    └──────────────────── minute (0 - 59)
└───────────────────────── second (0 - 59, optional)
```

**Common Examples:**
- `0 0 * * *` - Daily at midnight
- `0 */6 * * *` - Every 6 hours
- `*/30 * * * * *` - Every 30 seconds
- `0 0 1 * *` - First day of every month at midnight

## 🔍 Troubleshooting

### Job not triggering after restart

**Solution:** Enable the "Persistent" option in node configuration to save the job across restarts.

### Cron validation errors

**Issue:** Your cron string is rejected.  
**Solution:** Use the cron syntax reference above. The node uses `cron-parser` for validation, which is strict about format.

### Task gets replaced

**Issue:** Previous task disappears when scheduling a new one.  
**Explanation:** This is by design - only one task is active per node instance. Use multiple node instances for multiple independent schedules.

## 🧪 Testing

Run the test suite:

```bash
npm test
```

## 🤝 Contributing

Contributions are what make the open source community such an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

See [CONTRIBUTING.md](CONTRIBUTING.md) for more details.

## 📝 Changelog

See [CHANGELOG.md](CHANGELOG.md) for a list of changes.

## 📄 License

ISC © Carlos Fontán

## 🔗 Links

- [npm package](https://www.npmjs.com/package/node-red-contrib-fff-cron-task)
- [GitHub repository](https://github.com/fishfarmfeeder/node-red-contrib-fff-cron-task)
- [Issues](https://github.com/fishfarmfeeder/node-red-contrib-fff-cron-task/issues)

---

**Made with ❤️ by [Fish Farm Feeder](https://github.com/fishfarmfeeder)**

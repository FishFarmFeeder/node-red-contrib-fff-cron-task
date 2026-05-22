# node-red-contrib-fff-cron-task

[![npm version](https://img.shields.io/npm/v/node-red-contrib-fff-cron-task.svg)](https://www.npmjs.com/package/node-red-contrib-fff-cron-task)
[![CI](https://github.com/fishfarmfeeder/node-red-contrib-fff-cron-task/actions/workflows/ci.yml/badge.svg)](https://github.com/fishfarmfeeder/node-red-contrib-fff-cron-task/actions/workflows/ci.yml)
[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)

A Node-RED node to schedule one-shot or recurring tasks using a Date or a cron expression. Supports multiple independent jobs in one node and optional persistence across restarts.

## Install

```bash
cd ~/.node-red
npm install node-red-contrib-fff-cron-task
```

On Windows replace the first line with `cd %HOMEPATH%\.node-red`.

After restarting Node-RED, drag **cron-task** from the *function* category onto your flow.

## Quick start

Wire an inject (or function) node in front and set one of:

```js
// recurring
msg.cron = "*/5 * * * *";   // every 5 minutes

// or one-shot
msg.date = new Date(Date.now() + 60_000); // one minute from now
```

Output 1 fires when the schedule triggers. Output 2 emits errors.

A ready-to-import example flow is available at [`examples/basic-flow.json`](examples/basic-flow.json).

## Configuration

| Field        | Type    | Default | Description                                |
| ------------ | ------- | ------- | ------------------------------------------ |
| `name`       | string  | `""`    | Label shown in the editor                  |
| `persistent` | boolean | `false` | Survive restarts/redeploys (see Persistence) |

## Inputs

| Property        | Type            | Description                                                                 |
| --------------- | --------------- | --------------------------------------------------------------------------- |
| `msg.cron`      | string          | Cron expression (5 or 6 fields). Validated strictly.                        |
| `msg.date`      | Date \| string  | One-shot execution time. Must be in the future.                             |
| `msg.inputDate` | string \| Date  | Legacy field — auto-detects cron vs date. Kept for backward compatibility.  |
| `msg.job_id`    | string          | Optional. Defaults to `"default"`. Lets you run multiple jobs in one node.  |
| `msg.action`    | string          | Control command. See below.                                                 |

Priority when more than one schedule input is set: `msg.cron` > `msg.date` > `msg.inputDate`.

### Control commands (`msg.action`)

| Value         | Effect                                                                                          |
| ------------- | ----------------------------------------------------------------------------------------------- |
| `"cancel"`    | Stops the job referenced by `msg.job_id` (or `"default"` if omitted).                           |
| `"cancelAll"` | Stops every active job in this node instance.                                                   |
| `"list"`      | Emits the current job list on output 1 as `{ payload: "jobs", jobs: [...] }`. Schedules nothing. |

## Outputs

**Output 1 — Triggered events and `list` responses**

When a schedule fires:

```js
{
  payload: "triggered",
  original_payload: "...",      // what you scheduled
  job_id: "default",
  timestamp: 1748000000000,
  nextInvocation: "2026-05-22T14:35:00.000Z" // null for one-shot dates after they fire
}
```

When you send `msg.action="list"`:

```js
{
  payload: "jobs",
  jobs: [
    { job_id: "a", schedule: "*/5 * * * *",       type: "cron", nextInvocation: "2026-05-22T14:35:00.000Z" },
    { job_id: "b", schedule: "2026-12-25T10:00:00", type: "date", nextInvocation: "2026-12-25T10:00:00.000Z" }
  ],
  timestamp: 1748000000000
}
```

**Output 2 — Errors**

```js
{
  payload: "Invalid cron string: foo",
  error: {
    type: "InvalidCron", // MissingInput | InvalidCron | InvalidDate | PastDate | ScheduleFailed | ScheduleError
    input: "foo"
  }
}
```

## Persistence

When **Persistent** is on, jobs are saved to the node context under the key `scheduled_jobs` and restored automatically.

> **Important — context backend matters.** Node-RED stores context **in memory** by default, so jobs are lost on a real process restart even with persistence enabled. To survive restarts, configure a filesystem store in `settings.js`:
>
> ```js
> contextStorage: {
>   default: { module: "localfilesystem" }
> }
> ```
>
> Without it, "persistent" only survives redeploys (not process restarts).

## Cron syntax

Standard 5 or 6-field cron, validated by [`cron-parser`](https://www.npmjs.com/package/cron-parser):

```
*    *    *    *    *    *
|    |    |    |    |    |
|    |    |    |    |    +-- day of week (0-7, 0 and 7 are Sun)
|    |    |    |    +------- month (1-12)
|    |    |    +------------ day of month (1-31)
|    |    +----------------- hour (0-23)
|    +---------------------- minute (0-59)
+--------------------------- second (0-59, optional)
```

Examples:

- `0 0 * * *` — daily at midnight
- `0 */6 * * *` — every 6 hours
- `*/30 * * * * *` — every 30 seconds (6-field form)
- `0 0 1 * *` — first day of every month at midnight

## Troubleshooting

- **Job disappears after restart even with `persistent: true`** — your context store is in-memory. See [Persistence](#persistence).
- **Cron rejected** — `cron-parser` is strict. Test your expression at [crontab.guru](https://crontab.guru/) first.
- **Two schedules clash inside one node** — pass distinct `msg.job_id` values to keep them independent. Reusing the same id replaces the previous job.

## Testing

```bash
npm test
npm run lint
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Bug reports and PRs welcome — please add tests for behavioral changes.

## License

ISC — Carlos Fontán.

# Changelog

All notable changes to this project are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [1.0.0] - 2026-06-03

First public release.

### Added
- Local-first router/firewall watchdog that runs entirely on a Shelly Plug S Gen3.
- HTTP liveness probe of the powered device's own management interface — any HTTP
  response (incl. 401/403/404) counts as alive; only a timeout or connection
  failure counts as dead.
- State machine (MON / CYC / WAIT / LOCK) with a configurable failure threshold
  before a power cycle.
- Exponential backoff between retries, capped by `max_retry_s`, and a hard
  `Max cycles / incident` ceiling that parks the device in a safe LOCK state.
- Persistent state in Shelly KVS (`defib_state`) so a power loss or firmware
  restart mid-incident resumes safely (power restored, back to MON).
- Maintenance mode and tunable thresholds exposed as Shelly virtual components
  (`Watchdog`, `Failures to cycle`, `Max cycles / incident`).
- README with architecture overview, setup, configuration reference, a "how to
  test" walkthrough, and a Mermaid state diagram.
- Example KVS config in `examples/defib_config.json`.

[1.0.0]: https://github.com/westlund/shelly-defibrillator/releases/tag/v1.0.0

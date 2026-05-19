# Shelly Router Defibrillator

A self-contained router watchdog for Shelly Plug S Gen3.

This project uses a Shelly Plug S Gen3 to monitor a local router/firewall and perform a controlled power cycle only when the router itself stops responding.

It was built for a real-world problem: my home automation server and router occasionally freeze and have to be power-cycled manually. A normal “internet is down” automation would be too aggressive, because an ISP outage does not mean the router itself is dead. A home automation server that is down can't restart itself.

This script checks whether the device it powers responds locally on the LAN.

## What it does

The Shelly Plug S Gen3 powers the device, let's say it it our Internet router. A script running locally on the Shelly periodically sends an HTTP request to the router’s local management IP.

If the router responds with any HTTP response, it is considered alive.

If the router does not respond after a configurable number of consecutive failures, the Shelly Plug turns the router off, waits a few seconds, turns it back on, then waits for the router to boot before testing again.

If the router still does not respond, the script retries with an increasing wait interval.

## Design goals

- Local-first: runs directly on the Shelly device
- No dependency on Home Assistant, cloud services, DNS or internet - not even [Shelly Control Cloud](https://control.shelly.cloud)
- Detects router failure, not internet failure
- Conservative recovery logic with backoff
- Maintenance mode via virtual component
- Persistent state using Shelly KVS
- Minimal enough to run within Shelly scripting memory limits

## Why HTTP and not ping?

Shelly scripting on this device does not provide a simple ICMP ping primitive. HTTP is therefore used as a practical local liveness check.

For this use case, the exact HTTP status code does not matter. A `401`, `403`, `404`, redirect, or login page still proves that the router’s TCP/IP stack and web service path are alive enough to avoid a hard power cycle.

Timeout or connection failure means the router did not respond locally.

## Hardware

- Shelly Plug S Gen3 (may be compatible with older plugs but not tested)
- Router/firewall powered through the Shelly Plug
- Optional: separate access points that keep Wi-Fi available even if the router freezes *(If you only have one router and the plug is disconnected from it's wi-fi it may indicate your router needs some HLR.)*

Tested conceptually with:
- Local router with managment interface available at `http://192.168.1.1/`
- UniFi Dream Router that answers at `https://192.168.1.1/status`
- Home Assistant at http://192.168.2.42/4357`

## Security considerations

Jamming your wifi or the plug directly will result in the plug losing its network thus invoking a cold reboot even if the router is alive. Someone with knowledge about your setup may use this to orchestrate a denial of service attack.

Mitigation: Install a Shelly 1 Pro using wired network rather than wi-fi.

## Important safety note

Do not use this for equipment where sudden power loss can cause damage, data loss, or unsafe conditions.

This is intended for home/small-office network equipment that can tolerate a controlled power cycle.

## Configuration

The script uses three Shelly virtual components:

| Component | Purpose |
|---|---|
| Watchdog enabled | Enables/disables the watchdog. Turning it off also acts as maintenance mode. |
| Failures to cycle | Number of consecutive failed probes before power cycling. |
| Max cycles / incident | Maximum power cycles per incident. `0` means retry forever. |

Additional installation parameters are stored in Shelly KVS under the key:

```text
defib_config
```

If there is no configuration entry one will be created for you with some default settings. You will want to edit it adding your own parameters.

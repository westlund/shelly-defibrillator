// Defibrillator minimal -- Shelly Plug S Gen3
// HTTP response = router alive.
// KVS config key: defib_config
// KVS state key:  defib_state

let KCFG = "defib_config";
let KST = "defib_state";

let MON = "mon";
let CYC = "cyc";
let WAIT = "wait";
let LOCK = "lock";

let cfg = {
  target_url: "http://192.168.1.1/",
  power_off_s: 10,
  initial_retry_s: 300,
  max_retry_s: 86400,
  poll_s: 60,
  timeout_s: 5,
  switch_id: 0,

  enabled: true,
  fail_threshold: 3,
  max_cycles: 5
};

let st = {
  phase: MON,
  fails: 0,
  wait: 0,
  total: 0,
  incident: 0
};

let comps = [
  {id:201,t:"boolean",k:"enabled",n:"Watchdog enabled",d:true},
  {id:211,t:"number",k:"fail_threshold",n:"Failures to cycle",d:3,min:1,max:20},
  {id:213,t:"number",k:"max_cycles",n:"Max cycles / incident",d:5,min:0,max:50}
];

let i = 0;
let tok = 0;
let poll = null;

function log(x) { print("[Defib] " + x); }
function ms(s) { return s * 1000; }
function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

function save() {
  Shelly.call("KVS.Set", {key:KST, value:JSON.stringify(st)}, null);
}

function power(on) {
  Shelly.call("Switch.Set", {id:cfg.switch_id, on:on}, null);
  log(on ? "ON" : "OFF");
}

function maxed() {
  return cfg.max_cycles > 0 && st.incident >= cfg.max_cycles;
}

function apply(c, v) {
  if (c.t === "boolean") {
    cfg[c.k] = (v === true || v === "true");
    return;
  }

  let n = parseFloat("" + v);
  if (n !== n) return;
  if (c.min !== undefined && n < c.min) n = c.min;
  if (c.max !== undefined && n > c.max) n = c.max;
  cfg[c.k] = Math.floor(n);
}

function reset() {
  tok++;
  st.phase = MON;
  st.fails = 0;
  st.wait = 0;
  st.incident = 0;
  save();
  log("reset");
}

function disable() {
  tok++;
  power(true);
  st.phase = MON;
  st.fails = 0;
  st.wait = 0;
  st.incident = 0;
  save();
  log("disabled");
}

function lock() {
  tok++;
  power(true);
  st.phase = LOCK;
  st.fails = 0;
  st.wait = 0;
  save();
  log("lockout");
}

function probe(cb) {
  Shelly.call(
    "HTTP.GET",
    {url:cfg.target_url, timeout:cfg.timeout_s, ssl_ca:"*"},
    function(res, err) {
      cb(!err && res !== null);
    }
  );
}

function cycle() {
  if (!cfg.enabled) {
    disable();
    return;
  }

  if (maxed()) {
    lock();
    return;
  }

  let my = tok;

  if (st.wait === 0) st.wait = cfg.initial_retry_s;

  st.phase = CYC;
  st.total++;
  st.incident++;
  save();

  log("cycle " + st.incident + "/" + cfg.max_cycles + " wait " + st.wait);

  power(false);

  Timer.set(ms(cfg.power_off_s), false, function() {
    if (my !== tok) return;
    if (!cfg.enabled) {
      disable();
      return;
    }

    power(true);

    st.phase = WAIT;
    save();

    Timer.set(ms(st.wait), false, function() {
      if (my !== tok) return;
      if (!cfg.enabled) {
        disable();
        return;
      }

      probe(function(up) {
        if (my !== tok) return;

        if (up) {
          st.phase = MON;
          st.fails = 0;
          st.wait = 0;
          st.incident = 0;
          save();
          log("recovered");
          return;
        }

        if (maxed()) {
          lock();
          return;
        }

        st.wait = Math.min(st.wait * 2, cfg.max_retry_s);
        save();
        cycle();
      });
    });
  });
}

function tick() {
  if (!cfg.enabled) return;
  if (st.phase !== MON) return;

  probe(function(up) {
    if (!cfg.enabled || st.phase !== MON) return;

    if (up) {
      if (st.fails > 0) {
        st.fails = 0;
        st.wait = 0;
        st.incident = 0;
        save();
        log("ok");
      }
      return;
    }

    st.fails++;
    save();
    log("fail " + st.fails + "/" + cfg.fail_threshold);

    if (st.fails >= cfg.fail_threshold) cycle();
  });
}

function setupNext(done) {
  if (i >= comps.length) {
    done();
    return;
  }

  let c = comps[i++];

  Shelly.call(cap(c.t) + ".GetStatus", {id:c.id}, function(res, err) {
    if (!err && res && res.value !== undefined) {
      apply(c, res.value);
      setupNext(done);
      return;
    }

    let conf = {name:c.n, persisted:true, default_value:c.d};
    if (c.min !== undefined) conf.min = c.min;
    if (c.max !== undefined) conf.max = c.max;

    Shelly.call("Virtual.Add", {id:c.id, type:c.t, config:conf}, function() {
      apply(c, c.d);
      Timer.set(100, false, function() {
        setupNext(done);
      });
    });
  });
}

function handler() {
  Shelly.addStatusHandler(function(ev) {
    if (!ev.delta || ev.delta.value === undefined) return;

    for (let j = 0; j < comps.length; j++) {
      let c = comps[j];

      if (ev.id === c.id && ev.name === c.t) {
        let old = cfg.enabled;
        apply(c, ev.delta.value);

        if (c.k === "enabled") {
          if (!cfg.enabled) {
            disable();
            return;
          }

          if (!old && cfg.enabled) {
            reset();
            Timer.set(1000, false, tick);
            return;
          }
        }

        log("changed " + c.k);
        return;
      }
    }
  });
}

function loadCfg(cb) {
  Shelly.call("KVS.Get", {key:KCFG}, function(res, err) {
    if (!err && res && res.value) {
      try {
        let o = JSON.parse(res.value);

        if (o.target_url !== undefined) cfg.target_url = "" + o.target_url;
        if (o.power_off_s !== undefined) cfg.power_off_s = parseInt(o.power_off_s, 10);
        if (o.initial_retry_s !== undefined) cfg.initial_retry_s = parseInt(o.initial_retry_s, 10);
        if (o.max_retry_s !== undefined) cfg.max_retry_s = parseInt(o.max_retry_s, 10);
        if (o.poll_s !== undefined) cfg.poll_s = parseInt(o.poll_s, 10);
        if (o.timeout_s !== undefined) cfg.timeout_s = parseInt(o.timeout_s, 10);
        if (o.switch_id !== undefined) cfg.switch_id = parseInt(o.switch_id, 10);
      } catch(e) {}
      cb();
      return;
    }

    Shelly.call("KVS.Set", {
      key:KCFG,
      value:JSON.stringify({
        target_url:cfg.target_url,
        power_off_s:cfg.power_off_s,
        initial_retry_s:cfg.initial_retry_s,
        max_retry_s:cfg.max_retry_s,
        poll_s:cfg.poll_s,
        timeout_s:cfg.timeout_s,
        switch_id:cfg.switch_id
      })
    }, function() {
      cb();
    });
  });
}

function loadState(cb) {
  Shelly.call("KVS.Get", {key:KST}, function(res, err) {
    if (!err && res && res.value) {
      try {
        let o = JSON.parse(res.value);

        if (o.phase !== undefined) st.phase = o.phase;
        if (o.fails !== undefined) st.fails = o.fails;
        if (o.wait !== undefined) st.wait = o.wait;
        if (o.total !== undefined) st.total = o.total;
        if (o.incident !== undefined) st.incident = o.incident;

        // compatibility with earlier versions
        if (o.fail_count !== undefined) st.fails = o.fail_count;
        if (o.current_wait !== undefined) st.wait = o.current_wait;
        if (o.total_cycles !== undefined) st.total = o.total_cycles;
        if (o.incident_cycles !== undefined) st.incident = o.incident_cycles;
      } catch(e) {}
    }

    cb();
  });
}

function boot() {
  loadCfg(function() {
    loadState(function() {
      if (st.phase === CYC || st.phase === WAIT) {
        power(true);
        st.phase = MON;
        st.fails = 0;
        st.wait = 0;
        st.incident = 0;
        save();
      }

      i = 0;

      setupNext(function() {
        handler();

        poll = Timer.set(ms(cfg.poll_s), true, tick);

        log("ready " + cfg.target_url);

        Timer.set(5000, false, function() {
          if (cfg.enabled && st.phase !== LOCK) tick();
        });
      });
    });
  });
}

boot();

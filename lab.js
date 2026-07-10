(function () {
  "use strict";

  // ============================================================
  // 흔들기 패턴 분석 실험실
  // 중력을 제거한 가속도 크기(motion energy)에서 "피크(흔들림 1회)"를
  // 검출하고, 그 간격/진폭/규칙성/정지를 계산해 5가지 패턴을 감지한다.
  // ============================================================

  // --- DOM ---
  var startBtn = document.getElementById("startBtn");
  var statusEl = document.getElementById("status");
  var energyFill = document.getElementById("energyFill");
  var mIntensity = document.getElementById("mIntensity");
  var mIntensityLabel = document.getElementById("mIntensityLabel");
  var mSpeed = document.getElementById("mSpeed");
  var mSpeedLabel = document.getElementById("mSpeedLabel");
  var mBpm = document.getElementById("mBpm");
  var mConsistency = document.getElementById("mConsistency");
  var mState = document.getElementById("mState");

  var cardIntensity = document.getElementById("cardIntensity");
  var cardSpeed = document.getElementById("cardSpeed");
  var cardRhythm = document.getElementById("cardRhythm");
  var cardTriple = document.getElementById("cardTriple");
  var cardStop = document.getElementById("cardStop");
  var tripleDots = document.getElementById("tripleDots").querySelectorAll(".dot");
  var stopGameBtn = document.getElementById("stopGameBtn");
  var stopStatus = document.getElementById("stopStatus");

  // --- 튜닝 파라미터 (선형 가속도 m/s^2 기준) ---
  var CFG = {
    gravityAlpha: 0.8,     // 중력 저역통과 계수
    peakThreshold: 4.0,    // 피크로 인정할 최소 세기
    strongThreshold: 14.0, // "강한" 흔들기 기준
    quietThreshold: 1.5,   // 이 아래면 정지로 간주
    quietDuration: 400,    // 이 시간(ms) 이상 조용하면 "멈춤"
    refractory: 110,       // 피크 간 최소 간격(ms) — 중복 방지
    peakWindow: 3000,      // 최근 통계에 쓸 시간창(ms)
    maxPeaks: 8
  };

  // --- 상태 ---
  var listening = false;
  var gravity = null;
  var above = false, candAmp = 0, candTime = 0, lastPeakTime = 0;
  var peaks = []; // {t, amp}
  var stillSince = null, stopped = true, curMag = 0;

  function now() { return performance.now(); }

  function setStatus(msg, kind) {
    statusEl.textContent = msg;
    statusEl.className = "status" + (kind ? " " + kind : "");
  }

  // --- 신호 처리: 한 샘플 ---
  function processSample(ax, ay, az) {
    var t = now();
    if (gravity === null) gravity = { x: ax, y: ay, z: az };
    var a = CFG.gravityAlpha;
    gravity.x = a * gravity.x + (1 - a) * ax;
    gravity.y = a * gravity.y + (1 - a) * ay;
    gravity.z = a * gravity.z + (1 - a) * az;
    var lx = ax - gravity.x, ly = ay - gravity.y, lz = az - gravity.z;
    var mag = Math.sqrt(lx * lx + ly * ly + lz * lz);
    curMag = mag;

    // 피크 검출: 임계값 위 구간의 최댓값을, 임계값 아래로 떨어질 때 확정
    if (mag > CFG.peakThreshold) {
      above = true;
      if (mag > candAmp) { candAmp = mag; candTime = t; }
    } else {
      if (above && candAmp > 0 && (t - lastPeakTime) > CFG.refractory) {
        registerPeak(candTime, candAmp);
        lastPeakTime = candTime;
      }
      above = false;
      candAmp = 0;
    }

    // 정지 검출
    if (mag < CFG.quietThreshold) {
      if (stillSince === null) stillSince = t;
      if (t - stillSince > CFG.quietDuration) stopped = true;
    } else {
      stillSince = null;
      stopped = false;
    }
  }

  function registerPeak(t, amp) {
    peaks.push({ t: t, amp: amp });
    trimPeaks(t);
    if (navigator.vibrate) navigator.vibrate(12);
    onStrongPeak(t, amp);
  }

  function trimPeaks(t) {
    var cutoff = t - CFG.peakWindow;
    while (peaks.length && peaks[0].t < cutoff) peaks.shift();
    if (peaks.length > CFG.maxPeaks) peaks.splice(0, peaks.length - CFG.maxPeaks);
  }

  // --- 통계 계산 ---
  function metrics() {
    var t = now();
    var ps = peaks.filter(function (p) { return p.t > t - CFG.peakWindow; });
    var m = { count: ps.length, freq: 0, bpm: 0, consistency: 0, avgAmp: 0, lastAmp: 0 };
    if (ps.length) {
      var sum = 0, i;
      for (i = 0; i < ps.length; i++) sum += ps[i].amp;
      m.avgAmp = sum / ps.length;
      m.lastAmp = ps[ps.length - 1].amp;
    }
    if (ps.length >= 2) {
      var iv = [], j;
      for (j = 1; j < ps.length; j++) iv.push(ps[j].t - ps[j - 1].t);
      var mean = iv.reduce(function (a, b) { return a + b; }, 0) / iv.length;
      m.freq = mean > 0 ? 1000 / mean : 0;
      m.bpm = mean > 0 ? 60000 / mean : 0;
      var varr = iv.reduce(function (a, b) { return a + (b - mean) * (b - mean); }, 0) / iv.length;
      var cv = mean > 0 ? Math.sqrt(varr) / mean : 1;
      m.consistency = Math.max(0, Math.min(1, 1 - cv));
    }
    return m;
  }

  function classifyIntensity(a) {
    if (a >= 16) return "강함 💪";
    if (a <= 7) return "약함 🍃";
    return "보통";
  }
  function classifySpeed(hz) {
    if (!hz) return "-";
    if (hz >= 4) return "빠름 ⚡";
    if (hz <= 1.8) return "느림 🐢";
    return "보통";
  }

  function setBadge(card, ok, text) {
    var badge = card.querySelector(".challenge__badge");
    var status = card.querySelector(".challenge__status");
    card.classList.toggle("is-success", ok);
    if (badge) badge.textContent = ok ? "성공 ✅" : "대기";
    if (status) status.textContent = text;
  }

  // --- ④ 강하게 3번 → 멈추기 ---
  var tripleHits = [], tripleSuccess = false, tripleSuccessAt = 0;

  function onStrongPeak(t, amp) {
    if (amp >= CFG.strongThreshold) {
      if (tripleSuccess && t - tripleSuccessAt > 700) tripleSuccess = false;
      tripleHits.push(t);
    }
  }

  function updateTriple() {
    var t = now();
    tripleHits = tripleHits.filter(function (x) { return x > t - 2500; });
    var n = Math.min(3, tripleHits.length);
    for (var i = 0; i < tripleDots.length; i++) {
      tripleDots[i].classList.toggle("dot--on", i < n);
    }
    if (tripleHits.length >= 3 && stopped && !tripleSuccess) {
      tripleSuccess = true;
      tripleSuccessAt = t;
      setBadge(cardTriple, true, "성공! 강하게 3번 → 정지 감지 🎉");
      if (navigator.vibrate) navigator.vibrate([25, 40, 25, 40, 25]);
    } else if (!tripleSuccess) {
      if (tripleHits.length === 0) setBadge(cardTriple, false, "강하게 흔들어 보세요.");
      else if (tripleHits.length < 3) setBadge(cardTriple, false, "강한 흔들기 " + tripleHits.length + "/3");
      else setBadge(cardTriple, false, "좋아요! 이제 멈추세요 ✋");
    }
  }

  // --- ⑤ 정확히 멈추기 (타이밍) ---
  var gamePhase = "idle"; // idle | shaking | cue | done
  var cueTime = 0, cueTimer = null, audioCtx = null;

  function beep() {
    try {
      if (!audioCtx) return;
      var osc = audioCtx.createOscillator();
      var gain = audioCtx.createGain();
      osc.frequency.value = 880;
      gain.gain.value = 0.15;
      osc.connect(gain); gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.15);
    } catch (e) { /* noop */ }
  }

  function startStopGame() {
    if (!listening) return;
    if (cueTimer) clearTimeout(cueTimer);
    gamePhase = "shaking";
    setBadge(cardStop, false, "");
    stopStatus.textContent = "흔드세요... 신호를 기다려요 🌀";
    stopGameBtn.disabled = true;
    // 1.5~3.5초 뒤 무작위로 신호
    var delay = 1500 + Math.floor(Math.random() * 2000);
    cueTimer = setTimeout(function () {
      gamePhase = "cue";
      cueTime = now();
      stopStatus.textContent = "지금 멈춰! 🎯";
      cardStop.classList.add("is-cue");
      beep();
      if (navigator.vibrate) navigator.vibrate(60);
    }, delay);
  }

  function updateStopGame() {
    if (gamePhase === "cue" && stopped) {
      // 실제 멈춘 시점 ≈ 조용해지기 시작한 시각(stillSince)
      var actual = stillSince || now();
      var delta = Math.max(0, actual - cueTime);
      gamePhase = "done";
      cardStop.classList.remove("is-cue");
      var grade = delta < 250 ? "완벽! ⭐⭐⭐" : delta < 500 ? "훌륭해요 ⭐⭐" : delta < 900 ? "좋아요 ⭐" : "조금 늦었어요";
      setBadge(cardStop, delta < 900, "반응 " + Math.round(delta) + "ms · " + grade);
      stopStatus.textContent = "다시 도전하려면 「도전 시작」을 누르세요.";
      stopGameBtn.disabled = false;
    }
  }

  // --- 실시간 UI 루프 ---
  function tick() {
    if (!listening) return;
    energyFill.style.width = Math.min(100, (curMag / 25) * 100) + "%";

    var m = metrics();
    mIntensity.textContent = m.avgAmp.toFixed(1);
    mIntensityLabel.textContent = m.count ? classifyIntensity(m.avgAmp) : "-";
    mSpeed.textContent = m.freq ? m.freq.toFixed(1) : "0.0";
    mSpeedLabel.textContent = classifySpeed(m.freq);
    mBpm.textContent = m.bpm ? Math.round(m.bpm) : "0";
    mConsistency.textContent = (m.consistency * 100).toFixed(0) + "%";
    mState.textContent = stopped ? "정지 ⏹" : "흔드는 중 🌀";
    mState.classList.toggle("is-active", !stopped);

    // ① 세기
    if (m.count) {
      setBadge(cardIntensity, true, "감지: " + m.avgAmp.toFixed(1) + " (" + classifyIntensity(m.avgAmp) + ")");
    }
    // ② 속도
    if (m.count >= 2) {
      setBadge(cardSpeed, true, "감지: " + m.freq.toFixed(1) + " Hz (" + classifySpeed(m.freq) + ")");
    }
    // ③ 박자
    if (m.count >= 4 && m.consistency >= 0.82) {
      setBadge(cardRhythm, true, "성공! " + Math.round(m.bpm) + " BPM · 일정함 " + (m.consistency * 100).toFixed(0) + "%");
    } else if (m.count >= 2) {
      setBadge(cardRhythm, false, "맞추는 중... 일정함 " + (m.consistency * 100).toFixed(0) + "%");
    }
    // ④, ⑤
    updateTriple();
    updateStopGame();

    requestAnimationFrame(tick);
  }

  // --- 센서 시작 ---
  function onMotion(event) {
    var acc = event.accelerationIncludingGravity || event.acceleration;
    if (!acc || acc.x == null) return;
    processSample(acc.x, acc.y, acc.z);
  }

  function startListening() {
    if (listening) return;
    if (typeof window.DeviceMotionEvent === "undefined") {
      setStatus("이 기기/브라우저는 모션 센서를 지원하지 않아요. 📵", "error");
      return;
    }
    // 오디오 컨텍스트는 사용자 제스처 안에서 생성/재개해야 함
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (AC) { audioCtx = new AC(); if (audioCtx.resume) audioCtx.resume(); }
    } catch (e) { /* noop */ }

    window.addEventListener("devicemotion", onMotion, true);
    listening = true;
    startBtn.textContent = "감지 중...";
    startBtn.disabled = true;
    stopGameBtn.disabled = false;
    stopStatus.textContent = "「도전 시작」을 누르세요.";
    setStatus("흔들어 보세요! 모든 패턴을 실시간 분석합니다 🔬", "active");
    requestAnimationFrame(tick);
  }

  function requestAndStart() {
    if (
      typeof DeviceMotionEvent !== "undefined" &&
      typeof DeviceMotionEvent.requestPermission === "function"
    ) {
      DeviceMotionEvent.requestPermission()
        .then(function (state) {
          if (state === "granted") startListening();
          else setStatus("모션 센서 권한이 거부되었어요. 설정에서 허용해 주세요.", "error");
        })
        .catch(function () { setStatus("권한 요청 중 오류가 발생했어요.", "error"); });
    } else {
      startListening();
    }
  }

  // --- 이벤트 ---
  startBtn.addEventListener("click", requestAndStart);
  stopGameBtn.addEventListener("click", startStopGame);

  if (typeof window.DeviceMotionEvent === "undefined") {
    setStatus("데스크톱에는 모션 센서가 없어요. 모바일에서 열어 주세요. 📱", "");
  }

  // --- 테스트 훅 (자동화 테스트에서 상태 확인용) ---
  window.__lab = {
    getMetrics: metrics,
    isStopped: function () { return stopped; },
    feed: processSample
  };
})();

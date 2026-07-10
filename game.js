(function () {
  "use strict";

  // ============================================================
  // 흔들흔들 물약 공방 — MVP
  // 주문 → 재료 선택 → 흔들기 제조 → 결과 판정
  // 흔들기 감지 엔진은 실험실(lab.js)과 동일한 피크/세기/주파수/정지 방식을 사용.
  // ============================================================

  // ---------- 데이터 ----------
  var INGREDIENTS = [
    { id: "ice", name: "얼음 버섯", emoji: "🍄" },
    { id: "lizard", name: "청색 도마뱀 꼬리", emoji: "🦎" },
    { id: "soda", name: "탄산수", emoji: "💧" },
    { id: "moon", name: "달빛 시럽", emoji: "🌙" },
    { id: "rose", name: "붉은 장미", emoji: "🌹" },
    { id: "star", name: "별가루", emoji: "✨" },
    { id: "dragon", name: "용의 눈물", emoji: "🐉" },
    { id: "frog", name: "개구리 다리", emoji: "🐸" }
  ];

  // 흔들기 패턴 3종
  var PATTERNS = {
    slow: { label: "천천히 크게 흔들기 🐢", hint: "천천히 크게 흔드세요 🐢" },
    fast: { label: "빠르고 짧게 흔들기 ⚡", hint: "빠르고 짧게 흔드세요 ⚡" },
    triple: { label: "강하게 3번 흔든 뒤 멈추기 ✊", hint: "강하게 3번! 그리고 딱 멈추기 ✊" }
  };

  var RECIPES = [
    { id: "fire", name: "화염 저항 물약", emoji: "🔥", ings: ["ice", "lizard", "soda"], pattern: "slow",
      clue: "용과 싸워야 하는데 불이 무서워요 🐉" },
    { id: "invis", name: "투명 물약", emoji: "👻", ings: ["moon", "star"], pattern: "fast",
      clue: "오늘 밤 투명해지고 싶어요 👻" },
    { id: "conf", name: "자신감 물약", emoji: "💃", ings: ["rose", "star", "soda"], pattern: "fast",
      clue: "데이트 전에 자신감이 필요해요 💕" },
    { id: "love", name: "폭발성 사랑의 묘약", emoji: "💘", ings: ["rose", "moon"], pattern: "triple",
      clue: "누군가와 아주 강렬하게 사랑에 빠지고 싶어요 💘" },
    { id: "brave", name: "용기의 물약", emoji: "⚔️", ings: ["dragon", "lizard"], pattern: "slow",
      clue: "무서운 던전에 들어갈 용기가 필요해요 ⚔️" }
  ];

  var CUSTOMERS = [
    { name: "기사", emoji: "🛡️" },
    { name: "마법사", emoji: "🧙" },
    { name: "고블린", emoji: "👺" }
  ];

  // 재미있는 실패 부작용 5종
  var SIDE_EFFECTS = [
    "몸이 투명해졌는데 옷만 그대로 남았어요! 👕",
    "목소리가 고양이 울음소리로 변했어요! 🐱",
    "머리카락만 3배 빨리 자라기 시작했어요! 💇",
    "손님이 잠깐 닭으로 변했어요! 🐔",
    "물약을 마신 손님이 의자를 사랑하게 됐어요! 🪑💕"
  ];

  var DAY_CUSTOMERS = 5;

  // ---------- DOM ----------
  var $ = function (id) { return document.getElementById(id); };
  var screens = {
    title: $("screenTitle"), order: $("screenOrder"), ingredients: $("screenIngredients"),
    brew: $("screenBrew"), result: $("screenResult"), summary: $("screenSummary")
  };
  var statusEl = $("status");

  // ---------- 게임 상태 ----------
  var game = {
    day: 1, idx: 0, gold: 0, rep: 0,
    order: null, picked: [], grades: []
  };

  // ---------- 흔들기 분석 엔진 ----------
  var CFG = {
    gravityAlpha: 0.8, peakThreshold: 4.0, strongThreshold: 14.0,
    quietThreshold: 1.5, quietDuration: 380, refractory: 110
  };
  var listening = false, gravity = null;
  var above = false, candAmp = 0, candTime = 0, lastPeakTime = 0;
  var curMag = 0, stillSince = null, stopped = true;
  var brew = null; // 제조 세션

  function now() { return performance.now(); }

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

    if (mag > CFG.peakThreshold) {
      above = true;
      if (mag > candAmp) { candAmp = mag; candTime = t; }
    } else {
      if (above && candAmp > 0 && (t - lastPeakTime) > CFG.refractory) {
        onPeak(candTime, candAmp);
        lastPeakTime = candTime;
      }
      above = false; candAmp = 0;
    }

    if (mag < CFG.quietThreshold) {
      if (stillSince === null) stillSince = t;
      if (t - stillSince > CFG.quietDuration) stopped = true;
    } else {
      stillSince = null; stopped = false;
    }
  }

  function onPeak(t, amp) {
    if (navigator.vibrate) navigator.vibrate(12);
    if (!brew || !brew.active) return;
    brew.peaks.push({ t: t, amp: amp });
    if (amp >= CFG.strongThreshold) {
      brew.strongCount++;
      if (brew.strongCount === 3 && brew.time3 === 0) brew.time3 = t;
    }
  }

  // ---------- 화면 전환 ----------
  function show(name) {
    Object.keys(screens).forEach(function (k) { screens[k].hidden = (k !== name); });
    $("hud").hidden = (name === "title");
  }

  function setStatus(msg, kind) {
    statusEl.textContent = msg;
    statusEl.className = "status" + (kind ? " " + kind : "");
  }

  function updateHud() {
    $("hudDay").textContent = game.day;
    $("hudCustomer").textContent = Math.min(game.idx + 1, DAY_CUSTOMERS);
    $("hudTotal").textContent = DAY_CUSTOMERS;
    $("hudGold").textContent = game.gold;
    $("hudRep").textContent = game.rep;
  }

  // ---------- 손님/주문 ----------
  function nextCustomer() {
    if (game.idx >= DAY_CUSTOMERS) { showSummary(); return; }
    var recipe = RECIPES[Math.floor(Math.random() * RECIPES.length)];
    var cust = CUSTOMERS[Math.floor(Math.random() * CUSTOMERS.length)];
    game.order = { recipe: recipe, cust: cust };
    game.picked = [];
    updateHud();

    $("custFace").textContent = cust.emoji;
    $("custName").textContent = cust.name;
    $("orderText").textContent = "“" + recipe.clue + "”";
    $("orderHint").textContent = "필요한 물약을 추론해 재료를 고르세요.";
    show("order");
  }

  // ---------- 재료 선택 ----------
  function buildIngredients() {
    var grid = $("ingGrid");
    grid.innerHTML = "";
    INGREDIENTS.forEach(function (ing) {
      var b = document.createElement("button");
      b.className = "ing";
      b.dataset.id = ing.id;
      b.innerHTML = "<span class='ing__emoji'>" + ing.emoji + "</span><span class='ing__name'>" + ing.name + "</span>";
      b.addEventListener("click", function () { toggleIng(ing.id, b); });
      grid.appendChild(b);
    });
  }

  function toggleIng(id, btn) {
    var i = game.picked.indexOf(id);
    if (i >= 0) { game.picked.splice(i, 1); btn.classList.remove("ing--on"); }
    else { game.picked.push(id); btn.classList.add("ing--on"); }
    renderPicked();
  }

  function renderPicked() {
    var el = $("pickedList");
    if (!game.picked.length) { el.innerHTML = "<span class='picked-empty'>아직 담은 재료가 없어요</span>"; return; }
    el.innerHTML = game.picked.map(function (id) {
      var ing = INGREDIENTS.filter(function (x) { return x.id === id; })[0];
      return "<span class='picked-chip'>" + ing.emoji + " " + ing.name + "</span>";
    }).join("");
  }

  function goIngredients() {
    $("orderTextSm").textContent = "“" + game.order.recipe.clue + "”";
    renderPicked();
    // reset ing buttons
    var btns = $("ingGrid").querySelectorAll(".ing");
    for (var i = 0; i < btns.length; i++) btns[i].classList.remove("ing--on");
    show("ingredients");
  }

  // ---------- 제조 ----------
  function goBrew() {
    var pattern = game.order.recipe.pattern;
    $("brewHint").textContent = PATTERNS[pattern].hint;
    $("liquid").style.height = "12%";
    $("liquid").style.filter = "hue-rotate(0deg)";
    $("bubbles").textContent = "";
    $("brewFill").style.width = "0%";
    $("brewStartBtn").disabled = !listening;
    $("brewStatus").textContent = listening ? "버튼을 누르고 흔드세요!" : "먼저 타이틀에서 센서를 켜주세요.";
    show("brew");
  }

  var BREW_MS = 4200;

  function startBrew() {
    if (!listening) return;
    brew = { active: true, startT: now(), peaks: [], strongCount: 0, time3: 0, ended: false, exploded: false };
    stopped = false; stillSince = null;
    $("brewStartBtn").disabled = true;
    $("brewStatus").textContent = "흔드는 중... 🌀";
    requestAnimationFrame(brewTick);
  }

  function brewTick() {
    if (!brew || !brew.active) return;
    var t = now();
    var elapsed = t - brew.startT;
    var pattern = game.order.recipe.pattern;

    // 액체 연출: 현재 세기로 높이/색
    var fillPct = Math.min(92, 12 + curMag * 3);
    $("liquid").style.height = fillPct + "%";
    $("liquid").style.filter = "hue-rotate(" + Math.min(180, curMag * 8) + "deg)";
    $("brewFill").style.width = Math.min(100, (elapsed / BREW_MS) * 100) + "%";

    // 과하게 흔들면 거품/균열
    if (pattern === "triple" && brew.strongCount >= 6 && !brew.exploded) {
      brew.exploded = true;
      $("bubbles").textContent = "💥";
      endBrew();
      return;
    }
    if (curMag > 22) $("bubbles").textContent = "🫧🫧";
    else if (curMag > 10) $("bubbles").textContent = "🫧";

    // 종료 조건
    if (pattern === "triple") {
      // 강하게 3번 + 정지 → 성공적으로 종료
      if (brew.strongCount >= 3 && stopped && (t - brew.time3) > 150) { endBrew(); return; }
      if (elapsed > 6000) { endBrew(); return; }
    } else {
      if (elapsed > BREW_MS) { endBrew(); return; }
    }
    requestAnimationFrame(brewTick);
  }

  function endBrew() {
    if (!brew || brew.ended) return;
    brew.ended = true;
    brew.active = false;
    var score = judge();
    showResult(score);
  }

  // ---------- 판정 ----------
  function brewMetrics() {
    var ps = brew.peaks;
    var m = { count: ps.length, freq: 0, avgAmp: 0 };
    if (ps.length) {
      var s = 0; for (var i = 0; i < ps.length; i++) s += ps[i].amp;
      m.avgAmp = s / ps.length;
    }
    if (ps.length >= 2) {
      var iv = [], j;
      for (j = 1; j < ps.length; j++) iv.push(ps[j].t - ps[j - 1].t);
      var mean = iv.reduce(function (a, b) { return a + b; }, 0) / iv.length;
      m.freq = mean > 0 ? 1000 / mean : 0;
    }
    return m;
  }

  function band(v, lo, hi) { // v가 [lo,hi] 안이면 1, 밖으로 갈수록 0
    if (v >= lo && v <= hi) return 1;
    var d = v < lo ? lo - v : v - hi;
    var span = (hi - lo) || 1;
    return Math.max(0, 1 - d / span);
  }

  function judge() {
    var recipe = game.order.recipe;
    var m = brewMetrics();

    // 재료 정확도
    var need = recipe.ings;
    var matched = 0, extra = 0;
    game.picked.forEach(function (id) { if (need.indexOf(id) >= 0) matched++; else extra++; });
    var missing = need.length - matched;
    var ingScore = Math.max(0, Math.min(1, (matched - extra * 0.7 - missing * 0.7) / need.length));

    // 패턴 정확도
    var patScore = 0, exploded = brew.exploded;
    if (recipe.pattern === "slow") {
      patScore = 0.5 * band(m.freq, 0.7, 2.2) + 0.5 * band(m.avgAmp, 13, 40);
      if (m.count < 2) patScore = 0.1;
    } else if (recipe.pattern === "fast") {
      patScore = 0.6 * band(m.freq, 3.2, 8) + 0.4 * band(m.avgAmp, 4, 13);
      if (m.count < 3) patScore *= 0.4;
    } else { // triple
      if (exploded) patScore = 0;
      else if (brew.strongCount === 3) patScore = 1;
      else if (brew.strongCount === 4) patScore = 0.7;
      else if (brew.strongCount === 5) patScore = 0.45;
      else if (brew.strongCount >= 1) patScore = 0.35;
      else patScore = 0.1;
    }

    var total = Math.round((ingScore * 0.4 + patScore * 0.6) * 100);
    if (exploded) total = Math.min(total, 15);

    return { total: total, ingScore: ingScore, patScore: patScore, exploded: exploded, m: m };
  }

  function gradeFor(score) {
    if (score.exploded) return { key: "boom", label: "💥 폭발!", emoji: "💥", gold: 0, rep: -1 };
    var t = score.total;
    if (t >= 90) return { key: "perfect", label: "완벽한 제조!", emoji: "🌟", gold: 50, rep: 2 };
    if (t >= 72) return { key: "good", label: "훌륭하지만 효과가 조금 약해요", emoji: "😊", gold: 30, rep: 1 };
    if (t >= 52) return { key: "side", label: "효과는 있지만 부작용 발생!", emoji: "😵", gold: 15, rep: 0 };
    if (t >= 30) return { key: "unknown", label: "정체불명의 물약…", emoji: "🌀", gold: 5, rep: 0 };
    return { key: "boom", label: "💥 실패작 폭발!", emoji: "💥", gold: 0, rep: -1 };
  }

  function showResult(score) {
    var g = gradeFor(score);
    game.gold += g.gold;
    game.rep = Math.max(0, game.rep + g.rep);
    game.grades.push(g.key);
    updateHud();

    var recipe = game.order.recipe;
    $("resultGrade").textContent = g.label;
    $("resultGrade").className = "result-grade grade--" + g.key;
    $("resultEmoji").textContent = recipe.emoji + " " + g.emoji;

    var reaction;
    if (g.key === "perfect") reaction = game.order.cust.emoji + " 손님이 감탄했어요! “정확히 " + recipe.name + "네요!”";
    else if (g.key === "good") reaction = game.order.cust.emoji + " “나쁘지 않네요, 고마워요.”";
    else reaction = game.order.cust.emoji + " " + SIDE_EFFECTS[Math.floor(Math.random() * SIDE_EFFECTS.length)];
    $("resultText").textContent = reaction;

    $("resultScore").innerHTML =
      "정답 레시피: <b>" + recipe.emoji + " " + recipe.name + "</b> · 필요한 조작: <b>" + PATTERNS[recipe.pattern].label + "</b><br />" +
      "재료 정확도 " + Math.round(score.ingScore * 100) + "% · 흔들기 정확도 " + Math.round(score.patScore * 100) + "% → " +
      "<b>총점 " + score.total + "</b> · 🪙+" + g.gold;

    game.idx++;
    $("nextBtn").textContent = (game.idx >= DAY_CUSTOMERS) ? "영업 종료 →" : "다음 손님 →";
    show("result");
  }

  // ---------- 결산 ----------
  function showSummary() {
    var counts = {};
    game.grades.forEach(function (k) { counts[k] = (counts[k] || 0) + 1; });
    var names = { perfect: "🌟 완벽", good: "😊 훌륭", side: "😵 부작용", unknown: "🌀 정체불명", boom: "💥 폭발" };
    var rows = Object.keys(names).filter(function (k) { return counts[k]; })
      .map(function (k) { return "<div class='sum-row'><span>" + names[k] + "</span><b>" + counts[k] + "명</b></div>"; }).join("");
    $("summaryBox").innerHTML =
      "<div class='sum-big'>🪙 " + game.gold + " 골드</div>" +
      "<div class='sum-big'>⭐ 평판 " + game.rep + "</div>" +
      "<div class='sum-list'>" + (rows || "<div class='sum-row'>기록 없음</div>") + "</div>";
    show("summary");
  }

  function newDay() {
    game.day += 1; game.idx = 0; game.grades = [];
    updateHud();
    nextCustomer();
  }

  // ---------- 센서 시작 ----------
  function onMotion(event) {
    var acc = event.accelerationIncludingGravity || event.acceleration;
    if (!acc || acc.x == null) return;
    processSample(acc.x, acc.y, acc.z);
  }

  function startListening() {
    if (listening) {
      // 이미 켜짐 → 그냥 게임 시작
      beginGame();
      return;
    }
    if (typeof window.DeviceMotionEvent === "undefined") {
      // 센서 없어도 게임 진행은 가능 (제조는 흔들림 없이 낮은 점수)
      setStatus("모션 센서가 없는 기기예요. 모바일에서 열면 흔들기가 동작해요. 📱", "");
    } else {
      window.addEventListener("devicemotion", onMotion, true);
    }
    listening = true;
    beginGame();
  }

  function beginGame() {
    game = { day: 1, idx: 0, gold: 0, rep: 0, order: null, picked: [], grades: [] };
    updateHud();
    nextCustomer();
  }

  function requestAndStart() {
    if (typeof DeviceMotionEvent !== "undefined" &&
        typeof DeviceMotionEvent.requestPermission === "function") {
      DeviceMotionEvent.requestPermission()
        .then(function (state) {
          if (state === "granted") { window.addEventListener("devicemotion", onMotion, true); listening = true; beginGame(); }
          else { setStatus("권한이 거부됐어요. 흔들기 없이도 진행은 가능해요.", "error"); listening = true; beginGame(); }
        })
        .catch(function () { setStatus("권한 요청 오류. 흔들기 없이 진행합니다.", "error"); listening = true; beginGame(); });
    } else {
      startListening();
    }
  }

  // ---------- 이벤트 배선 ----------
  $("startBtn").addEventListener("click", requestAndStart);
  $("toIngredientsBtn").addEventListener("click", goIngredients);
  $("clearIngBtn").addEventListener("click", function () {
    game.picked = [];
    var btns = $("ingGrid").querySelectorAll(".ing");
    for (var i = 0; i < btns.length; i++) btns[i].classList.remove("ing--on");
    renderPicked();
  });
  $("toBrewBtn").addEventListener("click", goBrew);
  $("brewStartBtn").addEventListener("click", startBrew);
  $("nextBtn").addEventListener("click", nextCustomer);
  $("againBtn").addEventListener("click", newDay);

  buildIngredients();

  // ---------- 테스트 훅 ----------
  window.__game = {
    feed: processSample,
    state: function () { return game; },
    isListening: function () { return listening; }
  };
})();

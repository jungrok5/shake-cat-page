(function () {
  "use strict";

  // --- DOM ---
  var countEl = document.getElementById("count");
  var forceEl = document.getElementById("force");
  var bestEl = document.getElementById("best");
  var statusEl = document.getElementById("status");
  var startBtn = document.getElementById("startBtn");
  var resetBtn = document.getElementById("resetBtn");
  var catEmoji = document.getElementById("catEmoji");

  // --- State ---
  var count = 0;
  var best = Number(localStorage.getItem("shakeCat.best") || 0);
  var listening = false;

  // Shake detection tuning
  var SHAKE_THRESHOLD = 15; // m/s^2 of movement delta
  var SHAKE_COOLDOWN = 350; // ms between counted shakes
  var lastShakeTime = 0;
  var lastX = null, lastY = null, lastZ = null;

  var CAT_FACES = ["😺", "😸", "😹", "😻", "🙀", "😼", "😽", "🐱"];

  bestEl.textContent = best;

  // --- Helpers ---
  function setStatus(msg, kind) {
    statusEl.textContent = msg;
    statusEl.className = "status" + (kind ? " " + kind : "");
  }

  function registerShake(magnitude) {
    var now = Date.now();
    if (now - lastShakeTime < SHAKE_COOLDOWN) return;
    lastShakeTime = now;

    count += 1;
    countEl.textContent = count;

    // pop animation
    countEl.classList.remove("pop");
    void countEl.offsetWidth; // reflow to restart animation
    countEl.classList.add("pop");

    // cat reaction
    catEmoji.textContent = CAT_FACES[count % CAT_FACES.length];
    catEmoji.classList.remove("shaking");
    void catEmoji.offsetWidth;
    catEmoji.classList.add("shaking");

    // haptic feedback if available
    if (navigator.vibrate) navigator.vibrate(30);

    if (count > best) {
      best = count;
      bestEl.textContent = best;
      localStorage.setItem("shakeCat.best", String(best));
    }
  }

  function onMotion(event) {
    var acc = event.accelerationIncludingGravity || event.acceleration;
    if (!acc || acc.x == null) return;

    var x = acc.x, y = acc.y, z = acc.z;

    if (lastX !== null) {
      var delta = Math.abs(x - lastX) + Math.abs(y - lastY) + Math.abs(z - lastZ);
      forceEl.textContent = delta.toFixed(1);
      if (delta > SHAKE_THRESHOLD) {
        registerShake(delta);
      }
    }

    lastX = x;
    lastY = y;
    lastZ = z;
  }

  function startListening() {
    if (listening) return;
    if (typeof window.DeviceMotionEvent === "undefined") {
      setStatus("이 기기/브라우저는 모션 센서를 지원하지 않아요. 📵", "error");
      return;
    }
    window.addEventListener("devicemotion", onMotion, true);
    listening = true;
    startBtn.textContent = "감지 중...";
    startBtn.disabled = true;
    setStatus("고양이가 흔들림을 기다리고 있어요! 흔들어 보세요 🐾", "active");
  }

  function requestAndStart() {
    // iOS 13+ requires explicit permission
    if (
      typeof DeviceMotionEvent !== "undefined" &&
      typeof DeviceMotionEvent.requestPermission === "function"
    ) {
      DeviceMotionEvent.requestPermission()
        .then(function (state) {
          if (state === "granted") {
            startListening();
          } else {
            setStatus("모션 센서 권한이 거부되었어요. 설정에서 허용해 주세요.", "error");
          }
        })
        .catch(function () {
          setStatus("권한 요청 중 오류가 발생했어요.", "error");
        });
    } else {
      startListening();
    }
  }

  function reset() {
    count = 0;
    countEl.textContent = "0";
    forceEl.textContent = "0.0";
    catEmoji.textContent = "🐱";
    setStatus(
      listening ? "초기화했어요! 다시 흔들어 보세요 🐾" : "초기화했어요.",
      listening ? "active" : ""
    );
  }

  // --- Events ---
  startBtn.addEventListener("click", requestAndStart);
  resetBtn.addEventListener("click", reset);

  // Tap fallback: works everywhere (desktop testing + tapping the cat on mobile)
  document.querySelector(".cat").addEventListener("click", function () {
    registerShake(SHAKE_THRESHOLD + 1);
  });

  // Hint when no motion sensor is available (e.g. desktop browsers)
  if (typeof window.DeviceMotionEvent === "undefined") {
    setStatus("이 기기에는 모션 센서가 없어요. 고양이를 눌러서 즐겨보세요! 🐱", "");
  }
})();

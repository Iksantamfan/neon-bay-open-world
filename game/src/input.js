// NEON BAY — keyboard and mouse input, with pointer lock for mouse look.

(function () {
  var keys = {};
  var pressed = {};       // keys pressed since last consume (edge trigger)
  var mouseDX = 0;
  var mouseDY = 0;
  var mouseDown = false;
  var locked = false;
  var canvas = null;

  function init(canvasEl) {
    canvas = canvasEl;
    window.addEventListener("keydown", function (e) {
      if (e.repeat) return;
      keys[e.code] = true;
      pressed[e.code] = true;
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].indexOf(e.code) >= 0) {
        e.preventDefault();
      }
    });
    window.addEventListener("keyup", function (e) { keys[e.code] = false; });
    window.addEventListener("blur", function () { keys = {}; });
    document.addEventListener("mousemove", function (e) {
      if (locked) { mouseDX += e.movementX || 0; mouseDY += e.movementY || 0; }
    });
    document.addEventListener("mousedown", function (e) {
      if (e.button === 0) mouseDown = true;
    });
    document.addEventListener("mouseup", function (e) {
      if (e.button === 0) mouseDown = false;
    });
    document.addEventListener("pointerlockchange", function () {
      locked = document.pointerLockElement === canvas;
    });
    if (canvas) {
      canvas.addEventListener("click", function () {
        if (NB.state.mode === "playing" && !locked && canvas.requestPointerLock) {
          try { canvas.requestPointerLock(); } catch (e) {}
        }
      });
    }
  }

  function isDown(code) { return !!keys[code]; }
  function wasPressed(code) {
    var v = !!pressed[code];
    if (v) pressed[code] = false;
    return v;
  }
  function consumeMouse() {
    var d = { dx: mouseDX, dy: mouseDY, down: mouseDown };
    mouseDX = 0; mouseDY = 0; mouseDown = false;
    return d;
  }
  function clearPressed() { pressed = {}; }
  function unlock() {
    if (document.pointerLockElement && document.exitPointerLock) {
      try { document.exitPointerLock(); } catch (e) {}
    }
  }

  NB.input = {
    init: init,
    isDown: isDown,
    wasPressed: wasPressed,
    consumeMouse: consumeMouse,
    clearPressed: clearPressed,
    unlock: unlock,
    isLocked: function () { return locked; },
  };
})();

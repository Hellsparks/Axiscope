// Jog arrows around the camera image: click the side of the picture you want
// the nozzle to move towards.
//
// The arrows are screen-relative. With a saved camera mapping (Map camera, or
// the first Auto align), each edge drives whichever machine axis actually moves
// the nozzle that way on screen, taking the current Flip H / Flip V / Rotate
// into account. Without a mapping they fall back to the side pad's convention
// (right = +X, up = +Y), which is what an oriented view shows. Arrow keys jog
// X/Y the same way; Page Up / Page Down jog Z.
//
// The edge buttons are ordinary `.jog[data-jog]` buttons, so app.js handles
// their clicks and their enabled/disabled state; this file only keeps their
// data-jog / data-dir and labels in step with the view.

// On window so app.js / vision.js can call it with `if (window.SurroundJog)`
window.SurroundJog = {
  // Screen-space image motion (screen y down) of a raw-frame vector, using the
  // same transform CameraView.applyView puts on the stage: flip, then rotate.
  toScreen(vec) {
    const v = S.view, r = (v.rotate || 0) * Math.PI / 180;
    const x = v.flipH ? -vec[0] : vec[0], y = v.flipV ? -vec[1] : vec[1];
    return [x * Math.cos(r) - y * Math.sin(r), x * Math.sin(r) + y * Math.cos(r)];
  },

  // { right: {axis, dir}, up: {axis, dir}, mapped }
  mapping() {
    const m = typeof Vision !== 'undefined' && Vision.mapping && Vision.mapping.matrix;
    if (!m) return { right: { axis: 'X', dir: 1 }, up: { axis: 'Y', dir: 1 }, mapped: false };

    // mapping.matrix columns: image motion (px/mm) for +X and +Y machine moves
    const sx = this.toScreen([m[0][0], m[1][0]]);
    const sy = this.toScreen([m[0][1], m[1][1]]);
    // The axis that moves more sideways on screen gets the left/right arrows,
    // the other one up/down, so the two never end up on the same axis.
    const xSideways = Math.abs(sx[0]) / Math.hypot(...sx) >= Math.abs(sy[0]) / Math.hypot(...sy);
    const [hAxis, hVec, vAxis, vVec] = xSideways ? ['X', sx, 'Y', sy] : ['Y', sy, 'X', sx];
    return {
      right: { axis: hAxis, dir: hVec[0] >= 0 ? 1 : -1 },
      up:    { axis: vAxis, dir: vVec[1] <= 0 ? 1 : -1 },   // screen y grows downwards
      mapped: true,
    };
  },

  update() {
    const map = this.mapping();
    const edges = {
      right: map.right,
      left:  { axis: map.right.axis, dir: -map.right.dir },
      up:    map.up,
      down:  { axis: map.up.axis, dir: -map.up.dir },
    };
    document.querySelectorAll('.edge-jog[data-edge]').forEach(b => {
      const e = edges[b.dataset.edge];
      const label = (e.dir > 0 ? '+' : '−') + e.axis;
      b.dataset.jog = e.axis;
      b.dataset.dir = e.dir;
      b.querySelector('.edge-label').textContent = label;
      b.title = `Move the nozzle ${b.dataset.edge} on screen (${label})` +
        (map.mapped ? '' : '. Map the camera so the arrows follow Flip / Rotate');
      b.setAttribute('aria-label', `Move ${b.dataset.edge} on screen, ${label}`);
    });
  },

  init() {
    // On the Calibration tab, arrow keys press the matching edge button and
    // Page Up / Page Down press the side panel's Z+ / Z− buttons.
    const keys = {
      ArrowUp: '.edge-jog[data-edge="up"]',
      ArrowDown: '.edge-jog[data-edge="down"]',
      ArrowLeft: '.edge-jog[data-edge="left"]',
      ArrowRight: '.edge-jog[data-edge="right"]',
      PageUp: '.z-jog .jog[data-jog="Z"][data-dir="1"]',
      PageDown: '.z-jog .jog[data-jog="Z"][data-dir="-1"]',
    };
    document.addEventListener('keydown', e => {
      const selector = keys[e.key];
      if (!selector || S.tab !== 'calibration' || e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.target.closest('input, textarea, select, [contenteditable], #minicam')) return;
      const b = document.querySelector(selector);
      if (!b || b.disabled) return;
      e.preventDefault();
      if (!e.repeat) b.click();
    });
    this.update();
  },
};

SurroundJog.init();

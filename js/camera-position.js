// Saved camera position for T0.
//
// A nozzle camera that is put back by hand lands in roughly the same spot
// each time. Saving T0's position over it lets the next session drive T0
// back close enough for fine jogging or Auto align to take over.
//
// The position lives in Moonraker's database (namespace "axiscope"), so every
// browser that opens Axiscope sees it; a copy is kept in this browser in case
// the printer refuses the write. Capturing the T0 reference updates it too.
// "Move T0 to camera" stages at the bed centre in Y (clear of the tool docks)
// before coming forward over the camera; see goTo().

window.CameraPosition = {
  NS: 'axiscope',
  KEY: 'camera_position',
  LIFT_MM: 5,          // approach height above the saved Z
  XY_FEED: 6000,       // mm/min
  Z_FEED: 600,
  DESCEND_FEED: 120,   // slow final LIFT_MM down to the camera

  pos: null,           // { x, y, z, saved_at }
  source: '',          // 'printer' | 'browser'
  moving: false,

  lsKey() { return 'campos:' + S.host; },

  parse(v) {
    if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return null; } }
    return v && [v.x, v.y, v.z].every(Number.isFinite) ? v : null;
  },

  async load() {
    this.pos = null;
    this.source = '';
    try {
      const v = this.parse(await Printer.dbGet(this.NS, this.KEY));
      if (v) { this.pos = v; this.source = 'printer'; }
    } catch (e) { /* nothing saved yet (404) or no database: fall back below */ }
    if (!this.pos) {
      const v = this.parse(LS.get(this.lsKey(), null));
      if (v) { this.pos = v; this.source = 'browser'; }
    }
    this.render();
  },

  // Reason the buttons can't be used right now, or '' when they can.
  blocked(needSaved) {
    if (!S.online || !S.status || !S.status.pos) return 'No position from the printer yet.';
    if (!isHomed()) return 'Home the printer first.';
    if (activeTool() !== 0) return 'Select T0 first: the camera position is T0’s.';
    if (S.busy || this.moving) return 'Wait for the current move or auto alignment to finish.';
    if (needSaved && !this.pos) return 'No camera position saved yet. Centre T0 over the camera and press Save current.';
    return '';
  },

  async save(p, { quiet = false } = {}) {
    const pos = { x: +p.x.toFixed(3), y: +p.y.toFixed(3), z: +p.z.toFixed(3), saved_at: Math.round(Date.now() / 1000) };
    this.pos = pos;
    LS.set(this.lsKey(), pos);
    try {
      await Printer.dbSet(this.NS, this.KEY, JSON.stringify(pos));
      this.source = 'printer';
      if (!quiet) notice(`Camera position saved: X ${pos.x.toFixed(2)} Y ${pos.y.toFixed(2)} Z ${pos.z.toFixed(2)}.`);
    } catch (e) {
      this.source = 'browser';
      notice('Camera position saved in this browser only; the printer refused it (' + e.message + ').', 'error');
    }
    this.render();
  },

  saveCurrent() {
    const why = this.blocked(false);
    if (why) { notice('Camera position not saved: ' + why, 'error'); return; }
    const p = S.status.pos;
    this.save({ x: p[0], y: p[1], z: p[2] });
  },

  // 1. X to the camera's X and Y to the bed centre (away from the tool docks)
  // 2. Z to saved Z + LIFT_MM at normal speed
  // 3. Y forward over the camera
  // 4. slowly down the last LIFT_MM to the saved Z
  // If the toolhead starts below saved Z + LIFT_MM it rises first, so step 1
  // never drags low across the machine.
  async goTo() {
    const why = this.blocked(true);
    if (why) { notice('Not moved: ' + why, 'error'); return; }
    const st = S.status, c = this.pos;
    if (!st.axisMin || !st.axisMax) { notice('Not moved: the printer did not report its axis limits.', 'error'); return; }
    const centreY = (st.axisMin[1] + st.axisMax[1]) / 2;
    const clearZ = Math.min(c.z + this.LIFT_MM, st.axisMax[2]);
    const f = v => v.toFixed(3);
    const script = ['SAVE_GCODE_STATE NAME=axiscope_campos', 'G90'];
    if (st.pos[2] < clearZ) script.push(`G0 Z${f(clearZ)} F${this.Z_FEED}`);
    script.push(
      `G0 X${f(c.x)} Y${f(centreY)} F${this.XY_FEED}`,
      `G0 Z${f(clearZ)} F${this.Z_FEED}`,
      `G0 Y${f(c.y)} F${this.XY_FEED}`,
      `G0 Z${f(c.z)} F${this.DESCEND_FEED}`,
      'RESTORE_GCODE_STATE NAME=axiscope_campos');
    this.moving = true;
    this.render();
    notice('Moving T0 to the saved camera position…');
    const ok = await run(script.join('\n'), 'Move to camera');
    this.moving = false;
    this.render();
    if (ok) notice('T0 is at the saved camera position. Fine-tune with the arrows or Auto align, then Capture reference.');
  },

  render() {
    const value = $('campos-value');
    if (!value) return;
    const p = this.pos;
    value.innerHTML = p
      ? `X <b>${p.x.toFixed(2)}</b><span></span>Y <b>${p.y.toFixed(2)}</b><span></span>Z <b>${p.z.toFixed(2)}</b>`
      : 'Not saved yet';
    setText('campos-source', p ? (this.source === 'printer' ? 'on printer' : 'this browser') : '');
    const saveWhy = this.blocked(false), goWhy = this.blocked(true);
    const save = $('campos-save'), go = $('campos-goto');
    save.disabled = !!saveWhy;
    save.title = saveWhy || 'Save T0’s current X/Y/Z as the camera position';
    go.disabled = !!goWhy;
    go.title = goWhy || 'X to the camera, Y to bed centre → Z to saved +' + this.LIFT_MM + ' mm → Y over the camera → slowly down to the saved Z';
    setText('campos-goto-label', this.moving ? 'Moving…' : 'Move T0 to camera');
  },

  init() {
    $('campos-save').addEventListener('click', () => this.saveCurrent());
    $('campos-goto').addEventListener('click', () => this.goTo());
    if (S.host) this.load(); else this.render();
  },
};

CameraPosition.init();

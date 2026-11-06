// Manual exploration of the map plane with authored district viewpoints.
// Coordinates come from the atlas registry; neither these bookmarks nor keyboard
// movement establish street access, a walking route, or a pedestrian position.
// Camera values below are projection-model estimates, not surveyed elevations.

(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const bn = () => document.documentElement.lang === 'bn';
  const tr = (en, be) => (bn() ? be : en);

  /** Map-plane translation rates, in metres per second. */
  const SPEED_MPS = 1.35;
  const STRAFE_MPS = 0.9;
  const TURN_DEG_PER_SEC = 80;
  const MAX_PITCH = 85;
  const DEFAULT_PITCH = 75; // Retain geographic context rather than imply eye height.

  // Authored low-angle map framing; camera altitude depends on the viewport.
  // Zoom is not evidence that a viewpoint is at a person's eye height.
  const STREET_ZOOM = 19;

  /**
   * The radius of the earth in metres, on the sphere the web mercator
   * assumes. The projection is x = R·λ, y = R·ln(tan(π/4 + φ/2)); a ground
   * distance is the projected distance multiplied by the cosine of the
   * latitude it was measured at.
   */
  const EARTH_R = 6378137;

  /**
   * The itinerary.
   *
   * The atlas registry supplies district reference coordinates. The order and
   * bearings are authored bookmarks, not a street-connected route or proof
   * that a particular building, entrance or path can be reached.
   */
  const ROUTE = [
    {
      id: 'old-dhaka', bearing: 20,
      note: 'Old Dhaka district reference viewpoint.',
      note_bn: 'পুরোন ঢাকার জেলা-রেফারেন্স দৃশ্য।',
    },
    {
      id: 'chawkbazar', bearing: 350,
      note: 'Chawkbazar district reference viewpoint.',
      note_bn: 'চকবাজারের জেলা-রেফারেন্স দৃশ্য।',
    },
    {
      id: 'sadarghat', bearing: 120,
      note: 'The river terminal, and the water it sits on.',
      note_bn: 'নদীর টার্মিনাল, এবং যে জলের উপরে তা বসে।',
    },
    {
      id: 'motijheel', bearing: 200,
      note: 'Motijheel district reference viewpoint.',
      note_bn: 'মতিঝিলের জেলা-রেফারেন্স দৃশ্য।',
    },
    {
      id: 'kawran-bazar', bearing: 270,
      note: 'The wholesale produce terminal.',
      note_bn: 'পাইকারি কৃষিপণ্যের টার্মিনাল।',
    },
    {
      id: 'gulshan', bearing: 340,
      note: 'Gulshan district reference viewpoint.',
      note_bn: 'গুলশানের জেলা-রেফারেন্স দৃশ্য।',
    },
  ];

  let map = null;
  let areas = [];
  let collage = null;
  let active = false;
  /** True once the camera has actually been put at a stop. */
  let standing = false;
  let stopIndex = 0;
  let atBookmark = false;
  let boundMap = null;
  let previousMaxPitch = null;
  let previousKeyboardEnabled = false;
  let collageLoading = false;
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const keys = new Set();
  let rafId = null;
  let lastFrame = 0;

  function areaById(id) {
    return areas.find(a => a.id === id) || null;
  }

  // ── Measuring the camera ────────────────────────────────────────────────
  //
  // Fit a planar perspective model to map.unproject() samples. The camera
  // looks down by depression θ; the fitted vertical asymptote gives u=f tanθ.
  // Ground offsets satisfy D(s)=A*s/[u*(u+s)], with A=f*H/cos²θ.
  // Thus altitude H=A*cos²θ/f. Additional rows and the map's pitch provide
  // independent consistency checks; a failed fit returns unavailable.
  // This estimates height over the map plane only: no terrain, eye-height,
  // street position or surveyed building-height claim follows from the fit.

  /** The ground point under a screen position. */
  function groundAt(x, y) {
    if (!map) return null;
    try {
      const p = map.unproject([x, y]);
      if (!p || !Number.isFinite(p.lat) || !Number.isFinite(p.lng)) return null;
      return p;
    } catch {
      return null;
    }
  }

  /** Mercator east, in metres. */
  function mercX(p) {
    return EARTH_R * (p.lng * Math.PI) / 180;
  }

  /** Mercator north, in metres. */
  function mercY(p) {
    return EARTH_R * Math.log(Math.tan(Math.PI / 4 + (p.lat * Math.PI) / 360));
  }

  /** The distance between two ground points, in metres. */
  function groundDistanceM(a, b, lat) {
    const k = Math.cos((lat * Math.PI) / 180);
    const dE = (mercX(b) - mercX(a)) * k;
    const dN = (mercY(b) - mercY(a)) * k;
    return Math.hypot(dE, dN);
  }

  /**
   * Camera altitude estimated from the map-plane projection.
   *
   * Returns null when the projection samples do not support the model.
   * A flat map or inconsistent projection must not produce an altitude.
   */
  function measureCamera() {
    if (!map) return null;
    const pitchDeg = map.getPitch();
    if (!pitchDeg || pitchDeg < 30) return null;

    const canvas = map.getCanvas();
    const w = canvas.clientWidth;
    const h = map.getCanvas().clientHeight;
    if (!w || !h) return null;

    const cx = w / 2;
    const mid = h / 2;
    const centre = map.getCenter();
    const lat = centre.lat;
    const k = Math.cos((lat * Math.PI) / 180);
    const bearing = (map.getBearing() * Math.PI) / 180;

    // The zoom fixes the ground scale that unproject() reports in. A camera
    // height measured at one zoom is not the camera's height at another, so
    // the reading is only valid at the zoom it was taken at.
    if (!Number.isFinite(map.getZoom())) return null;

    // Ground offsets from the centre, along the camera's own heading.
    const along = p => {
      const dE = (mercX(p) - mercX(centre)) * k;
      const dN = (mercY(p) - mercY(centre)) * k;
      return {
        fwd: dN * Math.cos(bearing) + dE * Math.sin(bearing),
        side: dE * Math.cos(bearing) - dN * Math.sin(bearing),
      };
    };

    // Rows under the middle of the screen, spread over the lower half.
    // These are all below the horizon at a walk's pitch, which is where the
    // ground is a straight, unbroken line under the camera.
    const rows = [];
    for (const fraction of [0.16, 0.26, 0.36, 0.45]) {
      const s = fraction * h;
      const y = mid + s;
      if (y > h - 1) continue;
      const p = groundAt(cx, y);
      if (!p) continue;
      const { fwd, side } = along(p);
      // The ground under a pitched camera lies along its heading. A point
      // off that line means the reading is not describing this camera.
      if (Math.abs(side) > Math.abs(fwd) * 0.05 + 2) continue;
      rows.push({ s, d: -fwd });
    }
    if (rows.length < 3) return null;

    // Solve u and A from the first two rows, then hold every other row
    // against the answer.
    const [r1, r2] = rows;
    const ratio = r1.d / r2.d;
    const denom = ratio * r2.s - r1.s;
    if (!Number.isFinite(denom) || Math.abs(denom) < 1e-6) return null;
    const u = (r1.s * r2.s * (1 - ratio)) / denom;
    if (!Number.isFinite(u) || u <= 0 || u >= mid) return null;
    const A = (r1.d * u * (u + r1.s)) / r1.s;
    if (!Number.isFinite(A) || A <= 0) return null;

    // Every other row must agree with the two the answer came from.
    for (const row of rows.slice(2)) {
      const predicted = (A * row.s) / (u * (u + row.s));
      const error = Math.abs(predicted - row.d) / Math.max(row.d, 1);
      if (error > 0.05) return null;
    }

    // The focal length follows from how steeply the middle of the screen
    // looks down. The middle row is stretched by the grazing angle along
    // the view and not across it, so the two resolutions differ by that
    // angle's sine.
    const resRadial = A / (u * u);
    const left = groundAt(cx - 5, mid);
    const right = groundAt(cx + 5, mid);
    if (!left || !right) return null;
    const resLateral = groundDistanceM(left, right, lat) / 10;
    if (!(resLateral > 0) || !(resRadial > 0)) return null;
    const sine = resLateral / resRadial;
    if (!(sine > 0) || sine >= 1) return null;
    const depression = Math.asin(sine);
    const focal = u / Math.tan(depression);
    if (!Number.isFinite(focal) || focal <= 0) return null;

    if (Math.abs(depression - (90 - pitchDeg) * Math.PI / 180) > 0.01) return null;
    const heightM = A * Math.cos(depression) ** 2 / focal;
    if (!Number.isFinite(heightM) || heightM <= 0) return null;

    return {
      heightM,
      method: 'planar-projection-model',
      horizonY: mid - u,
      focalPx: focal,
      rows: rows.length,
      resRadial,
      resLateral,
    };
  }

  /** The camera's height above the map plane, in metres, or null. */
  function cameraHeightM() {
    const measured = measureCamera();
    return measured ? measured.heightM : null;
  }

  function metresToLatLng(lat, lng, northM, eastM) {
    return [
      lng + eastM / (111320 * Math.cos((lat * Math.PI) / 180)),
      lat + northM / 110574,
    ];
  }

  /** Move the viewpoint by a step along the current bearing. */
  function step(dNorthM, dEastM) {
    if (!map) return;
    invalidateBookmark();
    const c = map.getCenter();
    const [lng, lat] = metresToLatLng(c.lat, c.lng, dNorthM, dEastM);
    map.jumpTo({ center: [lng, lat] });
  }

  function frame(now) {
    rafId = null;
    if (!active || !map || document.hidden || !keys.size) { stopInput(); return; }
    const dt = lastFrame ? Math.min((now - lastFrame) / 1000, 0.1) : 0;
    lastFrame = now;

    if (keys.has('w') || keys.has('arrowup')) {
      const b = (map.getBearing() * Math.PI) / 180;
      step(SPEED_MPS * dt * Math.cos(b), SPEED_MPS * dt * Math.sin(b));
    }
    if (keys.has('s') || keys.has('arrowdown')) {
      const b = (map.getBearing() * Math.PI) / 180;
      step(-SPEED_MPS * dt * Math.cos(b), -SPEED_MPS * dt * Math.sin(b));
    }
    if (keys.has('a')) {
      const b = ((map.getBearing() - 90) * Math.PI) / 180;
      step(STRAFE_MPS * dt * Math.cos(b), STRAFE_MPS * dt * Math.sin(b));
    }
    if (keys.has('d')) {
      const b = ((map.getBearing() + 90) * Math.PI) / 180;
      step(STRAFE_MPS * dt * Math.cos(b), STRAFE_MPS * dt * Math.sin(b));
    }
    if (keys.has('arrowleft') || keys.has('arrowright')) invalidateBookmark();
    if (keys.has('arrowleft')) map.setBearing(map.getBearing() - TURN_DEG_PER_SEC * dt);
    if (keys.has('arrowright')) map.setBearing(map.getBearing() + TURN_DEG_PER_SEC * dt);

    if (keys.size) rafId = requestAnimationFrame(frame);
  }

  /**
   * Apply an authored district-reference map viewpoint.
   *
   * Returns false when the districts have not arrived yet, which is the
   * ordinary case at first: the map is ready long before the district list
   * is. The caller tries again when the districts land.
   */
  function standAtStop(index) {
    if (!map) return false;
    const stop = ROUTE[index];
    if (!stop) return false;
    const area = areaById(stop.id);
    if (!area) return false;
    map.jumpTo({
      center: [area.lng, area.lat],
      zoom: STREET_ZOOM,
      pitch: DEFAULT_PITCH,
      bearing: stop.bearing,
    });
    standing = true;
    atBookmark = true;
    return true;
  }

  /** Stand at a stop: move there and turn to face its bearing. */
  function goToStop(index) {
    stopInput();
    stopIndex = (index + ROUTE.length) % ROUTE.length;
    atBookmark = false;
    if (active) standAtStop(stopIndex);
    render();
  }

  /** The measured reading for the place the reader is standing in. */
  function measurementFor(areaId) {
    if (!collage) return null;
    const place = collage.districts?.find(d => d.id === areaId);
    if (!place) return null;
    return place;
  }

  function renderRouteList() {
    const list = $('#atlas-walk-route');
    if (!list) return;
    list.innerHTML = '';
    let shown = 0;
    for (let i = 0; i < ROUTE.length; i++) {
      const stop = ROUTE[i];
      const area = areaById(stop.id);
      if (!area) continue;
      shown += 1;
      const place = measurementFor(stop.id);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'atlas-walk-stop';
      button.dataset.index = String(i);
      button.setAttribute('aria-pressed', String(atBookmark && i === stopIndex));
      const name = document.createElement('strong');
      name.textContent = bn() ? area.name_bn || area.name : area.name;
      const note = document.createElement('small');
      if (place?.headline) {
        note.textContent = bn() ? place.headline_bn || place.headline : place.headline;
      } else {
        // Without a published measurement the stop shows what it is, which
        // is a description and not a number.
        note.textContent = tr(stop.note, stop.note_bn);
      }
      button.append(name, note);
      button.addEventListener('click', () => goToStop(i));
      list.appendChild(button);
    }
    // The itinerary's own heading says how many stops the walk has, and
    // does not claim more than the atlas can place.
    const summary = $('#atlas-walk-itinerary-summary');
    if (summary) {
      summary.textContent = shown
        ? tr(`Map viewpoints · ${shown}`, `মানচিত্রের দৃশ্য · ${shown}টি`)
        : tr('Map viewpoints', 'মানচিত্রের দৃশ্য');
    }
  }

  function renderStatus() {
    const el = $('#atlas-walk-status');
    if (!el) return;
    const height = cameraHeightM();
    const heightText = height === null
      ? tr('Map-plane camera estimate unavailable', 'মানচিত্রের সমতল থেকে ক্যামেরার আনুমানিক উচ্চতা অনুপলব্ধ')
      : tr(`Model camera ≈ ${height.toFixed(1)} m above map plane`, `মডেল ক্যামেরা মানচিত্রের সমতল থেকে ≈ ${height.toFixed(1)} মিটার`);
    // The panel is re-rendered on every settled frame of a walk; the text is
    // only rewritten when the reading has actually moved.
    const area = atBookmark ? areaById(ROUTE[stopIndex].id) : null;
    const context = area ? (bn() ? area.name_bn || area.name : area.name) : tr('Exploring map', 'মানচিত্র অন্বেষণ');
    const place = $("#atlas-walk-place");
    if (place && place.textContent !== context) place.textContent = context;
    const text = `${context} · ${heightText}`;
    if (el.textContent !== text) el.textContent = text;
  }

  /**
   * The controls, stated plainly.
   *
   * Keyboard controls remain beside the camera qualification. Movement is
   * map exploration; the panel does not imply a traversable street route.
   */
  function renderKeys() {
    const el = $('#atlas-walk-keys');
    if (!el) return;
    const text = bn()
      ? '<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> সরান · <kbd>←</kbd><kbd>→</kbd> ঘুরুন'
      : '<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> to move · <kbd>←</kbd><kbd>→</kbd> to turn';
    if (el.innerHTML !== text) el.innerHTML = text;
  }

  function renderStopButtons() {
    const prev = $('#atlas-walk-prev');
    const next = $('#atlas-walk-next');
    if (prev) {prev.textContent=tr('← Previous','← আগের');prev.setAttribute('aria-label',tr('Previous map viewpoint','আগের মানচিত্রের দৃশ্য'));}
    if (next) {next.textContent=tr('Next →','পরের →');next.setAttribute('aria-label',tr('Next map viewpoint','পরের মানচিত্রের দৃশ্য'));}
  }

  function render() {
    renderRouteList();
    renderStatus();
    renderKeys();
    renderStopButtons();
  }

  /** The camera's height follows the zoom and the window, so it is re-read
   *  whenever the map settles. */
  function onMapSettled() {
    if (!active) return;
    const area = areaById(ROUTE[stopIndex].id);
    const c = map.getCenter();
    if (atBookmark && (!area || Math.abs(c.lng - area.lng) > 1e-7 || Math.abs(c.lat - area.lat) > 1e-7)) {
      stopInput();
      invalidateBookmark();
    }
    renderStatus();
  }

  function stopInput() {
    keys.clear();
    if (rafId !== null) cancelAnimationFrame(rafId);
    rafId = null;
    lastFrame = 0;
  }

  function invalidateBookmark() {
    if (!atBookmark) return;
    atBookmark = false;
    $('#atlas-walk-route')?.querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed', 'false'));
    renderStatus();
  }

  function manualInput() { stopInput(); invalidateBookmark(); }
  function onCanvasPointerDown() {
    manualInput();
    map?.getCanvas()?.focus?.({preventScroll:true});
  }
  function onMapInput(event) { if (event?.originalEvent) manualInput(); }
  function onVisibility() { if (document.hidden) stopInput(); }
  function onMotionPreference() { stopInput(); }

  function onKeyDown(event) {
    if (!active || !map || document.hidden || event.ctrlKey || event.metaKey || event.altKey) return;
    if (document.querySelector('dialog[open]') || document.querySelector('#atlas-menu[open]')) return;
    const target = event.target;
    if (target && /^(INPUT|SELECT|TEXTAREA|BUTTON|A|SUMMARY)$/.test(target.tagName)) return;
    if (target && target.isContentEditable) return;
    const key = event.key.toLowerCase();
    if (!['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) return;
    if (event.repeat && !keys.has(key)) return;
    event.preventDefault();
    if (reducedMotion?.matches) {
      // Reduced motion uses one discrete user-requested step per key press.
      if (event.repeat) return;
      keys.add(key);
      lastFrame = 1;
      frame(101);
      stopInput();
      return;
    }
    keys.add(key);
    if (rafId === null) rafId = requestAnimationFrame(frame);
  }

  function onKeyUp(event) {
    keys.delete(event.key.toLowerCase());
    if (!keys.size) stopInput();
  }

  function bindMap() {
    if (!active || !map || boundMap === map) return;
    boundMap = map;
    previousMaxPitch = map.getMaxPitch?.() ?? 85;
    previousKeyboardEnabled = map.keyboard?.isEnabled?.() === true;
    if (previousKeyboardEnabled) map.keyboard.disable();
    map.setMaxPitch?.(MAX_PITCH);
    map.on('moveend', onMapSettled);
    map.on('resize', onMapSettled);
    for (const type of ['dragstart', 'zoomstart', 'rotatestart', 'pitchstart']) map.on(type, onMapInput);
    map.getCanvas()?.addEventListener?.('pointerdown', onCanvasPointerDown);
    map.getCanvas()?.addEventListener?.('wheel', manualInput, { passive: true });
  }

  function unbindMap() {
    if (!boundMap) return;
    boundMap.off('moveend', onMapSettled);
    boundMap.off('resize', onMapSettled);
    for (const type of ['dragstart', 'zoomstart', 'rotatestart', 'pitchstart']) boundMap.off(type, onMapInput);
    boundMap.getCanvas()?.removeEventListener?.('pointerdown', onCanvasPointerDown);
    boundMap.getCanvas()?.removeEventListener?.('wheel', manualInput);
    boundMap.setMaxPitch?.(previousMaxPitch);
    if (previousKeyboardEnabled) boundMap.keyboard?.enable?.();
    previousKeyboardEnabled = false;
    boundMap = null;
  }

  function activate(lensId) {
    const shouldWalk = lensId === 'walk';
    if (shouldWalk === active) {
      bindMap();
      if (active && !standing) standAtStop(stopIndex);
      return;
    }
    stopInput();
    active = shouldWalk;
    standing = false;
    atBookmark = false;
    if (active) {
      document.addEventListener('keydown', onKeyDown, { passive: false });
      document.addEventListener('keyup', onKeyUp);
      document.addEventListener('visibilitychange', onVisibility);
      document.addEventListener('pointerdown', stopInput, true);
      document.addEventListener('focusin', stopInput);
      window.addEventListener('blur', stopInput);
      reducedMotion?.addEventListener?.('change', onMotionPreference);
      bindMap();
      standAtStop(stopIndex);
      render();
    } else {
      unbindMap();
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
      document.removeEventListener('visibilitychange', onVisibility);
      document.removeEventListener('pointerdown', stopInput, true);
      document.removeEventListener('focusin', stopInput);
      window.removeEventListener('blur', stopInput);
      reducedMotion?.removeEventListener?.('change', onMotionPreference);
    }
  }

  async function loadCollage() {
    if (collageLoading || collage) return;
    collageLoading = true;
    try {
      const res = await fetch('/api/atlas/collage', { signal: AbortSignal.timeout(45000) });
      if (!res.ok) return;
      const body = await res.json();
      if (!Array.isArray(body?.districts)) return;
      collage = body;
      render();
    } catch {
      collage = null;
    } finally {
      collageLoading = false;
    }
  }

  window.AtlasWalk = {
    start() {
      window.addEventListener('atlas:language', render);
      $('#atlas-walk-prev')?.addEventListener('click', () => goToStop(stopIndex - 1));
      $('#atlas-walk-next')?.addEventListener('click', () => goToStop(stopIndex + 1));
    },
    /** Called by the lens switcher so the walk follows the lens. */
    activate,
    /** Task changes can cancel held input without discarding the viewpoint. */
    stop: stopInput,
    /** The map arrives after the module is loaded. */
    attach(mapInstance, areasData) {
      if (map !== mapInstance) { stopInput(); unbindMap(); standing = false; atBookmark = false; }
      map = mapInstance;
      areas = areasData || [];
      bindMap();
      // The districts may have arrived after the walk was asked for. When
      // they do, the camera finally applies its authored bookmark.
      if (active && !standing) standAtStop(stopIndex);
      render();
      // The collage is fetched once, however many times the district list
      // arrives and re-attaches the module.
      if (!collage) loadCollage();
    },
    /** The next stop on the itinerary. */
    next() { goToStop(stopIndex + 1); },
    previous() { goToStop(stopIndex - 1); },
    /** The camera's measurement, for the audit to read rather than re-guess. */
    measure() { return measureCamera(); },
  };
})();

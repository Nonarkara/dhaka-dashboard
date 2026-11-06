// The walkthrough: a first-person walk through the city the atlas measures.
//
// The Street level lens already draws the massing at the map provider's
// computed heights and says so. What was missing is the part that makes a
// walk a walk: standing in the street, turning your head, and moving.
//
// Three rules govern what this module claims:
//
//  1. The camera's height above the map plane is measured, not asserted.
//     MapLibre renders a pitched map with a level camera — the map plane is
//     rotated under the lens rather than the lens tilted over the map — so
//     the height is a consequence of the zoom, the pitch and the size of the
//     window. A reader is entitled to know it, and it is read back from the
//     map rather than guessed at.
//
//  2. The walk moves over the map's flat plane. The atlas carries no
//     elevation model, so the ground under the reader is the map's zero, and
//     the panel says that too.
//
//  3. The route is an authored itinerary over the atlas's own measured
//     districts, in an order a person could actually walk. It is not a
//     computed walking route: there is no routing engine here and the panel
//     does not pretend otherwise.

(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const bn = () => document.documentElement.lang === 'bn';
  const tr = (en, be) => (bn() ? be : en);

  /** The walking speed of a person, in metres per second. */
  const SPEED_MPS = 1.35;
  const STRAFE_MPS = 0.9;
  const TURN_DEG_PER_SEC = 80;
  const MAX_PITCH = 85;

  /**
   * The zoom the walk stands at.
   *
   * Not a matter of taste. The streamed vector tiles carry their building
   * outlines natively to z19 and the raster basemap no further, so z19 is
   * the last zoom at which the atlas is looking at the data as it was
   * published. Above it the camera would magnify the tiles and the street
   * would go soft; below it the city stops being a street.
   *
   * The camera's height follows from this zoom, and it is measured rather
   * than chosen: see measureCamera().
   */
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
   * The districts are the atlas's own, in the order a walker meets them
   * coming north up the old city. Each stop carries the bearing to face
   * when standing there — a direction, not a claim about what is visible.
   */
  const ROUTE = [
    {
      id: 'old-dhaka', bearing: 20,
      note: 'The old walled city, at street level.',
      note_bn: 'পুরোন ঢাকা, রাস্তার ধরনে।',
    },
    {
      id: 'chawkbazar', bearing: 350,
      note: 'The densest wholesale fabric in the country.',
      note_bn: 'দেশের সবচেয়ে ঘন পাইকারি কাঠামো।',
    },
    {
      id: 'sadarghat', bearing: 120,
      note: 'The river terminal, and the water it sits on.',
      note_bn: 'নদীর টার্মিনাল, এবং যে জলের উপরে তা বসে।',
    },
    {
      id: 'motijheel', bearing: 200,
      note: 'The financial core, emptied after dark.',
      note_bn: 'আর্থিক কেন্দ্র, যা রাতে ফাঁকা হয়ে যায়।',
    },
    {
      id: 'kawran-bazar', bearing: 270,
      note: 'The wholesale produce terminal.',
      note_bn: 'পাইকারি কৃষিপণ্যের টার্মিনাল।',
    },
    {
      id: 'gulshan', bearing: 340,
      note: 'The commercial belt, and the light it leaves on.',
      note_bn: 'বাণিজ্যিক এলাকা, এবং সে যে আলো রেখে যায়।',
    },
  ];

  let map = null;
  let areas = [];
  let collage = null;
  let active = false;
  /** True once the camera has actually been put at a stop. */
  let standing = false;
  let stopIndex = 0;
  const keys = new Set();
  let rafId = null;
  let lastFrame = 0;

  function areaById(id) {
    return areas.find(a => a.id === id) || null;
  }

  // ── Measuring the camera ────────────────────────────────────────────────
  //
  // MapLibre's pitched view is a level camera looking at a tilted map. A
  // ground point at distance d from the camera's foot therefore appears at
  // the screen row
  //
  //     y = y_horizon + f · H / d
  //
  // with f the focal length in pixels and H the camera's height above the
  // ground plane. Writing u for the distance from the middle of the screen
  // to the horizon and A for H·f, the distance from the middle of the
  // screen's ground point to the ground point at row y is
  //
  //     D(y) = A · s / (u · (u + s)),      s = y − middle
  //
  // Two rows are enough to solve for u and A. The focal length then comes
  // from the horizon and the angle at which the middle row looks down, and
  // the height is H = A / f.
  //
  // Every number is read back from the map with map.unproject(), which is
  // the map's own projection of a screen row onto the ground. When the rows
  // do not agree with one another, the measurement is refused: a wrong
  // number here would be a lie about where the reader is standing.

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
   * The camera, measured from the ground under the screen.
   *
   * Returns null when the view cannot be measured — a flat map has no
   * horizon to read, and a camera that cannot be measured must not be
   * given a height.
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
    const z = map.getZoom();

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

    const heightM = A / focal;
    if (!Number.isFinite(heightM) || heightM <= 0) return null;

    return {
      heightM,
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
    const c = map.getCenter();
    const [lng, lat] = metresToLatLng(c.lat, c.lng, dNorthM, dEastM);
    map.jumpTo({ center: [lng, lat] });
  }

  function frame(now) {
    if (!active) return;
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
      const b = ((map.getBearing() + 90) * Math.PI) / 180;
      step(STRAFE_MPS * dt * Math.cos(b), STRAFE_MPS * dt * Math.sin(b));
    }
    if (keys.has('d')) {
      const b = ((map.getBearing() - 90) * Math.PI) / 180;
      step(STRAFE_MPS * dt * Math.cos(b), STRAFE_MPS * dt * Math.sin(b));
    }
    if (keys.has('arrowleft')) map.setBearing(map.getBearing() - TURN_DEG_PER_SEC * dt);
    if (keys.has('arrowright')) map.setBearing(map.getBearing() + TURN_DEG_PER_SEC * dt);

    rafId = requestAnimationFrame(frame);
  }

  /**
   * Put the reader in the street.
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
      pitch: MAX_PITCH,
      bearing: stop.bearing,
    });
    standing = true;
    return true;
  }

  /** Stand at a stop: move there and turn to face its bearing. */
  function goToStop(index) {
    stopIndex = (index + ROUTE.length) % ROUTE.length;
    standAtStop(stopIndex);
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
      button.setAttribute('aria-pressed', String(i === stopIndex));
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
        ? tr(`Walk itinerary · ${shown} stops`, `ভ্রমণসূচি · ${shown}টি স্থান`)
        : tr('Walk itinerary', 'ভ্রমণসূচি');
    }
  }

  function renderStatus() {
    const el = $('#atlas-walk-status');
    if (!el) return;
    const height = cameraHeightM();
    const heightText = height === null
      ? tr('camera height unavailable', 'যন্ত্রের উচ্চতা অনুপলব্ধ')
      : tr(`camera ≈ ${height.toFixed(1)} m above the map plane`, `মানচিত্রের সমতলের উপরে যন্ত্র ≈ ${height.toFixed(1)} মিটার`);
    // The panel is re-rendered on every settled frame of a walk; the text is
    // only rewritten when the reading has actually moved.
    if (el.textContent !== heightText) el.textContent = heightText;
  }

  /**
   * The controls, stated plainly.
   *
   * A walk nobody can move is a picture, so the keys are on the panel
   * rather than hidden in a manual.
   */
  function renderKeys() {
    const el = $('#atlas-walk-keys');
    if (!el) return;
    const text = bn()
      ? '<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> হাঁটুন · <kbd>←</kbd><kbd>→</kbd> ঘুরুন'
      : '<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> to walk · <kbd>←</kbd><kbd>→</kbd> to turn';
    if (el.innerHTML !== text) el.innerHTML = text;
  }

  function renderStopButtons() {
    const prev = $('#atlas-walk-prev');
    const next = $('#atlas-walk-next');
    if (prev) prev.textContent = tr('← Previous stop', '← আগের স্থান');
    if (next) next.textContent = tr('Next stop →', 'পরের স্থান →');
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
    renderStatus();
  }

  function onKeyDown(event) {
    if (!active) return;
    const target = event.target;
    if (target && /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName)) return;
    if (target && target.isContentEditable) return;
    const key = event.key.toLowerCase();
    if (!['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) return;
    event.preventDefault();
    keys.add(key);
  }

  function onKeyUp(event) {
    keys.delete(event.key.toLowerCase());
  }

  function onBlur() {
    keys.clear();
  }

  function activate(lensId) {
    const shouldWalk = lensId === 'walk';
    if (shouldWalk === active) {
      // The lens is already the walk, but the camera may never have reached
      // the street — the districts arrive after the map does. Try again.
      if (active && !standing) standAtStop(stopIndex);
      return;
    }
    active = shouldWalk;
    if (!map) return;

    if (active) {
      document.addEventListener('keydown', onKeyDown, { passive: false });
      document.addEventListener('keyup', onKeyUp);
      window.addEventListener('blur', onBlur);
      lastFrame = 0;
      rafId = requestAnimationFrame(frame);
      // Raise the pitch limit for the walk so the viewpoint can reach the
      // street, and restore the atlas's own limit afterwards.
      try { map.setMaxPitch(MAX_PITCH); } catch { /* older builds clamp at 85 */ }
      standing = false;
      standAtStop(stopIndex);
      render();
      map.on('moveend', onMapSettled);
      map.on('resize', onMapSettled);
    } else {
      map.off('moveend', onMapSettled);
      map.off('resize', onMapSettled);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      keys.clear();
      if (rafId) cancelAnimationFrame(rafId);
      rafId = null;
      standing = false;
      try { map.setMaxPitch(85); } catch { /* ignore */ }
    }
  }

  async function loadCollage() {
    try {
      const res = await fetch('/api/atlas/collage', { signal: AbortSignal.timeout(45000) });
      const body = await res.json();
      if (!Array.isArray(body?.districts)) return;
      collage = body;
      render();
    } catch {
      collage = null;
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
    /** The map arrives after the module is loaded. */
    attach(mapInstance, areasData) {
      map = mapInstance;
      areas = areasData || [];
      // The districts may have arrived after the walk was asked for. When
      // they do, the camera finally goes to the street.
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

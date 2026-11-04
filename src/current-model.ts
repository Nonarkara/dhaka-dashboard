// Validate current modeled readings before they enter the cache or watch strip.
// Open-Meteo's timezone-less timestamps use the response's UTC offset.
export function validateCurrentModel(payload: unknown, kind: 'weather' | 'air' | 'wind', now = Date.now()) {
  const data = payload as { current?: Record<string, unknown>; current_units?: Record<string, unknown>; utc_offset_seconds?: number };
  const current = data?.current;
  const time = current?.time;
  if (!current || typeof time !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(time) || data.utc_offset_seconds !== 21600) throw Error('model-invalid-time');
  const local = Date.parse(time + ':00Z');
  if (!Number.isFinite(local) || new Date(local).toISOString().slice(0, 16) !== time) throw Error('model-invalid-time');
  const valid = local - data.utc_offset_seconds * 1000;
  if (now - valid > 3 * 3600000 || valid - now > 15 * 60000) throw Error('model-current-stale-or-future');
  const specs: Record<string, [number, number, string]> = kind === 'air'
    ? { us_aqi: [0, Infinity, 'USAQI'], pm2_5: [0, Infinity, 'μg/m³'] }
    : { wind_speed_10m: [0, Infinity, 'km/h'], wind_direction_10m: [0, 360, '°'], ...(kind === 'weather' ? {
      temperature_2m: [-Infinity, Infinity, '°C'] as [number, number, string],
      apparent_temperature: [-Infinity, Infinity, '°C'] as [number, number, string],
      relative_humidity_2m: [0, 100, '%'] as [number, number, string],
      surface_pressure: [0, Infinity, 'hPa'] as [number, number, string],
    } : {}) };
  for (const [key, [min, max, unit]] of Object.entries(specs)) {
    const value = current[key];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw Error('model-invalid-current-value');
    if (data.current_units?.[key] !== unit) throw Error('model-unexpected-current-unit');
  }
}
export function currentModelReason(error?: string) {
  return error?.match(/model-(?:invalid-time|current-stale-or-future|invalid-current-value|unexpected-current-unit)/)?.[0] || 'upstream-unreachable';
}

export function validateRainfall24h(payload: unknown, now = Date.now()) {
  const data = payload as { hourly?: { time?: string[]; precipitation?: unknown[] }; hourly_units?: { precipitation?: string } };
  const times=data?.hourly?.time, values=data?.hourly?.precipitation;
  if(data?.hourly_units?.precipitation!=='mm' || !Array.isArray(times) || times.length!==24 || !Array.isArray(values) || values.length!==24 || values.some(value=>typeof value!=='number'||!Number.isFinite(value)||value<0)) throw Error('invalid-rainfall-payload');
  const dates=times.map(time=>typeof time==='string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(time)?Date.parse(time+':00+06:00'):NaN);
  if(dates.some((date,i)=>!Number.isFinite(date)||new Date(date+21600000).toISOString().slice(0,16)!==times[i]||(i>0&&date-dates[i-1]!==3600000)) || Math.abs(dates[0]-now)>3600000) throw Error('invalid-rainfall-period');
  return {rain_24h_sum_mm:(values as number[]).reduce((a,b)=>a+b,0),unit:'mm',validFrom:new Date(dates[0]-3600000).toISOString(),validTo:new Date(dates[23]).toISOString()};
}

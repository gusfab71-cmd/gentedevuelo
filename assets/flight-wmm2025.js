/* Model WMM2025 (NOAA public-domain coefficients, epoch 2025-2030),
   port of WMM Gauss recursion from AeroLinkDEV/requirements-management-tool
   product/client/src/fmsCdu/magvar.ts. Derived approximation for planning,
   not certified navigation. WMM must be current and cannot replace AIP. */
(function(){
'use strict';
const rad=Math.PI/180, degree=180/Math.PI;
const index=(n,m)=>n*(n+1)/2+m;
const coefficients=[{"n":1,"m":0,"g":-29351.8,"h":0,"dg":12,"dh":0},{"n":1,"m":1,"g":-1410.8,"h":4545.4,"dg":9.7,"dh":-21.5},{"n":2,"m":0,"g":-2556.6,"h":0,"dg":-11.6,"dh":0},{"n":2,"m":1,"g":2951.1,"h":-3133.6,"dg":-5.2,"dh":-27.7},{"n":2,"m":2,"g":1649.3,"h":-815.1,"dg":-8,"dh":-12.1},{"n":3,"m":0,"g":1361,"h":0,"dg":-1.3,"dh":0},{"n":3,"m":1,"g":-2404.1,"h":-56.6,"dg":-4.2,"dh":4},{"n":3,"m":2,"g":1243.8,"h":237.5,"dg":0.4,"dh":-0.3},{"n":3,"m":3,"g":453.6,"h":-549.5,"dg":-15.6,"dh":-4.1},{"n":4,"m":0,"g":895,"h":0,"dg":-1.6,"dh":0},{"n":4,"m":1,"g":799.5,"h":278.6,"dg":-2.4,"dh":-1.1},{"n":4,"m":2,"g":55.7,"h":-133.9,"dg":-6,"dh":4.1},{"n":4,"m":3,"g":-281.1,"h":212,"dg":5.6,"dh":1.6},{"n":4,"m":4,"g":12.1,"h":-375.6,"dg":-7,"dh":-4.4},{"n":5,"m":0,"g":-233.2,"h":0,"dg":0.6,"dh":0},{"n":5,"m":1,"g":368.9,"h":45.4,"dg":1.4,"dh":-0.5},{"n":5,"m":2,"g":187.2,"h":220.2,"dg":0,"dh":2.2},{"n":5,"m":3,"g":-138.7,"h":-122.9,"dg":0.6,"dh":0.4},{"n":5,"m":4,"g":-142,"h":43,"dg":2.2,"dh":1.7},{"n":5,"m":5,"g":20.9,"h":106.1,"dg":0.9,"dh":1.9},{"n":6,"m":0,"g":64.4,"h":0,"dg":-0.2,"dh":0},{"n":6,"m":1,"g":63.8,"h":-18.4,"dg":-0.4,"dh":0.3},{"n":6,"m":2,"g":76.9,"h":16.8,"dg":0.9,"dh":-1.6},{"n":6,"m":3,"g":-115.7,"h":48.8,"dg":1.2,"dh":-0.4},{"n":6,"m":4,"g":-40.9,"h":-59.8,"dg":-0.9,"dh":0.9},{"n":6,"m":5,"g":14.9,"h":10.9,"dg":0.3,"dh":0.7},{"n":6,"m":6,"g":-60.7,"h":72.7,"dg":0.9,"dh":0.9},{"n":7,"m":0,"g":79.5,"h":0,"dg":0,"dh":0},{"n":7,"m":1,"g":-77,"h":-48.9,"dg":-0.1,"dh":0.6},{"n":7,"m":2,"g":-8.8,"h":-14.4,"dg":-0.1,"dh":0.5},{"n":7,"m":3,"g":59.3,"h":-1,"dg":0.5,"dh":-0.8},{"n":7,"m":4,"g":15.8,"h":23.4,"dg":-0.1,"dh":0},{"n":7,"m":5,"g":2.5,"h":-7.4,"dg":-0.8,"dh":-1},{"n":7,"m":6,"g":-11.1,"h":-25.1,"dg":-0.8,"dh":0.6},{"n":7,"m":7,"g":14.2,"h":-2.3,"dg":0.8,"dh":-0.2},{"n":8,"m":0,"g":23.2,"h":0,"dg":-0.1,"dh":0},{"n":8,"m":1,"g":10.8,"h":7.1,"dg":0.2,"dh":-0.2},{"n":8,"m":2,"g":-17.5,"h":-12.6,"dg":0,"dh":0.5},{"n":8,"m":3,"g":2,"h":11.4,"dg":0.5,"dh":-0.4},{"n":8,"m":4,"g":-21.7,"h":-9.7,"dg":-0.1,"dh":0.4},{"n":8,"m":5,"g":16.9,"h":12.7,"dg":0.3,"dh":-0.5},{"n":8,"m":6,"g":15,"h":0.7,"dg":0.2,"dh":-0.6},{"n":8,"m":7,"g":-16.8,"h":-5.2,"dg":0,"dh":0.3},{"n":8,"m":8,"g":0.9,"h":3.9,"dg":0.2,"dh":0.2},{"n":9,"m":0,"g":4.6,"h":0,"dg":0,"dh":0},{"n":9,"m":1,"g":7.8,"h":-24.8,"dg":-0.1,"dh":-0.3},{"n":9,"m":2,"g":3,"h":12.2,"dg":0.1,"dh":0.3},{"n":9,"m":3,"g":-0.2,"h":8.3,"dg":0.3,"dh":-0.3},{"n":9,"m":4,"g":-2.5,"h":-3.3,"dg":-0.3,"dh":0.3},{"n":9,"m":5,"g":-13.1,"h":-5.2,"dg":0,"dh":0.2},{"n":9,"m":6,"g":2.4,"h":7.2,"dg":0.3,"dh":-0.1},{"n":9,"m":7,"g":8.6,"h":-0.6,"dg":-0.1,"dh":-0.2},{"n":9,"m":8,"g":-8.7,"h":0.8,"dg":0.1,"dh":0.4},{"n":9,"m":9,"g":-12.9,"h":10,"dg":-0.1,"dh":0.1},{"n":10,"m":0,"g":-1.3,"h":0,"dg":0.1,"dh":0},{"n":10,"m":1,"g":-6.4,"h":3.3,"dg":0,"dh":0},{"n":10,"m":2,"g":0.2,"h":0,"dg":0.1,"dh":0},{"n":10,"m":3,"g":2,"h":2.4,"dg":0.1,"dh":-0.2},{"n":10,"m":4,"g":-1,"h":5.3,"dg":0,"dh":0.1},{"n":10,"m":5,"g":-0.6,"h":-9.1,"dg":-0.3,"dh":-0.1},{"n":10,"m":6,"g":-0.9,"h":0.4,"dg":0,"dh":0.1},{"n":10,"m":7,"g":1.5,"h":-4.2,"dg":-0.1,"dh":0},{"n":10,"m":8,"g":0.9,"h":-3.8,"dg":-0.1,"dh":-0.1},{"n":10,"m":9,"g":-2.7,"h":0.9,"dg":0,"dh":0.2},{"n":10,"m":10,"g":-3.9,"h":-9.1,"dg":0,"dh":0},{"n":11,"m":0,"g":2.9,"h":0,"dg":0,"dh":0},{"n":11,"m":1,"g":-1.5,"h":0,"dg":0,"dh":0},{"n":11,"m":2,"g":-2.5,"h":2.9,"dg":0,"dh":0.1},{"n":11,"m":3,"g":2.4,"h":-0.6,"dg":0,"dh":0},{"n":11,"m":4,"g":-0.6,"h":0.2,"dg":0,"dh":0.1},{"n":11,"m":5,"g":-0.1,"h":0.5,"dg":-0.1,"dh":0},{"n":11,"m":6,"g":-0.6,"h":-0.3,"dg":0,"dh":0},{"n":11,"m":7,"g":-0.1,"h":-1.2,"dg":0,"dh":0.1},{"n":11,"m":8,"g":1.1,"h":-1.7,"dg":-0.1,"dh":0},{"n":11,"m":9,"g":-1,"h":-2.9,"dg":-0.1,"dh":0},{"n":11,"m":10,"g":-0.2,"h":-1.8,"dg":-0.1,"dh":0},{"n":11,"m":11,"g":2.6,"h":-2.3,"dg":-0.1,"dh":0},{"n":12,"m":0,"g":-2,"h":0,"dg":0,"dh":0},{"n":12,"m":1,"g":-0.2,"h":-1.3,"dg":0,"dh":0},{"n":12,"m":2,"g":0.3,"h":0.7,"dg":0,"dh":0},{"n":12,"m":3,"g":1.2,"h":1,"dg":0,"dh":-0.1},{"n":12,"m":4,"g":-1.3,"h":-1.4,"dg":0,"dh":0.1},{"n":12,"m":5,"g":0.6,"h":0,"dg":0,"dh":0},{"n":12,"m":6,"g":0.6,"h":0.6,"dg":0.1,"dh":0},{"n":12,"m":7,"g":0.5,"h":-0.1,"dg":0,"dh":0},{"n":12,"m":8,"g":-0.1,"h":0.8,"dg":0,"dh":0},{"n":12,"m":9,"g":-0.4,"h":0.1,"dg":0,"dh":0},{"n":12,"m":10,"g":-0.2,"h":-1,"dg":-0.1,"dh":0},{"n":12,"m":11,"g":-1.3,"h":0.1,"dg":0,"dh":0},{"n":12,"m":12,"g":-0.7,"h":0.2,"dg":-0.1,"dh":-0.1}];
function field(coefficients, epoch, position, heightKm, date) {
  if (![position.lat, position.lon, heightKm, date.getTime()].every(Number.isFinite) || Math.abs(position.lat) > 90 || Math.abs(position.lon) > 360 || heightKm < -1 || heightKm > 850) return null;
  const year = date.getUTCFullYear(), start = Date.UTC(year, 0, 1), end = Date.UTC(year + 1, 0, 1);
  const elapsed = year + (date.getTime() - start) / (end - start) - epoch;
  const latitude = position.lat * rad, longitude = position.lon * rad;
  const a = 6378.137, b = 6356.7523142, eccentricity = 1 - b * b / (a * a);
  const curvature = a / Math.sqrt(1 - eccentricity * Math.sin(latitude) ** 2);
  const xp = (curvature + heightKm) * Math.cos(latitude), zp = (curvature * (1 - eccentricity) + heightKm) * Math.sin(latitude);
  const radius = Math.hypot(xp, zp), geocentric = Math.asin(zp / radius), x = Math.sin(geocentric), z = Math.sqrt((1 - x) * (1 + x));
  const p = new Float64Array(91), dp = new Float64Array(91), schmidt = new Float64Array(91);
  p[0] = 1; schmidt[0] = 1;
  for (let n = 1; n <= 12; n++) {
    schmidt[index(n, 0)] = schmidt[index(n - 1, 0)] * (2 * n - 1) / n;
    for (let m = 0; m <= n; m++) {
      const at = index(n, m), previous = index(n - 1, m);
      if (n === m) {
        p[at] = z * p[previous - 1]; dp[at] = z * dp[previous - 1] + x * p[previous - 1];
      } else if (n === 1 || m > n - 2) {
        p[at] = x * p[previous]; dp[at] = x * dp[previous] - z * p[previous];
      } else {
        const earlier = index(n - 2, m), k = ((n - 1) ** 2 - m * m) / ((2 * n - 1) * (2 * n - 3));
        p[at] = x * p[previous] - k * p[earlier]; dp[at] = x * dp[previous] - z * p[previous] - k * dp[earlier];
      }
      if (m > 0) schmidt[at] = schmidt[at - 1] * Math.sqrt((n - m + 1) * (m === 1 ? 2 : 1) / (n + m));
    }
  }
  for (let at = 1; at < 91; at++) { p[at] *= schmidt[at]; dp[at] *= -schmidt[at]; }
  let north = 0, east = 0, down = 0;
  for (const c of coefficients) {
    const at = index(c.n, c.m), power = (6371.2 / radius) ** (c.n + 2);
    const g = c.g + elapsed * c.dg, h = c.h + elapsed * c.dh;
    const cosine = Math.cos(c.m * longitude), sine = Math.sin(c.m * longitude), component = g * cosine + h * sine;
    north -= power * component * dp[at];
    down -= power * component * (c.n + 1) * p[at];
    east += power * (g * sine - h * cosine) * c.m * p[at];
  }
  if (Math.abs(Math.cos(geocentric)) > 1e-10) east /= Math.cos(geocentric);
  else {
    east = 0;
    const pole = new Float64Array(13); pole[0] = 1;
    let normalization = 1;
    for (let n = 1; n <= 12; n++) {
      const next = normalization * (2 * n - 1) / n;
      const scale = next * Math.sqrt(2 * n / (n + 1)); normalization = next;
      pole[n] = n === 1 ? pole[n - 1] : x * pole[n - 1] - ((n - 1) ** 2 - 1) / ((2 * n - 1) * (2 * n - 3)) * pole[n - 2];
      const c = coefficients.find(coefficient => coefficient.n === n && coefficient.m === 1);
      east += (6371.2 / radius) ** (n + 2) * ((c.g + elapsed * c.dg) * Math.sin(longitude) - (c.h + elapsed * c.dh) * Math.cos(longitude)) * pole[n] * scale;
    }
  }
  const rotation = geocentric - latitude, geodeticNorth = north * Math.cos(rotation) - down * Math.sin(rotation);
  down = north * Math.sin(rotation) + down * Math.cos(rotation); north = geodeticNorth;
  const horizontal = Math.hypot(north, east);
  return { north, east, down, horizontal, total: Math.hypot(horizontal, down), inclination: Math.atan2(down, horizontal) * degree, declination: Math.atan2(east, north) * degree };
}


function magneticVariation(lat,lon,atDate){
  const date=atDate instanceof Date&&Number.isFinite(atDate.getTime())?atDate:new Date();
  if(date.getTime()<Date.UTC(2025,0,1)||date.getTime()>=Date.UTC(2030,0,1))return null;
  const b=field(coefficients,2025,{lat,lon},0,date);
  if(!b||!Number.isFinite(b.declination)||b.horizontal<2000)return null;
  return b.declination;
}
window.GDV_WMM2025=Object.freeze({magneticVariation,epoch:"2025–2030",model:"WMM2025"});
})();
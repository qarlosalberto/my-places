import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const leafletJs = require.resolve('leaflet/dist/leaflet.js');
const leafletCss = require.resolve('leaflet/dist/leaflet.css');
const chartJs = join(dirname(require.resolve('chart.js')), 'chart.umd.js');
const API = 'https://www.zaragoza.es/sede/servicio/urbanismo-infraestructuras/transporte-urbano/poste-autobus';
const GBFS = 'https://zaragoza.publicbikesystem.net/customer/gbfs/v3.0/';
const json = data => ({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(data) });

async function startMockedServices(page) {
  // Run the exact production markup, CSS, map code and UI handlers. Only Firebase
  // authentication and third-party responses are replaced in this test session.
  await page.route('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js', route =>
    route.fulfill({ path: leafletJs, contentType: 'application/javascript' }));
  await page.route('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css', route =>
    route.fulfill({ path: leafletCss, contentType: 'text/css' }));
  await page.route('https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.min.js', route =>
    route.fulfill({ path: chartJs, contentType: 'application/javascript' }));
  await page.route(/\/app\.js\?v=/, async route => {
    let source = await (await route.fetch()).text();
    source = source.replace(/^import .*;\s*$/gm, '');
    source = source.replace(/^const configured=.*;$/m, 'const configured=false;');
    if (!source.includes('const configured=false;')) throw Error('Firebase test bypass not applied');
    source += `
window.__servicesE2E = {
  open: () => selectMainTab('services'),
  eta: extractBusEta,
  lines: extractBusLines,
  stops: () => serviceBuses,
  charts: () => servicesCharts,
  busLayer: () => servicesBusLayer,
  map: () => servicesMap
};`;
    await route.fulfill({ body: source, contentType: 'application/javascript' });
  });

  const bikeInfo = [
    { station_id: 'bike-3', name: 'Bizi disponible', lat: 41.6519, lon: -0.8925 },
    { station_id: 'bike-2', name: 'Bizi casi vacía', lat: 41.6471, lon: -0.8941 },
    { station_id: 'bike-0', name: 'Bizi vacía', lat: 41.6484, lon: -0.8855 }
  ];
  const bikeStatus = [
    { station_id: 'bike-3', num_vehicles_available: 3, num_docks_available: 9, num_vehicles_disabled: 1, is_renting: true },
    { station_id: 'bike-2', num_vehicles_available: 2, num_docks_available: 10, num_vehicles_disabled: 0, is_renting: true },
    { station_id: 'bike-0', num_vehicles_available: 0, num_docks_available: 12, num_vehicles_disabled: 0, is_renting: true }
  ];
  await page.route(GBFS + 'gbfs.json', route => route.fulfill(json({
    data: { feeds: [
      { name: 'station_information', url: GBFS + 'station_information.json' },
      { name: 'station_status', url: GBFS + 'station_status.json' }
    ] }
  })));
  await page.route(GBFS + 'station_information.json', route => route.fulfill(json({ data: { stations: bikeInfo } })));
  await page.route(GBFS + 'station_status.json', route => route.fulfill(json({ data: { stations: bikeStatus } })));

  const stops = [
    { id: 'tuzsa-798', title: 'Parada roja', geometry: { coordinates: [-0.8891, 41.6488] } },
    { id: 'tuzsa-799', title: 'Parada azul', geometry: { coordinates: [-0.8832, 41.6516] } },
    { id: 'tuzsa-800', title: 'Parada sin predicción', geometry: { coordinates: [-0.8955, 41.6507] } }
  ];
  await page.route(API + '.json?*', route => route.fulfill(json({ result: stops })));
  await page.route(new RegExp('poste-autobus/tuzsa-\\d+\\.json'), route => {
    const id = route.request().url().match(/tuzsa-(\d+)\.json/)?.[1];
    const data = id === '798'
      ? { destinos: [{ linea: '35', primero: '22 minutos', segundo: '35 minutos' },{ linea: '23', primero: '6 min', segundo: '18 min' },{ linea: '40', primero: 'Sin información' }] }
      : id === '799'
        ? { destinos: [{ linea: '23', primero: '6 min', segundo: '19 min' }] }
        : { destinos: [{ linea: '40', primero: 'Sin información' }] };
    return route.fulfill(json(data));
  });
  await page.route('https://*.tile.openstreetmap.org/**', route => route.abort());

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect.poll(() => page.evaluate(() => Boolean(window.__servicesE2E))).toBe(true);
  await page.evaluate(() => {
    document.getElementById('dashboard').classList.remove('hidden');
    document.getElementById('headerToolbar').classList.remove('hidden');
    // Reproduce the authorized-user toolbar (Sign out, not the wide Google login button).
    document.getElementById('login').classList.add('hidden');
    document.getElementById('logout').classList.remove('hidden');
    window.__servicesE2E.open();
  });
  await expect(page.locator('#servicesMap.leaflet-container')).toBeVisible();
  await expect(page.locator('#servicesStatus')).toContainText('2 stops with ETA');
}

test('bus arrivals from destinos/primero are red over 15 minutes, blue otherwise, and mobile tap opens details', async ({ page }) => {
  await startMockedServices(page);
  const results = await page.evaluate(() => ({
    parsed: [
      window.__servicesE2E.eta({ destinos: [{ primero: '22 minutos', segundo: '35 minutos' }] }),
      window.__servicesE2E.eta({ destinos: [{ primero: '6 min' }] }),
      window.__servicesE2E.eta({ destinos: [{ primero: 'En la parada' }] }),
      window.__servicesE2E.eta({ destinos: [{ primero: 'Sin información' }] })
    ],
    circles: window.__servicesE2E.busLayer().getLayers().filter(x => x.options?.radius === 22).map(x => ({ radius: x.options.radius, color: x.options.fillColor })),
    tapTargets: window.__servicesE2E.busLayer().getLayers().filter(x => x.options?.radius === 34).length
  }));
  expect(results.parsed).toEqual([22, 6, 0, null]);
  expect(results.circles).toEqual(expect.arrayContaining([
    { radius: 22, color: '#d94749' },
    { radius: 22, color: '#4274c7' }
  ]));
  expect(results.tapTargets).toBe(2);
  // Stop 800 has no valid arrivals on any route, so it must not be drawn.
  expect(results.circles).toHaveLength(2);
  // No bus pictograms should be rendered: circles are the entire tap affordance.
  await expect(page.locator('#servicesMap .servicesBusLabel')).toHaveCount(0);
  const routeDetails = await page.evaluate(() =>
    window.__servicesE2E.stops().find(s => s.id === 'tuzsa-798').arrivals);
  expect(routeDetails).toEqual([
    { line: '23', minutes: 6 },
    { line: '35', minutes: 22 },
    { line: '40', minutes: null }
  ]);

  // On 320px devices the map can start partly below the fold; scroll before coordinate-based touch.
  await page.locator('#servicesMap').scrollIntoViewIfNeeded();
  await page.evaluate(() => window.__servicesE2E.map().invalidateSize());
  const clickPoint = await page.evaluate(() => {
    const map = window.__servicesE2E.map();
    const point = map.latLngToContainerPoint([41.6488, -0.8891]);
    const bounds = map.getContainer().getBoundingClientRect();
    return { x: bounds.left + point.x, y: bounds.top + point.y };
  });
  await page.mouse.click(clickPoint.x, clickPoint.y);
  await expect(page.locator('#servicesMap .leaflet-popup-content')).toContainText('Line 35: 22 min');
  await expect(page.locator('#servicesMap .leaflet-popup-content')).toContainText('Line 23: 6 min');
  await expect(page.locator('#servicesMap .leaflet-popup-content')).toContainText('Line 40: No prediction');
  // Regression: a Leaflet moveend after selecting a stop must not remove its popup.
  await page.evaluate(() => window.__servicesE2E.map().fire('moveend'));
  await expect(page.locator('#servicesMap .leaflet-popup-content')).toContainText('Line 35: 22 min');
  // A background ETA refresh must update the existing marker without destroying its popup.
  await page.evaluate(() => {
    const map = window.__servicesE2E.map();
    map.panBy([1, 0], { animate: false });
  });
  await expect(page.locator('#servicesMap .leaflet-popup-content')).toContainText('Line 35: 22 min');

});

test('bus stops with known ETAs remain visible at wider zoom levels 13 and 12', async ({ page }) => {
  await startMockedServices(page);
  for (const [zoom, radius] of [[13, 14], [12, 10]]) {
    await page.evaluate(z => window.__servicesE2E.map().setZoom(z, { animate: false }), zoom);
    await expect.poll(() => page.evaluate(r =>
      window.__servicesE2E.busLayer().getLayers().filter(x => x.options?.radius === r).length, radius
    )).toBe(2);
  }
  await page.evaluate(() => window.__servicesE2E.map().setZoom(11, { animate: false }));
  await expect.poll(() => page.evaluate(() => window.__servicesE2E.busLayer().getLayers().length)).toBe(0);
  await page.evaluate(() => window.__servicesE2E.map().setZoom(14, { animate: false }));
  await expect.poll(() => page.evaluate(() =>
    window.__servicesE2E.busLayer().getLayers().filter(x => x.options?.radius === 22).length
  )).toBe(2);
});

test('a failed municipal ETA request never claims a live arrival or colors it red', async ({ page }) => {
  await page.route('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js', route =>
    route.fulfill({ path: leafletJs, contentType: 'application/javascript' }));
  await page.route('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css', route =>
    route.fulfill({ path: leafletCss, contentType: 'text/css' }));
  await page.route('https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.min.js', route =>
    route.fulfill({ path: chartJs, contentType: 'application/javascript' }));
  await page.route(/\/app\.js\?v=/, async route => {
    let source = await (await route.fetch()).text();
    source = source.replace(/^import .*;\s*$/gm, '').replace(/^const configured=.*;$/m, 'const configured=false;');
    source += '\nwindow.__openServicesForTest = () => selectMainTab("services");';
    await route.fulfill({ body: source, contentType: 'application/javascript' });
  });
  await page.route(GBFS + 'gbfs.json', route => route.fulfill(json({ data: { feeds: [] } })));
  await page.route('**/estacion-bicicleta.json?*', route => route.fulfill(json({ result: [] })));
  await page.route(API + '.json?*', route => route.fulfill(json({
    result: [{ id: 'tuzsa-798', title: 'Sin tiempos', geometry: { coordinates: [-0.8891, 41.6488] } }]
  })));
  await page.route(/poste-autobus\/tuzsa-798\.json/, route => route.fulfill({ status: 503, body: 'Unavailable' }));
  await page.route('https://*.tile.openstreetmap.org/**', route => route.abort());
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect.poll(() => page.evaluate(() => Boolean(window.__openServicesForTest))).toBe(true);
  await page.evaluate(() => {
    document.getElementById('dashboard').classList.remove('hidden');
    document.getElementById('headerToolbar').classList.remove('hidden');
    document.getElementById('servicesBizi').checked = false;
    window.__openServicesForTest();
  });
  await expect(page.locator('#servicesStatus')).toContainText('1 request errors');
  const touchTargetCount = await page.evaluate(() => document.querySelectorAll('#servicesMap .leaflet-overlay-pane .leaflet-interactive').length);
  expect(touchTargetCount).toBe(0);
  // Ensure the stop remains unknown and no fabricated "over 15 min" estimate appears.
  await expect(page.locator('#servicesMap .leaflet-popup-content')).toHaveCount(0);
  await expect(page.locator('#servicesStatus')).toContainText('0 stops with ETA');
});

test('multiselect independently toggles Bizi and Bus; Bizi 3/2/0 remain green/yellow/red', async ({ page }) => {
  await startMockedServices(page);
  await expect(page.locator('#servicesMap .serviceMarker-bike')).toHaveCount(3);
  const colors = await page.locator('#servicesMap .serviceMarker-bike .servicePin.bike').evaluateAll(nodes =>
    nodes.map(x => getComputedStyle(x).backgroundColor));
  expect(colors).toEqual(expect.arrayContaining([
    'rgb(24, 135, 91)',
    'rgb(233, 165, 47)',
    'rgb(217, 71, 73)'
  ]));
  await page.locator('#servicesPicker > summary').click();
  await page.locator('#servicesBus').uncheck();
  await expect(page.locator('#servicesMap .servicesBusLabel')).toHaveCount(0);
  await expect(page.locator('#servicesMap .serviceMarker-bike')).toHaveCount(3);
  await page.locator('#servicesBizi').uncheck();
  await expect(page.locator('#servicesMap .serviceMarker-bike')).toHaveCount(0);
  await page.locator('#servicesBus').check();
  await expect.poll(() => page.evaluate(() => window.__servicesE2E.busLayer().getLayers().filter(x => x.options?.radius === 34).length)).toBe(2);
});

test('broken-bikes-only filter keeps exactly the stations reporting faults, and Chart.js stats reflect current snapshot', async ({page}) => {
  await startMockedServices(page);
  await expect(page.locator('#servicesMap .serviceMarker-bike')).toHaveCount(3);
  await expect(page.locator('#servicesStatistics')).toBeVisible();
  const stats = await page.evaluate(() => ({
    bikes: document.querySelector('#servicesStatCards').innerText,
    charts: Object.keys(window.__servicesE2E.charts())
  }));
  expect(stats.bikes).toContain('out of service');
  expect(stats.bikes).toContain('1');
  expect(stats.charts).toEqual(expect.arrayContaining(['servicesBiziChart','servicesBreakdownChart','servicesBusChart']));
  await page.locator('#servicesPicker > summary').click();
  await page.locator('#servicesBrokenOnly').check();
  await expect(page.locator('#servicesMap .serviceMarker-bike')).toHaveCount(1);
  await expect(page.locator('#servicesMap .serviceRepair')).toContainText('1');
  await page.locator('#servicesBrokenOnly').uncheck();
  await expect(page.locator('#servicesMap .serviceMarker-bike')).toHaveCount(3);
});

test('bus line thresholds count separately per line, never treating an unknown prediction as >15 min', async ({page}) => {
  await startMockedServices(page);
  const result = await page.evaluate(() => ({
    parsed: window.__servicesE2E.lines({result:[{linea:'5',tiempos:[{minutos:12}]},{linea:'35',primero:'22 min'},{linea:'23',primero:'Sin información'}]}),
    cards: document.querySelector('#servicesStatCards').innerText
  }));
  expect(result.parsed).toEqual([{line:'5',minutes:12},{line:'23',minutes:null},{line:'35',minutes:22}]);
  expect(result.cards).toContain('lines with >15 min wait');
  expect(result.cards).toContain('1');
});

test('Services layout fits narrow phones without toolbar overlap or missing map', async ({ page }) => {
  await startMockedServices(page);
  const layout = await page.evaluate(() => {
    const map = document.getElementById('servicesMap').getBoundingClientRect();
    const picker = document.getElementById('servicesPicker').getBoundingClientRect();
    const refresh = document.getElementById('servicesRefresh').getBoundingClientRect();
    const tab = document.getElementById('servicesTab').getBoundingClientRect();
    const account = document.getElementById('account').getBoundingClientRect();
    return {
      pageWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      mapWidth: map.width,
      mapHeight: map.height,
      pickerRight: picker.right,
      refreshLeft: refresh.left,
      tabDoesNotOverlapAccount: tab.bottom <= account.top || tab.top >= account.bottom || tab.right <= account.left || tab.left >= account.right
    };
  });
  expect(layout.mapWidth).toBeGreaterThan(250);
  expect(layout.mapHeight).toBeGreaterThan(350);
  expect(layout.pickerRight).toBeLessThanOrEqual(layout.refreshLeft + 1);
  expect(layout.pageWidth).toBeLessThanOrEqual(layout.viewportWidth + 2);
  expect(layout.tabDoesNotOverlapAccount).toBeTruthy();
});

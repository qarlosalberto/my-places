import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const leafletJs = require.resolve('leaflet/dist/leaflet.js');
const leafletCss = require.resolve('leaflet/dist/leaflet.css');
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
  await page.route(/\/app\.js\?v=/, async route => {
    let source = await (await route.fetch()).text();
    source = source.replace(/^import .*;\s*$/gm, '');
    source = source.replace(/^const configured=.*;$/m, 'const configured=false;');
    if (!source.includes('const configured=false;')) throw Error('Firebase test bypass not applied');
    source += `
window.__servicesE2E = {
  open: () => selectMainTab('services'),
  eta: extractBusEta,
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
      ? { destinos: [{ linea: '35', primero: '22 minutos', segundo: '35 minutos' }] }
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
    window.__servicesE2E.open();
  });
  await expect(page.locator('#servicesMap .leaflet-map-pane')).toBeVisible();
  await expect(page.locator('#servicesStatus')).toContainText('2 arrivals received');
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
    circles: window.__servicesE2E.busLayer().getLayers().filter(x => x.options?.radius === 19 || x.options?.radius === 22).map(x => ({ radius: x.options.radius, color: x.options.fillColor })),
    tapTargets: window.__servicesE2E.busLayer().getLayers().filter(x => x.options?.radius === 34).length
  }));
  expect(results.parsed).toEqual([22, 6, 0, null]);
  expect(results.circles).toEqual(expect.arrayContaining([
    { radius: 22, color: '#d94749' },
    { radius: 22, color: '#4274c7' },
    { radius: 19, color: '#3f84c5' }
  ]));
  expect(results.tapTargets).toBe(3);
  const touchSizes = await page.locator('#servicesMap .servicesBusLabel').evaluateAll(nodes =>
    nodes.map(node => {
      const rect = node.getBoundingClientRect();
      const image = node.querySelector('span');
      return { width: rect.width, height: rect.height, glyph: parseFloat(getComputedStyle(image).fontSize) };
    }));
  expect(touchSizes).toHaveLength(3);
  for (const size of touchSizes) {
    expect(size.width).toBeGreaterThanOrEqual(42);
    expect(size.height).toBeGreaterThanOrEqual(42);
    expect(size.glyph).toBeGreaterThanOrEqual(25);
  }

  const clickPoint = await page.evaluate(() => {
    const map = window.__servicesE2E.map();
    const point = map.latLngToContainerPoint([41.6488, -0.8891]);
    const bounds = map.getContainer().getBoundingClientRect();
    return { x: bounds.left + point.x, y: bounds.top + point.y };
  });
  await page.mouse.click(clickPoint.x, clickPoint.y);
  await expect(page.locator('#servicesMap .leaflet-popup-content')).toContainText('Next arrival: 22 min');
});

test('a failed municipal ETA request never claims a live arrival or colors it red', async ({ page }) => {
  await page.route('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js', route =>
    route.fulfill({ path: leafletJs, contentType: 'application/javascript' }));
  await page.route('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css', route =>
    route.fulfill({ path: leafletCss, contentType: 'text/css' }));
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
  const visual = await page.locator('#servicesMap .servicesBusLabel').count();
  expect(visual).toBe(1);
  const stroke = await page.locator('#servicesMap .leaflet-overlay-pane svg path[stroke]').first().getAttribute('stroke');
  // Ensure the stop remains unknown and no fabricated "over 15 min" estimate appears.
  await expect(page.locator('#servicesMap .leaflet-popup-content')).toHaveCount(0);
  await expect(page.locator('#servicesStatus')).toContainText('0 arrivals received');
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
  await expect(page.locator('#servicesMap .servicesBusLabel')).toHaveCount(3);
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

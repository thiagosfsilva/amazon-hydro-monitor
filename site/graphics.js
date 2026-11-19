/*
project: amazon-hydro, monitor V2 prototype
purpose: Draw the gauge map and seasonal water-level charts
author: OpenAI Codex, for Thiago Silva
*/

'use strict';

const SVG = 'http://www.w3.org/2000/svg';

function svgElement(name, attributes = {}, label) {
  const element = document.createElementNS(SVG, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  if (label !== undefined) element.textContent = label;
  return element;
}

function drawMap(target, stations, selectStation) {
  const map = svgElement('svg', {viewBox: '0 0 720 522', role: 'group', 'aria-label': 'Mapa interativo das estações da ANA'});
  // Match the geographic extent of the offline basemap in build_map.R.
  const x = (longitude) => (longitude + 84) * 18;
  const y = (latitude) => 18 * (8 - Math.asinh(Math.tan(latitude * Math.PI / 180)) * 180 / Math.PI);
  const viewport = svgElement('svg', {width: 720, height: 522, overflow: 'visible'});
  map.append(viewport);
  viewport.append(svgElement('image', {
    href: 'views/monitor_basemap.svg', width: 720, height: 522,
    'aria-hidden': 'true', 'pointer-events': 'none',
  }));
  const tiles = svgElement('g', {'pointer-events': 'none'});
  const boundary = svgElement('path', {d: monitorBoundary, fill: 'none',
    stroke: '#637951', 'stroke-width': 1.8, 'vector-effect': 'non-scaling-stroke', 'pointer-events': 'none'});
  viewport.append(tiles, boundary);
  const layer = document.getElementById('basemap');
  const credit = document.getElementById('map-credit');
  const status = document.getElementById('map-status');
  // Browser file previews cannot send the HTTP referrer required by the OSM tile service.
  if (location.protocol === 'file:') {
    layer.querySelector('[value="osm"]').disabled = true;
    layer.value = 'local';
    status.textContent = 'OpenStreetMap disponível na versão HTTP.';
  }
  const visibleTiles = new Map();
  function drawTiles() {
    if (layer.value === 'local') return;
    const worldWidth = 360 * 18;
    const level = Math.max(0, Math.round(Math.log2(worldWidth * zoom * (map.getScreenCTM()?.a || 1) / 256)));
    const size = worldWidth / 2 ** level;
    const originX = 96 * 18;
    const originY = 172 * 18;
    // The SVG fits the full basin and centres it. Request tiles for the margins too.
    const scale = map.getScreenCTM().a;
    if (!scale) return;
    const bounds = map.getBoundingClientRect();
    const extraX = Math.max(0, bounds.width / scale - 720) / (2 * zoom);
    const extraY = Math.max(0, bounds.height / scale - 522) / (2 * zoom);
    const needed = new Set();
    for (let col = Math.floor((originX + left - extraX) / size); col < (originX + left + 720 / zoom + extraX) / size; col++) {
      for (let row = Math.floor((originY + top - extraY) / size); row < (originY + top + 522 / zoom + extraY) / size; row++) {
        const key = [level, col, row].join('/');
        needed.add(key);
        if (visibleTiles.has(key)) continue;
        const url = layer.value === 'osm' ? 'https://tile.openstreetmap.org/' + key + '.png'
          : 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/' + [level, row, col].join('/');
        const tile = svgElement('image', {x: col * size - originX, y: row * size - originY,
          width: size, height: size, href: url});
        tile.addEventListener('error', () => {
          if (visibleTiles.get(key) !== tile) return;
          layer.value = 'local';
          changeLayer();
          status.textContent = 'Fundo online indisponível. Exibindo o mapa local.';
        });
        visibleTiles.set(key, tile);
        tiles.append(tile);
      }
    }
    for (const [key, tile] of visibleTiles) {
      if (!needed.has(key)) {
        tile.remove();
        visibleTiles.delete(key);
      }
    }
  }

  const markers = new Map();
  for (const station of stations) {
    const point = svgElement('g', {
      class: 'point', role: 'button', tabindex: 0, 'aria-label': station.name, 'aria-pressed': 'false',
      transform: `translate(${x(station.longitude)} ${y(station.latitude)})`,
    });
    // Separate the two neighbouring markers and lead each back to its gauge.
    const offset = station.code === '16900000' ? -9 : station.code === '17050001' ? 9 : 0;
    if (offset) {
      point.append(svgElement('line', {x1: 0, y1: 0, x2: offset, y2: 0, stroke: '#496360'}));
    }
    point.append(svgElement('title', {}, station.name),
      svgElement('circle', {cx: offset, r: 10, class: 'point-hit'}),
      svgElement('circle', {cx: offset, r: 5.3, class: 'point-mark'}));
    point.addEventListener('click', () => selectStation(station.code));
    point.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        selectStation(station.code);
      }
    });
    markers.set(station.code, point);
    viewport.append(point);
  }

  const stationLabel = svgElement('text', {class: 'map-station-label', 'aria-hidden': 'true'});
  viewport.append(stationLabel);
  target.replaceChildren(map);

  const reset = document.getElementById('zoom-reset');
  const maxZoom = 512;
  let zoom = 1;
  let left = 0;
  let top = 0;
  let selected;

  function showView() {
    const width = 720 / zoom;
    const height = 522 / zoom;
    left = Math.max(0, Math.min(720 - width, left));
    top = Math.max(0, Math.min(522 - height, top));
    viewport.setAttribute('viewBox', [left, top, width, height].join(' '));
    drawTiles();
    map.classList.toggle('zoomed', zoom > 1);
    reset.disabled = zoom <= 1;
    for (const station of stations) {
      markers.get(station.code).setAttribute('transform',
        `translate(${x(station.longitude)} ${y(station.latitude)}) scale(${1 / zoom})`);
    }
    if (selected) {
      stationLabel.setAttribute('transform',
        `translate(${x(selected.longitude)} ${y(selected.latitude)}) scale(${1 / zoom})`);
    }
  }

  // Keep the geographic point under the gesture centre anchored while zooming.
  function changeView(from, to, factor) {
    const next = Math.max(1, Math.min(maxZoom, zoom * factor));
    left += from.x / zoom - to.x / next;
    top += from.y / zoom - to.y / next;
    zoom = next;
    showView();
  }
  const centre = {x: 360, y: 261};
  reset.onclick = () => changeView(centre, centre, 1 / zoom);
  map.setAttribute('tabindex', '0');
  map.addEventListener('keydown', (event) => {
    if (['+', '=', '-'].includes(event.key)) {
      event.preventDefault();
      changeView(centre, centre, event.key === '-' ? 0.5 : 2);
      return;
    }
    const step = 50 / zoom;
    if (zoom === 1 || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'ArrowLeft') left -= step;
    if (event.key === 'ArrowRight') left += step;
    if (event.key === 'ArrowUp') top -= step;
    if (event.key === 'ArrowDown') top += step;
    showView();
  });

  const touches = new Map();
  let start;
  let dragged = false;
  function mapPoint(event) {
    return new DOMPoint(event.clientX, event.clientY).matrixTransform(map.getScreenCTM().inverse());
  }
  map.addEventListener('wheel', (event) => {
    if ( event.ctrlKey || !event.deltaY) return;
    event.preventDefault();
    const units = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 522 : 1;
    const delta = Math.max(-300, Math.min(300, event.deltaY * units));
    const anchor = mapPoint(event);
    changeView(anchor, anchor, 2 ** (-delta / 300));
  }, {passive: false});
  function gesture() {
    const [a, b] = touches.values();
    if (!b) return {centre: a, distance: 0};
    return {centre: {x: (a.x + b.x) / 2, y: (a.y + b.y) / 2},
      distance: Math.hypot(a.x - b.x, a.y - b.y)};
  }
  map.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || touches.size >= 2) return;
    if (!touches.size) {
      dragged = false;
      start = {x: event.clientX, y: event.clientY};
    } else {
      dragged = true;
    }
    touches.set(event.pointerId, mapPoint(event));
    event.target.setPointerCapture(event.pointerId);
  });
  map.addEventListener('pointermove', (event) => {
    if (!touches.has(event.pointerId)) return;
    const from = gesture();
    if (!dragged && Math.hypot(event.clientX - start.x, event.clientY - start.y) < 4) return;
    dragged = true;
    touches.set(event.pointerId, mapPoint(event));
    const to = gesture();
    changeView(from.centre, to.centre, from.distance && to.distance ? to.distance / from.distance : 1);
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    map.addEventListener(type, (event) => touches.delete(event.pointerId));
  }
  map.addEventListener('click', (event) => {
    if (dragged && event.detail > 0) event.stopPropagation();
  }, true);
  function changeLayer() {
    visibleTiles.clear();
    tiles.replaceChildren();
    const satellite = layer.value === 'satellite';
    target.parentElement.classList.toggle('local-basemap', layer.value === 'local');
    boundary.style.display = layer.value === 'local' ? 'none' : '';
    boundary.setAttribute('stroke', satellite ? '#ffe6a3' : '#637951');
    credit.textContent = layer.value === 'local' ? 'Natural Earth · HydroBASINS'
      : satellite ? 'Esri World Imagery · Esri, Maxar, Earthstar Geographics e colaboradores' : '© OpenStreetMap contributors';
    credit.href = layer.value === 'local' ? 'https://www.hydrosheds.org/products/hydrobasins'
      : satellite ? 'https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9' : 'https://www.openstreetmap.org/copyright';
    showView();
  }
  layer.onchange = () => { status.textContent = ''; changeLayer(); };
  changeLayer();
  new ResizeObserver(drawTiles).observe(target);

  return {
    select(code) {
      for (const [markerCode, marker] of markers) marker.setAttribute('aria-pressed', markerCode === code);
      const station = stations.find((candidate) => candidate.code === code);
      selected = station;
      stationLabel.setAttribute('y', -13);
      stationLabel.textContent = station.name;
      // A station chosen in the dropdown should be visible at the existing zoom.
      if (x(station.longitude) < left || x(station.longitude) > left + 720 / zoom ||
          y(station.latitude) < top || y(station.latitude) > top + 522 / zoom) {
        left = x(station.longitude) - 360 / zoom;
        top = y(station.latitude) - 261 / zoom;
      }
      showView();
    },
  };
}

// Split paths at empty calendar days so unavailable readings appear as gaps.
function tracePath(values, x, y) {
  let starts = true;
  return values.map((value, day) => {
    if (value === null) {
      starts = true;
      return '';
    }
    const command = starts ? 'M' : 'L';
    starts = false;
    return `${command}${x(day).toFixed(1)},${y(value).toFixed(1)}`;
  }).join('');
}

function bandPath(lower, upper, x, y) {
  let path = '';
  let top = [];
  let bottom = [];
  for (let day = 0; day <= lower.length; day += 1) {
    if (day < lower.length && lower[day] !== null && upper[day] !== null) {
      top.push(`${x(day).toFixed(1)},${y(upper[day]).toFixed(1)}`);
      bottom.push(`${x(day).toFixed(1)},${y(lower[day]).toFixed(1)}`);
    } else if (top.length) {
      path += `M${top.concat(bottom.reverse()).join('L')}Z`;
      top = [];
      bottom = [];
    }
  }
  return path;
}

function levelTicks(station) {
  if (station.code === '31645000') return [5, 5.5, 6, 6.5, 7, 7.5, 8];
  const climate = station.baseline;
  const limits = [climate.lower, climate.upper, ...Object.values(station.years)];
  const values = limits.flat().filter((value) => value !== null);
  const lower = Math.min(...values);
  const upper = Math.max(...values);
  const roughStep = (upper - lower) / 5 || 1;
  const scale = 10 ** Math.floor(Math.log10(roughStep));
  const step = ([1, 2, 5, 10].find((size) => size * scale >= roughStep)) * scale;
  const start = Math.floor(lower / step) * step;
  const count = Math.max(1, Math.ceil((upper - start) / step));
  return Array.from({length: count + 1}, (_, index) => start + step * index);
}

function drawChart(target, station, state, days, series, moveCursor) {
  const padding = getComputedStyle(target);
  const width = Math.max(220, target.clientWidth - parseFloat(padding.paddingLeft) - parseFloat(padding.paddingRight));
  // Keep the area inside the axes at 5:4 at every card width.
  const height = 52 + (width - 58) * 0.8;
  const frame = {left: 42, right: width - 16, top: 25, bottom: height - 27};
  const ticks = levelTicks(station);
  const lower = ticks[0];
  const upper = ticks.at(-1);
  const x = (day) => frame.left + day * (frame.right - frame.left) / 364;
  const y = (value) => frame.bottom - (value - lower) * (frame.bottom - frame.top) / (upper - lower);
  const units = 'Nível (m)';
  const chart = svgElement('svg', {viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': `${station.name}, ${units.toLowerCase()} ao longo do ano`});
  const textFormat = new Intl.NumberFormat('pt-BR', {maximumFractionDigits: 2});
  chart.append(svgElement('text', {x: frame.left, y: 16, class: 'plot-label plot-unit'}, units));

  for (const value of ticks) {
    chart.append(svgElement('line', {x1: frame.left, x2: frame.right, y1: y(value), y2: y(value), class: 'plot-grid'}),
      svgElement('text', {x: frame.left - 6, y: y(value), 'text-anchor': 'end', 'dominant-baseline': 'central', class: 'plot-label'}, textFormat.format(value)));
  }

  const monthFormat = new Intl.DateTimeFormat('pt-BR', {month: 'short', timeZone: 'UTC'});
  days.forEach((date, day) => {
    if (date.getUTCDate() !== 1 || (width < 460 && date.getUTCMonth() % 2)) return;
    chart.append(svgElement('line', {x1: x(day), x2: x(day), y1: frame.top, y2: frame.bottom, class: 'plot-grid'}),
      svgElement('text', {x: x(day), y: frame.bottom + 20, 'text-anchor': 'middle', class: 'plot-label'}, monthFormat.format(date).replace('.', '')));
  });

  const climate = station.baseline;
  if (state.overlays.has('range')) chart.append(svgElement('path', {d: bandPath(climate.lower, climate.upper, x, y), class: 'plot-range'}));
  if (state.overlays.has('mean')) chart.append(svgElement('path', {d: tracePath(climate.mean, x, y), class: 'plot-mean'}));
  const curves = svgElement('g');
  if (station.code === '31645000') {
    curves.setAttribute('clip-path', `inset(${frame.top}px ${width - frame.right}px ${height - frame.bottom}px ${frame.left}px) view-box`);
  }
  chart.append(curves);
  for (const {year, color, emphasised} of series) {
    const values = station.years[year];
    curves.append(svgElement('path', {
      d: tracePath(values, x, y), class: emphasised ? 'plot-current' : 'plot-year', stroke: color,
    }));
  }

  const cursor = svgElement('line', {y1: frame.top, y2: frame.bottom, class: 'plot-cursor'});
  const marker = svgElement('circle', {r: 4, class: 'plot-reading'});
  const current = station.years[series.at(-1).year];
  const interaction = svgElement('rect', {x: frame.left, y: frame.top, width: frame.right - frame.left, height: frame.bottom - frame.top, class: 'plot-target', fill: 'transparent'});
  chart.append(cursor, marker, interaction);
  function setCursor(day) {
    cursor.setAttribute('x1', x(day));
    cursor.setAttribute('x2', x(day));
    const value = current[day];
    marker.setAttribute('visibility', value === null || value < lower || value > upper ? 'hidden' : 'visible');
    if (value !== null) {
      marker.setAttribute('cx', x(day));
      marker.setAttribute('cy', y(value));
    }
  }

  function pointToDate(event) {
    const bounds = chart.getBoundingClientRect();
    const chartX = (event.clientX - bounds.left) * width / bounds.width;
    const day = Math.round(364 * (chartX - frame.left) / (frame.right - frame.left));
    moveCursor(Math.min(364, Math.max(0, day)));
  }
  interaction.addEventListener('pointermove', (event) => {
    if (event.pointerType === 'mouse') pointToDate(event);
  });
  interaction.addEventListener('click', pointToDate);
  chart.setAttribute('tabindex', '0');
  chart.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const step = event.key === 'ArrowLeft' ? -1 : 1;
    moveCursor(Math.max(0, Math.min(364, state.day + step)));
  });
  target.replaceChildren(chart);
  setCursor(state.day);
  return {setCursor};
}

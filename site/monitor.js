/*
project: amazon-hydro, monitor V2 prototype
purpose: Connect independent gauge selections and shared chart controls
author: OpenAI Codex, for Thiago Silva
*/

'use strict';

const data = window.MONITOR_V2_DATA;
const get = (id) => document.getElementById(id);

if (data) initialize();

function initialize() {
  const stations = new Map(data.stations.map((station) => [station.code, station]));
  const baselineLabel = data.baseline.join('–');
  const latestDate = data.stations.map((station) => station.latest).sort().at(-1);
  const days = Array.from({length: 365}, (_, day) => new Date(Date.UTC(2001, 0, day + 1)));
  const dateFormat = new Intl.DateTimeFormat('pt-BR', {day: 'numeric', month: 'short', timeZone: 'UTC'});
  const fullDateFormat = new Intl.DateTimeFormat('pt-BR', {day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC'});
  const formatReadingDate = (date) => fullDateFormat.format(new Date(`${date}T00:00:00Z`));
  const levelFormat = new Intl.NumberFormat('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2});
  const changeFormat = new Intl.NumberFormat('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: 'exceptZero'});
  const formatLevel = (value) => value === null ? '—' : `${levelFormat.format(value)} m`;
  const upperStation = get('map-select');
  const defaultStations = ['10100000', '14990000', '17050001', '12351000', '14100000', '15630000'];
  const mean = {label: 'Média histórica', color: 'var(--plot-mean)', style: 'mean'};
  const range = {label: 'Média ± 1,96 desvios-padrão', color: 'var(--plot-range)', style: 'band'};
  const current = {label: String(data.currentYear), color: 'var(--plot-current)', style: 'current'};
  const state = {
    day: days.findLastIndex((day) => day.toISOString().slice(5, 10) <= latestDate.slice(5)),
    station: '14990000',
    overlays: new Set(['mean', 'range']),
    keyYears: new Set([2024, 2021]),
  };
  const charts = [];
  const keyYears = data.keyYears;

  get('coverage').textContent = `Período de referência ${baselineLabel}`;
  get('snapshot').textContent = `Último registro em ${formatReadingDate(latestDate)}`;
  get('sources').innerHTML = `
    <p>Níveis do HidroWeb e da telemetria da ANA, em metros na régua de cada estação. Coordenadas das estações: ANA. Bacia hidrográfica: HydroBASINS. Rios, cidades e litoral: Natural Earth.</p>
    <p>A faixa sombreada mostra a média diária mais ou menos 1,96 vezes o desvio-padrão dos níveis observados na mesma estação e data em ${baselineLabel}.</p>
    <p>As variações comparam a última leitura com a do dia anterior e a de sete dias antes. Um traço indica que falta a leitura de comparação. Cada ano extremo selecionado precisa de pelo menos 300 dias com leitura válida.</p>`;

  // Each select has the same choices and its own selected gauge.
  function fillSelect(select, code) {
    select.replaceChildren(...data.stations.map((station) => new Option(station.name, station.code)));
    select.value = code;
  }

  function addMetric(value, title) {
    const metric = document.createElement('div');
    metric.className = 'metric';
    const number = document.createElement('strong');
    number.textContent = value;
    const label = document.createElement('span');
    label.textContent = title;
    metric.append(number, label);
    return metric;
  }

  function showLevels(target, station) {
    const level = addMetric(formatLevel(station.latestLevel), formatReadingDate(station.latest));
    level.classList.add('latest-level');
    target.replaceChildren(level);
    for (const [delta, period] of [[station.change1d, 'em 1 dia'], [station.change7d, 'em 7 dias']]) {
      if (delta === null) {
        target.append(addMetric('—', period));
        continue;
      }
      const value = delta !== 0 && Math.abs(delta) < 0.005
        ? '< 0,01 m' : `${changeFormat.format(delta)} m`;
      const trend = addMetric(value, period);
      const arrow = document.createElement('b');
      arrow.className = 'trend-arrow';
      arrow.textContent = delta > 0 ? '↗' : delta < 0 ? '↘' : '→';
      arrow.dataset.direction = delta > 0 ? 'up' : delta < 0 ? 'down' : 'steady';
      arrow.setAttribute('aria-label', delta > 0 ? 'Subiu' : delta < 0 ? 'Desceu' : 'Estável');
      trend.firstChild.prepend(arrow);
      target.append(trend);
    }
  }

  function stationPlace(station) {
    return station.river.toLowerCase().replace(/(^|\s)(\p{L})/gu, (_, space, letter) => space + letter.toUpperCase()) + ` · ANA ${station.code}`;
  }

  function chartSeries(station) {
    const highlights = keyYears.filter(({year}) => state.keyYears.has(year) && station.years[year]);
    const background = station.code === '31645000'
      ? Object.keys(station.years).map(Number).filter(year => year < data.currentYear && !state.keyYears.has(year))
          .map(year => ({year, color: '#c7c9ca'}))
      : [];
    return [
      ...background,
      ...highlights,
      {year: data.currentYear, color: current.color, emphasised: true},
    ];
  }

  function drawCard(card) {
    const station = stations.get(card.code);
    if (!card.note) {
      card.note = document.createElement('div');
      card.note.className = 'station-note';
      const notes = {
        '12900001': 'Niveis exibidos a partir de 6 de setembro de 2024 foram reduzidos em 4,963 m para compensar um salto observado na série.',
        '31645000': `Monitoramento iniciado em 2015. Média histórica indisponível. As linhas cinza mostram as curvas anuais de 2016 a ${data.currentYear - 1}.`,
      };
      for (const [code, text] of Object.entries(notes)) {
        const paragraph = document.createElement('p');
        paragraph.dataset.station = code;
        paragraph.textContent = text;
        card.note.append(paragraph);
      }
      card.cursor.after(card.note);
    }
    for (const paragraph of card.note.children) {
      paragraph.style.visibility = paragraph.dataset.station === station.code ? 'visible' : 'hidden';
    }
    card.plot = drawChart(card.target, station, state, days, chartSeries(station), moveCursor);
    showCursorReading(card.cursor, station);
  }

  function showCursorReading(target, station) {
    const years = [data.currentYear, ...Array.from(state.keyYears).sort((a, b) => b - a)];
    const readings = years.map(year => [year, station.years[year]?.[state.day]]);
    readings.push(['Média histórica', station.baseline.mean[state.day]]);
    const table = document.createElement('table');
    table.createCaption().textContent = dateFormat.format(days[state.day]);
    for (const [label, value] of readings) {
      const row = table.insertRow();
      const heading = document.createElement('th');
      heading.scope = 'row';
      heading.textContent = label;
      row.append(heading);
      row.insertCell().textContent = Number.isFinite(value) ? formatLevel(value) : '—';
    }
    target.replaceChildren(table);
  }

  function moveCursor(day) {
    if (state.day === Number(day)) return;
    state.day = Number(day);
    for (const card of charts) {
      card.plot.setCursor(state.day);
      showCursorReading(card.cursor, stations.get(card.code));
    }
  }

  function drawLegend() {
    const entries = [current];
    if (state.overlays.has('mean')) entries.push(mean);
    if (state.overlays.has('range')) entries.push(range);
    get('chart-legend').replaceChildren(...entries.map(({label, color, style}) => {
      const entry = document.createElement('span');
      const swatch = document.createElement('i');
      swatch.className = style;
      swatch.style.setProperty('--legend-colour', color);
      swatch.setAttribute('aria-hidden', 'true');
      entry.append(swatch, label);
      return entry;
    }));
  }

  function redrawCharts() {
    charts.forEach(drawCard);
    drawLegend();
  }

  const detail = {code: state.station, target: get('station-plot'), cursor: get('station-cursor')};
  charts.push(detail);
  fillSelect(upperStation, detail.code);

  function selectOnMap(code) {
    const station = stations.get(code);
    state.station = code;
    detail.code = code;
    upperStation.value = code;
    get('station-name').textContent = station.name;
    get('station-place').textContent = stationPlace(station);
    showLevels(get('station-metrics'), station);
    const day = days.findIndex(date => date.toISOString().slice(5, 10) === station.latest.slice(5));
    const average = station.baseline.mean[day];
    get('baseline-summary').textContent = Number.isFinite(average)
      ? `Média histórica na data: ${formatLevel(average)}   ·   Diferença da média: ${changeFormat.format(station.latestLevel - average)} m`
      : 'Média histórica na data: —   ·   Diferença da média: —';
    map.select(code);
    drawCard(detail);
  }

  const mobile = matchMedia('(max-width: 800px)');
  const controls = document.querySelector('.controls');
  const overview = document.querySelector('.overview');
  const legend = get('chart-legend');
  const toggle = document.querySelector('.map-toggle');
  function arrangeControls() {
    const anchor = mobile.matches ? get('station-panel') : overview;
    anchor.before(controls, legend);
  }
  arrangeControls();
  mobile.addEventListener('change', arrangeControls);
  toggle.onclick = () => {
    const open = toggle.getAttribute('aria-expanded') !== 'true';
    toggle.setAttribute('aria-expanded', String(open));
    toggle.textContent = open ? 'Ocultar mapa das estações' : 'Mostrar mapa das estações';
  };
  const map = drawMap(get('map'), data.stations, selectOnMap);
  selectOnMap(state.station);
  upperStation.addEventListener('change', () => selectOnMap(upperStation.value));

  const grid = get('comparison-grid');
  function addCard(code) {
    const index = grid.children.length;
    const element = document.createElement('article');
    element.className = 'panel chart-card';
    element.innerHTML = `
      <div class="panel-head">
        <label><span class="visually-hidden">Estação de comparação ${index + 1}</span><select></select></label>
        <p class="station-place"></p>
      </div>
      <div class="station-metrics"></div>
      <div class="season-plot"></div>
      <div class="cursor-value"></div>`;
    const select = element.querySelector('select');
    const place = element.querySelector('.station-place');
    const latest = element.querySelector('.station-metrics');
    const card = {code, target: element.querySelector('.season-plot'), cursor: element.querySelector('.cursor-value')};
    charts.push(card);
    grid.append(element);
    fillSelect(select, code);

    function changeCard() {
      card.code = select.value;
      const station = stations.get(card.code);
      place.textContent = stationPlace(station);
      showLevels(latest, station);
      drawCard(card);
    }

    changeCard();
    select.addEventListener('change', changeCard);
  }
  defaultStations.forEach(addCard);
  const addRow = get('add-row');
  addRow.addEventListener('click', () => {
    const selected = new Set(charts.slice(1).map((card) => card.code));
    const available = data.stations.filter((station) => !selected.has(station.code));
    const count = Math.min(3, stations.size - grid.children.length);
    const first = grid.children.length;
    available.slice(0, count).forEach((station) => addCard(station.code));
    grid.children[first].querySelector('select').focus();
    addRow.hidden = grid.children.length >= stations.size;
  });

  document.querySelectorAll('.overlays input').forEach((input) => {
    input.addEventListener('change', () => {
      if (input.checked) state.overlays.add(input.value);
      else state.overlays.delete(input.value);
      redrawCharts();
    });
  });
  for (const {year, color, group} of keyYears) {
    const label = document.createElement('label');
    const checkbox = document.createElement('input');
    label.title = group;
    checkbox.type = 'checkbox';
    checkbox.checked = state.keyYears.has(year);
    checkbox.style.accentColor = color;
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) state.keyYears.add(year);
      else state.keyYears.delete(year);
      redrawCharts();
    });
    label.append(checkbox, String(year));
    get('key-years').append(label);
  }

  let nextFrame;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(nextFrame);
    nextFrame = requestAnimationFrame(redrawCharts);
  });
  moveCursor(state.day);
  drawLegend();
}

if (!data) get('load-error').hidden = false;

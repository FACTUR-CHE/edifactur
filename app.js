const state = {
  records: [],
  filtered: [],
  selectedId: null,
  activeTab: 'structured',
  activeMessage: 0,
  page: 0,
  pageSize: 250,
};
const labels = {
  UNB: 'Austauschkopf',
  UNH: 'Nachrichtenkopf',
  BGM: 'Dokument / Vorgang',
  DTM: 'Datum und Zeit',
  NAD: 'Marktpartner',
  CTA: 'Ansprechpartner',
  COM: 'Kontakt',
  RFF: 'Referenz',
  LOC: 'Ort / Lokation',
  LIN: 'Position',
  PIA: 'Zusatz-ID',
  QTY: 'Menge',
  MOA: 'Betrag',
  FTX: 'Freitext',
  ERC: 'Fehlercode',
  UNT: 'Nachrichtenende',
  UNZ: 'Austauschende',
};
const $ = (id) => document.getElementById(id);
function escapeHtml(value) {
  return String(value ?? '').replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char],
  );
}
function highlight(value) {
  const query = $('search').value.trim();
  const safe = escapeHtml(value);
  if (!query) return safe;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return safe.replace(new RegExp('(' + escaped + ')', 'ig'), '<mark>$1</mark>');
}
function splitEdifact(value, separator, releaseChar) {
  const parts = [];
  let current = '';
  let released = false;
  for (const char of value) {
    if (released) {
      current += char;
      released = false;
      continue;
    }
    if (char === releaseChar) {
      released = true;
      continue;
    }
    if (char === separator) {
      parts.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  if (released) current += releaseChar;
  parts.push(current);
  return parts;
}
function parseEdifact(source) {
  if (!source || typeof source !== 'string') return [];
  let segmentSep = "'",
    elementSep = '+',
    componentSep = ':',
    releaseChar = '?';
  if (source.startsWith('UNA') && source.length > 8) {
    componentSep = source[3];
    elementSep = source[4];
    releaseChar = source[6];
    segmentSep = source[8];
  }
  const rawSegments = splitEdifact(source, segmentSep, releaseChar)
    .map((s) => s.trim())
    .filter(Boolean);
  const messages = [];
  let current = [];
  rawSegments.forEach((raw) => {
    const elements = splitEdifact(raw, elementSep, releaseChar);
    const segment = { tag: elements[0], elements: elements.slice(1), raw };
    if (segment.tag === 'UNH' && current.length) {
      messages.push(current);
      current = [];
    }
    current.push(segment);
    if (segment.tag === 'UNT') {
      messages.push(current);
      current = [];
    }
  });
  if (current.length) messages.push(current);
  return messages.map((segments) => ({
    segments,
    type: (segments.find((s) => s.tag === 'UNH')?.elements[1] || 'EDIFACT').split(componentSep)[0],
  }));
}
function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function normalize(record) {
  const payload = record.payload?.payload || '';
  const messages = parseEdifact(payload);
  const metadata = [
    record.ID,
    record.messageID,
    record.referenceMessageID,
    record.communicationPartnerID,
    record.ownPartnerID,
    record.businessStatus,
    record.direction,
    record.messageCategory,
    record.messageFormat,
    record.processingStatus,
    record.transferTimestamp,
  ]
    .filter(Boolean)
    .join(' ');
  return {
    ...record,
    _payload: payload,
    _messages: messages,
    _messageCount: messages.filter((message) =>
      message.segments.some((segment) => segment.tag === 'UNH'),
    ).length,
    _search: (metadata + ' ' + payload).toLowerCase(),
  };
}
function setOptions(id, property) {
  const values = [...new Set(state.records.map((r) => r[property]).filter(Boolean))].sort();
  $(id).insertAdjacentHTML(
    'beforeend',
    values.map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join(''),
  );
}
function formatDate(value) {
  if (!value) return '–';
  const date = new Date(value);
  return Number.isNaN(date) ? value : date.toLocaleString('de-DE');
}
function applyFilters() {
  const query = $('search').value.trim().toLowerCase();
  state.filtered = state.records.filter(
    (r) =>
      (!query || r._search.includes(query)) &&
      (!$('formatFilter').value || r.messageFormat === $('formatFilter').value) &&
      (!$('directionFilter').value || r.direction === $('directionFilter').value) &&
      (!$('statusFilter').value || r.processingStatus === $('statusFilter').value) &&
      (!$('categoryFilter').value || r.messageCategory === $('categoryFilter').value),
  );
  const lastPage = Math.max(0, Math.ceil(state.filtered.length / state.pageSize) - 1);
  state.page = Math.min(state.page, lastPage);
  if (!state.filtered.some((r) => r.ID === state.selectedId))
    state.selectedId = state.filtered[0]?.ID || null;
  renderList();
  renderDetail();
}
function renderList() {
  const start = state.page * state.pageSize;
  const shown = state.filtered.slice(start, start + state.pageSize);
  const totalPages = Math.max(1, Math.ceil(state.filtered.length / state.pageSize));
  $('resultInfo').innerHTML =
    `<strong>${state.filtered.length.toLocaleString('de-DE')}</strong> von ${state.records.length.toLocaleString('de-DE')} Nachrichten${state.filtered.length > state.pageSize ? ` · Seite ${state.page + 1} von ${totalPages}` : ''}`;
  const records = shown.length
    ? shown
        .map(
          (r) =>
            `<button class="record ${r.ID === state.selectedId ? 'active' : ''}" data-id="${escapeHtml(r.ID)}"><div class="record-top"><span class="record-id">${highlight(r.messageID || r.ID)}</span><span class="badge">${highlight(r.messageFormat || '–')}</span></div><div class="record-meta">${highlight(r.direction || '–')} · ${highlight(r.processingStatus || '–')}<br>${highlight(r.communicationPartnerID || 'Kein Partner')} · ${formatDate(r.transferTimestamp)}${r._messageCount > 1 ? `<br><span class="aggregate-badge">Sammelnachricht · ${r._messageCount} EDIFACT-Nachrichten</span>` : ''}</div></button>`,
        )
        .join('')
    : '<p class="empty">Keine passenden Nachrichten.</p>';
  const pager =
    state.filtered.length > state.pageSize
      ? `<nav class="pager" aria-label="Seitennavigation"><button type="button" data-page="previous" ${state.page === 0 ? 'disabled' : ''}>← Zurück</button><span>${(start + 1).toLocaleString('de-DE')}–${Math.min(start + state.pageSize, state.filtered.length).toLocaleString('de-DE')} von ${state.filtered.length.toLocaleString('de-DE')}</span><button type="button" data-page="next" ${state.page >= totalPages - 1 ? 'disabled' : ''}>Weiter →</button></nav>`
      : '';
  $('recordList').innerHTML = records + pager;
}
function metaItem(label, value) {
  return `<div><dt>${label}</dt><dd>${highlight(value || '–')}</dd></div>`;
}
function renderStructured(record) {
  const messages = record._messages;
  if (!messages.length)
    return '<p class="notice">Keine EDIFACT-Segmente in der Nutzlast erkannt.</p>';
  const message = messages[state.activeMessage] || messages[0];
  const tabs =
    messages.length > 1
      ? `<div class="message-tabs">${messages.map((m, i) => `<button class="message-tab ${i === state.activeMessage ? 'active' : ''}" data-message="${i}">Nachricht ${i + 1}: ${escapeHtml(m.type)}</button>`).join('')}</div>`
      : '';
  const segments = message.segments
    .map(
      (s) =>
        `<div class="segment"><code title="${escapeHtml(labels[s.tag] || 'EDIFACT-Segment')}">${escapeHtml(s.tag)}</code><div><small>${escapeHtml(labels[s.tag] || 'EDIFACT-Segment')}</small><div class="segment-values">${s.elements.map((v, i) => `<span class="value" title="Element ${i + 1}">${highlight(v || '∅')}</span>`).join('')}</div></div></div>`,
    )
    .join('');
  return (
    tabs +
    `<div class="section"><h3>${escapeHtml(message.type)} · ${message.segments.length} Segmente</h3>${segments}</div>`
  );
}
function renderDetail() {
  const record = state.records.find((r) => r.ID === state.selectedId);
  if (!record) {
    $('detail').innerHTML = '<p class="empty">Wählen Sie eine Nachricht aus der Liste.</p>';
    return;
  }
  const tabs = `<div class="tabs"><button class="tab ${state.activeTab === 'structured' ? 'active' : ''}" data-tab="structured">Strukturierte Ansicht</button><button class="tab ${state.activeTab === 'raw' ? 'active' : ''}" data-tab="raw">EDIFACT-Rohdaten</button></div>`;
  const aggregation =
    record._messageCount > 1
      ? `<span class="aggregate-badge">Sammelnachricht · ${record._messageCount} EDIFACT-Nachrichten enthalten</span>`
      : '';
  $('detail').innerHTML =
    `<div class="detail-head"><div><p class="eyebrow">${escapeHtml(record.direction || 'Nachricht')} · ${escapeHtml(record.processingStatus || 'ohne Status')}</p><h2>${highlight(record.messageFormat || 'EDIFACT')} <span class="chip">${highlight(record.messageID || record.ID)}</span></h2>${aggregation}</div></div><dl class="meta">${metaItem('Übertragung', formatDate(record.transferTimestamp))}${metaItem('Kommunikationspartner', record.communicationPartnerID)}${metaItem('Eigene Partner-ID', record.ownPartnerID)}${metaItem('Kategorie', record.messageCategory)}${metaItem('Referenz', record.referenceMessageID)}${metaItem('Austauschweg', record.exchangeMethod)}</dl>${tabs}${state.activeTab === 'raw' ? `<pre>${highlight(record._payload)}</pre>` : renderStructured(record)}`;
}
function loadJson(text, name) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    alert('Die Datei enthält kein gültiges JSON.');
    return;
  }
  const list = Array.isArray(data.value) ? data.value : Array.isArray(data) ? data : [];
  const records = list.filter(isRecord);
  if (!records.length) {
    alert('Keine gültigen Datensätze gefunden. Erwartet wird eine Liste von Objekten in "value".');
    return;
  }
  if (records.length !== list.length)
    alert(`${list.length - records.length} ungültige Datensätze wurden übersprungen.`);
  state.records = records.map(normalize);
  state.selectedId = state.records[0].ID;
  state.activeTab = 'structured';
  state.activeMessage = 0;
  ['formatFilter', 'directionFilter', 'statusFilter', 'categoryFilter'].forEach((id) => {
    $(id).innerHTML = $(id).options[0].outerHTML;
  });
  setOptions('formatFilter', 'messageFormat');
  setOptions('directionFilter', 'direction');
  setOptions('statusFilter', 'processingStatus');
  setOptions('categoryFilter', 'messageCategory');
  $('fileName').textContent = name;
  $('upload').style.display = 'none';
  $('app').style.display = 'flex';
  applyFilters();
}
$('fileInput').addEventListener('change', (event) => {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onerror = () => alert('Die Datei konnte nicht gelesen werden.');
  reader.onload = () => loadJson(reader.result, file.name);
  reader.readAsText(file);
});
$('aboutButton').addEventListener('click', () => $('aboutDialog').showModal());
$('aboutClose').addEventListener('click', () => $('aboutDialog').close());
$('aboutDialog').addEventListener('click', (event) => {
  if (event.target === $('aboutDialog')) $('aboutDialog').close();
});
['search', 'formatFilter', 'directionFilter', 'statusFilter', 'categoryFilter'].forEach((id) =>
  $(id).addEventListener(id === 'search' ? 'input' : 'change', () => {
    state.activeMessage = 0;
    state.page = 0;
    applyFilters();
  }),
);
$('clearFilters').addEventListener('click', () => {
  ['search', 'formatFilter', 'directionFilter', 'statusFilter', 'categoryFilter'].forEach(
    (id) => ($(id).value = ''),
  );
  state.activeMessage = 0;
  state.page = 0;
  applyFilters();
});
$('recordList').addEventListener('click', (event) => {
  const pageButton = event.target.closest('[data-page]');
  const button = event.target.closest('[data-id]');
  if (pageButton) {
    state.page += pageButton.dataset.page === 'next' ? 1 : -1;
    applyFilters();
  }
  if (button) {
    state.selectedId = button.dataset.id;
    state.activeMessage = 0;
    renderList();
    renderDetail();
  }
});
$('detail').addEventListener('click', (event) => {
  const tab = event.target.closest('[data-tab]');
  const message = event.target.closest('[data-message]');
  if (tab) {
    state.activeTab = tab.dataset.tab;
    renderDetail();
  }
  if (message) {
    state.activeMessage = Number(message.dataset.message);
    renderDetail();
  }
});

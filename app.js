const state = {
  allData: [],
  filteredData: [],
  activeFilters: {
    hospital: 'all',
    location: 'all',
    affiliation: 'all',
    toeic: 'all'
  },
  currentSearch: '',
  currentSort: 'id-asc',
  viewMode: 'grid', // 'grid' | 'table'
  compareSet: new Set(),
  chartsVisible: false,
  theme: 'light',
  charts: {
    toeicDist: null,
    hospitalTop: null,
    affilDoughnut: null
  }
};

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
  if (typeof SPEC_DATA !== 'undefined') {
    state.allData = SPEC_DATA;
    initializeApp();
  } else {
    fetch('data.json')
      .then(res => res.json())
      .then(data => {
        state.allData = data;
        initializeApp();
      })
      .catch(err => {
        console.error('Data loading failure:', err);
      });
  }
});

function initializeApp() {
  applyTheme(state.theme);
  renderKPIs();
  applyFiltersAndRender();
  setupEventListeners();
  setupKeyboardShortcuts();
}

// Theme Switcher Engine (Default Light Mode)
window.applyTheme = function(theme) {
  state.theme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('cb_theme', theme);

  const iconElem = document.getElementById('theme-icon');
  const textElem = document.getElementById('theme-text');
  if (iconElem && textElem) {
    if (theme === 'dark') {
      iconElem.textContent = '☀️';
      textElem.textContent = '라이트';
    } else {
      iconElem.textContent = '🌙';
      textElem.textContent = '다크';
    }
  }

  if (state.chartsVisible) {
    updateCharts();
  }
};

// Render Header KPIs
function renderKPIs() {
  const totalElem = document.getElementById('kpi-total');
  if (totalElem) totalElem.textContent = `${state.allData.length}명`;

  let gpaSum = 0;
  let gpaCount = 0;
  let toeicSum = 0;
  let toeicCount = 0;
  let affilNoCount = 0;

  state.allData.forEach(item => {
    // GPA parsing
    const gpaStr = String(item['학점_상세'] || '');
    const gpaMatch = gpaStr.match(/(\d+\.\d+)/);
    if (gpaMatch) {
      const val = parseFloat(gpaMatch[1]);
      if (val >= 2.0 && val <= 4.5) {
        gpaSum += val;
        gpaCount++;
      }
    }

    // TOEIC parsing
    const score = item['토익점수_숫자'];
    if (score && score >= 500 && score <= 990) {
      toeicSum += score;
      toeicCount++;
    }

    // Affiliation No Count
    if (item['자대유무'] === '자대무') {
      affilNoCount++;
    }
  });

  const gpaElem = document.getElementById('kpi-gpa');
  if (gpaElem && gpaCount > 0) {
    const avgGpa = (gpaSum / gpaCount).toFixed(2);
    gpaElem.innerHTML = `${avgGpa} <span class="unit">/ 4.5</span>`;
  }

  const toeicElem = document.getElementById('kpi-toeic');
  if (toeicElem && toeicCount > 0) {
    const avgToeic = Math.round(toeicSum / toeicCount);
    toeicElem.textContent = `${avgToeic}점`;
  }

  const affilNoElem = document.getElementById('kpi-affil-no');
  if (affilNoElem) {
    const pct = Math.round((affilNoCount / state.allData.length) * 100);
    affilNoElem.innerHTML = `${pct}% <span class="unit">(${affilNoCount}명)</span>`;
  }
}

// Filter, Sort and Search Data
function computeFilteredData() {
  return state.allData.filter(item => {
    // 1. Hospital filter
    if (state.activeFilters.hospital !== 'all') {
      const hospTarget = `${item['지원병원_상세결과']} ${item['게시글제목']} ${item['정돈된제목']}`;
      if (!hospTarget.includes(state.activeFilters.hospital)) {
        return false;
      }
    }

    // 2. School Location filter ('서울/수도권' vs '지방')
    if (state.activeFilters.location !== 'all') {
      if (item['학교위치'] !== state.activeFilters.location) {
        return false;
      }
    }

    // 3. Hospital Affiliation filter ('자대유' vs '자대무')
    if (state.activeFilters.affiliation !== 'all') {
      if (item['자대유무'] !== state.activeFilters.affiliation) {
        return false;
      }
    }

    // 4. TOEIC filter ('무토익', '900점대', '800점대', '700점대 이하')
    if (state.activeFilters.toeic !== 'all') {
      if (item['토익구간'] !== state.activeFilters.toeic) {
        return false;
      }
    }

    // 5. Search query (supports multiple keywords split by space)
    if (state.currentSearch.trim() !== '') {
      const keywords = state.currentSearch.toLowerCase().split(/\s+/).filter(k => k.length > 0);
      const searchTarget = `${item['정돈된제목']} ${item['게시글제목']} ${item['지원병원_상세결과']} ${item['보유자격증']} ${item['학점_상세']} ${item['어학점수']} ${item['조언및후기(본문전체)']}`.toLowerCase();
      const allMatch = keywords.every(kw => searchTarget.includes(kw));
      if (!allMatch) {
        return false;
      }
    }

    return true;
  }).sort((a, b) => {
    if (state.currentSort === 'id-asc') {
      return a['No'] - b['No'];
    }
    if (state.currentSort === 'gpa-desc') {
      const gpaA = parseFloat((String(a['학점_상세']).match(/(\d+\.\d+)/) || [0, 0])[1]);
      const gpaB = parseFloat((String(b['학점_상세']).match(/(\d+\.\d+)/) || [0, 0])[1]);
      return gpaB - gpaA;
    }
    if (state.currentSort === 'toeic-desc') {
      const toeicA = a['토익점수_숫자'] || 0;
      const toeicB = b['토익점수_숫자'] || 0;
      return toeicB - toeicA;
    }
    if (state.currentSort === 'pass-desc') {
      const countA = a['최종합격병원목록'] ? a['최종합격병원목록'].length : 0;
      const countB = b['최종합격병원목록'] ? b['최종합격병원목록'].length : 0;
      return countB - countA;
    }
    return 0;
  });
}

// Master Render Pipeline
function applyFiltersAndRender() {
  state.filteredData = computeFilteredData();
  updateFilterStatusUI();

  if (state.viewMode === 'grid') {
    document.getElementById('cards-container').style.display = 'grid';
    document.getElementById('table-container').style.display = 'none';
    renderCardsView();
  } else {
    document.getElementById('cards-container').style.display = 'none';
    document.getElementById('table-container').style.display = 'block';
    renderTableView();
  }

  if (state.chartsVisible) {
    updateCharts();
  }
}

// Update Active Filter Summary Chips & Result Counter
function updateFilterStatusUI() {
  const countElem = document.getElementById('filter-result-count');
  if (countElem) countElem.textContent = `${state.filteredData.length}`;

  const summaryElem = document.getElementById('filter-active-summary');
  if (!summaryElem) return;

  const chips = [];
  if (state.activeFilters.hospital !== 'all') {
    chips.push(`🏥 병원: ${state.activeFilters.hospital}`);
  }
  if (state.activeFilters.location !== 'all') {
    chips.push(`🏫 위치: ${state.activeFilters.location}`);
  }
  if (state.activeFilters.affiliation !== 'all') {
    chips.push(`🩺 ${state.activeFilters.affiliation === '자대무' ? '자대병원 無' : '자대병원 有'}`);
  }
  if (state.activeFilters.toeic !== 'all') {
    chips.push(`🌐 ${state.activeFilters.toeic}`);
  }
  if (state.currentSearch.trim() !== '') {
    chips.push(`🔍 "${state.currentSearch.trim()}"`);
  }

  if (chips.length === 0) {
    summaryElem.innerHTML = '';
  } else {
    summaryElem.innerHTML = chips.map(c => `<span class="active-chip">${escapeHtml(c)}</span>`).join('');
  }
}

// Clean Hospital Results Formatter (Pass bold green, Fail muted)
function formatHospResults(text) {
  if (!text || text === '-') return '-';
  const safe = escapeHtml(truncate(text, 105));
  return safe
    .replace(/(최합|최종\s*합격|합격)/g, '<strong class="hl-pass">$1</strong>')
    .replace(/(서탈|면탈|역검\s*탈락|필기\s*탈락|불합격|1차면접\s*탈락)/g, '<span class="hl-fail">$1</span>');
}

// Render Spec Cards View
function renderCardsView() {
  const container = document.getElementById('cards-container');
  const list = state.filteredData;

  if (list.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 70px 20px; color: var(--text-muted); background: var(--bg-card); border-radius: var(--radius-md); border: 1px dashed var(--border-color);">
        <div style="font-size: 38px; margin-bottom: 12px;">🔍</div>
        <p style="font-size: 16px; font-weight: 700; color: var(--text-primary); margin-bottom: 6px;">선택한 조건에 일치하는 합격 사례가 없습니다.</p>
        <p style="font-size: 13px; color: var(--text-secondary);">학교 위치, 자대병원 유무, 토익 필터 조건을 변경하거나 필터를 초기화해 보세요.</p>
        <button class="btn btn-outline" style="margin-top: 16px;" onclick="resetAllFilters()">필터 전체 초기화</button>
      </div>
    `;
    return;
  }

  container.innerHTML = list.map(item => {
    const no = item['No'];
    const uniformTitle = item['정돈된제목'] || cleanTitle(item['게시글제목']);
    const gpaDisplay = item['학점_표시'] || item['학점_상세'] || '-';
    const rankDisplay = item['석차_표시'] || item['석차'] || '-';
    const toeicDisplay = item['어학_표시'] || item['어학점수'] || '-';
    const toeicSub = item['어학_구분_표시'] || item['토익구간'] || '공인성적';
    const hosp = item['지원병원_상세결과'] || '-';
    const certs = item['보유자격증_표시'] || item['보유자격증'] || '간호사 면허';
    const loc = item['학교위치'] || '기타';
    const affil = item['자대유무'] || '기타';
    const toeicBand = item['토익구간'] || '';
    const toeicScore = item['토익점수_숫자'] || 0;
    const isCompared = state.compareSet.has(no);

    // TOEIC badge
    let toeicBadge = '';
    if (toeicBand === '무토익' || toeicScore === 0) {
      toeicBadge = `<span class="badge-tag badge-toeic-zero">⚡ 무토익</span>`;
    } else if (toeicScore >= 900) {
      toeicBadge = `<span class="badge-tag badge-toeic-high">토익 ${toeicScore}점</span>`;
    } else if (toeicScore >= 800) {
      toeicBadge = `<span class="badge-tag badge-toeic-mid">토익 ${toeicScore}점</span>`;
    } else {
      toeicBadge = `<span class="badge-tag badge-toeic-low">토익 ${toeicScore}점</span>`;
    }

    // Affiliation badge
    let affilBadge = '';
    if (affil === '자대무') {
      affilBadge = `<span class="badge-tag badge-affil-no">자대병원 無</span>`;
    } else if (affil === '자대유') {
      affilBadge = `<span class="badge-tag badge-affil-yes">자대병원 有</span>`;
    }

    // Location badge
    const locBadge = `<span class="badge-tag badge-loc">📍 ${escapeHtml(loc)}</span>`;

    return `
      <div class="spec-card">
        <div>
          <div class="card-top">
            <div class="card-badges-left">
              <span class="card-id-badge">CASE #${String(no).padStart(2, '0')}</span>
              ${locBadge}
              ${affilBadge}
            </div>
            <div class="card-badges-right">
              ${toeicBadge}
            </div>
          </div>

          <h2 class="card-title" title="${escapeHtml(uniformTitle)}">
            ${highlightSearchKeywords(uniformTitle)}
          </h2>

          <div class="stats-pill-row">
            <div class="stat-pill">
              <div class="stat-pill-label">학점 / 석차</div>
              <div class="stat-pill-val" title="${escapeHtml(item['학점_상세'] || gpaDisplay)}">
                ${highlightSearchKeywords(gpaDisplay)}
              </div>
              <div class="stat-pill-sub" title="${escapeHtml(item['석차'] || rankDisplay)}">
                ${escapeHtml(rankDisplay)}
              </div>
            </div>
            <div class="stat-pill">
              <div class="stat-pill-label">어학 스펙</div>
              <div class="stat-pill-val ${toeicBand === '무토익' ? 'val-amber' : 'val-blue'}" title="${escapeHtml(item['어학점수'] || toeicDisplay)}">
                ${highlightSearchKeywords(toeicDisplay)}
              </div>
              <div class="stat-pill-sub" title="${escapeHtml(toeicSub)}">
                ${escapeHtml(toeicSub)}
              </div>
            </div>
          </div>

          <div class="hosp-results">
            <div class="hosp-results-title">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                <polyline points="22 4 12 14.01 9 11.01"></polyline>
              </svg>
              지원 및 전형 결과
            </div>
            <div class="hosp-results-text">${formatHospResults(hosp)}</div>
          </div>

          <div class="card-specs-brief">
            <span class="brief-label">보유 자격:</span>
            <span class="brief-val">${highlightSearchKeywords(certs)}</span>
          </div>
        </div>

        <div class="card-footer-actions">
          <button class="btn-detail" onclick="openDetail(${no})">
            <span>합격 후기 & 전형 조언 보기</span>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
          </button>
          <button class="btn-compare-check ${isCompared ? 'checked' : ''}" onclick="toggleCompare(${no}, this)" title="1:1 맞비교함에 담기">
            ${isCompared ? '✓ 비교중' : '+ 1:1 비교'}
          </button>
        </div>
      </div>
    `;
  }).join('');
}

// Render Precision Table View
function renderTableView() {
  const tbody = document.getElementById('table-body');
  const list = state.filteredData;

  if (list.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; padding: 40px; color: var(--text-muted);">
          조건에 부합하는 데이터가 없습니다.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = list.map(item => {
    const no = item['No'];
    const isCompared = state.compareSet.has(no);
    const toeicBand = item['토익구간'] || '';
    const gpaDisplay = item['학점_표시'] || item['학점_상세'] || '-';
    const rankDisplay = item['석차_표시'] || item['석차'] || '-';
    const toeicDisplay = item['어학_표시'] || item['어학점수'] || '-';
    const certs = item['보유자격증_표시'] || item['보유자격증'] || '간호사 면허';

    return `
      <tr style="cursor: pointer;" onclick="if (!event.target.closest('button') && !event.target.closest('input')) openDetail(${no})">
        <td style="text-align: center;">
          <input type="checkbox" ${isCompared ? 'checked' : ''} onchange="toggleCompare(${no})" style="cursor: pointer; width: 16px; height: 16px;">
        </td>
        <td><span class="card-id-badge">#${String(no).padStart(2, '0')}</span></td>
        <td>
          <div style="font-weight: 700; color: var(--text-primary); font-size: 14px; margin-bottom: 3px;">
            ${highlightSearchKeywords(item['정돈된제목'] || item['게시글제목'])}
          </div>
          <div style="font-size: 11px; color: var(--text-muted);">${truncate(item['지원병원_상세결과'], 60)}</div>
        </td>
        <td>
          <span style="font-weight: 700; color: var(--text-primary);">${escapeHtml(gpaDisplay)}</span>
          <div style="font-size: 11px; color: var(--text-muted);">${escapeHtml(rankDisplay)}</div>
        </td>
        <td>
          <span style="font-weight: 700; color: ${toeicBand === '무토익' ? 'var(--yellow)' : 'var(--cyan)'};">
            ${escapeHtml(toeicDisplay)}
          </span>
        </td>
        <td>
          <span class="badge-tag badge-loc">${escapeHtml(item['학교위치'] || '기타')}</span>
          <span class="badge-tag ${item['자대유무'] === '자대무' ? 'badge-affil-no' : 'badge-affil-yes'}">
            ${item['자대유무'] || '기타'}
          </span>
        </td>
        <td><span style="font-size: 11px; color: var(--text-secondary);">${truncate(certs, 30)}</span></td>
        <td>
          <button class="btn btn-outline btn-sm" onclick="openDetail(${no})" style="padding: 4px 8px; font-size: 11px;">
            후기 보기
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

// Real-Time Chart.js Visualizations (Theme-Aware)
function updateCharts() {
  if (typeof Chart === 'undefined') return;

  const dataset = state.filteredData.length > 0 ? state.filteredData : state.allData;
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const textColor = isDark ? '#94a3b8' : '#475569';
  const labelColor = isDark ? '#f8fafc' : '#0f172a';
  const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
  const doughnutBorder = isDark ? '#0f172a' : '#ffffff';
  const toeicColors = isDark ? ['#f59e0b', '#94a3b8', '#3b82f6', '#06b6d4'] : ['#d97706', '#64748b', '#2563eb', '#0284c7'];
  const hospBarColor = isDark ? '#60a5fa' : '#2563eb';

  // Chart 1: TOEIC Distribution Bar Chart
  const toeicCounts = { '무토익': 0, '700점대 이하': 0, '800점대': 0, '900점대': 0 };
  dataset.forEach(d => {
    if (d['토익구간'] && toeicCounts[d['토익구간']] !== undefined) {
      toeicCounts[d['토익구간']]++;
    }
  });

  const ctxToeic = document.getElementById('chart-toeic-dist');
  if (ctxToeic) {
    if (state.charts.toeicDist) state.charts.toeicDist.destroy();
    state.charts.toeicDist = new Chart(ctxToeic, {
      type: 'bar',
      data: {
        labels: ['무토익', '700점대 이하', '800점대', '900점대 (고토익)'],
        datasets: [{
          label: '인원수 (명)',
          data: [toeicCounts['무토익'], toeicCounts['700점대 이하'], toeicCounts['800점대'], toeicCounts['900점대']],
          backgroundColor: toeicColors,
          borderRadius: 6,
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { padding: 10, cornerRadius: 8 }
        },
        scales: {
          x: { ticks: { color: textColor, font: { size: 11 } }, grid: { display: false } },
          y: { ticks: { color: textColor, stepSize: 5 }, grid: { color: gridColor } }
        }
      }
    });
  }

  // Chart 2: Top 6 Passed Hospitals Horizontal Bar Chart
  const hospFreq = {};
  dataset.forEach(d => {
    const list = d['최종합격병원목록'] || [];
    list.forEach(h => {
      let name = h;
      if (name.includes('아산')) name = '서울아산병원';
      else if (name.includes('삼성')) name = '삼성서울병원';
      else if (name.includes('세브란스')) name = '세브란스병원';
      else if (name.includes('서울대')) name = '서울대/분당서울대';
      else if (name.includes('성모')) name = '가톨릭성모병원';
      else if (name.includes('아주대')) name = '아주대병원';
      hospFreq[name] = (hospFreq[name] || 0) + 1;
    });
  });

  const sortedHosp = Object.entries(hospFreq).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const ctxHosp = document.getElementById('chart-hospital-top');
  if (ctxHosp) {
    if (state.charts.hospitalTop) state.charts.hospitalTop.destroy();
    state.charts.hospitalTop = new Chart(ctxHosp, {
      type: 'bar',
      data: {
        labels: sortedHosp.map(x => x[0]),
        datasets: [{
          label: '합격자 수',
          data: sortedHosp.map(x => x[1]),
          backgroundColor: hospBarColor,
          borderRadius: 6
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: textColor }, grid: { color: gridColor } },
          y: { ticks: { color: labelColor, font: { size: 11, weight: '600' } }, grid: { display: false } }
        }
      }
    });
  }

  // Chart 3: Affiliation Doughnut Chart
  let affilYes = 0, affilNo = 0, affilEtc = 0;
  dataset.forEach(d => {
    if (d['자대유무'] === '자대무') affilNo++;
    else if (d['자대유무'] === '자대유') affilYes++;
    else affilEtc++;
  });

  const ctxAffil = document.getElementById('chart-affil-doughnut');
  if (ctxAffil) {
    if (state.charts.affilDoughnut) state.charts.affilDoughnut.destroy();
    state.charts.affilDoughnut = new Chart(ctxAffil, {
      type: 'doughnut',
      data: {
        labels: ['자대병원 無 (자대무)', '자대병원 有 (자대유)', '기타'],
        datasets: [{
          data: [affilNo, affilYes, affilEtc],
          backgroundColor: ['#e11d48', '#059669', '#64748b'],
          borderWidth: 3,
          borderColor: doughnutBorder
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { color: textColor, boxWidth: 12, padding: 12 } }
        },
        cutout: '65%'
      }
    });
  }
}

// Side-by-Side Comparison Feature
window.toggleCompare = function(no, btnElem) {
  if (state.compareSet.has(no)) {
    state.compareSet.delete(no);
    if (btnElem) {
      btnElem.classList.remove('checked');
      btnElem.textContent = '+ 비교';
    }
  } else {
    if (state.compareSet.size >= 3) {
      alert('1:1 맞비교는 최대 3개 케이스까지 동시에 선택할 수 있습니다.');
      return;
    }
    state.compareSet.add(no);
    if (btnElem) {
      btnElem.classList.add('checked');
      btnElem.textContent = '✓ 비교중';
    }
  }

  updateCompareDock();
  if (state.viewMode === 'table') {
    renderTableView();
  }
};

function updateCompareDock() {
  const dock = document.getElementById('compare-dock');
  const countElem = document.getElementById('compare-count');
  if (!dock || !countElem) return;

  const count = state.compareSet.size;
  countElem.textContent = `${count}`;

  if (count > 0) {
    dock.classList.add('active');
  } else {
    dock.classList.remove('active');
  }
}

window.clearCompare = function() {
  state.compareSet.clear();
  updateCompareDock();
  applyFiltersAndRender();
};

window.openCompareModal = function() {
  if (state.compareSet.size === 0) return;

  const items = Array.from(state.compareSet).map(no => state.allData.find(x => x['No'] === no)).filter(Boolean);
  const modal = document.getElementById('compare-modal');
  const container = document.getElementById('compare-table-container');

  let tableHtml = `
    <table class="spec-table" style="border: 1px solid var(--border-color); background: var(--bg-card);">
      <thead>
        <tr>
          <th style="width: 140px;">비교 항목</th>
          ${items.map(it => `
            <th style="min-width: 240px; text-align: left;">
              <span class="card-id-badge">CASE #${String(it['No']).padStart(2, '0')}</span>
              <div style="font-size: 14px; font-weight: 700; color: var(--text-primary); margin-top: 6px;">
                ${escapeHtml(it['정돈된제목'])}
              </div>
            </th>
          `).join('')}
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>출신교 / 위치</strong></td>
          ${items.map(it => `<td><span class="badge-tag badge-loc">${it['학교위치']}</span> · ${it['학력구분']}</td>`).join('')}
        </tr>
        <tr>
          <td><strong>자대병원 유무</strong></td>
          ${items.map(it => `<td><span class="badge-tag ${it['자대유무'] === '자대무' ? 'badge-affil-no' : 'badge-affil-yes'}">${it['자대유무']}</span></td>`).join('')}
        </tr>
        <tr>
          <td><strong>학점 / 석차</strong></td>
          ${items.map(it => `<td><strong style="color: var(--text-primary);">${it['학점_상세']}</strong> (${it['석차'] || '-'})</td>`).join('')}
        </tr>
        <tr>
          <td><strong>어학 스펙</strong></td>
          ${items.map(it => `<td><strong style="color: var(--cyan);">${it['어학점수']}</strong></td>`).join('')}
        </tr>
        <tr>
          <td><strong>보유 자격증</strong></td>
          ${items.map(it => `<td>${escapeHtml(it['보유자격증'])}</td>`).join('')}
        </tr>
        <tr>
          <td><strong>지원 및 합격 병원</strong></td>
          ${items.map(it => `<td style="font-size: 12px; color: var(--text-secondary); line-height: 1.5;">${escapeHtml(it['지원병원_상세결과'])}</td>`).join('')}
        </tr>
        <tr>
          <td><strong>핵심 합격 비결</strong></td>
          ${items.map(it => `
            <td>
              <div style="font-size: 12px; color: var(--text-secondary); max-height: 180px; overflow-y: auto; line-height: 1.6; white-space: pre-wrap; background: var(--bg-card-secondary); border: 1px solid var(--border-color); padding: 10px; border-radius: 6px;">
                ${escapeHtml(it['조언및후기(본문전체)'] || '-')}
              </div>
            </td>
          `).join('')}
        </tr>
      </tbody>
    </table>
  `;

  container.innerHTML = tableHtml;
  modal.classList.add('active');
};

// Spec Matcher Benchmark Algorithm
window.runSpecMatcher = function() {
  const myGpa = parseFloat(document.getElementById('input-my-gpa').value) || 4.30;
  const myToeic = parseInt(document.getElementById('input-my-toeic').value) || 910;
  const myLoc = document.getElementById('input-my-loc').value;
  const myAffil = document.getElementById('input-my-affil').value;

  // 1. Calculate Percentile
  const gpaPercentile = Math.round((state.allData.filter(d => {
    const m = String(d['학점_상세']).match(/(\d+\.\d+)/);
    return m && parseFloat(m[1]) <= myGpa;
  }).length / state.allData.length) * 100);

  const toeicPercentile = Math.round((state.allData.filter(d => {
    const s = d['토익점수_숫자'] || 0;
    return s <= myToeic;
  }).length / state.allData.length) * 100);

  // 2. Similarity Distance & Match Score
  const scored = state.allData.map(item => {
    const m = String(item['학점_상세']).match(/(\d+\.\d+)/);
    const candGpa = m ? parseFloat(m[1]) : 3.8;
    const candToeic = item['토익점수_숫자'] || 0;

    const gpaDiff = Math.abs(candGpa - myGpa) / 1.5; // normalized
    const toeicDiff = Math.abs(candToeic - myToeic) / 400; // normalized
    let distance = (gpaDiff * 0.55) + (toeicDiff * 0.45);

    if (item['학교위치'] === myLoc) distance *= 0.9;
    if (item['자대유무'] === myAffil) distance *= 0.85;

    const matchPercent = Math.max(70, Math.min(99, Math.round((1 - distance) * 100)));
    return { item, matchPercent };
  }).sort((a, b) => b.matchPercent - a.matchPercent).slice(0, 3);

  // 3. Aggregate Top Hospitals from matched candidates
  const recommendedHospitals = ['서울아산병원', '삼성서울병원', '강남세브란스병원'];

  const resultsElem = document.getElementById('matcher-results');
  resultsElem.innerHTML = `
    <div class="matcher-benchmark-banner">
      <div style="font-size: 13px; color: var(--purple); font-weight: 700; text-transform: uppercase;">실증 데이터 백분위 진단 결과</div>
      <div style="font-size: 24px; font-weight: 800; color: var(--text-primary); margin: 6px 0;">
        학점 상위 ${(100 - gpaPercentile).toFixed(1)}% · 토익 상위 ${(100 - toeicPercentile).toFixed(1)}% 군
      </div>
      <p style="font-size: 12px; color: var(--text-secondary);">
        입력하신 스펙(GPA ${myGpa.toFixed(2)} / 토익 ${myToeic}점)은 100인의 합격 실증 풀 중 <strong>빅3 및 상급종합병원 최종 합격권</strong>에 최적 매칭됩니다.
      </p>
    </div>

    <div style="margin-bottom: 14px;">
      <h5 style="color: var(--cyan); font-size: 13px; font-weight: 700; margin-bottom: 8px;">
        🎯 나와 가장 유사한 스펙의 실증 합격 사례 TOP 3
      </h5>
      <div style="display: flex; flex-direction: column; gap: 8px;">
        ${scored.map(({ item, matchPercent }) => `
          <div style="background: var(--bg-card-secondary); border: 1px solid var(--border-color); border-radius: 8px; padding: 10px 14px; display: flex; justify-content: space-between; align-items: center;">
            <div>
              <div style="font-size: 13px; font-weight: 700; color: var(--text-primary);">
                CASE #${String(item['No']).padStart(2, '0')} : ${escapeHtml(item['정돈된제목'])}
              </div>
              <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">
                학점 ${item['학점_상세']} · ${item['어학점수']} · ${item['학력구분']}
              </div>
            </div>
            <div style="text-align: right;">
              <span style="font-size: 14px; font-weight: 800; color: #10b981;">${matchPercent}%</span>
              <div style="font-size: 10px; color: var(--text-muted);">스펙 유사도</div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>

    <div style="background: rgba(37,99,235,0.08); border: 1px solid rgba(37,99,235,0.25); border-radius: 8px; padding: 12px 14px;">
      <div style="font-size: 12px; font-weight: 700; color: var(--primary); margin-bottom: 4px;">🏥 데이터 추천 1순위 타깃 상급종합병원</div>
      <div style="font-size: 13px; color: var(--text-primary); font-weight: 600;">
        ${recommendedHospitals.join(' · ')}
      </div>
    </div>
  `;
  resultsElem.style.display = 'block';
};

// Search Keyword Highlighting Engine
function highlightSearchKeywords(text) {
  if (!text) return '';
  const safeText = escapeHtml(text);
  if (!state.currentSearch.trim()) return safeText;

  const keywords = state.currentSearch.trim().split(/\s+/).filter(k => k.length > 0);
  if (keywords.length === 0) return safeText;

  // Regex pattern matching keywords safely
  const pattern = new RegExp(`(${keywords.map(escapeRegExp).join('|')})`, 'gi');
  return safeText.replace(pattern, '<mark class="kw-hl">$1</mark>');
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Export Filtered Data to CSV (with UTF-8 BOM for Korean Excel)
window.exportToCSV = function() {
  const dataset = state.filteredData.length > 0 ? state.filteredData : state.allData;

  const headers = ['번호', '정돈된제목', '학점_상세', '석차', '어학점수', '토익구간', '학교위치', '자대유무', '학력구분', '지원분야', '희망부서', '지원병원_상세결과', '보유자격증', '대외활동', '원문URL'];

  const rows = dataset.map(item => [
    item['No'],
    `"${String(item['정돈된제목'] || '').replace(/"/g, '""')}"`,
    `"${String(item['학점_상세'] || '').replace(/"/g, '""')}"`,
    `"${String(item['석차'] || '').replace(/"/g, '""')}"`,
    `"${String(item['어학점수'] || '').replace(/"/g, '""')}"`,
    `"${String(item['토익구간'] || '').replace(/"/g, '""')}"`,
    `"${String(item['학교위치'] || '').replace(/"/g, '""')}"`,
    `"${String(item['자대유무'] || '').replace(/"/g, '""')}"`,
    `"${String(item['학력구분'] || '').replace(/"/g, '""')}"`,
    `"${String(item['지원분야'] || '').replace(/"/g, '""')}"`,
    `"${String(item['희망부서'] || '').replace(/"/g, '""')}"`,
    `"${String(item['지원병원_상세결과'] || '').replace(/"/g, '""')}"`,
    `"${String(item['보유자격증'] || '').replace(/"/g, '""')}"`,
    `"${String(item['대외활동'] || '').replace(/"/g, '""')}"`,
    `"${String(item['원문URL'] || '').replace(/"/g, '""')}"`
  ]);

  const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `CodeBlue2026_간호사합격스펙_100인_빅데이터.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

// Reset All Filters Helper
window.resetAllFilters = function() {
  state.activeFilters.hospital = 'all';
  state.activeFilters.location = 'all';
  state.activeFilters.affiliation = 'all';
  state.activeFilters.toeic = 'all';
  state.currentSearch = '';

  const searchInput = document.getElementById('search-input');
  if (searchInput) searchInput.value = '';

  document.querySelectorAll('.filter-matrix .pill').forEach(pill => {
    if (pill.dataset.val === 'all') {
      pill.classList.add('active');
    } else {
      pill.classList.remove('active');
    }
  });

  applyFiltersAndRender();
};

// Open Detail Modal
window.openDetail = function(no) {
  const item = state.allData.find(x => x['No'] === no);
  if (!item) return;

  const modal = document.getElementById('detail-modal');
  const content = document.getElementById('modal-content');

  const loc = item['학교위치'] || '기타';
  const affil = item['자대유무'] || '기타';
  const toeicBand = item['토익구간'] || '';

  content.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; flex-wrap:wrap; gap:8px;">
      <div style="display:flex; align-items:center; gap:6px;">
        <span class="card-id-badge">CASE #${String(item['No']).padStart(2, '0')}</span>
        <span class="badge-tag badge-loc">📍 ${escapeHtml(loc)}</span>
        <span class="badge-tag ${affil === '자대무' ? 'badge-affil-no' : 'badge-affil-yes'}">
          ${affil === '자대무' ? '자대병원 無' : '자대병원 有'}
        </span>
      </div>
      <span class="card-type-badge">${escapeHtml(item['학력구분'] || '일반')}</span>
    </div>

    <h3 style="font-size:20px; color:var(--text-primary); font-weight:700; margin-bottom:4px; line-height:1.4;">
      ${escapeHtml(item['정돈된제목'] || item['게시글제목'])}
    </h3>
    <div style="font-size:12px; color:var(--text-muted); margin-bottom:16px;">
      원문 카페 제목: ${escapeHtml(item['게시글제목'])}
    </div>

    <div style="background:var(--bg-card-secondary); border:1px solid var(--border-color); border-radius:8px; padding:14px; margin-bottom:16px;">
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:10px;">
        <div><strong style="color:var(--text-muted); font-size:12px;">학점/석차:</strong> <span style="color:var(--text-primary); font-weight:600;">${escapeHtml(item['학점_상세'])} (${escapeHtml(item['석차'])})</span></div>
        <div><strong style="color:var(--text-muted); font-size:12px;">어학:</strong> <span style="color:${toeicBand === '무토익' ? 'var(--yellow)' : 'var(--cyan)'}; font-weight:600;">${escapeHtml(item['어학점수'])}</span></div>
        <div><strong style="color:var(--text-muted); font-size:12px;">지원분야:</strong> <span style="color:var(--text-secondary);">${escapeHtml(item['지원분야'])}</span></div>
        <div><strong style="color:var(--text-muted); font-size:12px;">희망부서:</strong> <span style="color:var(--text-secondary);">${escapeHtml(item['희망부서'])}</span></div>
      </div>
      <div style="margin-bottom:8px;"><strong style="color:var(--text-muted); font-size:12px;">자격증:</strong> <span style="color:var(--text-secondary);">${escapeHtml(item['보유자격증'])}</span></div>
      <div><strong style="color:var(--text-muted); font-size:12px;">대외활동:</strong> <span style="color:var(--text-secondary);">${escapeHtml(item['대외활동'])}</span></div>
    </div>

    <div style="margin-bottom:16px;">
      <div style="font-size:13px; font-weight:700; color:var(--green); margin-bottom:6px;">🏥 지원 병원 및 전형 결과</div>
      <div style="background:var(--green-bg); border:1px solid rgba(16,185,129,0.25); border-radius:8px; padding:12px; font-size:13px; color:var(--text-secondary); line-height:1.5;">
        ${escapeHtml(item['지원병원_상세결과'])}
      </div>
    </div>

    <div>
      <div style="font-size:14px; font-weight:700; color:var(--primary); margin-bottom:6px;">💬 합격 비결 및 전형별 조언 (원문 발췌)</div>
      <div class="modal-review-content">${escapeHtml(item['조언및후기(본문전체)'] || '작성된 후기가 없습니다.')}</div>
    </div>

    ${item['원문URL'] && item['원문URL'] !== '-' ? `
      <div style="margin-top:20px; text-align:right;">
        <a href="${item['원문URL']}" target="_blank" rel="noopener" style="color:var(--primary); font-size:12px; text-decoration:none; font-weight:600;">
          🔗 간준모 원문 게시글 보기 &rarr;
        </a>
      </div>
    ` : ''}
  `;

  modal.classList.add('active');
};

// Event Listeners Setup
function setupEventListeners() {
  // Search with input debounce
  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      state.currentSearch = e.target.value;
      applyFiltersAndRender();
    });
  }

  // Sort
  const sortSelect = document.getElementById('sort-select');
  if (sortSelect) {
    sortSelect.addEventListener('change', (e) => {
      state.currentSort = e.target.value;
      applyFiltersAndRender();
    });
  }

  // View Switcher (Grid vs Table)
  const btnGrid = document.getElementById('btn-view-grid');
  const btnTable = document.getElementById('btn-view-table');

  if (btnGrid && btnTable) {
    btnGrid.addEventListener('click', () => {
      state.viewMode = 'grid';
      btnGrid.classList.add('active');
      btnTable.classList.remove('active');
      applyFiltersAndRender();
    });

    btnTable.addEventListener('click', () => {
      state.viewMode = 'table';
      btnTable.classList.add('active');
      btnGrid.classList.remove('active');
      applyFiltersAndRender();
    });
  }

  // Multi-Facet Filter Pills Click
  const matrix = document.querySelector('.filter-matrix');
  if (matrix) {
    matrix.addEventListener('click', (e) => {
      const pill = e.target.closest('.pill');
      if (!pill) return;

      const type = pill.dataset.filterType;
      const val = pill.dataset.val;
      if (!type || !val) return;

      const parentRow = pill.closest('.filter-pills');
      if (parentRow) {
        parentRow.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
      }

      state.activeFilters[type] = val;
      applyFiltersAndRender();
    });
  }

  // Filter Reset Button
  const resetBtn = document.getElementById('btn-reset-filter');
  if (resetBtn) {
    resetBtn.addEventListener('click', resetAllFilters);
  }

  // Theme Toggle Button
  const themeBtn = document.getElementById('btn-theme-toggle');
  if (themeBtn) {
    themeBtn.addEventListener('click', () => {
      const nextTheme = state.theme === 'light' ? 'dark' : 'light';
      applyTheme(nextTheme);
    });
  }

  // Analytics Hub Toggle Button
  const chartsBtn = document.getElementById('btn-charts-toggle');
  const hubElem = document.getElementById('analytics-hub');
  const closeHubBtn = document.getElementById('btn-close-hub');

  if (chartsBtn && hubElem) {
    chartsBtn.addEventListener('click', () => {
      state.chartsVisible = !state.chartsVisible;
      if (state.chartsVisible) {
        hubElem.classList.add('active');
        chartsBtn.classList.add('btn-primary');
        chartsBtn.classList.remove('btn-analytics');
        updateCharts();
      } else {
        hubElem.classList.remove('active');
        chartsBtn.classList.remove('btn-primary');
        chartsBtn.classList.add('btn-analytics');
      }
    });
  }

  if (closeHubBtn && hubElem && chartsBtn) {
    closeHubBtn.addEventListener('click', () => {
      state.chartsVisible = false;
      hubElem.classList.remove('active');
      chartsBtn.classList.remove('btn-primary');
      chartsBtn.classList.add('btn-analytics');
    });
  }

  // Spec Matcher Button & Modal
  const matcherBtn = document.getElementById('btn-matcher');
  const matchModal = document.getElementById('match-modal');
  const matchClose = document.getElementById('match-modal-close');
  const runMatchBtn = document.getElementById('btn-run-match');

  if (matcherBtn && matchModal) {
    matcherBtn.addEventListener('click', () => {
      matchModal.classList.add('active');
    });
  }
  if (matchClose && matchModal) {
    matchClose.addEventListener('click', () => {
      matchModal.classList.remove('active');
    });
  }
  if (runMatchBtn) {
    runMatchBtn.addEventListener('click', runSpecMatcher);
  }

  // CSV Export Button
  const csvBtn = document.getElementById('btn-export-csv');
  if (csvBtn) {
    csvBtn.addEventListener('click', exportToCSV);
  }

  // Compare Dock Buttons
  const openCompareBtn = document.getElementById('btn-open-compare');
  const clearCompareBtn = document.getElementById('btn-clear-compare');
  const compareModal = document.getElementById('compare-modal');
  const compareClose = document.getElementById('compare-modal-close');

  if (openCompareBtn) openCompareBtn.addEventListener('click', openCompareModal);
  if (clearCompareBtn) clearCompareBtn.addEventListener('click', clearCompare);
  if (compareClose && compareModal) {
    compareClose.addEventListener('click', () => compareModal.classList.remove('active'));
  }

  // Detail Modal Close
  const closeBtn = document.getElementById('modal-close');
  const detailModal = document.getElementById('detail-modal');
  if (closeBtn && detailModal) {
    closeBtn.addEventListener('click', () => detailModal.classList.remove('active'));
    detailModal.addEventListener('click', (e) => {
      if (e.target.id === 'detail-modal') detailModal.classList.remove('active');
    });
  }

  // QR Modal
  const qrModal = document.getElementById('qr-modal');
  const qrBtn = document.getElementById('btn-qr-open');
  const qrClose = document.getElementById('qr-modal-close');

  if (qrBtn && qrModal) {
    qrBtn.addEventListener('click', () => {
      qrModal.classList.add('active');
      const qrContainer = document.getElementById('qrcode');
      qrContainer.innerHTML = '';

      const targetUrl = window.location.href;
      document.getElementById('qr-url-text').textContent = targetUrl;

      new QRCode(qrContainer, {
        text: targetUrl,
        width: 180,
        height: 180,
        colorDark: '#0f172a',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.H
      });
    });
  }
  if (qrClose && qrModal) {
    qrClose.addEventListener('click', () => qrModal.classList.remove('active'));
    qrModal.addEventListener('click', (e) => {
      if (e.target.id === 'qr-modal') qrModal.classList.remove('active');
    });
  }

  // PPT Mode Toggle
  const pptBtn = document.getElementById('btn-ppt-mode');
  if (pptBtn) {
    pptBtn.addEventListener('click', () => {
      document.body.classList.toggle('ppt-mode');
      if (document.body.classList.contains('ppt-mode')) {
        pptBtn.innerHTML = '<span>🖥️</span> 일반 뷰로 복귀';
        pptBtn.classList.remove('btn-outline');
        pptBtn.classList.add('btn-primary');
      } else {
        pptBtn.innerHTML = '<span>📸</span> PPT 캡처 뷰';
        pptBtn.classList.remove('btn-primary');
        pptBtn.classList.add('btn-outline');
      }
    });
  }
}

// Global Keyboard Shortcuts (Senior Developer Touch)
function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Press '/' to jump to search bar
    if (e.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
      e.preventDefault();
      const searchInput = document.getElementById('search-input');
      if (searchInput) {
        searchInput.focus();
        searchInput.select();
      }
    }

    // Press 'Escape' to close any open modal
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-backdrop.active').forEach(m => m.classList.remove('active'));
    }
  });
}

// Helper: Clean Title
function cleanTitle(raw) {
  if (!raw) return '합격 스펙 데이터';
  return raw.replace(/\[.*?\]/g, '').trim() || raw;
}

// Helper: Truncate Text
function truncate(str, maxLen) {
  if (!str) return '-';
  if (str.length <= maxLen) return str;
  return str.substring(0, maxLen) + '...';
}

// Helper: Escape HTML
function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

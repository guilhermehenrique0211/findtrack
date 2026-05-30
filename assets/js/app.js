// ─────────────────────────────────────────────
// SUPABASE — cliente criado pelo auth.js
// supabaseClient está disponível via window.supabaseClient
// ─────────────────────────────────────────────

// ─────────────────────────────────────────────
// GLOBALS
// ─────────────────────────────────────────────
let currentPage    = 'dashboard';
let allTransacoes  = [];
let editingId      = null;
let charts         = {};
let mesSelecionado = ''; // formato 'YYYY-MM', vazio = todos os meses

// ─────────────────────────────────────────────
// UTILS
// ─────────────────────────────────────────────
const $  = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);
const fmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDate = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR') : '—';

function showToast(msg, type = 'info') {
  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span class="toast-icon">${icons[type]}</span><span>${msg}</span>`;
  $('#toast-container').appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

function setLoading(show) {
  const el = $('#loading-overlay');
  if (!el) return;
  show ? el.classList.add('show') : el.classList.remove('show');
}

// ─────────────────────────────────────────────
// NAVEGAÇÃO
// ─────────────────────────────────────────────
function navigate(page) {
  $$('.page').forEach(p => p.classList.remove('active'));
  $$('.nav-item').forEach(n => n.classList.remove('active'));
  $(`#page-${page}`)?.classList.add('active');
  $(`[data-page="${page}"]`)?.classList.add('active');
  currentPage = page;

  if (page === 'dashboard')  loadDashboard();
  if (page === 'transacoes') loadTransacoes();
  if (page === 'lembretes')  loadLembretes();

  const titles = { dashboard: 'Dashboard', transacoes: 'Transações', lembretes: 'Cobranças & Lembretes' };
  $('#page-title').textContent = titles[page] || page;
}

// ─────────────────────────────────────────────
// DASHBOARD
// ─────────────────────────────────────────────
async function loadDashboard() {
  setLoading(true);
  let rows = [];
  try {
    const { data, error } = await supabaseClient.from('transacoes').select('*');
    if (error) throw error;
    rows = (data || []).filter(r => {
      if (!mesSelecionado) return true;
      return r.data && r.data.startsWith(mesSelecionado);
    });

    let totalEmprestado = 0, totalRecebido = 0, totalDespesas = 0,
        totalReceitas = 0, totalAReceber = 0;

    rows.forEach(r => {
      const v = parseFloat(r.valor_com_juros || r.valor || 0);
      if (r.tipo === 'emprestimo') {
        totalEmprestado += v;                          // todos os empréstimos
        if (r.status === 'pendente') totalAReceber += v; // pendente = a receber
        if (r.status === 'recebido') totalRecebido += v; // recebido = já recebido
      }
      if (r.tipo === 'receita') totalReceitas += parseFloat(r.valor || 0); // sempre soma
      if (r.tipo === 'despesa') totalDespesas += parseFloat(r.valor || 0); // sempre soma
    });

    $('#kpi-emprestado').textContent = fmt.format(totalEmprestado);
    $('#kpi-recebido').textContent   = fmt.format(totalRecebido);
    $('#kpi-despesas').textContent   = fmt.format(totalDespesas);
    $('#kpi-receitas').textContent   = fmt.format(totalReceitas);
    $('#kpi-a-receber').textContent  = fmt.format(totalAReceber);
    $('#kpi-pendentes').textContent  = rows.filter(r => r.tipo === 'emprestimo' && r.status === 'pendente').length;

    renderChartMeses(rows);
    renderChartDist(rows);
    renderTopDevedores(rows);

  } catch (e) {
    console.error(e);
    showToast(e.message, 'error');
  } finally {
    setLoading(false);
  }
  await loadDashLembretes();
}

// ─────────────────────────────────────────────
// GRÁFICOS
// ─────────────────────────────────────────────
function renderChartMeses(rows) {
  const ctx = document.getElementById('chart-meses')?.getContext('2d');
  if (!ctx) return;
  if (charts.meses) charts.meses.destroy();

  const meses = [], emprestado = [], recebido = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    const m = d.getMonth(), y = d.getFullYear();
    meses.push(d.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' }));

    const mesRows = rows.filter(r => {
      if (!r.data) return false;
      const rd = new Date(r.data + 'T00:00:00');
      return rd.getMonth() === m && rd.getFullYear() === y;
    });

    emprestado.push(mesRows
      .filter(r => r.tipo === 'emprestimo')
      .reduce((s, r) => s + parseFloat(r.valor_com_juros || r.valor || 0), 0));

    recebido.push(mesRows
      .filter(r => r.tipo === 'emprestimo' && r.status === 'recebido')
      .reduce((s, r) => s + parseFloat(r.valor_com_juros || r.valor || 0), 0));
  }

  charts.meses = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: meses,
      datasets: [
        { label: 'Emprestado', data: emprestado, backgroundColor: '#ff9800' },
        { label: 'Recebido',   data: recebido,   backgroundColor: '#4caf50' }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom' } },
      scales: { y: { ticks: { callback: v => 'R$ ' + v.toLocaleString('pt-BR') } } }
    }
  });
}

function renderChartDist(rows) {
  // Garante que o canvas existe (pode ter sido removido em chamada anterior)
  const wrapper = document.getElementById('chart-dist-wrapper');
  if (!wrapper) return;
  if (charts.dist) { charts.dist.destroy(); charts.dist = null; }

  // Empréstimos: usa valor_com_juros; demais: valor puro
  const empVal = rows.filter(r => r.tipo === 'emprestimo')
    .reduce((s, r) => s + parseFloat(r.valor_com_juros || r.valor || 0), 0);
  const recVal = rows.filter(r => r.tipo === 'receita')
    .reduce((s, r) => s + parseFloat(r.valor || 0), 0);
  const despVal = rows.filter(r => r.tipo === 'despesa')
    .reduce((s, r) => s + parseFloat(r.valor || 0), 0);

  const valores = [empVal, recVal, despVal];
  const labels  = ['Empréstimos', 'Receitas', 'Despesas'];
  const cores   = ['#ff9800', '#4caf50', '#e91e63'];

  // Filtra fatias com valor 0 para não poluir o gráfico
  const dadosFiltrados = valores.reduce((acc, v, i) => {
    if (v > 0) { acc.labels.push(labels[i]); acc.data.push(v); acc.cores.push(cores[i]); }
    return acc;
  }, { labels: [], data: [], cores: [] });

  if (!dadosFiltrados.data.length) {
    wrapper.innerHTML = '<div class="empty-state" style="padding:40px">Sem dados para exibir</div>';
    return;
  }

  // Recria o canvas se não existir
  let canvas = document.getElementById('chart-dist');
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.id = 'chart-dist';
    wrapper.innerHTML = '';
    wrapper.appendChild(canvas);
  }
  const ctx = canvas.getContext('2d');

  charts.dist = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: dadosFiltrados.labels,
      datasets: [{
        data: dadosFiltrados.data,
        backgroundColor: dadosFiltrados.cores,
        borderWidth: 2,
        borderColor: 'transparent'
      }]
    },
    options: {
      responsive: true,
      cutout: '60%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: '#ccc', font: { size: 13 }, padding: 16 }
        },
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${ctx.label}: ${fmt.format(ctx.raw)}`
          }
        }
      }
    }
  });
}

// ─────────────────────────────────────────────
// TOP DEVEDORES
// ─────────────────────────────────────────────
function renderTopDevedores(rows) {
  const list = $('#top-devedores');
  if (!list) return;

  const agrupado = {};
  rows.filter(r => r.tipo === 'emprestimo' && r.status === 'pendente')
    .forEach(r => {
      const v = parseFloat(r.valor_com_juros || r.valor || 0);
      agrupado[r.nome] = (agrupado[r.nome] || 0) + v;
    });

  const top = Object.entries(agrupado).sort((a, b) => b[1] - a[1]).slice(0, 5);

  if (!top.length) {
    list.innerHTML = `<div class="empty-state">Nenhum devedor pendente</div>`;
    return;
  }

  const maxVal = top[0][1];
  const medalhas = ['🥇', '🥈', '🥉', '4º', '5º'];

  list.innerHTML = top.map(([nome, valor], i) => `
    <div class="debtor-item">
      <div class="debtor-rank">${medalhas[i]}</div>
      <div class="debtor-body">
        <div class="debtor-header">
          <span class="debtor-nome">${nome}</span>
          <span class="debtor-valor">${fmt.format(valor)}</span>
        </div>
        <div class="debtor-bar-bg">
          <div class="debtor-bar-fill" style="width:${Math.round((valor/maxVal)*100)}%"></div>
        </div>
      </div>
    </div>
  `).join('');
}

// ─────────────────────────────────────────────
// DASH LEMBRETES
// ─────────────────────────────────────────────
async function loadDashLembretes() {
  const list = $('#dash-lembretes');
  if (!list) return;

  const hoje = new Date(); hoje.setHours(0,0,0,0);
  const limite = new Date(hoje); limite.setDate(limite.getDate() + 2);

  const { data, error } = await supabaseClient
    .from('transacoes').select('*')
    .eq('status','pendente')
    .eq('tipo','emprestimo')
    .order('data_vencimento', { ascending: true });

  if (error) { console.error(error); return; }

  const limiteStr2 = limite.toISOString().split('T')[0];
  const dashData = (data || []).filter(r => !r.data_vencimento || r.data_vencimento <= limiteStr2);

  if (!dashData.length) {
    list.innerHTML = `<div class="empty-state">✅ Sem vencimentos nos próximos 2 dias</div>`;
    return;
  }

  list.innerHTML = dashData.map(r => {
    const venc = r.data_vencimento ? new Date(r.data_vencimento + 'T00:00:00') : null;
    const diff = venc ? Math.round((venc - hoje) / 86400000) : null;
    const urgente = diff !== null && diff <= 0;
    const aviso = diff === null ? '' : diff < 0 ? `⚠️ Vencido ${Math.abs(diff)}d` : diff === 0 ? '🔴 Hoje!' : `🟡 ${diff}d`;
    return `
      <div class="reminder-item ${urgente ? 'due-today' : 'due-soon'}">
        <div style="flex:1"><strong>${r.nome}</strong>
          <span class="due-label" style="margin-left:8px">${aviso}</span>
        </div>
        <strong style="color:var(--green,#4caf50)">${fmt.format(parseFloat(r.valor_com_juros||r.valor||0))}</strong>
      </div>`;
  }).join('');
}

// ─────────────────────────────────────────────
// COBRANÇAS (página)
// ─────────────────────────────────────────────
async function loadLembretes() {
  setLoading(true);
  try {
    const dias = parseInt($('#lem-dias')?.value || '7');
    const hoje = new Date(); hoje.setHours(0,0,0,0);
    const limite = new Date(hoje); limite.setDate(limite.getDate() + dias);

    const { data, error } = await supabaseClient
      .from('transacoes').select('*')
      .eq('status','pendente')
      .eq('tipo','emprestimo')
      .order('data_vencimento', { ascending: true });

    if (error) throw error;
    // Filtra client-side: somente empréstimos dentro do prazo (ou sem vencimento)
    const limiteStr = limite.toISOString().split('T')[0];
    const filtered = (data || []).filter(r =>
      !r.data_vencimento || r.data_vencimento <= limiteStr
    );
    renderLembretes(filtered);
  } catch(e) {
    console.error(e); showToast(e.message, 'error');
  } finally { setLoading(false); }
}

function renderLembretes(rows) {
  const list = $('#venc-list');
  if (!list) return;

  if (!rows.length) {
    list.innerHTML = `<div class="empty-state">✅ Nenhum vencimento no período selecionado</div>`;
    return;
  }

  const hoje = new Date(); hoje.setHours(0,0,0,0);
  const prazoMap = { diario: '1 dia', semanal: '7 dias', mensal: '1 mês' };

  list.innerHTML = rows.map(r => {
    const venc = r.data_vencimento ? new Date(r.data_vencimento + 'T00:00:00') : null;
    let classe = 'due-later', aviso = 'Sem vencimento';
    if (venc) {
      const diff = Math.round((venc - hoje) / 86400000);
      if (diff < 0)        { classe = 'due-today'; aviso = `⚠️ Vencido há ${Math.abs(diff)} dia(s)`; }
      else if (diff === 0) { classe = 'due-today'; aviso = '🔴 Vence HOJE!'; }
      else if (diff <= 3)  { classe = 'due-soon';  aviso = `🟡 Vence em ${diff} dia(s)`; }
      else                 { classe = 'due-later'; aviso = `🟢 Vence em ${diff} dias`; }
    }
    return `
      <div class="reminder-item ${classe}">
        <div class="reminder-info">
          <strong>${r.nome}</strong>
          <span class="due-label ${classe}" style="display:block;margin-top:2px">${aviso}</span>
          ${r.periodicidade ? `<small style="color:var(--text2)">Prazo: ${prazoMap[r.periodicidade]||r.periodicidade}</small>` : ''}
          ${r.data_vencimento ? `<small style="color:var(--text2)">${fmtDate(r.data_vencimento)}</small>` : ''}
        </div>
        <div class="reminder-values">
          <div style="font-size:0.8rem;color:var(--text2)">Original: ${fmt.format(parseFloat(r.valor||0))}</div>
          <div style="font-weight:700;font-size:1rem;color:var(--green,#4caf50)">Cobrar: ${fmt.format(parseFloat(r.valor_com_juros||r.valor||0))}</div>
        </div>
        <button class="btn btn-primary btn-sm" onclick="marcarRecebido(${r.id})">✅ Recebido</button>
      </div>`;
  }).join('');
}

async function marcarRecebido(id) {
  setLoading(true);
  try {
    const { error } = await supabaseClient.from('transacoes').update({ status: 'recebido' }).eq('id', id);
    if (error) throw error;
    showToast('Marcado como recebido! 🎉', 'success');
    loadLembretes();
    loadDashboard();
  } catch(e) { showToast(e.message, 'error'); }
  finally { setLoading(false); }
}

// ─────────────────────────────────────────────
// TRANSAÇÕES
// ─────────────────────────────────────────────
async function loadTransacoes() {
  setLoading(true);
  try {
    const { data, error } = await supabaseClient.from('transacoes').select('*').order('data', { ascending: false });
    if (error) throw error;
    allTransacoes = (data || []).filter(r => {
      if (!mesSelecionado) return true;
      return r.data && r.data.startsWith(mesSelecionado);
    });
    renderTabela(allTransacoes);
  } catch(e) { console.error(e); showToast(e.message,'error'); }
  finally { setLoading(false); }
}

function filtrarTabela() {
  const busca  = ($('#busca-input')?.value || '').toLowerCase();
  const tipo   = $('#filtro-tipo')?.value  || '';
  const status = $('#filtro-status')?.value|| '';
  renderTabela(allTransacoes.filter(r =>
    (!busca  || r.nome.toLowerCase().includes(busca)) &&
    (!tipo   || r.tipo   === tipo) &&
    (!status || r.status === status)
  ));
}

function renderTabela(rows) {
  const tbody = $('#tabela-body');
  const count = $('#tabela-count');
  if (!tbody) return;
  if (count) count.textContent = `${rows.length} registro${rows.length!==1?'s':''}`;

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="11" style="text-align:center;padding:40px">Nenhuma transação encontrada</td></tr>`;
    return;
  }

  const prazoLabel = r => ({ diario:'1 dia', semanal:'7 dias', mensal:'~30 dias' }[r.periodicidade] || (r.periodicidade||'-'));

  const tipoLabel = t => ({ emprestimo:'Empréstimo', receita:'Receita', despesa:'Despesa' }[t] || t || '-');

  const statusBadge = s => {
    const map = {
      pendente: ['badge-orange','⏳ Pendente'], recebido: ['badge-green','✅ Recebido'],
      pago:     ['badge-blue','💳 Pago'],       quitado:  ['badge-blue','✅ Quitado'],
      cancelado:['badge-gray','❌ Cancelado'],  'em aberto':['badge-orange','📋 Em aberto']
    };
    const [cls,label] = map[s] || ['badge-gray', s||'-'];
    return `<span class="badge ${cls}">${label}</span>`;
  };

  tbody.innerHTML = rows.map(r => {
    const valorCobrado = fmt.format(parseFloat(r.valor_com_juros||r.valor||0));
    return `
      <tr>
        <td><strong>${r.nome}</strong></td>
        <td>${fmtDate(r.data)}</td>
        <td>${tipoLabel(r.tipo)}</td>
        <td>${fmt.format(parseFloat(r.valor||0))}</td>
        <td>${r.taxa_juros ? r.taxa_juros+'%' : '-'}</td>
        <td><strong style="color:var(--green,#4caf50)">${valorCobrado}</strong></td>
        <td>${prazoLabel(r)}</td>
        <td>${statusBadge(r.status)}</td>
        <td>${r.data_vencimento ? fmtDate(r.data_vencimento) : '—'}</td>
        <td>${r.observacoes||'—'}</td>
        <td>
          <button class="btn-icon" onclick="openEditModal(${r.id})" title="Editar">✏️</button>
          <button class="btn-icon" onclick="deleteTransacao(${r.id})" title="Excluir">🗑️</button>
        </td>
      </tr>`;
  }).join('');
}

// ─────────────────────────────────────────────
// MODAL – CAMPOS DINÂMICOS POR TIPO
// ─────────────────────────────────────────────

/**
 * Regras por tipo:
 *   emprestimo → juros + periodicidade + vencimento + status: [pendente, recebido]
 *   receita    → sem status, sem juros, sem vencimento
 *   despesa    → sem juros, sem vencimento + status: [em aberto, quitado]
 */
function atualizarCamposPorTipo() {
  const tipo = $('#form-tipo')?.value || '';

  const grupoJuros    = $('#grupo-juros-wrap');
  const grupoPeriod   = $('#grupo-period-wrap');
  const grupoVencWrap = $('#grupo-venc-wrap');
  const grupoStatus   = $('#grupo-status-wrap');
  const selStatus     = $('#form-status');

  const isEmprestimo = tipo === 'emprestimo';
  const isReceita    = tipo === 'receita';
  const isDespesa    = tipo === 'despesa';

  // Juros e periodicidade: só empréstimo
  [grupoJuros, grupoPeriod].forEach(g => {
    if (g) g.style.display = isEmprestimo ? '' : 'none';
  });

  // Vencimento: só empréstimo
  if (grupoVencWrap) grupoVencWrap.style.display = isEmprestimo ? '' : 'none';

  // Status
  if (grupoStatus) grupoStatus.style.display = isReceita ? 'none' : '';

  // Opções de status conforme tipo
  if (selStatus) {
    if (isEmprestimo) {
      selStatus.innerHTML = `
        <option value="pendente">⏳ Pendente</option>
        <option value="recebido">✅ Recebido</option>`;
    } else if (isDespesa) {
      selStatus.innerHTML = `
        <option value="pendente">⏳ Pendente</option>
        <option value="pago">💳 Pago</option>`;
    }
  }

  // Se não é empréstimo, esconde também valor com juros e prazo
  if (!isEmprestimo) {
    const gj = $('#grupo-valor-juros');
    const gp = $('#grupo-prazo');
    if (gj) gj.style.display = 'none';
    if (gp) gp.style.display = 'none';
  }
}

// ─────────────────────────────────────────────
// JUROS + VENCIMENTO AUTOMÁTICO
// ─────────────────────────────────────────────
function calcularJuros() {
  const valor        = parseFloat($('#form-valor')?.value)       || 0;
  const taxa         = parseFloat($('#form-taxa')?.value)        || 0;
  const periodicidade = $('#form-periodicidade')?.value          || '';
  const dataBase     = $('#form-data')?.value || new Date().toISOString().slice(0,10);
  const tipo         = $('#form-tipo')?.value || '';

  if (tipo !== 'emprestimo') return; // só calcula para empréstimo

  // Valor com juros
  const grupoJuros = $('#grupo-valor-juros');
  const campoJuros = $('#form-valor-juros');
  if (valor > 0 && taxa > 0) {
    if (grupoJuros) grupoJuros.style.display = 'block';
    if (campoJuros) campoJuros.value = (valor * (1 + taxa/100)).toFixed(2);
  } else {
    if (grupoJuros) grupoJuros.style.display = 'none';
    if (campoJuros) campoJuros.value = '';
  }

  // Vencimento automático
  const campoVenc  = $('#form-vencimento');
  const grupoPrazo = $('#grupo-prazo');
  const campoPrazo = $('#form-prazo-label');

  if (periodicidade && dataBase) {
    const d = new Date(dataBase + 'T00:00:00');
    let prazoTexto = '';

    if (periodicidade === 'diario') {
      d.setDate(d.getDate() + 1);
      prazoTexto = '1 dia';
    } else if (periodicidade === 'semanal') {
      d.setDate(d.getDate() + 7);
      prazoTexto = '7 dias (1 semana)';
    } else if (periodicidade === 'mensal') {
      const orig = new Date(dataBase + 'T00:00:00');
      d.setMonth(d.getMonth() + 1);
      prazoTexto = `${Math.round((d-orig)/86400000)} dias (1 mês)`;
    }

    const vencISO = d.toISOString().slice(0,10);
    if (campoVenc)  campoVenc.value = vencISO;
    if (grupoPrazo) grupoPrazo.style.display = 'block';
    if (campoPrazo) campoPrazo.textContent = `Vence em ${prazoTexto} — ${fmtDate(vencISO)}`;
  } else {
    if (grupoPrazo) grupoPrazo.style.display = 'none';
    if (campoPrazo) campoPrazo.textContent = '';
  }
}

// ─────────────────────────────────────────────
// MODAL – ABRIR / FECHAR
// ─────────────────────────────────────────────
function openNewModal() {
  editingId = null;
  $('#modal-title').textContent = 'Nova Transação';
  $('#form-transacao').reset();
  $('#form-data').value = new Date().toISOString().slice(0,10);
  // Esconde todos os grupos condicionais
  ['#grupo-valor-juros','#grupo-prazo'].forEach(s => { const el=$(s); if(el) el.style.display='none'; });
  atualizarCamposPorTipo();
  calcularJuros();
  $('#modal-transacao').classList.add('open');
}

function closeModal() {
  $('#modal-transacao').classList.remove('open');
}

async function openEditModal(id) {
  editingId = id;
  $('#modal-title').textContent = 'Editar Transação';
  setLoading(true);
  try {
    const { data, error } = await supabaseClient.from('transacoes').select('*').eq('id',id).single();
    if (error) throw error;

    $('#form-nome').value          = data.nome            || '';
    $('#form-data').value          = data.data            || '';
    $('#form-tipo').value          = data.tipo            || '';
    $('#form-valor').value         = data.valor           || '';
    $('#form-taxa').value          = data.taxa_juros      || '';
    $('#form-periodicidade').value = data.periodicidade   || '';
    $('#form-vencimento').value    = data.data_vencimento || '';
    $('#form-obs').value           = data.observacoes     || '';

    // Atualiza campos dinâmicos ANTES de setar status
    atualizarCamposPorTipo();
    $('#form-status').value = data.status || '';
    calcularJuros();

    $('#modal-transacao').classList.add('open');
  } catch(e) {
    console.error(e); showToast(e.message,'error');
  } finally { setLoading(false); }
}

async function saveTransacao() {
  const tipo = $('#form-tipo').value;
  const body = {
    nome:            $('#form-nome').value.trim(),
    data:            $('#form-data').value,
    tipo:            tipo,
    valor:           parseFloat($('#form-valor').value) || null,
    taxa_juros:      tipo === 'emprestimo' ? (parseFloat($('#form-taxa').value) || null) : null,
    periodicidade:   tipo === 'emprestimo' ? ($('#form-periodicidade').value || null) : null,
    valor_com_juros: tipo === 'emprestimo' ? (parseFloat($('#form-valor-juros').value) || null) : null,
    status:          tipo === 'receita' ? 'recebido' : ($('#form-status').value || null),
    data_vencimento: tipo === 'emprestimo' ? ($('#form-vencimento').value || null) : null,
    observacoes:     $('#form-obs').value.trim()
  };

  if (!body.nome || !body.data || !body.tipo || !body.valor) {
    showToast('Preencha os campos obrigatórios (Nome, Data, Tipo, Valor)', 'error');
    return;
  }

  setLoading(true);
  try {
    if (editingId) {
      const { error } = await supabaseClient.from('transacoes').update(body).eq('id', editingId);
      if (error) throw error;
      showToast('Transação atualizada! ✏️', 'success');
    } else {
      const { error } = await supabaseClient.from('transacoes').insert(body);
      if (error) throw error;
      showToast('Transação criada! 🎉', 'success');
    }
    closeModal();
    loadTransacoes();
    loadDashboard();
  } catch(e) {
    console.error(e); showToast(e.message,'error');
  } finally { setLoading(false); }
}

// ─────────────────────────────────────────────
// DELETE
// ─────────────────────────────────────────────
async function deleteTransacao(id) {
  if (!confirm('Deseja excluir esta transação?')) return;
  setLoading(true);
  try {
    const { error } = await supabaseClient.from('transacoes').delete().eq('id', id);
    if (error) throw error;
    showToast('Transação removida!', 'success');
    loadTransacoes();
    loadDashboard();
  } catch(e) { showToast(e.message,'error'); }
  finally { setLoading(false); }
}

// ─────────────────────────────────────────────
// TEMA
// ─────────────────────────────────────────────
function toggleTheme() {
  const html = document.documentElement;
  const isDark = html.getAttribute('data-theme') !== 'light';
  html.setAttribute('data-theme', isDark ? 'light' : 'dark');
  try { localStorage.setItem('theme', isDark ? 'light' : 'dark'); } catch {}
}

// ─────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const savedTheme = (() => { try { return localStorage.getItem('theme'); } catch { return null; } })();
  document.documentElement.setAttribute('data-theme', savedTheme || 'dark');

  // Registra eventos de UI (não dependem de auth)
  $$('.nav-item[data-page]').forEach(item =>
    item.addEventListener('click', () => navigate(item.dataset.page)));

  $('#modal-transacao')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal();
  });

  $('#busca-input')?.addEventListener('input',  filtrarTabela);
  $('#filtro-tipo')?.addEventListener('change', filtrarTabela);
  $('#filtro-status')?.addEventListener('change', filtrarTabela);

  $('#form-tipo')?.addEventListener('change', () => {
    atualizarCamposPorTipo();
    calcularJuros();
  });

  ['#form-valor','#form-taxa'].forEach(s => $(s)?.addEventListener('input',  calcularJuros));
  ['#form-periodicidade','#form-data'].forEach(s => $(s)?.addEventListener('change', calcularJuros));

  const mesPicker = $('#mes-picker');
  if (mesPicker) {
    const hoje = new Date();
    const mesAtual = hoje.toISOString().slice(0, 7);
    mesPicker.value = mesAtual;
    mesSelecionado = mesAtual;
    mesPicker.addEventListener('change', () => {
      mesSelecionado = mesPicker.value || '';
      loadDashboard();
      loadTransacoes();
      if (currentPage === 'lembretes') loadLembretes();
    });
  }

  // Aguarda auth.js confirmar sessão antes de carregar dados
  const authReady = window.__authReady || Promise.resolve();
  authReady.then(() => {
    if (!window.__fintrackAuthReady) return; // sem sessão — auth.js vai redirecionar
    loadDashboard();
    loadTransacoes();
    navigate('dashboard');
  });
});
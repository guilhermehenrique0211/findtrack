/**
 * auth.js — FinTrack
 * Proteção de sessão: deve ser carregado ANTES do app.js em index.html.
 * - Redireciona para login.html se não houver sessão válida
 * - Expõe supabaseClient global para o app.js
 * - Gerencia logout, refresh de token e expiração
 */
(() => {
  'use strict';

  const SUPABASE_URL = 'https://ptosgzkftndghhcmarhu.supabase.co';
  const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB0b3NnemtmdG5kZ2hoY21hcmh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1NDU1MDEsImV4cCI6MjA5NDEyMTUwMX0.1Xo0QKnM9LTGI_rAgKippYwuUBOryBBYMSzpr3TmCpM';

  // ── Cria cliente Supabase com opções de segurança ────────────────
  const _sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
      persistSession: true,       // mantém sessão no localStorage
      autoRefreshToken: true,     // renova token automaticamente
      detectSessionInUrl: true,   // suporte a magic link / OAuth callback
      storageKey: 'fintrack-auth',
    }
  });

  // Expõe globalmente para o app.js usar sem recriar
  window.supabaseClient = _sb;
  window.__fintrackAuthReady = false;

  // ── Redireciona para login ocultando o corpo até confirmar sessão ─
  // (evita flash do conteúdo antes da verificação)
  document.documentElement.style.visibility = 'hidden';

  async function guardRoute() {
    const { data: { session }, error } = await _sb.auth.getSession();

    if (!session) {
      // Sem sessão — vai para login
      window.location.replace('login.html');
      return;
    }

    // Sessão válida — mostra o app
    document.documentElement.style.visibility = '';
    window.__fintrackAuthReady = true;

    // Injeta nome do usuário na topbar (se existir o elemento)
    const userEl = document.getElementById('topbar-user');
    if (userEl && session.user?.email) {
      const name = session.user.user_metadata?.name || session.user.email.split('@')[0];
      userEl.textContent = name;
      userEl.title = session.user.email;
    }
  }

  // ── Escuta mudanças de estado de autenticação ────────────────────
  _sb.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT' || (!session && event !== 'INITIAL_SESSION')) {
      // Sessão encerrada (logout, expiração, revogação)
      window.location.replace('login.html');
    }
    if (event === 'TOKEN_REFRESHED') {
      // Token renovado silenciosamente — nenhuma ação necessária
    }
  });

  // ── Função de logout global ──────────────────────────────────────
  window.logout = async function () {
    try {
      await _sb.auth.signOut();
    } finally {
      // Garante o redirect mesmo se signOut falhar
      window.location.replace('login.html');
    }
  };

  // ── Executa o guard e expõe Promise para o app.js aguardar ────
  window.__authReady = guardRoute();

})();
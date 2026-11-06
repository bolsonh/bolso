/* Bolso: store.js
   Camada de dados com dois modos que falam a mesma língua:
   - Local: guarda no aparelho (localStorage). Funciona sem configurar nada.
   - Supabase: guarda na nuvem, com login, e sincroniza entre celular e computador. */
(function (root) {
  'use strict';

  const TABLES = ['cards', 'categories', 'recurring', 'transactions'];
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const empty = () => ({ cards: [], categories: [], recurring: [], transactions: [] });

  /* ---------- Modo local ---------- */

  function LocalStore() {
    const KEY = 'bolso.v1';
    let memory = null; // se o navegador bloquear o armazenamento, segue só na memória
    let blocked = false;

    function read() {
      if (memory) return memory;
      try {
        const raw = root.localStorage.getItem(KEY);
        if (raw) {
          const d = JSON.parse(raw);
          for (const t of TABLES) if (!Array.isArray(d[t])) d[t] = [];
          return d;
        }
      } catch (e) { blocked = true; }
      return empty();
    }
    function write(d) {
      if (blocked) { memory = d; return; }
      try { root.localStorage.setItem(KEY, JSON.stringify(d)); }
      catch (e) { blocked = true; memory = d; }
    }

    // como o banco, que carimba sozinho a hora em que cada lançamento entrou
    const stamped = (table, rows) => {
      const out = clone(rows);
      if (table === 'transactions') { const now = new Date().toISOString(); for (const r of out) if (!r.created_at) r.created_at = now; }
      return out;
    };

    return {
      mode: 'local',
      async init() {},
      async load() { return clone(read()); },
      async insert(table, rows) {
        const d = read();
        d[table].push(...stamped(table, rows));
        write(d);
        return rows;
      },
      async insertIgnore(table, rows) { // só para transactions geradas por conta fixa
        const d = read();
        const have = new Set(d[table].filter((r) => r.recurring_id).map((r) => r.recurring_id + '|' + r.month));
        const added = rows.filter((r) => !have.has(r.recurring_id + '|' + r.month));
        d[table].push(...stamped(table, added));
        write(d);
        return added;
      },
      async update(table, id, patch) { return this.updateMany(table, [id], patch); },
      async updateMany(table, ids, patch) {
        const d = read();
        const set = new Set(ids);
        let n = 0;
        for (const r of d[table]) if (set.has(r.id)) { Object.assign(r, clone(patch)); n++; }
        write(d);
        if (!n) throw new Error('Registro não encontrado. Talvez já tenha sido removido.');
        return n;
      },
      async remove(table, ids) {
        const d = read();
        const set = new Set(ids);
        d[table] = d[table].filter((r) => !set.has(r.id));
        // mesmo comportamento do banco: ao apagar, quem apontava para o item fica sem vínculo
        if (table === 'cards') {
          for (const r of d.transactions.concat(d.recurring)) if (set.has(r.card_id)) r.card_id = null;
        }
        if (table === 'recurring') {
          for (const r of d.transactions) if (set.has(r.recurring_id)) r.recurring_id = null;
        }
        write(d);
      },
      async wipe() { write(empty()); },
      auth: null,
    };
  }

  /* ---------- Modo Supabase ---------- */

  function friendlyError(err) {
    const msg = String((err && (err.message || err.error_description)) || err || '');
    const code = err && (err.code || err.error_code);
    const map = [
      [/invalid login credentials/i, 'E-mail ou senha incorretos.'],
      [/email not confirmed/i, 'Falta confirmar o e-mail. Abra a mensagem que o Supabase enviou e clique no link.'],
      [/user already registered|already been registered/i, 'Já existe uma conta com esse e-mail. Use Entrar.'],
      [/password should be at least|weak.?password/i, 'A senha precisa ter pelo menos 6 caracteres.'],
      [/signups? not allowed|signup is disabled|signups are disabled/i, 'Novos cadastros estão desligados neste projeto. Entre com a conta que você já criou.'],
      [/rate limit|too many requests|over_email_send_rate_limit/i, 'Muitas tentativas seguidas. Espere alguns minutos e tente de novo.'],
      [/failed to fetch|networkerror|load failed|network request failed/i, 'Sem conexão com o Supabase. Confira a internet e tente de novo.'],
      [/jwt expired|invalid jwt|refresh_token/i, 'Sua sessão expirou. Entre de novo.'],
      [/permission denied|row-level security|violates row-level/i, 'O banco recusou a gravação. Rode o arquivo schema.sql no Supabase e entre de novo.'],
      [/could not find the '[^']+' column|column .* does not exist|transactions_source_check/i, 'O banco ainda não tem a atualização da fatura do cartão. Rode o arquivo supabase/migracao-02-fatura.sql no SQL Editor do Supabase e tente de novo.'],
      [/could not find the function|pgrst202|excluir_minha_conta/i, 'O banco ainda não tem a função de excluir conta. Rode o arquivo supabase/migracao-03-excluir-conta.sql no SQL Editor do Supabase e tente de novo.'],
      [/entre na sua conta para poder/i, 'Sua sessão expirou. Entre de novo para excluir a conta.'],
      [/relation .* does not exist|could not find the table|schema cache/i, 'As tabelas ainda não existem no Supabase. Rode o arquivo schema.sql no SQL Editor.'],
      [/invalid api key|apikey/i, 'A chave do Supabase em config.js está errada.'],
    ];
    for (const [re, text] of map) if (re.test(msg) || (code && re.test(String(code)))) return new Error(text);
    return new Error(msg || 'Algo deu errado. Tente de novo.');
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = root.document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error('Sem conexão para carregar o Supabase. Confira a internet e tente de novo.'));
      root.document.head.appendChild(s);
    });
  }

  function SupabaseStore(cfg) {
    let client = null;
    const libUrl = cfg.SUPABASE_JS_URL || 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js';

    const ok = (res) => {
      if (res.error) throw friendlyError(res.error);
      return res.data;
    };

    async function fetchAll(table, orders) {
      const out = [];
      for (let from = 0; ; from += 1000) {
        let q = client.from(table).select('*');
        for (const o of orders) q = q.order(o, { ascending: true });
        const data = ok(await q.range(from, from + 999));
        out.push(...data);
        if (data.length < 1000) break;
      }
      return out;
    }

    const numeric = (r) => (r && r.amount != null ? Object.assign(r, { amount: Number(r.amount) }) : r);

    return {
      mode: 'supabase',
      async init() {
        if (!root.supabase) await loadScript(libUrl);
        if (!root.supabase || !root.supabase.createClient) throw new Error('Não foi possível carregar a biblioteca do Supabase.');
        client = root.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
          auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
        });
      },
      async load() {
        const [cards, categories, recurring, transactions] = await Promise.all([
          fetchAll('cards', ['created_at', 'id']),
          fetchAll('categories', ['created_at', 'id']),
          fetchAll('recurring', ['created_at', 'id']),
          fetchAll('transactions', ['date', 'id']),
        ]);
        return { cards, categories, recurring: recurring.map(numeric), transactions: transactions.map(numeric) };
      },
      async insert(table, rows) {
        if (!rows.length) return rows;
        for (let i = 0; i < rows.length; i += 500) {
          ok(await client.from(table).insert(rows.slice(i, i + 500)));
        }
        return rows;
      },
      async insertIgnore(table, rows) {
        if (!rows.length) return [];
        for (let i = 0; i < rows.length; i += 500) {
          ok(await client.from(table).upsert(rows.slice(i, i + 500), { onConflict: 'recurring_id,month', ignoreDuplicates: true }));
        }
        // devolve o que de fato existe no banco para esses meses (outro aparelho pode ter criado antes)
        const recIds = [...new Set(rows.map((r) => r.recurring_id))];
        const months = [...new Set(rows.map((r) => r.month))];
        const data = ok(await client.from(table).select('*').in('recurring_id', recIds).in('month', months));
        return data.map(numeric);
      },
      async update(table, id, patch) { return this.updateMany(table, [id], patch); },
      async updateMany(table, ids, patch) {
        let n = 0;
        for (let i = 0; i < ids.length; i += 200) {
          const data = ok(await client.from(table).update(patch).in('id', ids.slice(i, i + 200)).select('id'));
          n += data.length;
        }
        if (!n) throw new Error('Registro não encontrado. Talvez já tenha sido removido em outro aparelho.');
        return n;
      },
      async remove(table, ids) {
        for (let i = 0; i < ids.length; i += 200) {
          ok(await client.from(table).delete().in('id', ids.slice(i, i + 200)));
        }
      },
      async wipe() {
        for (const t of ['transactions', 'recurring', 'categories', 'cards']) {
          ok(await client.from(t).delete().not('id', 'is', null));
        }
      },
      /** Exclui o login de quem está logado e todos os dados dele (a função do banco apaga em cascata). Depois sai só deste aparelho. */
      async deleteAccount() {
        ok(await client.rpc('excluir_minha_conta'));
        try { await client.auth.signOut({ scope: 'local' }); } catch (e) { /* o login já foi apagado no servidor */ }
      },
      auth: {
        async getSession() {
          const { data, error } = await client.auth.getSession();
          if (error) throw friendlyError(error);
          return data.session;
        },
        async signIn(email, password) {
          const { data, error } = await client.auth.signInWithPassword({ email, password });
          if (error) throw friendlyError(error);
          return data.session;
        },
        async signUp(email, password, consent) {
          // consent: { aceite_termos, aceite_em } fica guardado nos dados do usuário como registro do aceite
          const { data, error } = await client.auth.signUp({
            email, password, options: { emailRedirectTo: root.location.origin + root.location.pathname, data: consent || {} },
          });
          if (error) throw friendlyError(error);
          return data; // data.session vem vazio quando o projeto exige confirmar o e-mail
        },
        async acceptTerms(consent) {
          const { data, error } = await client.auth.updateUser({ data: consent });
          if (error) throw friendlyError(error);
          return data.user;
        },
        async signOut() { await client.auth.signOut(); },
        async resetPassword(email) {
          const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: root.location.origin + root.location.pathname });
          if (error) throw friendlyError(error);
        },
        async updatePassword(password) {
          const { error } = await client.auth.updateUser({ password });
          if (error) throw friendlyError(error);
        },
        onChange(cb) { client.auth.onAuthStateChange((event, session) => cb(event, session)); },
      },
    };
  }

  root.Stores = { LocalStore, SupabaseStore, TABLES };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.Stores;
})(typeof window !== 'undefined' ? window : globalThis);

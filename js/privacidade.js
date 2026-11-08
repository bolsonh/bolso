/* Página de privacidade: mostra a versão dos termos e o e-mail de contato. Fica em arquivo próprio para a página rodar sem script embutido (CSP). */
(function () {
  var cfg = window.APP_CONFIG || {};
  var v = window.Fin && window.Fin.TERMS_VERSION;
  if (v) document.getElementById('versao').textContent = v;
  var mail = String(cfg.CONTACT_EMAIL || '').trim();
  if (/^\S+@\S+\.\S+$/.test(mail)) {
    document.querySelectorAll('.contato').forEach(function (el) {
      var a = document.createElement('a');
      a.href = 'mailto:' + mail;
      a.textContent = mail;
      el.replaceWith(a);
    });
  }
})();

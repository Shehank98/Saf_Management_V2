wireChrome();
$('#f').onsubmit = async e => {
  e.preventDefault();
  const email = $('#e').value.trim(), pw = $('#p').value;
  if (!/\S+@\S+/.test(email) || pw.length < 4) { $('#err').textContent = 'Enter your email and password.'; return }
  const b = $('#f button.primary'); b.disabled = true; $('#err').textContent = '';
  try { await POST('/api/admin/login', { email, password: pw }); location.href = '/admin' }
  catch (x) { $('#err').textContent = x.message; b.disabled = false }
};

import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { colors } from '../theme';

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', company: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await register(form.name, form.email, form.password);
      navigate('/');
    } catch (err) {
      setError(err?.response?.data?.error || 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.root}>
      <div style={styles.card}>
        <div style={styles.brandRow}>
          <div style={styles.brandDot} />
          <span style={styles.brandText}>MOBO</span>
        </div>
        <h1 style={styles.title}>Create your account</h1>
        <p style={styles.sub}>Start booking rides across Cameroon</p>

        {error && <div style={styles.error}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <label style={styles.label}>Full Name</label>
          <input style={styles.input} type="text" value={form.name} onChange={set('name')} placeholder="Jean-Paul Nkemdirim" required autoFocus />

          <label style={styles.label}>Email</label>
          <input style={styles.input} type="email" value={form.email} onChange={set('email')} placeholder="you@company.com" required />

          <label style={styles.label}>Company (optional)</label>
          <input style={styles.input} type="text" value={form.company} onChange={set('company')} placeholder="Acme Corp" />

          <label style={styles.label}>Password</label>
          <input style={styles.input} type="password" value={form.password} onChange={set('password')} placeholder="8+ characters" required minLength={8} />

          <button style={{ ...styles.btn, opacity: loading ? 0.7 : 1 }} disabled={loading} type="submit">
            {loading ? 'Creating account…' : 'Create Account'}
          </button>
        </form>

        <p style={styles.footerLink}>
          Already have an account?{' '}
          <Link to="/login" style={{ color: colors.primary, fontWeight: 600 }}>Sign in</Link>
        </p>
      </div>
    </div>
  );
}

const styles = {
  root: { minHeight: '100vh', background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { background: colors.white, borderRadius: 20, padding: '40px', width: '100%', maxWidth: 440, boxShadow: '0 24px 64px rgba(0,0,0,0.25)' },
  brandRow: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 },
  brandDot: { width: 36, height: 36, borderRadius: '50%', background: `linear-gradient(135deg, ${colors.primary}, #7c3aed)` },
  brandText: { fontSize: 26, fontWeight: 900, color: colors.text, letterSpacing: 1 },
  title: { fontSize: 22, fontWeight: 800, color: colors.text, marginBottom: 6 },
  sub: { fontSize: 14, color: colors.textSec, marginBottom: 28 },
  error: { background: '#fef2f2', color: colors.danger, border: '1px solid #fecaca', borderRadius: 10, padding: '10px 14px', fontSize: 14, marginBottom: 16 },
  label: { display: 'block', fontSize: 13, fontWeight: 600, color: colors.text, marginBottom: 6 },
  input: { display: 'block', width: '100%', padding: '12px 14px', fontSize: 15, borderRadius: 10, border: `1.5px solid ${colors.border}`, marginBottom: 16, outline: 'none', fontFamily: 'inherit' },
  btn: { display: 'block', width: '100%', padding: '14px', fontSize: 16, fontWeight: 700, color: colors.white, background: `linear-gradient(135deg, ${colors.primary}, #7c3aed)`, border: 'none', borderRadius: 12, cursor: 'pointer', marginTop: 8, fontFamily: 'inherit' },
  footerLink: { textAlign: 'center', marginTop: 20, fontSize: 14, color: colors.textSec },
};

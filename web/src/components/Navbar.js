import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { colors } from '../theme';

const NAV_LINKS = [
  { to: '/',          label: 'Book Ride' },
  { to: '/history',   label: 'My Rides' },
  { to: '/corporate', label: 'Corporate' },
];

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleLogout = () => { logout(); navigate('/login'); };

  return (
    <nav style={styles.nav}>
      <div style={styles.inner}>
        {/* Brand */}
        <Link to="/" style={styles.brand}>
          <span style={styles.brandDot}></span>
          <span style={styles.brandText}>MOBO</span>
        </Link>

        {/* Desktop links */}
        <div style={styles.links}>
          {NAV_LINKS.map(l => (
            <Link
              key={l.to}
              to={l.to}
              style={{
                ...styles.navLink,
                ...(location.pathname === l.to ? styles.navLinkActive : {}),
              }}
            >
              {l.label}
            </Link>
          ))}
        </div>

        {/* Right side */}
        <div style={styles.right}>
          <button
            style={styles.avatarBtn}
            onClick={() => setMenuOpen(o => !o)}
          >
            <span style={styles.avatar}>{user?.name?.charAt(0) || 'U'}</span>
            <span style={styles.avatarName}>{user?.name?.split(' ')[0] || 'Me'}</span>
          </button>

          {menuOpen && (
            <div style={styles.dropdown}>
              <Link to="/profile" style={styles.dropItem} onClick={() => setMenuOpen(false)}>
                Profile
              </Link>
              <button style={styles.dropItemBtn} onClick={handleLogout}>Log out</button>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}

const styles = {
  nav: {
    background: colors.dark,
    color: colors.white,
    position: 'sticky',
    top: 0,
    zIndex: 100,
    boxShadow: '0 2px 16px rgba(0,0,0,0.18)',
  },
  inner: {
    maxWidth: 1200,
    margin: '0 auto',
    padding: '0 24px',
    height: 64,
    display: 'flex',
    alignItems: 'center',
    gap: 32,
  },
  brand: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    textDecoration: 'none',
    flexShrink: 0,
  },
  brandDot: {
    width: 32,
    height: 32,
    borderRadius: '50%',
    background: `linear-gradient(135deg, ${colors.primary}, #7c3aed)`,
    display: 'inline-block',
  },
  brandText: {
    fontSize: 22,
    fontWeight: 900,
    color: colors.white,
    letterSpacing: 1,
  },
  links: {
    display: 'flex',
    gap: 8,
    flex: 1,
  },
  navLink: {
    color: 'rgba(255,255,255,0.65)',
    textDecoration: 'none',
    fontWeight: 500,
    fontSize: 15,
    padding: '6px 14px',
    borderRadius: 8,
    transition: 'all 0.15s',
  },
  navLinkActive: {
    color: colors.white,
    background: 'rgba(255,255,255,0.1)',
  },
  right: {
    position: 'relative',
    marginLeft: 'auto',
  },
  avatarBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: colors.white,
    padding: '4px 8px',
    borderRadius: 8,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: '50%',
    background: `linear-gradient(135deg, ${colors.primary}, #7c3aed)`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 15,
    fontWeight: 800,
  },
  avatarName: { fontSize: 14, fontWeight: 600 },
  dropdown: {
    position: 'absolute',
    top: '110%',
    right: 0,
    background: colors.white,
    borderRadius: 10,
    boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
    overflow: 'hidden',
    minWidth: 150,
    zIndex: 200,
  },
  dropItem: {
    display: 'block',
    padding: '12px 16px',
    color: colors.text,
    textDecoration: 'none',
    fontSize: 14,
    fontWeight: 500,
    cursor: 'pointer',
  },
  dropItemBtn: {
    display: 'block',
    width: '100%',
    padding: '12px 16px',
    color: colors.danger,
    background: 'none',
    border: 'none',
    textAlign: 'left',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    borderTop: `1px solid ${colors.border}`,
  },
};

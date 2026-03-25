import { NavLink } from 'react-router-dom';

const links = [
  { to: '/', label: 'Dashboard' },
  { to: '/agents', label: 'Agents' },
  { to: '/posts', label: 'Scheduled Posts' },
  { to: '/settings', label: 'Settings' },
];

export default function Sidebar() {
  return (
    <aside className="sidebar">
      <h2 className="sidebar-title">Nexus</h2>
      <nav>
        {links.map((link) => (
          <NavLink key={link.to} to={link.to} end className="sidebar-link">
            {link.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}

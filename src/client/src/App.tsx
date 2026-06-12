import { useEffect, useState } from 'react';
import { AdminPage } from './AdminPage';
import { GamePage } from './GamePage';

// Hash-based routing (#/admin) — no router dependency and no SWA
// fallback-route configuration needed.
export default function App() {
  const [hash, setHash] = useState(window.location.hash);

  useEffect(() => {
    const onHashChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const isAdmin = hash === '#/admin';

  return (
    <div className="app">
      <header>
        <h1>Factory Physics</h1>
        <nav>
          <a href="#/" className={isAdmin ? '' : 'active'}>Factory</a>
          <a href="#/admin" className={isAdmin ? 'active' : ''}>Admin</a>
        </nav>
      </header>

      {isAdmin ? <AdminPage /> : <GamePage />}
    </div>
  );
}

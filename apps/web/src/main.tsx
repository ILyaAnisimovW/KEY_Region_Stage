import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { auth, getMe, type Me } from './auth';
import './style.css';

// Process a redirect once, before React mounts (also safe under StrictMode).
let callbackError = '';
if (window.location.pathname === '/callback') {
  try { await auth.signinRedirectCallback(); }
  catch { callbackError = 'Вход не завершён. Попробуйте ещё раз.'; }
  window.history.replaceState({}, '', '/');
}

function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState(callbackError);
  useEffect(() => {
    let mounted = true;
    const expired = () => { setMe(null); setError('Сессия завершена. Войдите снова.'); };
    auth.events.addUserUnloaded(expired);
    auth.events.addSilentRenewError(expired);
    void (async () => {
      try { if (await auth.getUser()) { const result = await getMe(); if (mounted) setMe(result); } }
      catch (e) { if (mounted) setError((e as Error).message); }
      finally { if (mounted) setBusy(false); }
    })();
    return () => { mounted = false; auth.events.removeUserUnloaded(expired); auth.events.removeSilentRenewError(expired); };
  }, []);
  async function action(run: () => Promise<unknown>) {
    setBusy(true); setError('');
    try { await run(); } catch { setError('Не удалось связаться с сервисом входа. Попробуйте ещё раз.'); }
    finally { setBusy(false); }
  }
  return <main>
    <a className="brand" href="/">Gourmet Box<span>Хорошая еда заслуживает второго шанса</span></a>
    <section>
      <p className="eyebrow">Личный кабинет</p>
      <h1>{me ? 'Вы вошли' : 'Рады вас видеть'}</h1>
      {error && <p role="alert" className="error">{error}</p>}
      {busy && <p role="status">Проверяем доступ…</p>}
      {me ? <>
        <p>Ваш доступ: {me.roles.map(role => role === 'BUYER' ? 'Покупатель' : 'Сотрудник заведения').join(', ')}.</p>
        {me.roles.includes('STAFF') && <><h2>Ваши заведения</h2>{me.venues.length ? <ul>{me.venues.map(v => <li key={v.id}>{v.name}</li>)}</ul> : <p>Заведения пока не назначены. Обратитесь к администратору.</p>}</>}
        <button disabled={busy} onClick={() => void action(async () => setMe(await getMe()))}>Обновить доступ</button>
        <button className="secondary" disabled={busy} onClick={() => void action(() => auth.signoutRedirect())}>Выйти</button>
      </> : <>
        <p>Войдите, чтобы бронировать боксы или работать с заказами своего заведения.</p>
        <button disabled={busy} onClick={() => void action(() => auth.signinRedirect())}>Войти</button>
      </>}
    </section>
  </main>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);

import { useEffect, useState, type FormEvent } from 'react';
import { cancelBooking, cancelStaffBooking, closeOffer, fulfillBooking, listOffers, listOrders, listVenueOffers, listVenueOrders, noShowBooking, publishOffer, reserve, type Booking, type Offer } from './booking';

const money = (minor: number) => `${new Intl.NumberFormat('ru-RU').format(minor / 100)} ₽`;
const date = (value: string) => new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
const localInput = (value: Date, round: 'ceil' | 'floor' = 'ceil') => {
  const minutes = round === 'ceil' ? Math.ceil(value.getTime() / 60_000) : Math.floor(value.getTime() / 60_000);
  const shifted = new Date(minutes * 60_000 - value.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 16);
};
const errorText = (error: unknown) => error instanceof Error ? error.message : 'Попробуйте ещё раз.';
const labels: Record<Booking['status'], string> = { RESERVED: 'Ожидает выдачи', FULFILLED: 'Выдан', CANCELLED: 'Отменён', NO_SHOW: 'Не забран' };

export function Catalog({ canBook, onLogin, onBooked }: { canBook: boolean; onLogin: () => void; onBooked: () => void }) {
  const [offers, setOffers] = useState<Offer[]>([]), [selected, setSelected] = useState<Offer | null>(null);
  const [loading, setLoading] = useState(true), [working, setWorking] = useState(false), [error, setError] = useState('');
  const [quantity, setQuantity] = useState(1), [pickupAt, setPickupAt] = useState(''), [paymentMethod, setPaymentMethod] = useState<'AT_PICKUP' | 'ONLINE_LATER'>('AT_PICKUP');
  const refresh = () => { setLoading(true); listOffers().then(data => { setOffers(data.items); setError(''); }).catch(e => setError(errorText(e))).finally(() => setLoading(false)); };
  useEffect(refresh, []);
  useEffect(() => {
    if (!selected) return;
    const overflow = document.body.style.overflow;
    const onEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setSelected(null); };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onEscape);
    return () => { document.body.style.overflow = overflow; window.removeEventListener('keydown', onEscape); };
  }, [selected]);
  const choose = (item: Offer) => {
    setSelected(item); setQuantity(1); setError('');
    const earliest = Math.max(new Date(item.pickupWindowStart).getTime(), Date.now() + 16 * 60_000);
    setPickupAt(localInput(new Date(earliest)));
  };
  const book = async (event: FormEvent) => {
    event.preventDefault();
    if (!selected) return;
    setWorking(true); setError('');
    try {
      await reserve({ offerId: selected.id, quantity, pickupAt: new Date(pickupAt).toISOString(), paymentMethod });
      setSelected(null); refresh(); onBooked();
    } catch (e) { setError(errorText(e)); }
    finally { setWorking(false); }
  };
  return <section className="booking-catalog" aria-labelledby="catalog-title">
    <div className="booking-section-head"><div><p className="eyebrow">БОКСЫ РЯДОМ</p><h2 id="catalog-title">Сегодня вкусное<br/><em>не пропадёт.</em></h2></div><button className="booking-refresh" onClick={refresh} disabled={loading}>Обновить каталог ↗</button></div>
    {loading && <p className="booking-message" role="status">Загружаем доступные боксы…</p>}
    {error && <p className="booking-error" role="alert">{error}</p>}
    {!loading && !error && !offers.length && <div className="booking-empty"><span>01 / КАТАЛОГ</span><h3>Пока нет открытых боксов.</h3><p>Когда заведение опубликует предложение, оно появится здесь. Загляните позже.</p></div>}
    {!!offers.length && <div className="offer-grid">{offers.map((item, index) => <article className="offer-card" key={item.id}>
      <div className="offer-photo"><img src="/images/bakery-hero-photo.png" alt="Иллюстративное фото выпечки"/><span>{String(index + 1).padStart(2, '0')} / ФОТО ДЛЯ ПРИМЕРА</span></div>
      <div className="offer-card-body"><span className="offer-venue">{item.venueName} · {item.address}</span><h3>{item.title}</h3><p>{item.items.map(i => `${i.quantity} × ${i.name}`).join(' · ')}</p><div className="offer-meta"><span>Забрать: {date(item.pickupWindowStart)}–{new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(new Date(item.pickupWindowEnd))}</span><span>Осталось: {item.availableBoxes}</span></div><div className="offer-bottom"><strong>{money(item.priceMinor)}</strong><del>{money(item.originalPriceMinor)}</del><button className="button yellow" onClick={() => canBook ? choose(item) : onLogin()}>{canBook ? 'Забронировать' : 'Войти для брони'} →</button></div></div>
    </article>)}</div>}
    {selected && <div className="booking-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setSelected(null); }}><form className="booking-modal" onSubmit={book} aria-label={`Бронирование: ${selected.title}`}><button type="button" className="booking-close" onClick={() => setSelected(null)} aria-label="Закрыть">×</button><p className="eyebrow">ПОДТВЕРДИТЕ БРОНЬ</p><h3>{selected.title}</h3><p className="booking-modal-venue">{selected.venueName} · {selected.address}</p>{selected.venueName.includes('демо') && <p className="booking-error" role="note">Это тестовый заказ: деньги не списываются, реальной выдачи нет.</p>}<ul>{selected.items.map((item, i) => <li key={i}><span>{item.name} · {item.allergens}</span><b>{item.quantity} шт.</b></li>)}</ul>{selected.expiresAt && <p className="booking-expiry">Срок годности продуктов: {date(selected.expiresAt)}</p>}<label>Количество боксов<select value={quantity} onChange={e => setQuantity(Number(e.target.value))}>{Array.from({ length: Math.min(5, selected.availableBoxes) }, (_, i) => <option value={i + 1} key={i}>{i + 1}</option>)}</select></label><label>Когда заберёте<input type="datetime-local" required value={pickupAt} min={localInput(new Date(Math.max(Date.now() + 15 * 60_000, new Date(selected.pickupWindowStart).getTime())))} max={localInput(new Date(selected.pickupWindowEnd), 'floor')} onChange={e => setPickupAt(e.target.value)}/></label><label>Оплата<select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value as typeof paymentMethod)}><option value="AT_PICKUP">На месте — демонстрационный режим</option><option value="ONLINE_LATER">Онлайн — появится позже</option></select></label><div className="booking-total"><span>Итого за {quantity} бокс{quantity === 1 ? '' : 'а'}</span><strong>{money(selected.priceMinor * quantity)}</strong></div><p className="booking-small">Деньги сейчас не списываются. Код выдачи появится в «Моих бронях».</p>{error && <p className="booking-error" role="alert">{error}</p>}<button className="button yellow full" disabled={working}>{working ? 'Бронируем…' : 'Подтвердить бронь →'}</button></form></div>}
  </section>;
}

export function MyBookings({ onCatalog }: { onCatalog: () => void }) {
  const [orders, setOrders] = useState<Booking[]>([]), [loading, setLoading] = useState(true), [working, setWorking] = useState(''), [error, setError] = useState('');
  const refresh = () => { setLoading(true); listOrders().then(data => { setOrders(data.items); setError(''); }).catch(e => setError(errorText(e))).finally(() => setLoading(false)); };
  useEffect(refresh, []);
  const cancel = async (order: Booking) => {
    if (!window.confirm(`Отменить бронь «${order.title}»?`)) return;
    setWorking(order.id);
    try { await cancelBooking(order.id); refresh(); } catch (e) { setError(errorText(e)); }
    finally { setWorking(''); }
  };
  return <section className="booking-history"><div className="booking-section-head"><div><p className="eyebrow">ВАШИ НАХОДКИ</p><h2>Мои брони<span className="yellow-dot">.</span></h2></div><button className="booking-refresh" onClick={refresh}>Обновить ↗</button></div>
    {loading && <p className="booking-message" role="status">Загружаем брони…</p>}{error && <p className="booking-error" role="alert">{error}</p>}
    {!loading && !error && !orders.length && <div className="booking-empty"><span>01 / МЕСТО ДЛЯ ВКУСНОГО</span><h3>Здесь пока пусто.<br/><em>Исправим?</em></h3><p>Выберите бокс в каталоге, укажите время и получите код для выдачи.</p><button className="button yellow" onClick={onCatalog}>Смотреть боксы →</button></div>}
    <div className="booking-list">{orders.map(order => <article className="booking-row" key={order.id}><div className="booking-row-top"><span className={`booking-status ${order.status.toLowerCase()}`}>{labels[order.status]}</span><span>№ {order.id.slice(0, 8).toUpperCase()}</span></div><div className="booking-row-main"><div><h3>{order.title}</h3><p>{order.venueName} · {order.address}</p><p>Забрать {date(order.pickupAt)} · {order.quantity} {order.quantity === 1 ? 'бокс' : 'бокса'}</p></div><strong>{money(order.totalPriceMinor)}</strong></div><p className="booking-items">{order.items.map(item => `${item.quantity} × ${item.name}`).join(' · ')}</p>{order.status === 'RESERVED' && <div className="booking-code"><div><small>КОД ДЛЯ ПОЛУЧЕНИЯ</small><strong>{order.pickupCode}</strong></div><p>Покажите сотруднику в окне выдачи. Оплата на сайте не производилась.</p></div>}{order.status === 'RESERVED' && new Date(order.pickupAt).getTime() > Date.now() && <button className="booking-text-action" disabled={working === order.id} onClick={() => void cancel(order)}>Отменить бронь ↗</button>}</article>)}</div>
  </section>;
}

export function StaffBookings({ venues }: { venues: { id: string; name: string }[] }) {
  const [venueId, setVenueId] = useState(venues[0]?.id ?? ''), [offers, setOffers] = useState<Offer[]>([]), [orders, setOrders] = useState<Booking[]>([]);
  const [error, setError] = useState(''), [success, setSuccess] = useState(''), [busy, setBusy] = useState(false);
  const [title, setTitle] = useState('Вечерняя выпечка'), [itemName, setItemName] = useState('Круассан сливочный'), [allergens, setAllergens] = useState('Глютен, молоко, яйца'), [itemQty, setItemQty] = useState(3);
  const [boxes, setBoxes] = useState(4), [price, setPrice] = useState(200), [originalPrice, setOriginalPrice] = useState(500);
  const [start, setStart] = useState(localInput(new Date(Date.now() + 60 * 60_000))), [end, setEnd] = useState(localInput(new Date(Date.now() + 3 * 60 * 60_000)));
  const [expiresAt, setExpiresAt] = useState(localInput(new Date(Date.now() + 5 * 60 * 60_000))), [storageConfirmed, setStorageConfirmed] = useState(false);
  const [codes, setCodes] = useState<Record<string, string>>({}), [reasons, setReasons] = useState<Record<string, string>>({});
  const refresh = () => {
    if (!venueId) return;
    Promise.all([listVenueOffers(venueId), listVenueOrders(venueId)]).then(([a, b]) => { setOffers(a.items); setOrders(b.items); setError(''); }).catch(e => setError(errorText(e)));
  };
  useEffect(refresh, [venueId]);
  const create = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(''); setSuccess('');
    try { await publishOffer(venueId, { title, items: [{ name: itemName, quantity: itemQty, allergens }], totalBoxes: boxes, priceMinor: Math.round(price * 100), originalPriceMinor: Math.round(originalPrice * 100), pickupWindowStart: new Date(start).toISOString(), pickupWindowEnd: new Date(end).toISOString(), expiresAt: new Date(expiresAt).toISOString(), storageConfirmed: storageConfirmed as true }); setSuccess('Бокс опубликован в каталоге.'); refresh(); }
    catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  };
  const act = async (action: () => Promise<unknown>) => {
    setBusy(true); setError(''); setSuccess('');
    try { await action(); setSuccess('Готово. Список обновлён.'); refresh(); } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  };
  if (!venues.length) return <div className="booking-empty"><h3>Нет назначенных заведений</h3><p>Доступ к точке выдаёт администратор.</p></div>;
  return <section className="staff-bookings"><div className="booking-section-head"><div><p className="eyebrow">КАБИНЕТ ЗАВЕДЕНИЯ</p><h2>Боксы и выдача<span className="yellow-dot">.</span></h2></div><select aria-label="Заведение" value={venueId} onChange={e => setVenueId(e.target.value)}>{venues.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</select></div>{error && <p className="booking-error" role="alert">{error}</p>}{success && <p className="booking-success" role="status">{success}</p>}
    <details className="staff-create"><summary>+ Опубликовать новый бокс</summary><form onSubmit={create}><div className="staff-form-grid"><label>Название<input required minLength={3} value={title} onChange={e => setTitle(e.target.value)}/></label><label>Продукт<input required value={itemName} onChange={e => setItemName(e.target.value)}/></label><label>Аллергены<input required value={allergens} onChange={e => setAllergens(e.target.value)}/></label><label>Штук в боксе<input type="number" min="1" max="100" required value={itemQty} onChange={e => setItemQty(Number(e.target.value))}/></label><label>Боксов<input type="number" min="1" max="1000" required value={boxes} onChange={e => setBoxes(Number(e.target.value))}/></label><label>Цена, ₽<input type="number" min="1" step="1" required value={price} onChange={e => setPrice(Number(e.target.value))}/></label><label>Исходная цена, ₽<input type="number" min="2" step="1" required value={originalPrice} onChange={e => setOriginalPrice(Number(e.target.value))}/></label><label>Начало выдачи<input type="datetime-local" required value={start} onChange={e => setStart(e.target.value)}/></label><label>Конец выдачи<input type="datetime-local" required value={end} onChange={e => setEnd(e.target.value)}/></label><label>Срок годности<input type="datetime-local" required value={expiresAt} onChange={e => setExpiresAt(e.target.value)}/></label></div><label className="staff-confirm"><input type="checkbox" required checked={storageConfirmed} onChange={e => setStorageConfirmed(e.target.checked)}/>Подтверждаю условия хранения и пригодность продуктов</label><p>Срок выдачи должен закончиться минимум за 30 минут до срока годности. Состав и цена после публикации фиксируются.</p><button className="button yellow" disabled={busy}>Опубликовать →</button></form></details>
    <h3 className="staff-subhead">Предложения</h3><div className="staff-offers">{offers.length ? offers.map(item => <div className="staff-item" key={item.id}><div><strong>{item.title}</strong><span>{item.status === 'CLOSED' ? 'Закрыт' : `Доступно ${item.availableBoxes} из ${item.totalBoxes}`} · {money(item.priceMinor)}</span></div>{item.status === 'PUBLISHED' && <button disabled={busy} onClick={() => void act(() => closeOffer(venueId, item.id))}>Закрыть</button>}</div>) : <p className="booking-message">Боксов пока нет.</p>}</div>
    <h3 className="staff-subhead">Брони покупателей</h3><div className="staff-orders">{orders.length ? orders.map(order => <article className="staff-item" key={order.id}><div><span className={`booking-status ${order.status.toLowerCase()}`}>{labels[order.status]}</span><strong>{order.title} · {order.quantity} шт.</strong><span>Получение: {date(order.pickupAt)} · № {order.id.slice(0, 8)}</span></div>{order.status === 'RESERVED' && <div className="staff-actions"><input inputMode="numeric" maxLength={6} pattern="[0-9]{6}" placeholder="Код выдачи" aria-label={`Код выдачи для заказа ${order.id.slice(0, 8)}`} value={codes[order.id] ?? ''} onChange={e => setCodes({ ...codes, [order.id]: e.target.value.replace(/\D/g, '') })}/><button disabled={busy || !/^\d{6}$/.test(codes[order.id] ?? '')} onClick={() => void act(() => fulfillBooking(order.id, codes[order.id]!))}>Выдать</button><button disabled={busy || Date.now() < Math.min(new Date(order.pickupAt).getTime() + 15 * 60_000, new Date(order.pickupWindowEnd).getTime())} onClick={() => void act(() => noShowBooking(order.id))}>Неявка</button><input placeholder="Причина отмены" aria-label={`Причина отмены заказа ${order.id.slice(0, 8)}`} value={reasons[order.id] ?? ''} onChange={e => setReasons({ ...reasons, [order.id]: e.target.value })}/><button disabled={busy || (reasons[order.id] ?? '').trim().length < 3} onClick={() => void act(() => cancelStaffBooking(order.id, reasons[order.id]!))}>Отменить</button></div>}</article>) : <p className="booking-message">Активных броней пока нет.</p>}</div>
  </section>;
}

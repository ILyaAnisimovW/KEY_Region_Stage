import { auth } from './auth';

export interface Offer {
  id: string; venueId: string; venueName: string; address: string; title: string;
  status: 'PUBLISHED' | 'CLOSED'; items: { name: string; quantity: number; allergens: string }[];
  totalBoxes: number; availableBoxes: number; priceMinor: number; originalPriceMinor: number;
  pickupWindowStart: string; pickupWindowEnd: string; expiresAt?: string;
}
export interface Booking {
  id: string; offerId: string; venueId: string; venueName: string; address: string; title: string;
  status: 'RESERVED' | 'FULFILLED' | 'CANCELLED' | 'NO_SHOW'; quantity: number;
  items: Offer['items']; totalPriceMinor: number; originalTotalMinor: number;
  pickupAt: string; pickupWindowStart: string; pickupWindowEnd: string; paymentMethod: 'AT_PICKUP' | 'ONLINE_LATER';
  pickupCode?: string; createdAt: string;
}
const base = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/v1';

async function request<T>(path: string, init: RequestInit = {}, protectedRoute = false): Promise<T> {
  const headers = new Headers(init.headers);
  if (protectedRoute) {
    let user = await auth.getUser();
    if (!user || user.expired) user = await auth.signinSilent();
    if (!user) throw new Error('Войдите в аккаунт, чтобы продолжить.');
    headers.set('Authorization', `Bearer ${user.access_token}`);
  }
  if (init.body) headers.set('Content-Type', 'application/json');
  // A free API instance may need about a minute to wake after inactivity.
  const response = await fetch(`${base}${path}`, { ...init, headers, cache: 'no-store', signal: AbortSignal.timeout(75000) });
  if (!response.ok) {
    const data = await response.json().catch(() => null) as { message?: string } | null;
    if (response.status === 409) throw new Error(data?.message || 'Бокс уже недоступен. Обновите каталог.');
    if (response.status === 401 || response.status === 403) throw new Error('Сессия завершена. Войдите снова.');
    throw new Error(data?.message || `Не удалось выполнить действие (${response.status}).`);
  }
  return response.json() as Promise<T>;
}
export const listOffers = () => request<{ items: Offer[] }>('/offers');
export const listOrders = () => request<{ items: Booking[] }>('/orders', {}, true);
export const listVenueOrders = (venueId: string) => request<{ items: Booking[] }>(`/venues/${venueId}/orders`, {}, true);
export const listVenueOffers = (venueId: string) => request<{ items: Offer[] }>(`/venues/${venueId}/offers`, {}, true);
export const reserve = (body: { offerId: string; quantity: number; pickupAt: string; paymentMethod: 'AT_PICKUP' | 'ONLINE_LATER' }) =>
  request<Booking>('/orders', { method: 'POST', headers: { 'Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify(body) }, true);
export const cancelBooking = (id: string) => request<Booking>(`/orders/${id}/cancel`, { method: 'POST', headers: { 'Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify({ reason: 'Отменено покупателем' }) }, true);
export const cancelStaffBooking = (id: string, reason: string) => request<Booking>(`/orders/${id}/cancel`, { method: 'POST', headers: { 'Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify({ reason }) }, true);
export const fulfillBooking = (id: string, pickupCode: string) => request<Booking>(`/orders/${id}/fulfill`, { method: 'POST', headers: { 'Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify({ pickupCode }) }, true);
export const noShowBooking = (id: string) => request<Booking>(`/orders/${id}/no-show`, { method: 'POST', headers: { 'Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify({ reason: 'Покупатель не пришёл' }) }, true);
export const publishOffer = (venueId: string, body: { title: string; items: Offer['items']; totalBoxes: number; priceMinor: number; originalPriceMinor: number; pickupWindowStart: string; pickupWindowEnd: string; expiresAt: string; storageConfirmed: true }) =>
  request<Offer>(`/venues/${venueId}/offers`, { method: 'POST', body: JSON.stringify(body) }, true);
export const closeOffer = (venueId: string, offerId: string) => request<Offer>(`/venues/${venueId}/offers/${offerId}/close`, { method: 'POST' }, true);

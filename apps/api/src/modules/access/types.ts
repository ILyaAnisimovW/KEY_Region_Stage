export type Role = 'BUYER' | 'STAFF';
export interface Principal { id: string; roles: Role[] }
export interface OrderScope { buyerId: string; venueId: string }
export interface VenueSummary { id: string; name: string }
export interface AccessRepository {
  findPrincipal(issuer: string, subject: string): Promise<Principal | undefined>;
  hasMembership(userId: string, venueId: string): Promise<boolean>;
  findOrderScope(orderId: string): Promise<OrderScope | undefined>;
  findOfferVenue(offerId: string): Promise<string | undefined>;
  listVenues(userId: string): Promise<VenueSummary[]>;
}
export const ACCESS_REPOSITORY = Symbol('ACCESS_REPOSITORY');

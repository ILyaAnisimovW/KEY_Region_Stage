import { SetMetadata } from '@nestjs/common';
export type Policy = 'public' | 'authenticated' | 'buyer' | 'venue' | 'order-read' | 'order-cancel' | 'order-staff';
// One policy for every operation in the existing OpenAPI contract.
export const policies = {
  getVenue: 'public', listOffers: 'public', getOffer: 'public',
  listBatches: 'venue', createBatch: 'venue', listVenueOffers: 'venue', createOffer: 'venue',
  updateDraft: 'venue', quotePrice: 'venue', publishOffer: 'venue', closeOffer: 'venue',
  listMyOrders: 'buyer', createOrder: 'buyer', getOrder: 'order-read',
  cancelOrder: 'order-cancel', fulfillOrder: 'order-staff', markNoShow: 'order-staff',
  listOrderEvents: 'order-read', listVenueOrders: 'venue', listVenueEvents: 'venue', getAnalytics: 'venue',
  getMe: 'authenticated', health: 'public'
} as const satisfies Record<string, Policy>;
export const OPERATION = Symbol('ACCESS_OPERATION');
export const OperationAccess = (operation: keyof typeof policies) => SetMetadata(OPERATION, operation);

/**
 * Server-component data seam for the account area — orders, consignment and
 * favorites per user; mock ⇄ live invisible to the pages.
 */
import { API_MODE } from '@/lib/api/config';
import { hasDb } from '@/lib/server/db/client';
import type { Order, WarehouseItem } from '@/lib/types/domain';
import { getOrders as mockOrders } from '@/lib/mock/orders';
import { getWarehouseItems as mockWarehouse } from '@/lib/mock/warehouse';
import { ordersForUser, warehouseForUser } from '@/lib/server/repos/ordersRepo';
import { requestsForUser } from '@/lib/server/repos/requestsRepo';

const live = () => API_MODE === 'live' && hasDb();

export async function getOrders(userId: string): Promise<Order[]> {
  if (!live()) return mockOrders();
  return ordersForUser(userId);
}

export async function getWarehouseItems(userId: string): Promise<WarehouseItem[]> {
  if (!live()) return mockWarehouse();
  return warehouseForUser(userId);
}

/** Real per-user overview counts for the profile "control room" tiles. In
 *  mock/dev mode returns the fixture counts so the page still renders; in live
 *  mode these are the user's actual open requests / in-transit orders / stored
 *  consignments (fixes ProfileStats, which used to import fixtures directly and
 *  therefore showed demo numbers even in production). */
export async function getProfileCounts(userId: string): Promise<{
  openRequests: number;
  activeOrders: number;
  warehouseItems: number;
}> {
  if (!live()) {
    return {
      openRequests: 0,
      activeOrders: mockOrders().filter((o) => o.status !== 'delivered').length,
      warehouseItems: mockWarehouse().length,
    };
  }
  const [requests, orders, warehouse] = await Promise.all([
    requestsForUser(userId),
    ordersForUser(userId),
    warehouseForUser(userId),
  ]);
  return {
    openRequests: requests.filter((r) => r.status !== 'quoted').length,
    activeOrders: orders.filter((o) => o.status !== 'delivered').length,
    warehouseItems: warehouse.length,
  };
}

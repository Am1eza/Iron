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

const live = () => API_MODE === 'live' && hasDb();

export async function getOrders(userId: string): Promise<Order[]> {
  if (!live()) return mockOrders();
  return ordersForUser(userId);
}

export async function getWarehouseItems(userId: string): Promise<WarehouseItem[]> {
  if (!live()) return mockWarehouse();
  return warehouseForUser(userId);
}

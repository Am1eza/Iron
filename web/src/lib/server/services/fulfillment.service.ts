import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { ulid } from 'ulid';
import { type DbOrTx } from '@/lib/server/db/client';
import { orders, orderItems, leads, orderEvents, orderFulfillments, warehouseItems, warehouseReservations,
  warehouseWithdrawals, warehouseCashEntries, operationOutbox, users } from '@/lib/server/db/schema';
import { BusinessRuleError, businessOperation, financialAudit, stockGrams, safeMoney } from '@/lib/server/utils/businessOperation';
import { updateWarehouseItem } from '@/lib/server/repos/ordersRepo';
import { recordBillingChange } from './warehouseBilling';
import { can, canActOnAssignedRecord } from '@/lib/auth/roles';
import type { AuthUser } from '@/lib/auth/types';
import { orderStatusSmsNotification } from './leads.service';

type Stock = typeof warehouseItems.$inferSelect;
function requireProof(proof: string) {
  if (!proof || proof.trim().length < 5 || proof.length > 1000) throw new BusinessRuleError('proof_required', 'شمارهٔ سند و توضیح قابل پیگیری (حداقل ۵ حرف) لازم است.', 400);
}
async function lockedStock(tx: DbOrTx, id: string): Promise<Stock> {
  const [item] = await tx.select().from(warehouseItems).where(and(eq(warehouseItems.id, id), isNull(warehouseItems.deletedAt))).for('update');
  if (!item) throw new BusinessRuleError('not_found', 'قلم انبار یافت نشد.', 404);
  return item;
}
async function availableGrams(tx: DbOrTx, stock: Stock): Promise<number> {
  const rows = await tx.select().from(warehouseReservations).where(and(eq(warehouseReservations.warehouseItemId, stock.id), eq(warehouseReservations.status, 'reserved')));
  return stockGrams(stock.quantityTons) - rows.reduce((n,r) => n + stockGrams(r.quantityTons), 0);
}
async function lockOrder(tx: DbOrTx, ref: string, actor: AuthUser) {
  const [order] = await tx.select().from(orders).where(eq(orders.ref, ref)).for('update');
  if (!order || order.deletedAt) throw new BusinessRuleError('not_found', 'سفارش فعال یافت نشد.', 404);
  if (order.leadId) {
    const [lead] = await tx.select().from(leads).where(eq(leads.id, order.leadId)).for('share');
    if (lead && !canActOnAssignedRecord(actor, lead.assigneeId)) throw new BusinessRuleError('forbidden', 'سفارش به کارشناس دیگری واگذار شده است.', 403);
  }
  return order;
}

export async function reserveOrderStock(ref: string, actor: AuthUser, input: {
  operationId: string; orderItemId: string; warehouseItemId: string; quantityTons: number; ownerAuthorization: string;
}) {
  requireProof(input.ownerAuthorization);
  const grams = stockGrams(input.quantityTons);
  if (!grams) throw new BusinessRuleError('quantity', 'مقدار رزرو باید مثبت باشد.', 400);
  return businessOperation(`reserve:${actor.id}:${input.operationId}`, { ref, ...input }, async tx => {
    const order = await lockOrder(tx, ref, actor);
    if (!['registered','confirmed','loading','in_transit'].includes(order.status)) throw new BusinessRuleError('closed_order', 'سفارش برای رزرو باز نیست.');
    const [line] = await tx.select().from(orderItems).where(and(eq(orderItems.id, input.orderItemId), eq(orderItems.orderId, order.id)));
    if (!line || !line.weightKg) throw new BusinessRuleError('weight_required', 'وزن قطعی قلم سفارش برای تخصیص لازم است.');
    const previous = await tx.select().from(warehouseReservations).where(and(eq(warehouseReservations.orderItemId, line.id), sql`${warehouseReservations.status}<>'released'`));
    if (previous.reduce((n,r) => n + stockGrams(r.quantityTons), 0) + grams > stockGrams(line.weightKg / 1000))
      throw new BusinessRuleError('over_allocation', 'رزرو از وزن سفارش بیشتر می‌شود.');
    const stock = await lockedStock(tx, input.warehouseItemId);
    if (!['stored','selling'].includes(stock.status) || await availableGrams(tx, stock) < grams)
      throw new BusinessRuleError('insufficient_stock', 'موجودی آزاد کافی نیست.');
    if (stock.userId !== order.userId && !can(actor.role, 'leads:manage'))
      throw new BusinessRuleError('owner_authorization', 'فروش کالای امانی به خریدار دیگر نیازمند ثبت مجوز مالک توسط مدیر است.', 403);
    const [reservation] = await tx.insert(warehouseReservations).values({ id: ulid(), warehouseItemId: stock.id,
      ownerId: stock.userId, orderItemId: line.id, quantityTons: input.quantityTons }).returning();
    if (!reservation) throw new Error('Business write returned no row');
    await financialAudit(tx, actor.id, 'warehouse.reserve', 'warehouseItem', stock.id, null, { reservation, ownerAuthorization: input.ownerAuthorization, orderRef: ref });
    return reservation;
  });
}

export async function fulfillOrder(ref: string, actor: AuthUser, input: {
  operationId: string; orderItemId: string; quantity: number; proof: string; reservationId?: string; kind: 'delivery' | 'return';
}) {
  requireProof(input.proof);
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) throw new BusinessRuleError('quantity', 'مقدار تحویل معتبر لازم است.', 400);
  return businessOperation(`fulfill:${actor.id}:${input.operationId}`, { ref, ...input }, async tx => {
    const order = await lockOrder(tx, ref, actor);
    if (input.kind === 'delivery' && order.status !== 'in_transit') throw new BusinessRuleError('not_shipped', 'تحویل فقط برای سفارش در حال حمل ثبت می‌شود.');
    if (input.kind === 'return' && !can(actor.role, 'leads:manage')) throw new BusinessRuleError('forbidden', 'ثبت برگشت کالا نیازمند مدیر است.', 403);
    const lines = await tx.select().from(orderItems).where(eq(orderItems.orderId, order.id));
    const line = lines.find(l => l.id === input.orderItemId);
    if (!line) throw new BusinessRuleError('line_not_found', 'قلم متعلق به این سفارش نیست.', 404);
    const history = await tx.select().from(orderFulfillments).where(inArray(orderFulfillments.orderItemId, lines.map(l => l.id)));
    const lineHistory = history.filter(f => f.orderItemId === line.id);
    const delivered = lineHistory.filter(f => f.kind === 'delivery').reduce((n,f) => n+f.quantity,0);
    const returned = lineHistory.filter(f => f.kind === 'return').reduce((n,f) => n+f.quantity,0);
    if ((input.kind === 'delivery' && delivered + input.quantity > line.qty + 1e-9) || (input.kind === 'return' && returned + input.quantity > delivered + 1e-9))
      throw new BusinessRuleError('over_fulfillment', 'مقدار از ماندهٔ مجاز تحویل/برگشت بیشتر است.');
    if (input.reservationId) {
      const [reservation] = await tx.select().from(warehouseReservations).where(eq(warehouseReservations.id, input.reservationId));
      if (!reservation || reservation.orderItemId !== line.id || !line.weightKg)
        throw new BusinessRuleError('reservation_mismatch', 'رزرو متعلق به این قلم نیست.');
      const grams = stockGrams(line.weightKg / 1000 * input.quantity / line.qty);
      if (grams !== stockGrams(reservation.quantityTons)) throw new BusinessRuleError('reservation_quantity', 'مقدار تحویل باید با این رزرو برابر باشد؛ برای ارسال جزئی رزرو جدا بسازید.');
      const stock = await lockedStock(tx, reservation.warehouseItemId);
      if (stock.userId !== reservation.ownerId) throw new BusinessRuleError('owner_mismatch', 'مالک رزرو و انبار متفاوت است.');
      if (input.kind === 'delivery') {
        if (reservation.status !== 'reserved') throw new BusinessRuleError('reservation_consumed', 'این رزرو قبلاً تحویل یا آزاد شده است.');
        await tx.update(warehouseReservations).set({ status: 'consumed' }).where(eq(warehouseReservations.id, reservation.id));
        await updateWarehouseItem(stock.id, { quantityTons: (stockGrams(stock.quantityTons)-grams)/1_000_000 }, actor.id, input.proof,
          { tx, operationId: `fulfillment:${input.operationId}` });
      } else {
        const original = lineHistory.find(f => f.reservationId === reservation.id && f.kind === 'delivery');
        if (!original || lineHistory.some(f => f.reservationId === reservation.id && f.kind === 'return'))
          throw new BusinessRuleError('return_mismatch', 'تحویل متناظر یافت نشد یا قبلاً برگشت خورده است.');
        const now = new Date(), quantityTons = (stockGrams(stock.quantityTons)+grams)/1_000_000;
        stockGrams(quantityTons);
        const after = { ...stock, quantityTons, status: 'stored' as const, releasedAt: null, version: stock.version+1, updatedAt: now };
        await recordBillingChange(tx, stock, after, now, actor.id, input.proof);
        await tx.update(warehouseItems).set({ quantityTons, status: 'stored', releasedAt: null, version: after.version, updatedAt: now }).where(eq(warehouseItems.id, stock.id));
        const { warehouseMovements } = await import('@/lib/server/db/schema');
        await tx.insert(warehouseMovements).values({ id: ulid(), warehouseItemId: stock.id, kind: 'receipt', deltaTons: grams/1_000_000,
          quantityAfterTons: quantityTons, actorId: actor.id, note: input.proof, operationId: `return:${input.operationId}` });
        await financialAudit(tx, actor.id, 'warehouse.return', 'warehouseItem', stock.id, stock, after);
      }
    } else {
      const [allocation] = await tx.select().from(warehouseReservations).where(and(eq(warehouseReservations.orderItemId, line.id), sql`${warehouseReservations.status}<>'released'`)).limit(1);
      if (allocation) throw new BusinessRuleError('reservation_required', 'برای این قلم، رزرو انبار باید همراه رسید معرفی شود.');
    }
    const [fulfillment] = await tx.insert(orderFulfillments).values({ id: ulid(), orderItemId: line.id, reservationId: input.reservationId,
      quantity: input.quantity, kind: input.kind, proof: input.proof, actorId: actor.id }).returning();
    if (!fulfillment) throw new Error('Business write returned no row');
    const complete = input.kind === 'delivery' && lines.every(l => history.filter(f => f.orderItemId === l.id && f.kind === 'delivery').reduce((n,f)=>n+f.quantity,0) + (l.id===line.id ? input.quantity : 0) >= l.qty-1e-9);
    const status = complete ? 'delivered' : order.status;
    await tx.update(orders).set({ status, updatedAt: new Date(), lastUpdate: new Date() }).where(eq(orders.id, order.id));
    const eventId = ulid();
    await tx.insert(orderEvents).values({ id: eventId, orderId: order.id, kind: input.kind, status,
      note: `${input.kind==='return'?'برگشت':'تحویل'} ${input.quantity} ${line.unit} از ${line.name}؛ ${input.proof}`, actorId: actor.id });
    await financialAudit(tx, actor.id, `order.${input.kind}`, 'order', order.id, null, fulfillment);
    if (complete && order.userId) {
      const [owner] = await tx.select().from(users).where(eq(users.id, order.userId));
      if (owner) {
        const notification = orderStatusSmsNotification(order.ref, owner.name, 'delivered');
        await tx.insert(operationOutbox).values({ id: eventId, mobile: owner.mobile, message: notification.fallbackText, notification });
      }
    }
    return { fulfillment, status, complete };
  });
}

export async function requestWithdrawal(ownerId: string, input: { operationId: string; warehouseItemId: string; quantityTons: number; recipient: string }) {
  requireProof(input.recipient);
  const grams = stockGrams(input.quantityTons); if (!grams) throw new BusinessRuleError('quantity', 'مقدار مثبت لازم است.', 400);
  return businessOperation(`withdrawal:${ownerId}:${input.operationId}`, input, async tx => {
    const stock = await lockedStock(tx, input.warehouseItemId);
    if (stock.userId !== ownerId) throw new BusinessRuleError('not_found', 'قلم انبار یافت نشد.', 404);
    if (!['stored','selling'].includes(stock.status) || await availableGrams(tx, stock) < grams) throw new BusinessRuleError('insufficient_stock', 'موجودی آزاد کافی نیست.');
    const [row] = await tx.insert(warehouseWithdrawals).values({ id: ulid(), warehouseItemId: stock.id, ownerId,
      quantityTons: input.quantityTons, recipient: input.recipient }).returning();
    if (!row) throw new Error('Business write returned no row');
    await financialAudit(tx, ownerId, 'warehouse.withdrawal.request', 'warehouseItem', stock.id, null, row);
    return row;
  });
}

export async function actOnWithdrawal(id: string, actor: AuthUser, input: { operationId: string; action: 'approve' | 'deliver' | 'cancel'; proof: string }) {
  requireProof(input.proof);
  return businessOperation(`withdrawal-action:${actor.id}:${input.operationId}`, { id, ...input }, async tx => {
    const [row] = await tx.select().from(warehouseWithdrawals).where(eq(warehouseWithdrawals.id, id)).for('update');
    if (!row || (!can(actor.role,'leads:write') && actor.id!==row.ownerId)) throw new BusinessRuleError('not_found','درخواست یافت نشد.',404);
    if (input.action !== 'cancel' && !can(actor.role,'leads:write')) throw new BusinessRuleError('forbidden','تأیید و تحویل فقط توسط کارشناس مجاز است.',403);
    const stock = await lockedStock(tx, row.warehouseItemId);
    if (stock.userId!==row.ownerId) throw new BusinessRuleError('owner_mismatch','مالکیت درخواست با انبار مطابقت ندارد.');
    let reservationId = row.reservationId;
    if (input.action==='approve') {
      if (row.status!=='requested') throw new BusinessRuleError('transition','درخواست در انتظار تأیید نیست.');
      if (await availableGrams(tx,stock)<stockGrams(row.quantityTons)) throw new BusinessRuleError('insufficient_stock','موجودی آزاد کافی نیست.');
      reservationId=ulid();
      await tx.insert(warehouseReservations).values({ id: reservationId, warehouseItemId: stock.id, ownerId: row.ownerId, quantityTons: row.quantityTons });
    } else if (input.action==='deliver') {
      if (row.status!=='approved' || !reservationId) throw new BusinessRuleError('transition','ابتدا درخواست را تأیید و رزرو کنید.');
      await tx.update(warehouseReservations).set({status:'consumed'}).where(and(eq(warehouseReservations.id,reservationId),eq(warehouseReservations.status,'reserved')));
      await updateWarehouseItem(stock.id,{quantityTons:(stockGrams(stock.quantityTons)-stockGrams(row.quantityTons))/1_000_000},actor.id,input.proof,{tx,operationId:`withdrawal:${row.id}`});
    } else {
      if (['delivered','cancelled'].includes(row.status)) throw new BusinessRuleError('transition','درخواست بسته شده است.');
      if (reservationId) await tx.update(warehouseReservations).set({status:'released'}).where(eq(warehouseReservations.id,reservationId));
    }
    const [after]=await tx.update(warehouseWithdrawals).set({status:input.action==='approve'?'approved':input.action==='deliver'?'delivered':'cancelled',reservationId,proof:input.proof,updatedAt:new Date()}).where(eq(warehouseWithdrawals.id,id)).returning();
    if (!after) throw new Error('Business write returned no row');
    await financialAudit(tx,actor.id,`warehouse.withdrawal.${input.action}`,'warehouseItem',stock.id,row,after);
    return after;
  });
}

/** Record a verified sale or actual payout; this API never initiates a bank transfer. */
export async function recordWarehouseCash(actor: AuthUser, input: { operationId: string; warehouseItemId: string; kind: 'sale'|'payout'|'reversal'; amountToman?: number; orderRef?: string; reversesId?: string; proof: string }) {
  requireProof(input.proof);
  if (!can(actor.role,'leads:manage')) throw new BusinessRuleError('forbidden','ثبت مالی فقط توسط مدیر مجاز است.',403);
  return businessOperation(`cash:${actor.id}:${input.operationId}`,input,async tx=>{
    // Same lock order as reservation/fulfillment: order, then warehouse item.
    const order=input.orderRef?await lockOrder(tx,input.orderRef,actor):null;
    let linkedOrderId = order?.id;
    const stock=await lockedStock(tx,input.warehouseItemId);
    let amount=safeMoney(input.amountToman??0);
    const entries=await tx.select().from(warehouseCashEntries).where(eq(warehouseCashEntries.warehouseItemId,stock.id));
    if(input.kind==='reversal') {
      const original=entries.find(e=>e.id===input.reversesId);
      if(!original || original.kind==='reversal' || entries.some(e=>e.reversesId===original.id)) throw new BusinessRuleError('invalid_reversal','سند قابل ابطال یافت نشد.');
      if (!['sale','payout'].includes(original.kind)) throw new BusinessRuleError('invalid_reversal','اصلاح پرداخت اجرت باید از مسیر حساب اجرت انجام شود.');
      if (order && order.id !== original.orderId) throw new BusinessRuleError('invalid_reversal','سفارش با سند اصلی مطابقت ندارد.');
      linkedOrderId = original.orderId ?? undefined;
      amount=-original.amountToman;
    } else if(input.kind==='sale') {
      if(!order || order.status!=='delivered') throw new BusinessRuleError('order_required','فروش باید به سفارش تحویل‌شده مرتبط باشد.');
      const allocations=await tx.select().from(warehouseReservations).innerJoin(orderItems,eq(orderItems.id,warehouseReservations.orderItemId))
        .where(and(eq(orderItems.orderId,order.id),eq(warehouseReservations.warehouseItemId,stock.id),eq(warehouseReservations.status,'consumed')));
      if(!allocations.length) throw new BusinessRuleError('sale_unlinked','این کالا حرکت تحویل مرتبط با سفارش ندارد.');
      const sales=await tx.select().from(warehouseCashEntries).where(eq(warehouseCashEntries.orderId,order.id));
      const already=sales.filter(e=>e.kind==='sale'||e.kind==='reversal').reduce((n,e)=>n+e.amountToman,0);
      if(!amount || order.terms?.total==null || amount+already>order.terms.total) throw new BusinessRuleError('sale_amount','وجه فروش از مبلغ مستند سفارش بیشتر است.');
    } else {
      const balance=entries.filter(e=>['sale','payout','reversal'].includes(e.kind)).reduce((n,e)=>n+e.amountToman,0);
      if(!amount || amount>balance) throw new BusinessRuleError('payout_balance','مبلغ پرداخت از ماندهٔ بستانکاری بیشتر است.');
      amount=-amount;
    }
    if(!amount) throw new BusinessRuleError('zero_amount','مبلغ صفر سند مالی ایجاد نمی‌کند.');
    const [entry]=await tx.insert(warehouseCashEntries).values({id:ulid(),warehouseItemId:stock.id,ownerId:stock.userId,orderId:linkedOrderId,kind:input.kind,amountToman:amount,reversesId:input.reversesId,proof:input.proof,actorId:actor.id}).returning();
    if (!entry) throw new Error('Business write returned no row');
    await financialAudit(tx,actor.id,`warehouse.cash.${input.kind}`,'warehouseItem',stock.id,null,entry);
    return entry;
  });
}

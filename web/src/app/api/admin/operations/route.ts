import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { requireDb, requireApiPermission, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { validateBody } from '@/lib/validation/request';
import { getDb } from '@/lib/server/db/client';
import { orderItems, orders, warehouseReservations, warehouseWithdrawals, warehouseCashEntries, operationOutbox } from '@/lib/server/db/schema';
import { reserveOrderStock, fulfillOrder, actOnWithdrawal, recordWarehouseCash } from '@/lib/server/services/fulfillment.service';
import { BusinessRuleError, financialAudit } from '@/lib/server/utils/businessOperation';
import { can } from '@/lib/auth/roles';

const common = { operationId: z.string().min(8).max(100) };
const proof = z.string().trim().min(5).max(1000);
const payload = z.discriminatedUnion('action', [
  z.object({ ...common, action: z.literal('reserve'), ref: z.string(), orderItemId: z.string(), warehouseItemId: z.string(), quantityTons: z.number().positive().max(100000), ownerAuthorization: proof }),
  z.object({ ...common, action: z.literal('fulfill'), ref: z.string(), orderItemId: z.string(), quantity: z.number().positive().max(1e11), proof, reservationId: z.string().optional(), kind: z.enum(['delivery','return']) }),
  z.object({ ...common, action: z.literal('withdrawal'), id: z.string(), decision: z.enum(['approve','deliver','cancel']), proof }),
  z.object({ ...common, action: z.literal('cash'), warehouseItemId: z.string(), kind: z.enum(['sale','payout','reversal']), amountToman: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(), orderRef: z.string().optional(), reversesId: z.string().optional(), proof }),
  z.object({ ...common, action: z.literal('outbox'), id: z.string(), decision: z.enum(['confirmed_sent','confirmed_not_sent']), proof }),
]);
async function GETImpl(req: NextRequest) {
  const guard=requireDb(); if(guard) return guard;
  const auth=await requireApiPermission(req,'leads:read'); if('response' in auth) return auth.response;
  const page=Math.max(1,Math.floor(Number(req.nextUrl.searchParams.get('page'))||1));
  const ref=req.nextUrl.searchParams.get('ref');
  if(ref) {
    const lines=await getDb().select({id:orderItems.id}).from(orderItems).innerJoin(orders,eq(orders.id,orderItems.orderId)).where(eq(orders.ref,ref));
    const reservations=lines.length?await getDb().select().from(warehouseReservations).where(inArray(warehouseReservations.orderItemId,lines.map(l=>l.id))):[];
    return NextResponse.json({reservations},{headers:{'Cache-Control':'no-store'}});
  }
  const [withdrawals,cash,outbox]=await Promise.all([
    getDb().select().from(warehouseWithdrawals).orderBy(desc(warehouseWithdrawals.createdAt),desc(warehouseWithdrawals.id)).limit(51).offset((page-1)*50),
    getDb().select().from(warehouseCashEntries).orderBy(desc(warehouseCashEntries.createdAt),desc(warehouseCashEntries.id)).limit(51).offset((page-1)*50),
    can(auth.session.role,'leads:manage')?getDb().select().from(operationOutbox).where(sql`${operationOutbox.status} in ('failed','uncertain')`).orderBy(operationOutbox.createdAt).limit(51).offset((page-1)*50):[],
  ]);
  return NextResponse.json({withdrawals:withdrawals.slice(0,50),cash:cash.slice(0,50),outbox:outbox.slice(0,50),hasMore:[withdrawals,cash,outbox].some(r=>r.length>50),page},{headers:{'Cache-Control':'no-store'}});
}
async function POSTImpl(req:NextRequest) {
  const guard=requireDb(); if(guard) return guard;
  const auth=await requireApiPermission(req,'leads:write'); if('response' in auth) return auth.response;
  const v=await validateBody(req,payload); if(!v.ok) return v.response;
  const data=v.data;
  let result;
  if(data.action==='reserve') result=await reserveOrderStock(data.ref,auth.session,data);
  else if(data.action==='fulfill') result=await fulfillOrder(data.ref,auth.session,data);
  else if(data.action==='withdrawal') result=await actOnWithdrawal(data.id,auth.session,{...data,action:data.decision});
  else if(data.action==='cash') result=await recordWarehouseCash(auth.session,data);
  else {
    if(!can(auth.session.role,'leads:manage')) throw new BusinessRuleError('forbidden','بررسی ارسال پیامک فقط توسط مدیر انجام می‌شود.',403);
    result=await getDb().transaction(async tx=>{
      const [row]=await tx.select().from(operationOutbox).where(eq(operationOutbox.id,data.id)).for('update');
      if(!row || !['failed','uncertain'].includes(row.status)) throw new BusinessRuleError('outbox_state','این پیام نیازمند بررسی نیست.');
      const [after]=await tx.update(operationOutbox).set({status:data.decision==='confirmed_sent'?'sent':'pending',nextAttemptAt:new Date(),lastError:null})
        .where(and(eq(operationOutbox.id,row.id),eq(operationOutbox.status,row.status))).returning();
      await financialAudit(tx,auth.session.id,'outbox.reconcile','outbox',row.id,row,{...after,proof:data.proof});
      return after;
    });
  }
  return NextResponse.json({result},{status:201});
}
export const GET=withApiErrorHandling(GETImpl);
export const POST=withApiErrorHandling(POSTImpl);

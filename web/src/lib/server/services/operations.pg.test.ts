// @vitest-environment node
import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { ulid } from 'ulid';
import { createTestDb } from '@/test/db';
import type { Db } from '@/lib/server/db/client';
import * as s from '@/lib/server/db/schema';
import type { AuthUser } from '@/lib/auth/types';
import { createOrder, createWarehouseItem, updateWarehouseItem, updateOrderStatus, cancelOrder, exportOrderWarehouse } from '@/lib/server/repos/ordersRepo';
import { createSettlement, unsettledFor, voidSettlement, markSettlementPaid, warehouseAccountBalance } from '@/lib/server/repos/warehouseSettlementsRepo';
import { reserveOrderStock, fulfillOrder, requestWithdrawal, actOnWithdrawal, recordWarehouseCash } from './fulfillment.service';
import { businessOperation } from '@/lib/server/utils/businessOperation';
import { operationOutboxJob } from '@/lib/server/jobs/operationOutbox.job';
import * as sms from '@/lib/server/integrations/smsir';
let db:Db, close:()=>Promise<void>, owner:string, other:string, admin:AuthUser;
beforeAll(async()=>{
 ({db,close}=await createTestDb());
 owner=ulid();other=ulid(); const id=ulid();
 await db.insert(s.users).values([{id:owner,mobile:'09121119991'},{id:other,mobile:'09121119992'},{id,mobile:'09121119993',role:'admin'}]);
 admin={id,role:'admin',mobile:'09121119993',createdAt:new Date().toISOString()};
},120000);
afterAll(async()=>{vi.restoreAllMocks();await close();});
async function stock(tons=5){
 const item=await createWarehouseItem({ref:`WH-${ulid()}`,userId:owner,product:'میلگرد',quantityTons:tons,monthlyFeeToman:60000,arrivedAt:new Date(Date.now()-30*86400000),actorId:admin.id});
 return (await updateWarehouseItem(item.id,{status:'stored'},admin.id,'رسید ورود فیزیکی'))!.after;
}
async function order(){return createOrder({ref:`OR-${ulid()}`,userId:owner,items:[{skuId:'',name:'میلگرد',qty:5,unit:'piece',weightKg:5000,unitPrice:60000,lineTotal:300000}],terms:{currency:'TOMAN',source:'manual',total:300000},actor:admin});}
async function ship(ref:string){for(const status of ['confirmed','loading','in_transit'] as const)await updateOrderStatus(ref,status,admin);}

describe('E: financial invariants and recovery',()=>{
 it('commits lead conversion once and rolls back lead state on invalid item insertion',async()=>{
  const id=ulid();await db.insert(s.leads).values({id,ref:`LD-${id}`,contactMobile:'09121119991',userId:owner,source:'cart'});
  await expect(createOrder({ref:`OR-${ulid()}`,leadId:id,items:[{skuId:'missing',name:'x',qty:1,unit:'kg'}]})).rejects.toThrow();
  expect((await db.select().from(s.leads).where(eq(s.leads.id,id)))[0]!.status).toBe('new');
  const a=await createOrder({ref:`OR-${ulid()}`,leadId:id,userId:other,items:[]});
  const b=await createOrder({ref:`OR-${ulid()}`,leadId:id,items:[]});
  expect(b.ref).toBe(a.ref);
  const records=await db.select().from(s.orders).where(eq(s.orders.leadId,id));
  expect(records).toHaveLength(1);expect(records[0]!.userId).toBe(owner);
  expect((await db.select().from(s.leads).where(eq(s.leads.id,id)))[0]!.status).toBe('won');
 });
 it('business failure leaves no durable claim; retry is exactly once and hash conflicts reject',async()=>{
  const key=ulid();
  await expect(businessOperation(key,{x:1},async()=>{throw Error('fault');})).rejects.toThrow('fault');
  let writes=0;
  expect(await businessOperation(key,{x:1},async()=>({n:++writes}))).toEqual({n:1});
  expect(await businessOperation(key,{x:1},async()=>({n:++writes}))).toEqual({n:1});
  expect(writes).toBe(1);await expect(businessOperation(key,{x:2},async()=>({}))).rejects.toThrow();
 });
 it('partial/full release preserves all historic storage fees',async()=>{
  const item=await stock();
  expect((await unsettledFor(item)).amountToman).toBe(300000);
  const partial=(await updateWarehouseItem(item.id,{quantityTons:1},admin.id,'خروج جزئی چهار تن'))!.after;
  expect((await unsettledFor(partial)).amountToman).toBe(300000);
  const released=(await updateWarehouseItem(item.id,{status:'released'},admin.id,'رسید خروج کامل'))!.after;
  expect(released.quantityTons).toBe(0);expect(released.releasedAt).not.toBeNull();
  expect((await unsettledFor(released)).amountToman).toBe(300000);
  const movement=await db.select({sum:sql<number>`sum(${s.warehouseMovements.deltaTons})`.mapWith(Number)}).from(s.warehouseMovements).where(eq(s.warehouseMovements.warehouseItemId,item.id));
  expect(movement[0]!.sum).toBe(0);
 });
 it('rate changes do not rewrite the past; stale manual edits reject',async()=>{
  const item=await stock();
  const changed=await updateWarehouseItem(item.id,{monthlyFeeToman:120000},admin.id,'تعرفهٔ جدید از امروز',{expectedVersion:item.version});
  expect((await unsettledFor(changed!.after)).amountToman).toBe(300000);
  await expect(updateWarehouseItem(item.id,{quantityTons:1},admin.id,'اصلاح با نسخه قدیمی',{expectedVersion:item.version})).rejects.toThrow();
 });
 it('rejects request provenance from another customer without fulfilling it',async()=>{
  const id=ulid();await db.insert(s.userRequests).values({id,ref:id,userId:other,type:'warehouse',title:'test'});
  await expect(createWarehouseItem({ref:`WH-${ulid()}`,userId:owner,product:'x',quantityTons:1,requestId:id,actorId:admin.id})).rejects.toThrow();
  expect((await db.select().from(s.userRequests).where(eq(s.userRequests.id,id)))[0]!.status).toBe('submitted');
 });
 it('intake and request fulfillment replay once',async()=>{
  const id=ulid();await db.insert(s.userRequests).values({id,ref:id,userId:owner,type:'warehouse',title:'test'});
  const input={userId:owner,product:'x',quantityTons:1,requestId:id,actorId:admin.id};
  const a=await createWarehouseItem({...input,ref:`WH-${ulid()}`});const b=await createWarehouseItem({...input,ref:`WH-${ulid()}`});
  expect(a.id).toBe(b.id);expect((await db.select().from(s.userRequests).where(eq(s.userRequests.id,id)))[0]!.status).toBe('fulfilled');
 });
 it('enforces quantity, ownership, ledger and immutable evidence in SQL',async()=>{
  const item=await stock();
  await expect(db.update(s.warehouseItems).set({quantityTons:-1}).where(eq(s.warehouseItems.id,item.id))).rejects.toThrow();
  await expect(db.update(s.warehouseItems).set({quantityTons:2}).where(eq(s.warehouseItems.id,item.id))).rejects.toThrow();
  await expect(db.delete(s.warehouseMovements).where(eq(s.warehouseMovements.warehouseItemId,item.id))).rejects.toThrow();
  await expect(db.insert(s.warehouseReservations).values({id:ulid(),warehouseItemId:item.id,ownerId:other,quantityTons:1})).rejects.toThrow();
  const o=await order();await expect(db.update(s.orderItems).set({name:'changed'}).where(eq(s.orderItems.id,o.items[0]!.orderItemId!))).rejects.toThrow();
 });
 it('reserves stock, rejects oversell and cancellation releases its allocation',async()=>{
  const item=await stock(),o=await order();
  await reserveOrderStock(o.ref,admin,{operationId:ulid(),orderItemId:o.items[0]!.orderItemId!,warehouseItemId:item.id,quantityTons:4,ownerAuthorization:'مجوز کتبی مالک کالا'});
  await expect(reserveOrderStock(o.ref,admin,{operationId:ulid(),orderItemId:o.items[0]!.orderItemId!,warehouseItemId:item.id,quantityTons:2,ownerAuthorization:'مجوز کتبی مالک کالا'})).rejects.toThrow();
  await expect(updateWarehouseItem(item.id,{quantityTons:1},admin.id,'خروج بیشتر از موجودی آزاد')).rejects.toThrow();
  await cancelOrder(o.ref,admin);
  expect((await db.select().from(s.warehouseReservations).where(eq(s.warehouseReservations.warehouseItemId,item.id)))[0]!.status).toBe('released');
 });
 it('records partial delivery and completes only after all quantities arrive',async()=>{
  const item=await stock(),o=await order();const lineId=o.items[0]!.orderItemId!;
  const first=await reserveOrderStock(o.ref,admin,{operationId:ulid(),orderItemId:lineId,warehouseItemId:item.id,quantityTons:2,ownerAuthorization:'مجوز دریافت مالک'});
  const second=await reserveOrderStock(o.ref,admin,{operationId:ulid(),orderItemId:lineId,warehouseItemId:item.id,quantityTons:3,ownerAuthorization:'مجوز دریافت مالک'});
  await ship(o.ref);
  await expect(updateOrderStatus(o.ref,'delivered',admin)).rejects.toThrow();
  const input={operationId:ulid(),orderItemId:lineId,quantity:2,proof:'رسید تحویل شماره یک',reservationId:first.id,kind:'delivery' as const};
  expect((await fulfillOrder(o.ref,admin,input)).complete).toBe(false);
  await fulfillOrder(o.ref,admin,input);
  expect((await db.select().from(s.warehouseItems).where(eq(s.warehouseItems.id,item.id)))[0]!.quantityTons).toBe(3);
  expect((await fulfillOrder(o.ref,admin,{...input,operationId:ulid(),quantity:3,reservationId:second.id})).complete).toBe(true);
  await expect(cancelOrder(o.ref,admin)).rejects.toThrow();
  await fulfillOrder(o.ref,admin,{...input,operationId:ulid(),kind:'return'});
  expect((await db.select().from(s.warehouseItems).where(eq(s.warehouseItems.id,item.id)))[0]!.quantityTons).toBe(2);
 });
 it('withdrawal is owner scoped, reserves on approval, and delivers exactly once',async()=>{
  const item=await stock();
  await expect(requestWithdrawal(other,{operationId:ulid(),warehouseItemId:item.id,quantityTons:1,recipient:'گیرندهٔ غیرمجاز'})).rejects.toThrow();
  const w=await requestWithdrawal(owner,{operationId:ulid(),warehouseItemId:item.id,quantityTons:1,recipient:'نمایندهٔ مجاز مالک'});
  await actOnWithdrawal(w.id,admin,{operationId:ulid(),action:'approve',proof:'تأیید کتبی مالک'});
  const command={operationId:ulid(),action:'deliver' as const,proof:'رسید تحویل شماره ۱۲۳'};
  await actOnWithdrawal(w.id,admin,command);await actOnWithdrawal(w.id,admin,command);
  expect((await db.select().from(s.warehouseItems).where(eq(s.warehouseItems.id,item.id)))[0]!.quantityTons).toBe(4);
 });
 it('settlement replay is stable and paid void preserves customer credit',async()=>{
  const item=await stock();const operationId=ulid();
  const first=await createSettlement(item.id,admin.id,{operationId});const second=await createSettlement(item.id,admin.id,{operationId});
  expect(first!.id).toBe(second!.id);
  await markSettlementPaid(first!.id,'رسید بانکی ۱۲۳۴۵',admin.id);
  const before=await warehouseAccountBalance(owner);
  await voidSettlement(first!.id,admin.id,'اصلاح سند نگهداری');
  const after=await warehouseAccountBalance(owner);
  expect(after.billedFeeBalanceToman).toBe(before.billedFeeBalanceToman-first!.amountToman);
  const rebill=await createSettlement(item.id,admin.id);expect(rebill!.amountToman).toBe(first!.amountToman);
 });
 it('requires actual sale linkage and refuses payouts beyond credit',async()=>{
  const item=await stock();
  await expect(recordWarehouseCash(admin,{operationId:ulid(),warehouseItemId:item.id,kind:'payout',amountToman:1,proof:'رسید واریز آزمایشی'})).rejects.toThrow();
  await expect(recordWarehouseCash(admin,{operationId:ulid(),warehouseItemId:item.id,kind:'sale',amountToman:1,proof:'رسید فروش آزمایشی'})).rejects.toThrow();
 });
 it('sale reversal preserves its order linkage and cannot reverse a fee payment',async()=>{
  const item=await stock(),o=await order();
  const [row]=await db.select().from(s.orders).where(eq(s.orders.ref,o.ref));
  const original=ulid();
  await db.insert(s.warehouseCashEntries).values({id:original,warehouseItemId:item.id,ownerId:owner,orderId:row!.id,kind:'sale',amountToman:1000,proof:'سند فروش آزمون'});
  const reversal=await recordWarehouseCash(admin,{operationId:ulid(),warehouseItemId:item.id,kind:'reversal',reversesId:original,proof:'ابطال فروش آزمون'});
  expect(reversal.orderId).toBe(row!.id);
  expect(reversal.amountToman).toBe(-1000);
  const payment=ulid();
  await db.insert(s.warehouseCashEntries).values({id:payment,warehouseItemId:item.id,ownerId:owner,kind:'payment',amountToman:1000,proof:'رسید اجرت آزمون'});
  await expect(recordWarehouseCash(admin,{operationId:ulid(),warehouseItemId:item.id,kind:'reversal',reversesId:payment,proof:'ابطال غیرمجاز اجرت'})).rejects.toMatchObject({code:'invalid_reversal'});
 });
 it('exports more than 100 own orders without leaking another owner',async()=>{
  const exportOwner=ulid();await db.insert(s.users).values({id:exportOwner,mobile:'09121119994'});
  await db.insert(s.orders).values(Array.from({length:101},()=>{const id=ulid();return{id,ref:`EX-${id}`,userId:exportOwner};}));
  const result=await exportOrderWarehouse(exportOwner);expect(result.orders).toHaveLength(101);expect(result.warehouseItems).toHaveLength(0);
 });
 it('outbox records uncertain delivery and never automatically resends it',async()=>{
  const send=vi.spyOn(sms,'sendNotification').mockResolvedValue({ok:false});
  const plain=vi.spyOn(sms,'sendSms').mockResolvedValue({ok:false});
  const id=ulid();await db.insert(s.operationOutbox).values({id,mobile:'09121119991',message:'test'});
  await operationOutboxJob.run();const count=plain.mock.calls.length+send.mock.calls.length;
  await operationOutboxJob.run();expect(plain.mock.calls.length+send.mock.calls.length).toBe(count);
  expect((await db.select().from(s.operationOutbox).where(eq(s.operationOutbox.id,id)))[0]!.status).toBe('uncertain');
  send.mockRestore();plain.mockRestore();
 });
});

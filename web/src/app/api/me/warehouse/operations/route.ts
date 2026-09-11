import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { desc, eq } from 'drizzle-orm';
import { requireDb, requireApiUser, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { validateBody } from '@/lib/validation/request';
import { getDb } from '@/lib/server/db/client';
import { warehouseWithdrawals, warehouseCashEntries } from '@/lib/server/db/schema';
import { warehouseAccountBalance } from '@/lib/server/repos/warehouseSettlementsRepo';
import { requestWithdrawal, actOnWithdrawal } from '@/lib/server/services/fulfillment.service';
const payload=z.discriminatedUnion('action',[
  z.object({action:z.literal('request'),operationId:z.string().min(8).max(100),warehouseItemId:z.string().min(1).max(64),quantityTons:z.number().positive().max(100000),recipient:z.string().trim().min(5).max(1000)}),
  z.object({action:z.literal('cancel'),operationId:z.string().min(8).max(100),id:z.string().min(1).max(64),proof:z.string().trim().min(5).max(1000)}),
]);
async function GETImpl(req:NextRequest){
 const guard=requireDb();if(guard)return guard;
 const auth=await requireApiUser(req);if('response' in auth)return auth.response;
 const page=Math.max(1,Math.floor(Number(req.nextUrl.searchParams.get('page'))||1));
 const [withdrawals,cash]=await Promise.all([
  getDb().select().from(warehouseWithdrawals).where(eq(warehouseWithdrawals.ownerId,auth.session.id)).orderBy(desc(warehouseWithdrawals.createdAt),desc(warehouseWithdrawals.id)).limit(51).offset((page-1)*50),
  getDb().select({id:warehouseCashEntries.id,warehouseItemId:warehouseCashEntries.warehouseItemId,kind:warehouseCashEntries.kind,amountToman:warehouseCashEntries.amountToman,proof:warehouseCashEntries.proof,createdAt:warehouseCashEntries.createdAt}).from(warehouseCashEntries).where(eq(warehouseCashEntries.ownerId,auth.session.id)).orderBy(desc(warehouseCashEntries.createdAt),desc(warehouseCashEntries.id)).limit(51).offset((page-1)*50),
 ]);
 const balance=await warehouseAccountBalance(auth.session.id);
 return NextResponse.json({balance,withdrawals:withdrawals.slice(0,50),cash:cash.slice(0,50),hasMore:withdrawals.length>50||cash.length>50,page},{headers:{'Cache-Control':'no-store'}});
}
async function POSTImpl(req:NextRequest){
 const guard=requireDb();if(guard)return guard;
 const auth=await requireApiUser(req);if('response' in auth)return auth.response;
 const v=await validateBody(req,payload);if(!v.ok)return v.response;
 const result=v.data.action==='request'?await requestWithdrawal(auth.session.id,v.data):await actOnWithdrawal(v.data.id,auth.session,{...v.data,action:'cancel'});
 return NextResponse.json({result},{status:201});
}
export const GET=withApiErrorHandling(GETImpl);
export const POST=withApiErrorHandling(POSTImpl);

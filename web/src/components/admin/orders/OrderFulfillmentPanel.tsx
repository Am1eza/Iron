'use client';
import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Order, WarehouseItem } from '@/lib/types/domain';
import { http } from '@/lib/api/http';
import { Button } from '@/components/ui';
import { useAuthStore } from '@/lib/stores/auth';
import { can } from '@/lib/auth/roles';
import { normalizeDigits, toPersianDigits } from '@/lib/utils/format';
import ui from '../adminUi.module.css';

type Reservation = { id: string; orderItemId: string | null; warehouseItemId: string; quantityTons: number; status: string };
export function OrderFulfillmentPanel({order}:{order:Order}) {
 const [open,setOpen]=useState(false);
 return <details onToggle={e=>setOpen(e.currentTarget.open)}><summary>رزرو انبار و ثبت رسید تحویل / برگشت</summary>{open?<OrderFulfillmentForm order={order}/>:null}</details>;
}
function OrderFulfillmentForm({ order }: { order: Order }) {
 const [lineId,setLineId]=useState(order.items[0]?.orderItemId??'');
 const [qty,setQty]=useState(''); const [proof,setProof]=useState('');
 const [stockId,setStockId]=useState(''); const [search,setSearch]=useState('');
 const [reservationId,setReservationId]=useState(''); const [kind,setKind]=useState<'delivery'|'return'>('delivery');
 const key=useRef(''); const qc=useQueryClient();
 const user=useAuthStore(s=>s.user);
 const {data:stock}=useQuery({queryKey:['admin','warehouse','allocation',search],queryFn:()=>http.get<{items:WarehouseItem[]}>(`/api/admin/warehouse?q=${encodeURIComponent(search)}`)});
 const {data}=useQuery({queryKey:['admin','order-reservations',order.ref],queryFn:()=>http.get<{reservations:Reservation[]}>(`/api/admin/operations?ref=${encodeURIComponent(order.ref)}`)});
 const mutation=useMutation({mutationFn:(action:'reserve'|'fulfill')=>http.post('/api/admin/operations',{
   operationId:key.current ||= crypto.randomUUID(),action,ref:order.ref,orderItemId:lineId,
   ...(action==='reserve'?{warehouseItemId:stockId,quantityTons:Number(normalizeDigits(qty)),ownerAuthorization:proof}
    :{quantity:Number(normalizeDigits(qty)),proof,kind,reservationId:reservationId||undefined}),
 }),onSuccess:()=>{key.current='';setQty('');setProof('');void qc.invalidateQueries({queryKey:['admin','orders']});void qc.invalidateQueries({queryKey:['admin','order-reservations']});void qc.invalidateQueries({queryKey:['admin','warehouse']});}});
 const line=order.items.find(l=>l.orderItemId===lineId);
 const available=(data?.reservations??[]).filter(r=>r.orderItemId===lineId && r.status===(kind==='return'?'consumed':'reserved'));
 return <div>
  <p>تحویل کامل فقط پس از ثبت رسید همهٔ اقلام تأیید می‌شود. برگشت، سابقهٔ تحویل را حفظ می‌کند.</p>
  <label>قلم سفارش <select className={ui.select} value={lineId} onChange={e=>{setLineId(e.target.value);setReservationId('');}}>{order.items.map(l=><option key={l.orderItemId} value={l.orderItemId}>{l.name}</option>)}</select></label>
  <p>سفارش: {toPersianDigits(line?.qty??0)}؛ تحویل: {toPersianDigits(line?.deliveredQty??0)}؛ برگشت: {toPersianDigits(line?.returnedQty??0)} {line?.unit}</p>
  <label>مقدار <input className={ui.numInput} inputMode="decimal" value={qty} onChange={e=>setQty(e.target.value)}/></label>
  <label>شمارهٔ رسید / مجوز مالک و توضیح <input className={ui.textCell} maxLength={1000} value={proof} onChange={e=>setProof(e.target.value)}/></label>
  <fieldset><legend>رزرو (مقدار بالا به تن)</legend>
   <label>جستجوی کالای انبار <input className={ui.textCell} value={search} onChange={e=>setSearch(e.target.value)} placeholder="نام کالا یا کد انبار"/></label>
   <label>کالای انبار <select className={ui.select} value={stockId} onChange={e=>setStockId(e.target.value)}><option value="">انتخاب کالا</option>{stock?.items.map(s=><option key={s.id} value={s.id}>{s.product} — {s.ref} — {s.quantityTons} تن</option>)}</select></label>
   <Button size="sm" disabled={!stockId||proof.trim().length<5||!qty||mutation.isPending} onClick={()=>mutation.mutate('reserve')}>ثبت رزرو با مجوز مالک</Button>
  </fieldset>
  <fieldset><legend>رسید (مقدار بالا به {line?.unit})</legend>
   <label>نوع رسید <select className={ui.select} value={kind} onChange={e=>{setKind(e.target.value as 'delivery'|'return');setReservationId('');}}><option value="delivery">تحویل به مشتری</option>{can(user?.role,'leads:manage')?<option value="return">برگشت از مشتری</option>:null}</select></label>
   <label>رزرو مرتبط <select className={ui.select} value={reservationId} onChange={e=>setReservationId(e.target.value)}><option value="">تأمین مستقیم، بدون برداشت از انبار امانی</option>{available.map(r=><option key={r.id} value={r.id}>{r.quantityTons} تن — {stock?.items.find(s=>s.id===r.warehouseItemId)?.product??'کالای رزروشده'}</option>)}</select></label>
   <Button size="sm" disabled={proof.trim().length<5||!qty||mutation.isPending} onClick={()=>mutation.mutate('fulfill')}>ثبت رسید {kind==='delivery'?'تحویل':'برگشت'}</Button>
  </fieldset>
  {mutation.isError?<p role="alert">{mutation.error.message} <button onClick={()=>{key.current='';mutation.reset();}}>شروع عملیات تازه پس از بررسی نتیجهٔ قبلی</button></p>:null}
  {mutation.isSuccess?<p role="status">عملیات ثبت شد؛ موجودی و سابقه به‌روزرسانی شدند.</p>:null}
 </div>;
}

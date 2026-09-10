'use client';
import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { http } from '@/lib/api/http';
import type { WarehouseItem } from '@/lib/types/domain';
import { Button } from '@/components/ui';
import { formatToman, normalizeDigits } from '@/lib/utils/format';
import { useAuthStore } from '@/lib/stores/auth';
import { can } from '@/lib/auth/roles';
import ui from '@/components/admin/adminUi.module.css';

type Withdrawal={id:string;warehouseItemId:string;quantityTons:number;recipient:string;status:string;proof?:string};
type Cash={id:string;warehouseItemId:string;kind:string;amountToman:number;proof:string};
type Outbox={id:string;message:string;lastError:string;status:string};
const labels:Record<string,string>={requested:'در انتظار تأیید',approved:'رزروشده',delivered:'تحویل‌شده',cancelled:'لغوشده',sale:'وجه فروش',payout:'واریز به مالک',payment:'پرداخت اجرت',refund:'بازپرداخت اعتبار',reversal:'سند اصلاحی'};
export function WarehouseOperationsPanel({items,staff=false}:{items:WarehouseItem[];staff?:boolean}){
 const [page,setPage]=useState(1),[stockId,setStockId]=useState(''),[qty,setQty]=useState(''),[recipient,setRecipient]=useState('');
 const [proof,setProof]=useState(''),[amount,setAmount]=useState(''),[orderRef,setOrderRef]=useState('');
 const key=useRef(''),qc=useQueryClient(); const user=useAuthStore(s=>s.user); const manager=staff&&can(user?.role,'leads:manage');
 const endpoint=staff?'/api/admin/operations':'/api/me/warehouse/operations';
 const query=useQuery({queryKey:[staff?'admin':'me','warehouse-operations',page],queryFn:()=>http.get<{withdrawals:Withdrawal[];cash:Cash[];outbox?:Outbox[];hasMore:boolean;balance?:{billedFeeBalanceToman:number;salePayableToman:number}}>(`${endpoint}?page=${page}`)});
 const mutation=useMutation({mutationFn:(payload:Record<string,unknown>)=>http.post(endpoint,{...payload,operationId:key.current ||= crypto.randomUUID()}),onSuccess:()=>{key.current='';void query.refetch();void qc.invalidateQueries({queryKey:['admin','warehouse']});}});
 const write=(payload:Record<string,unknown>)=>mutation.mutate(payload);
 const title=(id:string)=>items.find(i=>i.id===id)?.product??'کالای ثبت‌شده';
 return <section aria-label="برداشت و گردش حساب انبار">
  <h2>برداشت کالا و گردش حساب</h2>
  {query.data?.balance?<p>ماندهٔ صورتحساب نگهداری: {formatToman(query.data.balance.billedFeeBalanceToman)} (مبلغ منفی یعنی اعتبار شما)؛ وجه فروش قابل پرداخت به شما: {formatToman(query.data.balance.salePayableToman)}</p>:null}
  {!staff?<fieldset><legend>درخواست برداشت از موجودی خودتان</legend>
   <label>کالا <select className={ui.select} value={stockId} onChange={e=>setStockId(e.target.value)}><option value="">انتخاب کالا</option>{items.filter(i=>['stored','selling'].includes(i.status)).map(i=><option key={i.id} value={i.id}>{i.product} — {i.ref}</option>)}</select></label>
   <label>مقدار به تن <input className={ui.numInput} inputMode="decimal" value={qty} onChange={e=>setQty(e.target.value)}/></label>
   <label>نام گیرنده و مشخصات تحویل <input className={ui.textCell} value={recipient} onChange={e=>setRecipient(e.target.value)}/></label>
   <Button size="sm" disabled={!stockId||!qty||recipient.trim().length<5||mutation.isPending} onClick={()=>write({action:'request',warehouseItemId:stockId,quantityTons:Number(normalizeDigits(qty)),recipient})}>ثبت درخواست برداشت</Button>
   <p>درخواست پس از بررسی موجودی و تأیید کارشناس رزرو می‌شود؛ ثبت درخواست به‌معنی تحویل کالا نیست.</p>
  </fieldset>:null}
  <label>شرح عملیات / شمارهٔ رسید برای تأیید، تحویل یا لغو <input className={ui.textCell} maxLength={1000} value={proof} onChange={e=>setProof(e.target.value)}/></label>
  {query.isPending?<p role="status">در حال دریافت سوابق…</p>:null}
  {query.isError?<p role="alert">دریافت سوابق ناموفق بود. <button onClick={()=>void query.refetch()}>تلاش دوباره</button></p>:null}
  <ul>{query.data?.withdrawals.map(w=><li key={w.id}>{title(w.warehouseItemId)} — {w.quantityTons} تن — گیرنده: {w.recipient} — {labels[w.status]}
   {staff&&w.status==='requested'?<Button size="sm" disabled={proof.trim().length<5||mutation.isPending} onClick={()=>write({action:'withdrawal',id:w.id,decision:'approve',proof})}>تأیید و رزرو</Button>:null}
   {staff&&w.status==='approved'?<Button size="sm" disabled={proof.trim().length<5||mutation.isPending} onClick={()=>write({action:'withdrawal',id:w.id,decision:'deliver',proof})}>ثبت رسید تحویل</Button>:null}
   {['requested','approved'].includes(w.status)?<Button size="sm" variant="ghost" disabled={proof.trim().length<5||mutation.isPending} onClick={()=>write(staff?{action:'withdrawal',id:w.id,decision:'cancel',proof}:{action:'cancel',id:w.id,proof})}>لغو درخواست</Button>:null}
  </li>)}</ul>
  {manager?<fieldset><legend>ثبت سند فروش یا واریز انجام‌شده</legend>
   <p>این فرم انتقال بانکی انجام نمی‌دهد؛ فقط سند تأییدشدهٔ فروش یا رسید واریز را ثبت می‌کند.</p>
   <label>کالا <select className={ui.select} value={stockId} onChange={e=>setStockId(e.target.value)}><option value="">انتخاب کالا</option>{items.map(i=><option key={i.id} value={i.id}>{i.product} — {i.ref}</option>)}</select></label>
   <label>مبلغ تومان <input className={ui.numInput} inputMode="numeric" value={amount} onChange={e=>setAmount(e.target.value)}/></label>
   <label>کد سفارش مرتبط با فروش <input className={ui.textCell} value={orderRef} onChange={e=>setOrderRef(e.target.value)}/></label>
   <Button size="sm" disabled={!stockId||!amount||!orderRef||proof.trim().length<5||mutation.isPending} onClick={()=>write({action:'cash',kind:'sale',warehouseItemId:stockId,amountToman:Number(normalizeDigits(amount)),orderRef,proof})}>ثبت وجه فروش</Button>
   <Button size="sm" disabled={!stockId||!amount||proof.trim().length<5||mutation.isPending} onClick={()=>write({action:'cash',kind:'payout',warehouseItemId:stockId,amountToman:Number(normalizeDigits(amount)),proof})}>ثبت واریز به مالک</Button>
  </fieldset>:null}
  <h3>گردش وجوه ثبت‌شده</h3>
  <ul>{query.data?.cash.map(c=><li key={c.id}>{title(c.warehouseItemId)} — {labels[c.kind]} — {formatToman(c.amountToman)} — {c.proof}
   {manager&&['sale','payout'].includes(c.kind)?<Button size="sm" variant="ghost" disabled={proof.trim().length<5||mutation.isPending} onClick={()=>write({action:'cash',kind:'reversal',warehouseItemId:c.warehouseItemId,reversesId:c.id,proof})}>ثبت سند اصلاحی</Button>:null}
  </li>)}</ul>
  {manager&&query.data?.outbox?.length?<><h3>پیامک‌های نیازمند بررسی</h3><p>ابتدا گزارش سرویس پیامک را بررسی کنید؛ عدم دریافت پاسخ، اثبات عدم ارسال نیست.</p><ul>{query.data.outbox.map(o=><li key={o.id}>{o.message} — {o.lastError}
   <Button size="sm" disabled={proof.trim().length<5||mutation.isPending} onClick={()=>write({action:'outbox',id:o.id,decision:'confirmed_sent',proof})}>ارسال در گزارش سرویس تأیید شد</Button>
   <Button size="sm" disabled={proof.trim().length<5||mutation.isPending} onClick={()=>write({action:'outbox',id:o.id,decision:'confirmed_not_sent',proof})}>عدم ارسال تأیید شد؛ تکرار ارسال</Button>
  </li>)}</ul></>:null}
  {mutation.isError?<p role="alert">{mutation.error.message} <button onClick={()=>{key.current='';mutation.reset();}}>پس از بررسی نتیجه، عملیات تازه آغاز شود</button></p>:null}
  {mutation.isSuccess?<p role="status">عملیات ثبت شد.</p>:null}
  <Button size="sm" disabled={page===1} onClick={()=>setPage(page-1)}>صفحهٔ قبل</Button>
  <Button size="sm" disabled={!query.data?.hasMore} onClick={()=>setPage(page+1)}>صفحهٔ بعد</Button>
 </section>;
}

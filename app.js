/* WNM-Educational Measurement and Evaluation Section Ver.1 — ระบบรับ–ส่งและตรวจสอบวุฒิการศึกษา (Prototype, เก็บข้อมูลในเบราว์เซอร์) */
'use strict';

/* ---------- ค่าคงที่ ---------- */
const KEY = 'vethi-verify-v1';
const TH_M = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
const TH_MS = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
const PREFIX_RE = /^(ว่าที่ร้อยตรีหญิง|ว่าที่ร้อยตรี|ว่าที่ ร\.ต\.หญิง|ว่าที่ ร\.ต\.|จ่าสิบเอก|สิบเอก|สิบโท|สิบตรี|พลทหาร|ร้อยตรี|ร้อยโท|ร้อยเอก|เด็กชาย|เด็กหญิง|นางสาว|นาย|นาง|ด\.ช\.|ด\.ญ\.|น\.ส\.)\s*/;
const RESULT = {
  pending:  { t: 'รอตรวจสอบ',          c: 'warn' },
  found:    { t: 'สำเร็จการศึกษาจริง',  c: 'ok' },
  mismatch: { t: 'ข้อมูลไม่ตรงกัน',     c: 'info' },
  notfound: { t: 'ไม่พบข้อมูล',        c: 'danger' }
};
const LETTER_RESULT = {
  found: 'สำเร็จการศึกษาจริง',
  mismatch: 'ข้อมูลไม่ตรงกับหลักฐานของโรงเรียน',
  notfound: 'ไม่พบหลักฐานการสำเร็จการศึกษา',
  pending: 'อยู่ระหว่างตรวจสอบ'
};
const STATUS = {
  submitted: { t: 'ส่งคำขอแล้ว รอเจ้าหน้าที่รับ', c: 'info', step: 0 },
  returned: { t: 'ส่งกลับให้แก้ไข', c: 'danger', step: 0 },
  received: { t: 'รับหนังสือแล้ว',      c: 'info', step: 1 },
  checking: { t: 'กำลังตรวจสอบ',       c: 'warn', step: 2 },
  done:     { t: 'ตรวจสอบเสร็จ',        c: 'ok',   step: 3 },
  replied:  { t: 'ส่งหนังสือตอบแล้ว',    c: 'ok',   step: 4 }
};
const STEPS = ['ยื่นคำขอ', 'รับหนังสือ', 'กำลังตรวจสอบ', 'ตรวจสอบเสร็จ', 'ส่งหนังสือตอบ'];
const VIEWS = [
  ['dash', '📊 Dashboard'], ['receive', '📥 รับหนังสือ'], ['outgoing', '📤 หนังสือส่งออก'],
  ['verify', '🔍 ตรวจสอบ'], ['grads', '🎓 ฐานข้อมูลผู้สำเร็จการศึกษา'], ['fees', '💳 ค่าบำรุงการศึกษา'],
  ['track', '🧭 ติดตามสถานะ'], ['reports', '📈 รายงาน'], ['settings', '⚙️ ตั้งค่า']
];

let inFrame = true;
try { inFrame = window.self !== window.top; } catch (e) { inFrame = true; }
const canPrint = !inFrame;

/* ---------- ตัวช่วย ---------- */
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const uid = p => p + Math.random().toString(36).slice(2, 9);
const thaiDigits = s => String(s ?? '').replace(/[๐-๙]/g, d => '๐๑๒๓๔๕๖๗๘๙'.indexOf(d));
const digits = s => thaiDigits(s).replace(/\D/g, '');
const money = n => Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const isoOf = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const todayISO = () => isoOf(new Date());
const beYear = () => new Date().getFullYear() + 543;
function fmtBE(iso) { if (!iso) return '-'; const [y, m, d] = iso.split('-'); return `${d}/${m}/${+y + 543}`; }
function fmtLong(iso) { if (!iso) return '-'; const [y, m, d] = iso.split('-'); return `${+d} ${TH_M[+m - 1]} ${+y + 543}`; }
function fmtDT(ts) { const d = new Date(ts); return `${d.getDate()} ${TH_MS[d.getMonth()]} ${d.getFullYear() + 543} · ${pad(d.getHours())}:${pad(d.getMinutes())} น.`; }
const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const MONTH_RE = new RegExp('(\\d{1,2})\\s*(' + [...TH_M, ...TH_MS].map(reEsc).join('|') + ')\\s*(?:พ\\.ศ\\.\\s*)?(\\d{4})');
function mkISO(y, m, d) {
  y = +y; m = +m; d = +d;
  if (y > 2400) y -= 543;
  if (!(y > 1900 && y < 2200 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return '';
  return `${y}-${pad(m)}-${pad(d)}`;
}
function findDate(str) {
  const s = thaiDigits(str);
  let m = s.match(MONTH_RE);
  if (m) { let i = TH_M.indexOf(m[2]); if (i < 0) i = TH_MS.indexOf(m[2]); return mkISO(m[3], i + 1, m[1]); }
  m = s.match(/(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})/);
  if (m) return mkISO(m[3], m[2], m[1]);
  m = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return mkISO(m[1], m[2], m[3]);
  return '';
}
function parseDateAny(v) {
  const s = thaiDigits(v).trim();
  if (/^\d{5}(\.\d+)?$/.test(s)) { const d = new Date(Math.round((+s - 25569) * 864e5)); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }
  return findDate(s);
}
function splitName(full) {
  let s = String(full || '').trim().replace(/\s+/g, ' ');
  let prefix = '';
  const m = s.match(PREFIX_RE);
  if (m) { prefix = m[1]; s = s.slice(m[0].length).trim(); }
  const i = s.indexOf(' ');
  return { prefix, fname: i < 0 ? s : s.slice(0, i), lname: i < 0 ? '' : s.slice(i + 1) };
}
const CID_RE = /\d[-\s]?\d{4}[-\s]?\d{5}[-\s]?\d{2}[-\s]?\d/;
function splitIds(str) {
  const s = thaiDigits(str);
  let cid = '', rest = s;
  const m = s.match(CID_RE);
  if (m) { cid = digits(m[0]); rest = s.replace(m[0], ' '); }
  const sm = rest.match(/\d{3,7}/);
  return { cid, sid: sm ? sm[0] : '' };
}
function normLevel(s) {
  const t = thaiDigits(s);
  const d = t.match(/[1-6]/);
  return d ? 'ม.' + d[0] : String(s || '').trim();
}
const normName = s => String(s || '').replace(PREFIX_RE, '').replace(/\s+/g, '');
const sidKey = s => digits(s).replace(/^0+/, '');
function maskCid(c) { c = digits(c); if (c.length !== 13) return c || '-'; return `${c[0]}-${c.slice(1, 5)}-xxxxx-${c.slice(10, 12)}-${c[12]}`; }
const fullName = s => `${s.prefix || ''}${s.fname} ${s.lname}`.trim();

function parseCSV(text) {
  text = String(text || '').replace(/^﻿/, '');
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n') { row.push(f); rows.push(row); row = []; f = ''; }
    else if (c !== '\r') f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows.filter(r => r.some(x => String(x).trim()));
}

/* ---------- ข้อมูล ---------- */
/* ---------- โหมดออนไลน์ (Supabase) — ใช้เมื่อมี config.js ที่ใส่ URL และ anon key ---------- */
const CFG = window.WNM_CONFIG || {};
const CLOUD = !!(CFG.supabaseUrl && CFG.supabaseAnonKey && !/วาง|PASTE|xxxx/i.test(CFG.supabaseAnonKey) && window.supabase && window.supabase.createClient);
const sb = CLOUD ? window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true } }) : null;
const isUuid = v => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || ''));
const synced = { students: new Map(), fees: new Map(), requests: new Map(), settings: '' };
const SYNC = { state: 'ok', msg: '' };
function emptyState() { return { v: 1, settings: defaultSettings(), students: [], fees: [], requests: [], agencies: [], staffList: [] }; }
function seenGet(id) { try { return +localStorage.getItem('wnm-seen-' + id) || 0; } catch (e) { return 0; } }
function seenSet(id, t) { try { localStorage.setItem('wnm-seen-' + id, String(t)); } catch (e) { /* ไม่มีที่เก็บในเครื่อง */ } }
const mapProfile = p => ({ id: p.id, name: p.agency_name || p.email, email: p.email, phone: p.phone || '', contact: p.contact || '', address: p.address || '', approved: !!p.approved, role: p.role, createdAt: new Date(p.created_at).getTime(), lastSeen: seenGet(p.id) });
const cloudMsg = e => { const m = (e && (e.message || e.error_description)) || String(e); return /Failed to fetch|NetworkError/i.test(m) ? 'เชื่อมต่อ Supabase ไม่ได้ ตรวจสอบอินเทอร์เน็ต' : m; };

async function selectAll(table) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from(table).select('id,data').range(from, from + 999);
    if (error) throw error;
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}
function markSynced() {
  for (const t of ['students', 'fees', 'requests']) synced[t] = new Map(S[t].map(o => [o.id, JSON.stringify(o)]));
  synced.settings = JSON.stringify(S.settings);
}
async function cloudLoadStaff() {
  const [st, stu, fee, req, prof] = await Promise.all([
    sb.from('settings').select('data').eq('id', 1).maybeSingle(), selectAll('students'), selectAll('fees'), selectAll('requests'),
    sb.from('profiles').select('*').order('created_at')
  ]);
  if (st.error) throw st.error;
  if (prof.error) throw prof.error;
  S = emptyState();
  S.settings = Object.assign(defaultSettings(), (st.data && st.data.data) || {});
  S.students = stu.map(r => r.data); S.fees = fee.map(r => r.data); S.requests = req.map(r => r.data);
  S.staffList = prof.data.filter(p => p.role === 'staff').map(mapProfile);
  S.agencies = prof.data.filter(p => p.role === 'agency').map(mapProfile);
  migrateState();
  markSynced();
  if (!st.data || !Object.keys(st.data.data || {}).length) cloudQueueSave();
}
async function cloudLoadAgencyReqs() {
  const { data, error } = await sb.rpc('my_requests');
  if (error) throw error;
  S.requests = Array.isArray(data) ? data : [];
}
async function cloudLoadAgency(profile) {
  S = emptyState();
  const ps = await sb.rpc('public_settings');
  if (!ps.error && ps.data) for (const [k, v] of Object.entries(ps.data)) if (v) S.settings[k] = v;
  S.agencies = [mapProfile(profile)];
  await cloudLoadAgencyReqs();
}
function rowFor(t, o) {
  const base = { id: o.id, data: o, updated_at: new Date().toISOString() };
  if (t === 'requests') Object.assign(base, { agency_id: isUuid(o.agencyId) ? o.agencyId : null, email: String(o.email || '').toLowerCase() || null, status: o.status || null });
  return base;
}
let saveTimer = null, saving = false, saveAgain = false;
function cloudQueueSave() { clearTimeout(saveTimer); setSync('pending'); saveTimer = setTimeout(cloudSave, 600); }
async function cloudSave() {
  saveTimer = null;
  if (saving) { saveAgain = true; return; }
  saving = true; setSync('saving');
  try {
    for (const t of ['students', 'fees', 'requests']) {
      const cur = new Map(S[t].map(o => [o.id, JSON.stringify(o)]));
      const up = [];
      for (const [id, js] of cur) if (synced[t].get(id) !== js) up.push(rowFor(t, JSON.parse(js)));
      const del = [...synced[t].keys()].filter(id => !cur.has(id));
      for (let i = 0; i < up.length; i += 300) { const { error } = await sb.from(t).upsert(up.slice(i, i + 300)); if (error) throw error; }
      for (let i = 0; i < del.length; i += 200) { const { error } = await sb.from(t).delete().in('id', del.slice(i, i + 200)); if (error) throw error; }
      synced[t] = cur;
    }
    const sj = JSON.stringify(S.settings);
    if (sj !== synced.settings) { const { error } = await sb.from('settings').upsert({ id: 1, data: S.settings, updated_at: new Date().toISOString() }); if (error) throw error; synced.settings = sj; }
    setSync('ok');
  } catch (e) {
    setSync('error', cloudMsg(e)); toast('บันทึกขึ้นระบบไม่สำเร็จ: ' + cloudMsg(e), 'err');
  } finally {
    saving = false;
    if (saveAgain) { saveAgain = false; cloudSave(); }
  }
}
function syncChip() {
  const t = { pending: '⏳ รอบันทึก', saving: '⏳ กำลังบันทึก…', ok: '☁️ บันทึกแล้ว', error: '⚠️ บันทึกไม่สำเร็จ' }[SYNC.state] || '☁️ ออนไลน์';
  return `<span id="sync-chip" class="sync ${SYNC.state}" title="${esc(SYNC.msg || 'ข้อมูลเก็บบน Supabase')}">${t}</span>`;
}
function setSync(state, msg) { SYNC.state = state; SYNC.msg = msg || ''; const el = $('#sync-chip'); if (el) el.outerHTML = syncChip(); }
window.addEventListener('beforeunload', e => { if (CLOUD && (saving || SYNC.state === 'pending')) { e.preventDefault(); e.returnValue = ''; } });

async function fetchProfile() {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const { data, error } = await sb.from('profiles').select('*').eq('id', user.id).maybeSingle();
  if (error) throw error;
  return data;
}
async function cloudEnter(profile) {
  if (!profile) throw new Error('ไม่พบข้อมูลบัญชีในระบบ');
  if (profile.role === 'staff') {
    if (!profile.approved) { await sb.auth.signOut(); throw new Error('บัญชีเจ้าหน้าที่นี้ถูกระงับ'); }
    await cloudLoadStaff();
    Object.assign(U, { me: profile, staffAuth: true, agencyId: null, mode: 'staff', view: U.view || 'dash' });
  } else {
    if (!profile.approved) { await sb.auth.signOut(); throw new Error('บัญชีหน่วยงานรอเจ้าหน้าที่โรงเรียนอนุมัติ เมื่ออนุมัติแล้วจึงจะเข้าสู่ระบบได้'); }
    await cloudLoadAgency(profile);
    Object.assign(U, { me: profile, agencyId: profile.id, staffAuth: false, mode: 'agency', aView: 'home', adraft: null });
  }
}
async function cloudLogin(email, pw, expectRole) {
  const { error } = await sb.auth.signInWithPassword({ email, password: pw });
  if (error) throw new Error(/Invalid login/i.test(error.message) ? 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' : /not confirmed/i.test(error.message) ? 'ยังไม่ได้ยืนยันอีเมล กดลิงก์ยืนยันในอีเมลก่อน' : cloudMsg(error));
  const prof = await fetchProfile();
  if (expectRole === 'staff' && prof && prof.role !== 'staff') { await sb.auth.signOut(); throw new Error('บัญชีนี้ไม่ใช่บัญชีเจ้าหน้าที่ ใช้หน้าเข้าสู่ระบบของหน่วยงานภายนอก'); }
  if (expectRole === 'agency' && prof && prof.role === 'staff') { await sb.auth.signOut(); throw new Error('บัญชีนี้เป็นบัญชีเจ้าหน้าที่ ใช้หน้าเข้าสู่ระบบเจ้าหน้าที่'); }
  await cloudEnter(prof);
}
async function cloudBoot() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return;
  try { await cloudEnter(await fetchProfile()); } catch (e) { U.authErr = cloudMsg(e); }
}
async function cloudSubmitRequest(d, fields) {
  const me = U.agencyId, rid = d.editingId || (crypto.randomUUID ? crypto.randomUUID() : uid('r'));
  const atts = [];
  let i = 0;
  for (const f of d.files) {
    if (f.path) { atts.push({ name: f.name, size: f.size, type: f.type, path: f.path }); continue; }
    if (!f.data) continue;
    const ext = (f.name.match(/\.[A-Za-z0-9]{1,6}$/) || [''])[0].toLowerCase();
    const path = `${me}/${rid}/${Date.now()}_${i++}${ext}`;
    const { error } = await sb.storage.from('attachments').upload(path, dataURLtoBlob(f.data), { contentType: f.type || 'application/octet-stream', upsert: false });
    if (error) throw new Error(`อัปโหลดไฟล์ ${f.name} ไม่สำเร็จ: ${cloudMsg(error)}`);
    atts.push({ name: f.name, size: f.size, type: f.type, path });
  }
  const { error } = await sb.rpc('submit_request', { p: Object.assign({}, fields, { id: rid, attachments: atts }) });
  if (error) throw new Error(cloudMsg(error));
  await cloudLoadAgencyReqs();
  return rid;
}
async function cloudDownload(bucket, path) {
  const { data, error } = await sb.storage.from(bucket).download(path);
  if (error) throw new Error(cloudMsg(error));
  return data;
}
/* หนังสือตอบ: เก็บผลแบบเปิดเผยได้ไว้ในคำขอ และอัปโหลด PDF ให้หน่วยงานดาวน์โหลด */
function snapshotPublic(r) {
  r.publicResults = r.persons.map(p => { const s = getStu(p.matchedId); return { name: pName(p), result: p.result, note: letterNote(p), gpa: showGpa(r) && s && p.result !== 'notfound' ? (s.gpa || '') : '' }; });
}
async function publishReply(r) {
  if (!CLOUD) return;
  try {
    const blob = await replyPDF(r);
    const { error } = await sb.storage.from('replies').upload(`${r.id}.pdf`, blob, { contentType: 'application/pdf', upsert: true });
    if (error) throw error;
    r.replyPdf = true; save();
  } catch (e) { toast('อัปโหลดหนังสือตอบ PDF ให้หน่วยงานไม่สำเร็จ: ' + cloudMsg(e) + ' (กดบันทึกส่งใหม่ได้ที่หน้าหนังสือ)', 'err'); }
}
async function cloudPoll() {
  if (!CLOUD || saving || SYNC.state === 'pending' || document.hidden) return;
  const typing = () => { const a = document.activeElement; return (a && /INPUT|TEXTAREA|SELECT/.test(a.tagName)) || !!U.letterId; };
  try {
    if (U.mode === 'staff' && U.staffAuth) {
      const rows = await selectAll('requests');
      let changed = false;
      rows.forEach(row => {
        const js = JSON.stringify(row.data), idx = S.requests.findIndex(o => o.id === row.id);
        if (idx < 0) { S.requests.push(row.data); synced.requests.set(row.id, js); changed = true; }
        else if (synced.requests.get(row.id) === JSON.stringify(S.requests[idx]) && synced.requests.get(row.id) !== js) { S.requests[idx] = row.data; synced.requests.set(row.id, js); changed = true; }
      });
      const prof = await sb.from('profiles').select('*').order('created_at');
      if (!prof.error) {
        const ag = prof.data.filter(p => p.role === 'agency').map(mapProfile);
        if (JSON.stringify(ag.map(a => [a.id, a.approved])) !== JSON.stringify(S.agencies.map(a => [a.id, a.approved]))) { S.agencies = ag; S.staffList = prof.data.filter(p => p.role === 'staff').map(mapProfile); changed = true; }
      }
      if (changed && !typing()) render();
    } else if (U.mode === 'agency' && U.agencyId) {
      const before = JSON.stringify(S.requests);
      await cloudLoadAgencyReqs();
      if (before !== JSON.stringify(S.requests) && !typing()) render();
    }
  } catch (e) { /* ลองใหม่รอบถัดไป */ }
}
if (CLOUD) setInterval(cloudPoll, 45000);

let storageOK = true;
function load() { try { const t = localStorage.getItem(KEY); return t ? JSON.parse(t) : null; } catch (e) { storageOK = false; return null; } }
function save() {
  if (CLOUD) {
    if (typeof U === 'undefined') return;
    if (U.mode === 'staff' && U.staffAuth) cloudQueueSave();
    else if (U.agencyId) { const a = curAgency(); if (a) seenSet(a.id, a.lastSeen || 0); }
    return;
  }
  try { localStorage.setItem(KEY, JSON.stringify(S)); storageOK = true; } catch (e) { storageOK = false; }
}

function defaultSettings() {
  return {
    school: 'โรงเรียนวรราชาทินัดดามาตุวิทยา',
    address: '59 หมู่ 2 ตำบลคลองพระอุดม\nอำเภอลาดหลุมแก้ว จังหวัดปทุมธานี 12140',
    docPrefix: 'ศธ 04314.09/',
    director: 'นายธัชวรรธน์ เจริญภิรมย์บวร',
    directorTitle: 'ผู้อำนวยการโรงเรียนวรราชาทินัดดามาตุวิทยา',
    office: 'กลุ่มบริหารวิชาการ งานทะเบียนและวัดผล',
    phone: '0 2011 0991',
    fax: '',
    email: 'watpol@wnm.ac.th',
    contact: '',
    thaiNum: true,
    nextReg: 50,
    nextOut: 121,
    outFrom: 121,
    outTo: 200
  };
}

function seed() {
  const st = [
    ['10231', '1129900123451', 'นาย', 'ธนกฤต', 'ศรีสมบูรณ์', 'ม.6', '2026-03-31', '3.45'],
    ['10232', '1129900123462', 'นางสาว', 'พิมพ์ชนก', 'แก้วประเสริฐ', 'ม.6', '2026-03-31', '3.82'],
    ['10245', '1129900123473', 'นาย', 'ภูมิพัฒน์', 'วงศ์ทอง', 'ม.6', '2026-03-31', '2.97'],
    ['10250', '1129900123484', 'นางสาว', 'ณัฐธิดา', 'บุญมา', 'ม.6', '2026-03-31', '3.21'],
    ['09812', '1129900123495', 'นาย', 'กิตติภพ', 'จันทร์หอม', 'ม.6', '2025-03-31', '3.05'],
    ['09820', '1129900123506', 'นางสาว', 'ศิริญา', 'ทองดี', 'ม.6', '2025-03-31', '3.67'],
    ['09833', '1129900123517', 'นาย', 'อนุชา', 'พรหมมา', 'ม.6', '2025-03-31', '2.54'],
    ['11402', '1129900123528', 'เด็กหญิง', 'ปาณิสรา', 'สุขเจริญ', 'ม.3', '2026-03-31', '3.90'],
    ['11415', '1129900123539', 'เด็กชาย', 'วรเมธ', 'นาคสวัสดิ์', 'ม.3', '2026-03-31', '2.88'],
    ['11420', '1129900123540', 'เด็กหญิง', 'กัญญาณัฐ', 'ศรีสุข', 'ม.3', '2026-03-31', '3.12'],
    ['09104', '1129900123551', 'นางสาว', 'มณีรัตน์', 'อินทร์แก้ว', 'ม.6', '2024-03-31', '3.40'],
    ['09117', '1129900123562', 'นาย', 'ชยพล', 'ประเสริฐสุข', 'ม.6', '2024-03-31', '2.76']
  ];
  const students = st.map(a => ({ id: uid('s'), sid: a[0], cid: a[1], prefix: a[2], fname: a[3], lname: a[4], level: a[5], gradDate: a[6], gpa: a[7], dob: '', father: '', mother: '', source: 'ตัวอย่าง' }));
  students.forEach((s, i) => { if (i % 5 !== 4) { s.pp1Set = String(12 + Math.floor(i / 4)).padStart(5, '0'); s.pp1No = String(345 + i * 7).padStart(6, '0'); } });
  const bySid = sid => students.find(s => s.sid === sid);
  const fees = [
    { id: uid('f'), studentId: bySid('10245').id, term: '2/2568', item: 'ค่าบำรุงการศึกษา', amount: 3500, paid: 1500, note: '' },
    { id: uid('f'), studentId: bySid('09833').id, term: '2/2567', item: 'ค่าบำรุงการศึกษา', amount: 3500, paid: 0, note: '' },
    { id: uid('f'), studentId: bySid('09833').id, term: '2/2567', item: 'ค่ากิจกรรมพัฒนาผู้เรียน', amount: 800, paid: 0, note: '' },
    { id: uid('f'), studentId: bySid('10250').id, term: '2/2568', item: 'ค่าบำรุงการศึกษา', amount: 3500, paid: 3500, note: 'ชำระครบ' }
  ];
  const P = (sid, fname, lname, gradDate, level, prefix = '') => ({ id: uid('p'), sid, prefix, fname, lname, gradDate, gradText: gradDate ? fmtBE(gradDate) : '', level, result: 'pending', matchedId: null, auto: '', note: '', manual: false });
  const ts = (iso, hh) => new Date(iso + 'T' + (hh || '09:30') + ':00').getTime();
  const requests = [
    { id: uid('r'), regNo: '41/2569', recvDate: '2026-08-18', agency: 'บริษัท ไทยสมาร์ท โลจิสติกส์ จำกัด', to: 'ผู้จัดการฝ่ายทรัพยากรบุคคล บริษัท ไทยสมาร์ท โลจิสติกส์ จำกัด', docNo: 'TSL-HR 045/2569', docDate: '2026-08-12', email: 'hr@thaismart.example.com', aaddr: '99/9 ถนนบางนา-ตราด แขวงบางนาใต้\nเขตบางนา กรุงเทพมหานคร 10260', form: 2, file: '',
      persons: [P('09820', 'ศิริญา', 'ทองดี', '2025-03-31', 'ม.6'), P('09833', 'อนุชา', 'พรหมมา', '2025-03-31', 'ม.6')],
      status: 'replied', outNo: '118/2569', outDate: '2026-08-22', sentDate: '2026-08-22',
      timeline: [{ t: ts('2026-08-18'), text: 'รับหนังสือ เลขทะเบียนรับ 41/2569', pub: true }, { t: ts('2026-08-19', '10:15'), text: 'ตรวจสอบกับฐานข้อมูลผู้สำเร็จการศึกษา', pub: true }, { t: ts('2026-08-19', '10:20'), text: 'ตรวจสอบครบทุกรายแล้ว', pub: true }, { t: ts('2026-08-22', '14:00'), text: 'ออกเลขหนังสือส่ง ที่ 118/2569', pub: true }, { t: ts('2026-08-22', '14:05'), text: 'ส่งหนังสือแจ้งผลการตรวจสอบถึงหน่วยงานแล้ว', pub: true }] },
    { id: uid('r'), regNo: '44/2569', recvDate: '2026-09-02', agency: 'โรงพยาบาลตัวอย่างนนทเวช', to: 'ผู้อำนวยการโรงพยาบาลตัวอย่างนนทเวช', docNo: 'รพ.นว 512/2569', docDate: '2026-08-28', email: 'hr@hospital.example.com', aaddr: '123 ถนนงามวงศ์วาน ตำบลบางกระสอ\nอำเภอเมืองนนทบุรี จังหวัดนนทบุรี 11000', form: 2, file: '',
      persons: [P('09104', 'มณีรัตน์', 'อินทร์แก้ว', '2024-03-31', 'ม.6'), P('09150', 'ปวีณา', 'ใจงาม', '2024-03-31', 'ม.6', 'นางสาว')],
      status: 'done', outNo: '', outDate: '', sentDate: '',
      timeline: [{ t: ts('2026-09-02'), text: 'รับหนังสือ เลขทะเบียนรับ 44/2569', pub: true }, { t: ts('2026-09-03', '11:00'), text: 'ตรวจสอบครบทุกรายแล้ว', pub: true }] },
    { id: uid('r'), regNo: '47/2569', recvDate: '2026-09-10', agency: 'กองทะเบียนและประมวลผล มหาวิทยาลัยตัวอย่าง', to: 'ผู้อำนวยการกองทะเบียนและประมวลผล มหาวิทยาลัยตัวอย่าง', docNo: 'REG 2231/2569', docDate: '2026-09-05', email: 'registrar@univ.example.ac.th', aaddr: '1 ถนนพหลโยธิน ตำบลคลองหนึ่ง\nอำเภอคลองหลวง จังหวัดปทุมธานี 12120', form: 1, file: 'รายชื่อผู้สมัคร_รอบ2.xlsx',
      persons: [P('10231', 'ธนกฤต', 'ศรีสมบูรณ์', '2026-03-31', 'ม.6'), P('10232', 'พิมพ์ชนก', 'แก้วประเสริฐ', '2026-03-31', 'ม.6'), P('10245', 'ภูมิพัฒน์', 'วงศ์ทอง', '2026-03-15', 'ม.6'), P('10299', 'สุดารัตน์', 'มีสุข', '2026-03-31', 'ม.6', 'นางสาว')],
      status: 'checking', outNo: '', outDate: '', sentDate: '',
      timeline: [{ t: ts('2026-09-10'), text: 'รับหนังสือ เลขทะเบียนรับ 47/2569', pub: true }, { t: ts('2026-09-11', '13:40'), text: 'เริ่มตรวจสอบรายชื่อ', pub: true }] },
    { id: uid('r'), regNo: '49/2569', recvDate: '2026-09-24', agency: 'บริษัท เอ็นบีเอ็ม การ์เมนท์ จำกัด', to: 'ผู้จัดการฝ่ายบุคคล บริษัท เอ็นบีเอ็ม การ์เมนท์ จำกัด', docNo: 'NBM 0192/2569', docDate: '2026-09-20', email: 'recruit@nbm.example.co.th', aaddr: '55 หมู่ 3 ตำบลคลองพระอุดม\nอำเภอลาดหลุมแก้ว จังหวัดปทุมธานี 12140', form: 2, file: '',
      persons: [P('09117', 'ชยพล', 'ประเสริฐสุข', '2024-03-31', 'ม.6', 'นาย'), P('11420', 'กัญญาณัฐ', 'ศรีสุข', '2026-03-31', 'ม.3', 'นางสาว')],
      status: 'received', outNo: '', outDate: '', sentDate: '',
      timeline: [{ t: ts('2026-09-24'), text: 'รับหนังสือ เลขทะเบียนรับ 49/2569', pub: true }] }
  ];
  const data = { v: 1, settings: defaultSettings(), students, fees, requests };
  // จับคู่ผลตัวอย่าง (ยกเว้นรายสุดท้ายของหนังสือ 47 และหนังสือ 49 ที่ยังรอตรวจ)
  requests.forEach((r, ri) => r.persons.forEach((p, i) => {
    if (ri === 3 || (ri === 2 && i === 3)) return;
    Object.assign(p, matchPerson(p, students));
  }));
  requests.forEach(r => r.persons.forEach(p => { if (!p.prefix) { const s = students.find(x => x.id === p.matchedId); p.prefix = s ? s.prefix : ''; } }));
  data.agencies = seedAgencies();
  requests.push(sampleOnlineRequest());
  return data;
}

let S = CLOUD ? emptyState() : load();
if (!CLOUD && (!S || !S.v)) { S = seed(); save(); }
/* ปรับข้อมูลที่บันทึกไว้จากเวอร์ชันก่อน */
function migrateState() {
  (S.requests || []).forEach(r => { if (r.status === 'replied' && !Array.isArray(r.enclosures)) r.enclosures = r.form == 1 ? [{ name: 'บัญชีรายชื่อผลการตรวจสอบวุฒิการศึกษา', qty: 1, unit: 'ฉบับ' }] : []; });
  (S.requests || []).forEach(r => { if (r.outNo && r.outYearOn === undefined && /^\d+\/\d{4}$/.test(r.outNo)) r.outYearOn = true; });
  const st = S.settings, d = defaultSettings();
  if (!st.address || st.address === 'จังหวัดนนทบุรี') st.address = d.address;
  if (!st.phone) st.phone = d.phone;
  if (!st.email || st.email === 'web@wnm.ac.th') st.email = d.email;
  if (!st.docPrefix || st.docPrefix === 'ศธ 04xxx.xx/') st.docPrefix = d.docPrefix;
  if (!st.director) st.director = d.director;
  st.fax = '';
  if (st.contact === undefined) st.contact = '';
  if (!st.outFrom) { st.outFrom = st.nextOut || 1; st.outTo = (st.nextOut || 1) + 79; }
  S.students.forEach((s, i) => { if (s.source === 'ตัวอย่าง' && !s.pp1Set && i % 5 !== 4) { s.pp1Set = String(12 + Math.floor(i / 4)).padStart(5, '0'); s.pp1No = String(345 + i * 7).padStart(6, '0'); } });
  if (!CLOUD && !Array.isArray(S.agencies)) { S.agencies = seedAgencies(); S.requests.push(sampleOnlineRequest()); }
  if (!CLOUD) (S.agencies || []).forEach(a => { if (a.approved === undefined) a.approved = true; });
  if (!CLOUD) save();
}
if (!CLOUD) migrateState();

/* ---------- สถานะหน้าจอ ---------- */
const U = {
  mode: /^#staff$/.test(location.hash) ? 'staff' : /^#(agency|portal)$/.test(location.hash) ? 'agency' : 'home',
  view: 'dash', reqId: null, trackId: null, letterId: null,
  gq: '', glevel: '', fq: '', fOnly: true, tq: '', vq: '', showAdd: false,
  draft: newDraft(), lastImport: '',
  staffAuth: false, agencyId: null, aView: 'home', aTab: 'login', aReqId: null, adraft: null, returnId: null, authErr: ''
};
function newDraft() { return { regno: '', form: 2, file: '', date: todayISO(), email: '', agency: '', to: '', docno: '', docdate: '', aaddr: '', aphone: '', persons: [blankP(), blankP()] }; }
function blankP() { return { sid: '', cid: '', prefix: '', fname: '', lname: '', gradText: '', level: '' }; }
const PREFIXES = ['นาย', 'นางสาว', 'นาง', 'เด็กชาย', 'เด็กหญิง'];
const RANKS = ['ว่าที่ร้อยตรี', 'ว่าที่ร้อยตรีหญิง', 'สิบตรี', 'สิบโท', 'สิบเอก', 'จ่าสิบเอก', 'พลทหาร', 'ร้อยตรี', 'ร้อยโท', 'ร้อยเอก', 'ส.ต.ต.', 'ด.ต.', 'จ.ส.ต.', 'ร.ต.อ.', 'พระ', 'พระมหา', 'สามเณร'];
const prefixList = () => `<datalist id="prefix-list">${[...PREFIXES, ...RANKS].map(o => `<option value="${o}"></option>`).join('')}</datalist>`;
/* ชื่อพร้อมคำนำหน้า: ใช้คำนำหน้าตามหนังสือ ถ้าไม่มีใช้ตามฐานข้อมูลโรงเรียน */
function pName(p) {
  let pre = p.prefix || '';
  if (!pre && p.result !== 'notfound') { const s = S.students.find(x => x.id === p.matchedId); if (s) pre = s.prefix || ''; }
  return `${pre}${p.fname} ${p.lname}`.trim();
}

const getReq = id => S.requests.find(r => r.id === id);
const getStu = id => S.students.find(s => s.id === id);
const byRecv = (a, b) => (b.recvDate || '').localeCompare(a.recvDate || '') || b.regNo.localeCompare(a.regNo);
const outstanding = sid => S.fees.filter(f => f.studentId === sid).reduce((a, f) => a + Math.max(0, f.amount - f.paid), 0);
const totalOutstanding = () => S.fees.reduce((a, f) => a + Math.max(0, f.amount - f.paid), 0);
const regTaken = (reg, exceptId) => S.requests.some(x => x.id !== exceptId && x.regNo && x.regNo.replace(/\s/g, '') === String(reg).replace(/\s/g, ''));
const statusBadge = r => `<span class="badge ${STATUS[r.status].c}">${STATUS[r.status].t}</span>`;
const resultBadge = k => `<span class="badge ${RESULT[k].c}">${RESULT[k].t}</span>`;
function addTL(r, text, pub) { r.timeline.push({ t: Date.now(), text, pub: !!pub }); }

/* ---------- การจับคู่กับฐานข้อมูล ---------- */
function matchPerson(p, students = S.students) {
  const cid = digits(p.cid);
  let best = null, bestScore = 0;
  for (const s of students) {
    const bySid = !!(sidKey(p.sid) && sidKey(p.sid) === sidKey(s.sid));
    const byCid = !!(cid && cid === s.cid);
    const byName = !!(p.fname && normName(p.fname) === normName(s.fname) && normName(p.lname) === normName(s.lname));
    const sc = (bySid ? 2 : 0) + (byCid ? 3 : 0) + (byName ? 2 : 0);
    if (sc > bestScore) { best = { s, bySid, byCid, byName }; bestScore = sc; }
  }
  if (!best) {
    const fz = typeof suggestFor === 'function' && S && students === S.students ? suggestFor(p, 1)[0] : null;
    if (fz && fz.sc >= 0.8) { const c = compareWith(p, fz.s); return { result: 'mismatch', matchedId: fz.s.id, auto: `ใกล้เคียง ${Math.round(fz.sc * 100)}% · ${c.auto} · ตรวจหลักฐานก่อนยืนยัน` }; }
    return { result: 'notfound', matchedId: null, auto: 'ไม่พบในฐานข้อมูลผู้สำเร็จการศึกษา' };
  }
  const issues = [];
  if (!best.byName) issues.push('ชื่อ-สกุลไม่ตรง');
  if (p.sid && !best.bySid) issues.push('เลขประจำตัวไม่ตรง');
  if (p.gradDate && best.s.gradDate && p.gradDate !== best.s.gradDate) issues.push(`วันที่จบไม่ตรง (ฐานข้อมูล ${fmtBE(best.s.gradDate)})`);
  if (p.level && best.s.level && normLevel(p.level) !== best.s.level) issues.push(`ระดับชั้นไม่ตรง (ฐานข้อมูล ${best.s.level})`);
  return issues.length
    ? { result: 'mismatch', matchedId: best.s.id, auto: issues.join(' · ') }
    : { result: 'found', matchedId: best.s.id, auto: 'ข้อมูลตรงกับฐานข้อมูล' };
}
/* เทียบรายบุคคลกับนักเรียนที่เลือก แล้วบอกว่าต่างกันตรงไหน */
function compareWith(p, s) {
  const issues = [];
  if (normName(p.fname) !== normName(s.fname) || normName(p.lname) !== normName(s.lname)) issues.push(`ชื่อ-สกุลสะกดต่างจากฐานข้อมูล (${fullName(s)})`);
  if (p.sid && sidKey(p.sid) !== sidKey(s.sid)) issues.push(`เลขประจำตัวไม่ตรง (ฐานข้อมูล ${s.sid})`);
  if (digits(p.cid) && s.cid && digits(p.cid) !== s.cid) issues.push('เลขบัตรประชาชนไม่ตรง');
  if (p.gradDate && s.gradDate && p.gradDate !== s.gradDate) issues.push(`วันที่จบไม่ตรง (ฐานข้อมูล ${fmtBE(s.gradDate)})`);
  if (p.level && s.level && normLevel(p.level) !== s.level) issues.push(`ระดับชั้นไม่ตรง (ฐานข้อมูล ${s.level})`);
  return issues.length ? { result: 'mismatch', auto: issues.join(' · ') } : { result: 'found', auto: 'ข้อมูลตรงกับฐานข้อมูล' };
}
function refreshStatus(r) {
  if (r.status === 'replied' || !registered(r)) return;
  const pend = r.persons.filter(p => p.result === 'pending').length;
  const ns = pend === 0 ? 'done' : (pend < r.persons.length ? 'checking' : 'received');
  if (ns !== r.status) {
    if (ns === 'checking') addTL(r, 'เริ่มตรวจสอบรายชื่อ', true);
    if (ns === 'done') addTL(r, 'ตรวจสอบครบทุกรายแล้ว', true);
    r.status = ns;
  }
}

/* ---------- การนำเข้าไฟล์ ---------- */
function readText(file) { return file.text ? file.text() : new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsText(file); }); }
async function fileToMatrix(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith('.csv') || name.endsWith('.txt')) return parseCSV(await readText(file));
  if (typeof XLSX === 'undefined') throw new Error('ยังโหลดตัวอ่านไฟล์ Excel ไม่สำเร็จ ตรวจสอบการเชื่อมต่ออินเทอร์เน็ตแล้วลองอีกครั้ง');
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const out = [];
  wb.SheetNames.forEach(n => out.push(...XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: false, defval: '' })));
  return out;
}

/* ปพ.3: อ่านทุกแถวในทุกชีต ดึงข้อมูลจากแถวที่มีคำนำหน้าชื่อ + รหัส/เลขบัตร */
const fmtGpa = v => { const m = thaiDigits(String(v ?? '')).trim().match(/^([0-4])(?:\.(\d{1,2}))?$/); return m && +v <= 4 ? (+thaiDigits(v)).toFixed(2) : ''; };
function parsePP3Row(r, gpaCol = -1) {
  const cells = r.map(c => thaiDigits(String(c ?? '')).trim()).filter(Boolean);
  let name = '', cid = '', sid = '', dob = '', gpa = gpaCol >= 0 ? fmtGpa(r[gpaCol]) : '';
  const names = [], evals = [];
  for (const c of cells) {
    if (PREFIX_RE.test(c) && /[ก-๙]/.test(c) && c.length < 80) { names.push(c.replace(/\s+/g, ' ')); continue; }
    const ids = splitIds(c);
    if (ids.cid && !cid) { cid = ids.cid; if (ids.sid && !sid) sid = ids.sid; continue; }
    if (!sid && /^\d{4,7}$/.test(c)) { sid = c; continue; }
    if (!gpa && /^[0-4]\.\d{1,2}$/.test(c)) { gpa = fmtGpa(c); continue; }
    if (!dob) { const d = findDate(c); if (d) { dob = d; continue; } }
    if (/^(ดีเยี่ยม|ดี|ผ่าน|ไม่ผ่าน)$/.test(c)) evals.push(c);
  }
  name = names[0] || '';
  if (!name || (!sid && !cid)) return null;
  const n = splitName(name);
  return { sid, cid, ...n, dob, gpa, father: names[1] || '', mother: names[2] || '', evals };
}
async function importPP3(file, level, fallbackISO) {
  const rows = await fileToMatrix(file);
  let approval = '';
  rows.forEach((r, i) => {
    const line = r.join(' ');
    if (/อนุมัติ/.test(line)) {
      for (let k = i; k < Math.min(rows.length, i + 8); k++) { const d = findDate(rows[k].join(' ')); if (d) { approval = d; break; } }
    }
  });
  const gradDate = approval || fallbackISO;
  const seen = new Set(), recs = [];
  let gpaCol = -1, setCol = -1, noCol = -1;
  for (const r of rows) {
    const hi = r.findIndex(c => /ผลการเรียนเฉลี่ย|เกรดเฉลี่ย|เฉลี่ยสะสม|GPA|GPAX/i.test(String(c)));
    const si = r.findIndex(c => /ชุดที่/.test(String(c))), ni = r.findIndex(c => /^\s*เลขที่\s*$|ปพ\.?\s*1.*เลขที่/.test(String(c)));
    if (si >= 0) setCol = si; if (ni >= 0) noCol = ni;
    if (hi >= 0 || si >= 0) { if (hi >= 0) gpaCol = hi; continue; }
    const rec = parsePP3Row(r, gpaCol);
    if (rec) { if (setCol >= 0) rec.pp1Set = digits(r[setCol]); if (noCol >= 0) rec.pp1No = digits(r[noCol]); }
    if (!rec) continue;
    const k = rec.sid || rec.cid;
    if (seen.has(k)) continue;
    seen.add(k); recs.push(rec);
  }
  let added = 0, updated = 0;
  recs.forEach(rec => {
    const ex = S.students.find(s => (rec.cid && s.cid === rec.cid) || (rec.sid && sidKey(s.sid) === sidKey(rec.sid) && s.level === level));
    const obj = { sid: rec.sid, cid: rec.cid, prefix: rec.prefix, fname: rec.fname, lname: rec.lname, level, gradDate, dob: rec.dob, gpa: rec.gpa, father: rec.father, mother: rec.mother, evals: rec.evals, source: 'ปพ.3 ' + file.name };
    if (rec.pp1Set) obj.pp1Set = rec.pp1Set; if (rec.pp1No) obj.pp1No = rec.pp1No;
    if (ex) { Object.assign(ex, obj); updated++; } else { S.students.push({ id: uid('s'), ...obj }); added++; }
  });
  save();
  return { total: recs.length, added, updated, approval, gradDate, withGpa: recs.filter(x => x.gpa).length };
}
function importGradCSV(text) {
  const rows = parseCSV(text);
  if (!rows.length) return { added: 0, updated: 0, skipped: 0 };
  const h = rows[0].map(x => String(x).trim());
  const find = re => h.findIndex(x => re.test(x));
  let iSid = find(/รหัส|เลขประจำตัว(?!ประชาชน)/), iCid = find(/ประชาชน|บัตร/), iName = find(/ชื่อ/), iLv = find(/ระดับ|ชั้น/), iDate = find(/วันที่|จบ/), iGpa = find(/GPA|เกรด|เฉลี่ย/i), iSet = find(/ชุดที่/), iNo = find(/^เลขที่|ปพ\.?1.*เลขที่|เลขที่.*ปพ/);
  let start = 1;
  if (iName < 0 && iSid < 0) { iSid = 0; iName = 1; iLv = 2; iDate = 3; iCid = -1; iGpa = -1; iSet = -1; iNo = -1; start = 0; }
  if (iDate === iLv) iDate = find(/วันที่/);
  let added = 0, updated = 0, skipped = 0;
  rows.slice(start).forEach(r => {
    const ids = splitIds(r[iSid] || '');
    const cid = iCid >= 0 ? digits(r[iCid]) : ids.cid;
    const n = iName >= 0 ? splitName(r[iName]) : { fname: '' };
    const extra = { gpa: iGpa >= 0 ? fmtGpa(r[iGpa]) || String(r[iGpa] || '').trim() : '', pp1Set: iSet >= 0 ? digits(r[iSet]) : '', pp1No: iNo >= 0 ? digits(r[iNo]) : '' };
    if (!n.fname) {
      const key = sidKey(ids.sid || r[iSid]), ex0 = S.students.find(s => (key && sidKey(s.sid) === key) || (cid && s.cid === cid));
      if (ex0) { Object.entries(extra).forEach(([k, v]) => { if (v) ex0[k] = v; }); updated++; } else skipped++;
      return;
    }
    const obj = { sid: ids.sid || String(r[iSid] || '').trim(), cid, ...n, level: normLevel(r[iLv]), gradDate: parseDateAny(r[iDate] || ''), source: 'CSV' };
    Object.entries(extra).forEach(([k, v]) => { if (v) obj[k] = v; });
    const ex = S.students.find(s => (obj.cid && s.cid === obj.cid) || (obj.sid && sidKey(s.sid) === sidKey(obj.sid) && s.level === obj.level));
    if (ex) { Object.assign(ex, obj); updated++; } else { S.students.push({ id: uid('s'), dob: '', father: '', mother: '', ...obj }); added++; }
  });
  save();
  return { added, updated, skipped };
}
function personsFromMatrix(rows) {
  let hi = rows.findIndex(r => r.some(c => /ชื่อ/.test(String(c))));
  const h = hi >= 0 ? rows[hi].map(c => String(c).trim()) : [];
  const find = re => h.findIndex(x => re.test(x));
  let iSid = find(/เลขประจำตัว(?!ประชาชน)|รหัส/), iFull = find(/ชื่อ\s*-?\s*(ชื่อ)?\s*สกุล/), iF = find(/^ชื่อ$|^ชื่อ\s|ชื่อ(?!.*สกุล)/), iL = find(/^สกุล|นามสกุล|^สกุล$/), iDate = find(/จบ|วันที่/), iLv = find(/ระดับ|ชั้น/);
  if (hi < 0) { iSid = 0; iF = 1; iL = 2; iDate = 3; iLv = 4; iFull = -1; }
  const body = rows.slice(hi + 1);
  return body.map(r => {
    let fname = '', lname = '', prefix = '';
    if (iFull >= 0) { const n = splitName(r[iFull]); fname = n.fname; lname = n.lname; prefix = n.prefix; }
    else { const n0 = splitName(r[iF]); fname = n0.fname; prefix = n0.prefix; lname = String(r[iL] ?? '').trim(); if (!lname) { fname = n0.fname; lname = n0.lname; } }
    const gd = parseDateAny(r[iDate] ?? '');
    return { sid: iSid >= 0 ? splitIds(r[iSid] ?? '').sid || String(r[iSid] ?? '').trim() : '', prefix, fname, lname, gradText: gd ? fmtBE(gd) : String(r[iDate] ?? '').trim(), level: iLv >= 0 && r[iLv] ? normLevel(r[iLv]) : '' };
  }).filter(p => p.fname);
}

/* ---------- บัญชีผู้ใช้และการเข้าสู่ระบบ ---------- */
const DEFAULT_STAFF_PW = 'admin1234';
async function sha(s) {
  try { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''); }
  catch (e) { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return 'x' + h; }
}
const staffHash = pw => sha('wnm-staff:' + pw);
const agencyHash = (email, pw) => sha('wnm-agency:' + String(email).toLowerCase() + ':' + pw);
async function checkStaffPw(pw) { const st = S.settings; return st.staffPwHash ? (await staffHash(pw)) === st.staffPwHash : pw === DEFAULT_STAFF_PW; }
async function checkAgencyPw(acc, pw) { return acc.pwHash ? (await agencyHash(acc.email, pw)) === acc.pwHash : (!!acc.pw0 && pw === acc.pw0); }
const curAgency = () => (S.agencies || []).find(a => a.id === U.agencyId) || null;
function saveSession() { try { sessionStorage.setItem('wnm-session', JSON.stringify({ staff: U.staffAuth, agencyId: U.agencyId })); } catch (e) { /* ไม่มี sessionStorage */ } }
function loadSession() { try { const s = JSON.parse(sessionStorage.getItem('wnm-session') || 'null'); if (s) { U.staffAuth = !!s.staff; U.agencyId = s.agencyId || null; } } catch (e) { /* ไม่มี sessionStorage */ } }

function seedAgencies() {
  const t = new Date('2026-08-01T09:00:00').getTime();
  return [
    { id: 'a_tsl', name: 'บริษัท ไทยสมาร์ท โลจิสติกส์ จำกัด', email: 'hr@thaismart.example.com', phone: '02 000 1111', contact: 'นางสาวอรุณี ใจดี ฝ่ายทรัพยากรบุคคล', address: '99/9 ถนนบางนา-ตราด แขวงบางนาใต้\nเขตบางนา กรุงเทพมหานคร 10260', pwHash: '', pw0: 'demo1234', approved: true, createdAt: t, lastSeen: new Date('2026-08-23T00:00:00').getTime() },
    { id: 'a_hos', name: 'โรงพยาบาลตัวอย่างนนทเวช', email: 'hr@hospital.example.com', phone: '02 000 2222', contact: 'นายวีระ ทองมา งานบุคคล', address: '123 ถนนงามวงศ์วาน ตำบลบางกระสอ\nอำเภอเมืองนนทบุรี จังหวัดนนทบุรี 11000', pwHash: '', pw0: 'demo1234', approved: true, createdAt: t, lastSeen: 0 }
  ];
}
function sampleOnlineRequest() {
  const t = new Date('2026-09-27T10:12:00').getTime();
  return { id: uid('r'), regNo: '', recvDate: '', submittedAt: t, source: 'online', agencyId: 'a_tsl', agency: 'บริษัท ไทยสมาร์ท โลจิสติกส์ จำกัด', to: 'ผู้จัดการฝ่ายทรัพยากรบุคคล บริษัท ไทยสมาร์ท โลจิสติกส์ จำกัด', docNo: 'TSL-HR 052/2569', docDate: '2026-09-26', email: 'hr@thaismart.example.com', aaddr: '99/9 ถนนบางนา-ตราด แขวงบางนาใต้\nเขตบางนา กรุงเทพมหานคร 10260', aphone: '02 000 1111', form: 2, file: 'หนังสือขอตรวจสอบวุฒิ_TSL-HR052.pdf',
    attachments: [{ name: 'หนังสือขอตรวจสอบวุฒิ_TSL-HR052.pdf', size: 184320, type: 'application/pdf', data: '' }],
    persons: [{ id: uid('p'), sid: '09812', prefix: 'นาย', fname: 'กิตติภพ', lname: 'จันทร์หอม', gradDate: '2025-03-31', gradText: '31/03/2568', level: 'ม.6', result: 'pending', matchedId: null, auto: '', note: '', manual: false }],
    status: 'submitted', outNo: '', outDate: '', sentDate: '', timeline: [{ t, text: 'หน่วยงานส่งคำขอตรวจสอบออนไลน์', pub: true }] };
}
const registered = r => r.status !== 'submitted' && r.status !== 'returned';
const REQS = () => S.requests.filter(registered);
const inboxReqs = () => S.requests.filter(r => r.status === 'submitted').sort((a, b) => (a.submittedAt || 0) - (b.submittedAt || 0));
function myReqs(acc) {
  return S.requests.filter(r => r.agencyId === acc.id || (r.email && r.email === acc.email))
    .sort((a, b) => (b.submittedAt || new Date(b.recvDate || 0).getTime()) - (a.submittedAt || new Date(a.recvDate || 0).getTime()));
}
const fmtSize = n => n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
function attChips(r, canRemove) {
  const list = r.attachments || [];
  if (!list.length) return '';
  return `<div class="att-list">${list.map((a, i) => `<span class="att"><span>📎 ${esc(a.name)} <span class="muted">(${fmtSize(a.size || 0)})</span></span>${a.data || (CLOUD && a.path) ? `<button type="button" class="btn btn-outline sm" data-act="attdl" data-r="${r.id || ''}" data-i="${i}">ดาวน์โหลด</button>` : '<span class="muted small">เก็บเฉพาะชื่อไฟล์</span>'}${canRemove ? `<button type="button" class="icon-btn" data-act="adelfile" data-i="${i}" aria-label="ลบไฟล์ ${esc(a.name)}">✕</button>` : ''}</span>`).join('')}</div>`;
}
function dataURLtoBlob(u) {
  const [head, body] = String(u).split(','); const mime = (head.match(/data:([^;]+)/) || [])[1] || 'application/octet-stream';
  const bin = atob(body); const arr = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

/* ---------- หน้าแรก ---------- */
function vHome() {
  return `<section class="hero home-hero"><span class="eyebrow">WNM · Educational Measurement and Evaluation</span><h1>ระบบรับ–ส่งและตรวจสอบวุฒิการศึกษา</h1><p>งานทะเบียนและวัดผล กลุ่มบริหารวิชาการ ${esc(S.settings.school)} · ยื่นคำขอ ติดตามสถานะ และรับหนังสือตอบได้ในที่เดียว</p></section>
  <div class="grid g2">
    <button type="button" class="card role-card" data-act="role" data-r="staff"><div class="role-icon" style="background:rgba(255,95,158,.14)">🧑‍💼</div><h2>เจ้าหน้าที่</h2><p class="muted">รับหนังสือ ตรวจสอบวุฒิ ออกหนังสือตอบ จัดการฐานข้อมูลผู้สำเร็จการศึกษาและค่าบำรุงการศึกษา</p><span class="btn btn-primary">เข้าสู่ระบบเจ้าหน้าที่</span></button>
    <button type="button" class="card role-card" data-act="role" data-r="agency"><div class="role-icon" style="background:rgba(77,159,255,.14)">🏢</div><h2>หน่วยงานภายนอก</h2><p class="muted">ส่งคำขอตรวจสอบคุณวุฒิการศึกษาพร้อมแนบเอกสาร ติดตามสถานะ และดาวน์โหลดหนังสือตอบกลับ</p><span class="btn btn-blue">เข้าสู่ระบบ / ลงทะเบียนหน่วยงาน</span></button>
  </div>
  <div class="card"><h2>ขั้นตอนการขอตรวจสอบวุฒิการศึกษา</h2><ol class="flow">
    <li><b>ลงทะเบียนหน่วยงาน</b><span>ใช้อีเมลของหน่วยงานและตั้งรหัสผ่าน</span></li>
    <li><b>ส่งคำขอ</b><span>กรอกรายชื่อและแนบหนังสือขอตรวจสอบ</span></li>
    <li><b>โรงเรียนรับเรื่องและตรวจสอบ</b><span>ติดตามสถานะได้ตลอด</span></li>
    <li><b>รับหนังสือตอบ</b><span>ดาวน์โหลด PDF หรือรับทางอีเมล/ไปรษณีย์</span></li></ol></div>`;
}
function vStaffLogin() {
  const def = !CLOUD && !S.settings.staffPwHash;
  return `<div class="auth-wrap"><form class="card form auth" data-form="stafflogin" novalidate><span class="eyebrow">เจ้าหน้าที่</span><h2 style="margin:0">เข้าสู่ระบบเจ้าหน้าที่</h2>
  ${CLOUD ? '<div><label for="sl-email">อีเมลเจ้าหน้าที่</label><input id="sl-email" type="email" autocomplete="username" required></div>' : ''}
  <div><label for="sl-pw">${CLOUD ? 'รหัสผ่าน' : 'รหัสผ่านเจ้าหน้าที่'}</label><input id="sl-pw" type="password" autocomplete="current-password" required></div>
  ${U.authErr ? `<p class="notice danger" style="margin:0">${esc(U.authErr)}</p>` : ''}
  <button class="btn btn-primary" type="submit">เข้าสู่ระบบ</button>
  ${def ? `<p class="hint" style="margin:0">ยังใช้รหัสเริ่มต้น <b>${DEFAULT_STAFF_PW}</b> อยู่ เข้าระบบแล้วเปลี่ยนได้ที่ ⚙️ ตั้งค่า</p>` : ''}
  <button type="button" class="btn btn-outline" data-act="home">← กลับหน้าแรก</button></form></div>`;
}
function vAgencyAuth() {
  const reg = U.aTab === 'register';
  const demo = !CLOUD && (S.agencies || []).find(a => a.pw0 && !a.pwHash && a.approved);
  const tabs = `<div class="seg" role="tablist"><button type="button" class="${reg ? '' : 'on'}" data-act="atab" data-t="login">เข้าสู่ระบบ</button><button type="button" class="${reg ? 'on' : ''}" data-act="atab" data-t="register">ลงทะเบียนหน่วยงาน</button></div>`;
  const err = (U.authErr ? `<p class="notice danger" style="margin:0">${esc(U.authErr)}</p>` : '') + (U.authOk ? `<p class="notice ok" style="margin:0">${esc(U.authOk)}</p>` : '');
  if (!reg) return `<div class="auth-wrap"><form class="card form auth" data-form="alogin" novalidate><span class="eyebrow">หน่วยงานภายนอก</span>${tabs}
    <div><label for="al-email">อีเมลที่ลงทะเบียน</label><input id="al-email" type="email" autocomplete="username" required></div>
    <div><label for="al-pw">รหัสผ่าน</label><input id="al-pw" type="password" autocomplete="current-password" required></div>
    ${err}<button class="btn btn-blue" type="submit">เข้าสู่ระบบ</button>
    ${demo ? `<div class="hint"><span>บัญชีทดลอง: ${esc(demo.email)} / ${esc(demo.pw0)}</span><button type="button" class="btn btn-outline sm" data-act="ademo" data-id="${demo.id}">กรอกให้</button></div>` : ''}
    <button type="button" class="btn btn-outline" data-act="home">← กลับหน้าแรก</button></form></div>`;
  return `<div class="auth-wrap"><form class="card form auth wide" data-form="aregister" novalidate><span class="eyebrow">หน่วยงานภายนอก</span>${tabs}
    <div class="grid g2"><div class="span2"><label for="ar-name">ชื่อหน่วยงาน</label><input id="ar-name" required placeholder="เช่น บริษัท ตัวอย่าง จำกัด"></div>
    <div><label for="ar-email">อีเมลหน่วยงาน (ใช้เข้าสู่ระบบ)</label><input id="ar-email" type="email" autocomplete="username" required></div>
    <div><label for="ar-phone">โทรศัพท์</label><input id="ar-phone" inputmode="tel"></div>
    <div><label for="ar-pw">รหัสผ่าน (อย่างน้อย 8 ตัว)</label><input id="ar-pw" type="password" autocomplete="new-password" required></div>
    <div><label for="ar-pw2">ยืนยันรหัสผ่าน</label><input id="ar-pw2" type="password" autocomplete="new-password" required></div>
    <div class="span2"><label for="ar-contact">ผู้ประสานงาน (ชื่อ ตำแหน่ง)</label><input id="ar-contact"></div>
    <div class="span2"><label for="ar-addr">ที่อยู่หน่วยงาน (สำหรับส่งหนังสือตอบทางไปรษณีย์)</label><textarea id="ar-addr" rows="2" style="font-family:inherit;font-size:15px"></textarea></div></div>
    ${err}<button class="btn btn-blue" type="submit">ลงทะเบียนและเข้าสู่ระบบ</button>
    <button type="button" class="btn btn-outline" data-act="home">← กลับหน้าแรก</button></form></div>`;
}

/* ---------- หน้าจอหน่วยงานภายนอก (บัญชีหน่วยงาน) ---------- */
const AVIEWS = [['home', '🏠 หน้าหลัก'], ['new', '📝 ส่งคำขอตรวจสอบคุณวุฒิ'], ['status', '🔍 สถานะและผลการตรวจสอบ']];
function newADraft(acc) { return { form: 2, agency: acc.name, docno: '', docdate: '', to: '', email: acc.email, aphone: acc.phone || '', aaddr: acc.address || '', persons: [blankP(), blankP()], files: [], consent: false, editingId: null }; }
function agencyEvents(acc) {
  return myReqs(acc).flatMap(r => r.timeline.filter(e => e.pub).map(e => ({ r, e }))).sort((a, b) => b.e.t - a.e.t);
}
function vAgencyHome(acc) {
  const reqs = myReqs(acc), ev = agencyEvents(acc), unread = ev.filter(x => x.e.t > (acc.lastSeen || 0)).length;
  const inProg = reqs.filter(r => r.status !== 'replied').length;
  return `<section class="hero"><span class="eyebrow">หน่วยงานภายนอก</span><h1 style="font-size:clamp(22px,3.4vw,30px)">${esc(acc.name)}</h1><p>${esc(acc.email)}${acc.contact ? ' · ' + esc(acc.contact) : ''}</p></section>
  <div class="grid g2">
    <button type="button" class="card role-card action-card" data-act="ago" data-v="new"><div class="role-icon" style="background:rgba(255,95,158,.14)">📝</div><h2>ส่งคำขอตรวจสอบคุณวุฒิการศึกษา</h2><p class="muted">กรอกรายชื่อ แนบหนังสือขอตรวจสอบ ระบบช่วยอ่านข้อมูลจากไฟล์หนังสือให้</p></button>
    <button type="button" class="card role-card action-card" data-act="ago" data-v="status"><div class="role-icon" style="background:rgba(77,159,255,.14)">🔍</div><h2>ตรวจสอบสถานะและผลการตรวจสอบ</h2><p class="muted">${reqs.length} คำขอ · อยู่ระหว่างดำเนินการ ${inProg} · ดาวน์โหลดหนังสือตอบกลับได้เมื่อโรงเรียนส่งแล้ว</p></button>
  </div>
  <div class="card"><div class="between wrap"><h2 style="margin:0">🔔 แจ้งสถานะจากเจ้าหน้าที่ ${unread ? `<span class="badge danger">ใหม่ ${unread}</span>` : ''}</h2>${unread ? '<button type="button" class="btn btn-outline sm" data-act="aseen">ทำเครื่องหมายว่าอ่านแล้ว</button>' : ''}</div>
  ${ev.length ? `<ul class="notif">${ev.slice(0, 10).map(({ r, e }) => `<li class="${e.t > (acc.lastSeen || 0) ? 'new' : ''}"><button type="button" data-act="aopen" data-id="${r.id}"><time>${fmtDT(e.t)}</time><b>${esc(e.text)}</b><span class="muted small">หนังสือที่ ${esc(r.docNo)} · ${STATUS[r.status].t}</span></button></li>`).join('')}</ul>` : '<p class="muted" style="margin:10px 0 0">ยังไม่มีการแจ้งสถานะ เมื่อส่งคำขอแล้ว ความคืบหน้าจะแสดงที่นี่</p>'}</div>`;
}
function personsEditor(d, key) {
  const opt = v => ['', 'ม.3', 'ม.6'].map(o => `<option value="${o}" ${v === o ? 'selected' : ''}>${o || '–'}</option>`).join('');
  return `<div class="between"><h3>รายชื่อผู้ขอตรวจสอบ (${d.persons.length} ราย)</h3><button type="button" class="btn btn-outline sm" data-act="addp" data-d="${key}">+ เพิ่มรายชื่อ</button></div>
  ${prefixList()}<div class="tablewrap"><table class="edit"><thead><tr><th>#</th><th>คำนำหน้า/ยศ *</th><th>ชื่อ</th><th>สกุล</th><th>เลขประจำตัวนักเรียนเดิม</th><th>วันเดือนปีที่จบ</th><th>ระดับชั้น</th><th></th></tr></thead><tbody>
  ${d.persons.map((p, i) => `<tr><td>${i + 1}</td>
    <td><input id="${key}-${i}-prefix" class="pfx" list="prefix-list" aria-label="คำนำหน้าหรือยศ แถว ${i + 1}" data-in="dp" data-d="${key}" data-i="${i}" data-f="prefix" value="${esc(p.prefix)}" placeholder="นาย / นางสาว / ยศ"></td>
    <td><input id="${key}-${i}-fname" aria-label="ชื่อ แถว ${i + 1}" data-in="dp" data-d="${key}" data-i="${i}" data-f="fname" value="${esc(p.fname)}"></td>
    <td><input id="${key}-${i}-lname" aria-label="สกุล แถว ${i + 1}" data-in="dp" data-d="${key}" data-i="${i}" data-f="lname" value="${esc(p.lname)}"></td>
    <td><input id="${key}-${i}-sid" aria-label="เลขประจำตัว แถว ${i + 1}" data-in="dp" data-d="${key}" data-i="${i}" data-f="sid" value="${esc(p.sid)}" inputmode="numeric" placeholder="ถ้าทราบ"></td>
    <td><input id="${key}-${i}-grad" aria-label="วันที่จบ แถว ${i + 1}" data-in="dp" data-d="${key}" data-i="${i}" data-f="gradText" value="${esc(p.gradText)}" placeholder="31/03/2568"></td>
    <td><select id="${key}-${i}-level" aria-label="ระดับชั้น แถว ${i + 1}" data-ch="dp" data-d="${key}" data-i="${i}" data-f="level">${opt(p.level)}</select></td>
    <td><button type="button" class="icon-btn" data-act="delp" data-d="${key}" data-i="${i}" aria-label="ลบแถว ${i + 1}">✕</button></td></tr>`).join('')}
  </tbody></table></div>`;
}
function vAgencyNew(acc) {
  const d = U.adraft || (U.adraft = newADraft(acc));
  return `<div class="pagehead"><h1>ส่งคำขอตรวจสอบคุณวุฒิการศึกษา</h1><p class="muted">${d.editingId ? 'แก้ไขคำขอที่เจ้าหน้าที่ส่งกลับ แล้วกดส่งอีกครั้ง' : 'กรอกข้อมูลตามหนังสือของหน่วยงาน และแนบไฟล์หนังสือขอตรวจสอบ'}</p></div>
  ${scanCard('agency')}
  <form class="card form" data-form="asubmit" novalidate>
    <div class="grid g3">
      <div class="span2"><label for="ad-agency">หน่วยงาน</label><input id="ad-agency" data-in="df" data-d="adraft" data-f="agency" value="${esc(d.agency)}"></div>
      <div><label for="ad-email">อีเมลรับผล</label><input id="ad-email" type="email" data-in="df" data-d="adraft" data-f="email" value="${esc(d.email)}"></div>
      <div><label for="ad-docno">เลขที่หนังสือของหน่วยงาน</label><input id="ad-docno" data-in="df" data-d="adraft" data-f="docno" value="${esc(d.docno)}" placeholder="เช่น ABC 123/2569"></div>
      <div><label for="ad-docdate">หนังสือลงวันที่</label><input id="ad-docdate" type="date" data-in="df" data-d="adraft" data-f="docdate" value="${esc(d.docdate)}"></div>
      <div><label for="ad-phone">โทรศัพท์</label><input id="ad-phone" data-in="df" data-d="adraft" data-f="aphone" value="${esc(d.aphone)}"></div>
      <div class="span2"><label for="ad-to">ผู้รับหนังสือตอบ (ตำแหน่ง และชื่อหน่วยงาน)</label><input id="ad-to" data-in="df" data-d="adraft" data-f="to" value="${esc(d.to)}" placeholder="เช่น ผู้จัดการฝ่ายทรัพยากรบุคคล บริษัท ตัวอย่าง จำกัด"></div>
      <div><label for="ad-addr">ที่อยู่รับหนังสือทางไปรษณีย์</label><textarea id="ad-addr" rows="2" data-in="df" data-d="adraft" data-f="aaddr" style="font-family:inherit;font-size:15px">${esc(d.aaddr)}</textarea></div>
    </div>
    <div class="formsel" role="radiogroup" aria-label="รูปแบบรายชื่อ">
      <label class="opt ${d.form == 1 ? 'on' : ''}"><input type="radio" name="ad-form" value="1" data-ch="dform" data-d="adraft" ${d.form == 1 ? 'checked' : ''}><b>📄 แนบใบรายชื่อ</b><span>รายชื่ออยู่ในไฟล์ที่แนบ (โรงเรียนจะส่งบัญชีรายชื่อผลการตรวจสอบกลับ)</span></label>
      <label class="opt ${d.form == 2 ? 'on' : ''}"><input type="radio" name="ad-form" value="2" data-ch="dform" data-d="adraft" ${d.form == 2 ? 'checked' : ''}><b>📄 ระบุรายชื่อในหนังสือ</b><span>รายชื่ออยู่ในเนื้อหนังสือ ไม่มีใบรายชื่อแนบ</span></label>
    </div>
    ${personsEditor(d, 'adraft')}
    <div class="attach"><label for="ad-files" style="margin:0">ไฟล์แนบ (หนังสือขอตรวจสอบ ใบรายชื่อ สำเนาหลักฐาน)</label><input type="file" id="ad-files" multiple accept=".pdf,image/*,.xls,.xlsx,.csv,.doc,.docx" data-ch="afiles">
      ${attChips({ attachments: d.files }, true)}<p class="muted small" style="margin:0">รองรับ PDF รูปภาพ Excel Word · ${CLOUD ? 'ไฟล์ละไม่เกิน 10 MB' : 'ในระบบทดลองนี้ไฟล์ละไม่เกิน 1.5 MB จะเก็บตัวไฟล์ ไฟล์ใหญ่กว่านั้นเก็บเฉพาะชื่อ'}</p></div>
    <label class="row consent"><input type="checkbox" id="ad-consent" data-ch="aconsent" ${d.consent ? 'checked' : ''}><span>ข้าพเจ้ายืนยันว่าหน่วยงานได้รับความยินยอมจากเจ้าของข้อมูลให้ตรวจสอบวุฒิการศึกษา และข้อมูลที่กรอกถูกต้องตามหนังสือของหน่วยงาน</span></label>
    <div class="row end"><button type="button" class="btn btn-outline" data-act="aresetdraft">ล้างฟอร์ม</button><button class="btn btn-primary" type="submit">${d.editingId ? 'ส่งคำขออีกครั้ง' : 'ส่งคำขอ'}</button></div>
  </form>`;
}
function vAgencyStatus(acc) {
  const reqs = myReqs(acc);
  return `<div class="pagehead"><h1>สถานะและผลการตรวจสอบ</h1><p class="muted">คำขอทั้งหมดของ ${esc(acc.name)} รวมหนังสือที่ส่งถึงโรงเรียนทางไปรษณีย์ด้วยอีเมลนี้</p></div>
  ${reqs.length ? `<div class="req-list">${reqs.map(r => `<button type="button" class="card req-item" data-act="aopen" data-id="${r.id}"><div class="between wrap"><div><b>หนังสือที่ ${esc(r.docNo)}</b><div class="sub">ลงวันที่ ${fmtLong(r.docDate)} · ${r.persons.length} ราย${r.regNo ? ' · เลขรับของโรงเรียน ' + esc(r.regNo) : ''}</div></div>${statusBadge(r)}</div>${r.status === 'replied' ? '<span class="small" style="color:var(--ok-fg)">📄 มีหนังสือตอบกลับให้ดาวน์โหลด</span>' : ''}${r.status === 'returned' ? '<span class="small" style="color:var(--danger-fg)">↩️ เจ้าหน้าที่ส่งกลับให้แก้ไข</span>' : ''}</button>`).join('')}</div>` : `<div class="card empty">ยังไม่มีคำขอ <button type="button" class="btn btn-primary sm" data-act="ago" data-v="new">ส่งคำขอแรก</button></div>`}`;
}
const pubRows = r => r.publicResults || r.persons.map(p => { const s = getStu(p.matchedId); return { name: pName(p), result: p.result, note: letterNote(p), gpa: showGpa(r) && s && p.result !== 'notfound' ? (s.gpa || '') : '' }; });
function vAgencyDetail(acc) {
  const r = getReq(U.aReqId);
  if (!r || !myReqs(acc).includes(r)) return vAgencyStatus(acc);
  const ready = r.status === 'done' || r.status === 'replied';
  return `<div class="row"><button type="button" class="btn btn-outline sm" data-act="ago" data-v="status">← รายการคำขอ</button></div>
  <div class="card"><div class="between wrap"><div><span class="eyebrow">หนังสือที่ ${esc(r.docNo)}</span><h2 style="margin:4px 0">${esc(r.agency)}</h2><p class="muted small" style="margin:0">${r.submittedAt ? 'ส่งคำขอเมื่อ ' + fmtDT(r.submittedAt) : 'โรงเรียนรับหนังสือเมื่อ ' + fmtLong(r.recvDate)}${r.regNo ? ' · เลขทะเบียนรับ ' + esc(r.regNo) : ''}${r.outNo ? ' · หนังสือตอบที่ ' + esc(S.settings.docPrefix + r.outNo) : ''}</p></div>${statusBadge(r)}</div>
  ${stepper(r)}${deliveryLine(r)}
  ${r.status === 'returned' ? `<div class="notice danger" style="margin-top:10px">เจ้าหน้าที่ส่งคำขอกลับให้แก้ไข: <b>${esc(r.returnReason || '-')}</b> <button type="button" class="btn btn-primary sm" data-act="aedit" data-id="${r.id}">แก้ไขและส่งใหม่</button></div>` : ''}
  ${r.status === 'replied' ? `<div class="reply-box"><div><b>📄 หนังสือแจ้งผลการตรวจสอบวุฒิการศึกษา</b><div class="sub">ที่ ${esc(S.settings.docPrefix + r.outNo)} ลงวันที่ ${fmtLong(r.outDate)}</div></div><button type="button" class="btn btn-green" data-act="areply" data-id="${r.id}">ดาวน์โหลดหนังสือตอบกลับ (PDF)</button></div>` : ''}</div>
  <div class="grid g-main"><div class="card"><h2>ผลการตรวจสอบวุฒิการศึกษา</h2>${ready ? `<div class="tablewrap"><table style="min-width:0"><thead><tr><th>#</th><th>ชื่อ-สกุล</th>${pubRows(r).some(x => x.gpa) ? '<th class="num">เกรดเฉลี่ย</th>' : ''}<th>ผลการตรวจสอบ</th></tr></thead><tbody>${pubRows(r).map((x, i, all) => `<tr><td>${i + 1}</td><td>${esc(x.name)}</td>${all.some(y => y.gpa) ? `<td class="num">${esc(x.gpa || '-')}</td>` : ''}<td>${resultBadge(x.result)}${x.note ? `<div class="sub">${esc(x.note)}</div>` : ''}</td></tr>`).join('')}</tbody></table></div>` : `<p class="notice warn" style="margin:0">อยู่ระหว่างดำเนินการ ${r.persons.length} ราย ผลจะแสดงเมื่อตรวจสอบครบทุกราย</p><ul class="plain">${r.persons.map(p => `<li>${esc(pName(p))}</li>`).join('')}</ul>`}
  ${attChips(r) ? `<h3 style="margin:16px 0 8px">ไฟล์ที่แนบ</h3>${attChips(r)}` : ''}</div>
  <div class="card"><h2>ความคืบหน้า</h2><ul class="timeline">${r.timeline.filter(e => e.pub).sort((a, b) => b.t - a.t).map(e => `<li><time>${fmtDT(e.t)}</time>${esc(e.text)}</li>`).join('')}</ul></div></div>`;
}
function vAgency() {
  const acc = curAgency();
  return U.aView === 'new' ? vAgencyNew(acc) : U.aView === 'status' ? vAgencyStatus(acc) : U.aView === 'detail' ? vAgencyDetail(acc) : vAgencyHome(acc);
}

/* ---------- กล่องคำขอออนไลน์ (เจ้าหน้าที่) ---------- */
function onlineInbox() {
  const list = inboxReqs(), returned = S.requests.filter(r => r.status === 'returned').length;
  return `<div class="card inbox"><div class="between wrap"><h2 style="margin:0">📨 คำขอออนไลน์จากหน่วยงานภายนอก ${list.length ? `<span class="badge danger">รอรับ ${list.length}</span>` : ''}</h2>${returned ? `<span class="muted small">ส่งกลับให้แก้ไข ${returned} รายการ (รอหน่วยงานแก้ไข)</span>` : ''}</div>
  ${list.length ? list.map(r => `<div class="inbox-item"><div class="between wrap"><div><b>${esc(r.agency)}</b><div class="sub">หนังสือที่ ${esc(r.docNo)} ลงวันที่ ${fmtLong(r.docDate)} · ส่งเมื่อ ${fmtDT(r.submittedAt)} · ${r.form == 1 ? 'แนบใบรายชื่อ' : 'ระบุรายชื่อ'} · ${esc(r.email)}</div></div>
    <div class="row"><button type="button" class="btn btn-green sm" data-act="acceptopen" data-id="${r.id}">✅ รับหนังสือ</button><button type="button" class="btn btn-outline sm" data-act="retopen" data-id="${r.id}">↩️ ส่งกลับให้แก้ไข</button></div></div>
    <p class="small" style="margin:8px 0 0">${r.persons.map(p => esc(pName(p)) + (p.sid ? ` (${esc(p.sid)})` : '')).join(' · ')}</p>
    ${attChips(r)}
    ${U.acceptId === r.id ? `<div class="row" style="margin-top:8px"><label for="acc-reg" style="margin:0">เลขทะเบียนรับ (จากงานธุรการ)</label><input id="acc-reg" placeholder="เช่น 1234/${beYear()}" style="flex:1;min-width:180px;max-width:260px"><button type="button" class="btn btn-green sm" data-act="acceptreq" data-id="${r.id}">ยืนยันรับหนังสือ</button></div>` : ''}
    ${U.returnId === r.id ? `<div class="row" style="margin-top:8px"><input id="ret-reason" placeholder="เหตุผล เช่น ไม่ได้แนบหนังสือขอตรวจสอบ" style="flex:1;min-width:220px"><button type="button" class="btn btn-red sm" data-act="returnreq" data-id="${r.id}">ยืนยันส่งกลับ</button></div>` : ''}</div>`).join('') : '<p class="muted" style="margin:8px 0 0">ยังไม่มีคำขอใหม่ คำขอที่หน่วยงานส่งผ่านระบบจะแสดงที่นี่ให้กดรับหนังสือ</p>'}</div>`;
}

/* ---------- ส่วนประกอบ ---------- */
function stat(label, n, unit, color) {
  return `<div class="lc" style="--accent:${color}"><span class="lc-label">${label}</span><div class="lc-num">${n}${unit ? `<span class="unit">${unit}</span>` : ''}</div></div>`;
}
function bar(label, v, max, k) {
  return `<div class="barrow"><span>${label}</span><div class="bartrack"><div class="barfill b-${k}" style="width:${(v / max) * 100}%"></div></div><b>${v}</b></div>`;
}
function resultSummary(r) {
  const c = k => r.persons.filter(p => p.result === k).length;
  const parts = [];
  if (c('found')) parts.push(`<span class="badge ok">ตรง ${c('found')}</span>`);
  if (c('mismatch')) parts.push(`<span class="badge info">ไม่ตรง ${c('mismatch')}</span>`);
  if (c('notfound')) parts.push(`<span class="badge danger">ไม่พบ ${c('notfound')}</span>`);
  if (c('pending')) parts.push(`<span class="badge warn">รอ ${c('pending')}</span>`);
  return `<div class="row" style="gap:4px">${parts.join('')}</div>`;
}
function reqTable(list, ctx) {
  if (!list.length) return `<p class="muted">ยังไม่มีหนังสือ</p>`;
  return `<div class="tablewrap"><table><thead><tr><th>เลขรับ</th><th>วันที่รับ</th><th>หน่วยงาน / เลขที่หนังสือ</th><th>แบบ</th><th class="num">ราย</th><th>สถานะ</th><th></th></tr></thead><tbody>
  ${list.map(r => `<tr><td><b>${esc(r.regNo)}</b></td><td>${fmtBE(r.recvDate)}</td><td>${esc(r.agency)}<div class="sub">ที่ ${esc(r.docNo)}</div></td><td>${r.form == 1 ? 'แบบที่ 1' : 'แบบที่ 2'}</td><td class="num">${r.persons.length}</td><td>${statusBadge(r)}<div style="margin-top:4px">${ageChip(r)}</div></td>
  <td class="tdact"><button type="button" class="btn btn-outline sm" data-act="openverify" data-id="${r.id}">ตรวจสอบ</button>${ctx === 'dash' ? '' : ` <button type="button" class="btn btn-outline sm" data-act="opentrack" data-id="${r.id}">ติดตาม</button>`}${ctx === 'receive' && r.status !== 'replied' ? ` <button type="button" class="btn btn-outline sm" data-act="editreq" data-id="${r.id}">แก้ไข</button>` : ''}${ctx === 'receive' ? ` <button type="button" class="btn btn-outline sm" data-act="delreq" data-id="${r.id}">ลบ</button>` : ''}</td></tr>`).join('')}
  </tbody></table></div>`;
}
function deliveryLine(r) {
  const d = r.delivery; if (!d) return '';
  const trk = d.track ? ` เลขพัสดุ <a href="https://track.thailandpost.co.th/?trackNumber=${encodeURIComponent(d.track)}" target="_blank" rel="noopener"><b>${esc(d.track)}</b></a>` : '';
  const how = d.method === 'email' ? `ไปรษณีย์อิเล็กทรอนิกส์ถึง ${esc(d.to)}` : d.method === 'post' ? `ไปรษณีย์ (${esc(d.type)})${trk}` : 'ส่งถึงหน่วยงานแล้ว';
  return `<p class="notice ok small" style="margin:8px 0 0">📬 ส่งหนังสือตอบเมื่อ ${fmtLong(r.sentDate)} ทาง${how}</p>`;
}
function stepper(r) {
  const cur = STATUS[r.status].step;
  return `<ol class="stepper">${STEPS.map((s, i) => `<li class="${i <= cur ? 'done' : ''} ${i === cur ? 'cur' : ''}"><span>${i + 1}</span>${s}</li>`).join('')}</ol>`;
}

/* ---------- หน้าจอเจ้าหน้าที่ ---------- */
function vDash() {
  const R = REQS(), open = R.filter(r => r.status !== 'replied'), inbox = inboxReqs().length;
  const persons = R.flatMap(r => r.persons), cnt = k => persons.filter(p => p.result === k).length, max = Math.max(1, persons.length);
  const debtors = new Set(S.fees.filter(f => f.amount - f.paid > 0).map(f => f.studentId)).size;
  const over = open.filter(r => ageOf(r).over).length;
  const done = R.filter(r => r.status === 'replied' && r.sentDate), avg = done.length ? (done.reduce((a, r) => a + ageOf(r).d, 0) / done.length) : null;
  const pendAg = (S.agencies || []).filter(x => !x.approved).length;
  return `
  <div class="pagehead between wrap"><div><h1>งานตรวจสอบวุฒิการศึกษา</h1><p class="muted">ข้อมูล ณ ${fmtLong(todayISO())} · กำหนดตอบภายใน ${slaDays()} วันนับจากวันที่รับ</p></div>
  <div class="row"><button type="button" class="btn btn-primary" data-act="go" data-v="receive">${ic('inbox')} รับหนังสือ${inbox ? ` <span class="pill">${inbox} ออนไลน์</span>` : ''}</button><button type="button" class="btn btn-outline" data-act="go" data-v="outgoing">${ic('send')} หนังสือส่งออก</button></div></div>
  <div class="ledger">${stat('หนังสือรับทั้งหมด', R.length, 'ฉบับ', 'var(--primary)')}${stat('อยู่ระหว่างดำเนินการ', open.length, 'ฉบับ', 'var(--gold)')}${stat('เกินกำหนดตอบ', over, 'ฉบับ', over ? 'var(--red)' : 'var(--outline)')}${stat('ส่งหนังสือตอบแล้ว', R.length - open.length, 'ฉบับ', 'var(--green)')}${stat('เวลาตอบเฉลี่ย', avg == null ? '–' : avg.toFixed(1), avg == null ? '' : 'วัน', 'var(--blue)')}</div>
  ${pendAg ? `<div class="notice warn row">${ic('building')} มีหน่วยงานภายนอกลงทะเบียนรออนุมัติ ${pendAg} หน่วยงาน <button type="button" class="btn btn-outline sm" data-act="go" data-v="settings">ตรวจสอบและอนุมัติ</button></div>` : ''}
  <div class="grid g-main">
    <section class="card"><div class="between"><div><h2 style="margin:0">งานที่ต้องทำต่อ</h2><p class="muted small" style="margin:2px 0 0">เรียงตามความเร่งด่วน: เกินกำหนด › คำขอใหม่ › รอตรวจ › รอออกหนังสือ</p></div><button type="button" class="btn btn-outline sm" data-act="go" data-v="track">ดูทั้งหมด</button></div>${workQueue()}</section>
    <div class="stack">
      <section class="card"><h2>ผลการตรวจสอบรายบุคคล</h2><div class="bars">${['found', 'mismatch', 'notfound', 'pending'].map(k => bar(RESULT[k].t, cnt(k), max, k)).join('')}</div><p class="muted small" style="margin:0">รวม ${persons.length} ราย จาก ${R.length} หนังสือ · ฐานข้อมูลผู้สำเร็จ ${S.students.length.toLocaleString('th-TH')} ราย</p></section>
      <section class="card fee-card"><div class="between"><h2 style="margin:0">ค่าบำรุงการศึกษาค้างชำระ</h2><span class="badge neutral">${ic('lock')} เฉพาะเจ้าหน้าที่</span></div><div class="fee-num">฿${money(totalOutstanding())}</div><div class="between"><span class="muted small">${debtors} ราย · ไม่แสดงต่อหน่วยงานภายนอก</span><button type="button" class="btn btn-outline sm" data-act="go" data-v="fees">จัดการ</button></div></section>
      <section class="card"><h2>ความเคลื่อนไหวล่าสุด</h2>${recentActivity()}</section>
    </div>
  </div>`;
}

function vReceive() {
  const d = U.draft;
  const opt = v => ['', 'ม.3', 'ม.6'].map(o => `<option value="${o}" ${v === o ? 'selected' : ''}>${o || '–'}</option>`).join('');
  return `<div class="pagehead"><h1>รับหนังสือขอตรวจสอบวุฒิ</h1><p class="muted">ลงทะเบียนรับหนังสือจากหน่วยงาน แล้วระบุรายชื่อผู้ที่ขอให้ตรวจสอบ</p></div>
  ${onlineInbox()}
  ${scanCard('staff')}
  <form class="card form ${d.editingId ? 'editing' : ''}" data-form="receive" id="rc-form" novalidate>
    ${d.editingId ? `<div class="notice warn between wrap" style="margin:0 0 14px"><span>✏️ กำลังแก้ไขข้อมูลรับหนังสือ เลขรับ <b>${esc((getReq(d.editingId) || {}).regNo || '')}</b> · ผลการตรวจสอบของรายที่ไม่เปลี่ยนข้อมูลจะคงไว้</span><button type="button" class="btn btn-outline sm" data-act="canceledit">ยกเลิกการแก้ไข</button></div>` : ''}
    <div class="grid g3">
      <div><label for="rc-reg">เลขทะเบียนรับ (จากงานธุรการ)</label><input id="rc-reg" data-in="df" data-f="regno" value="${esc(d.regno || '')}" placeholder="เช่น 1234/${beYear()}">${!d.editingId && nextRegNo() ? `<div class="hintline">เลขถัดจากฉบับล่าสุด <button type="button" class="linkbtn" data-act="usereg" data-v="${nextRegNo()}">${nextRegNo()}</button></div>` : ''}</div>
      <div><label for="rc-date">วันที่รับ</label><input id="rc-date" type="date" data-in="df" data-f="date" value="${esc(d.date)}"></div>
      <div><label for="rc-email">E-mail หน่วยงาน (ใช้ดูสถานะ/รับผล)</label><input id="rc-email" type="email" data-in="df" data-f="email" value="${esc(d.email)}" placeholder="hr@company.co.th"></div>
      <div class="span2"><label for="rc-agency">หน่วยงานที่ขอตรวจสอบ</label><input id="rc-agency" data-in="df" data-ch="agencypick" data-f="agency" list="agency-list" autocomplete="off" value="${esc(d.agency)}" placeholder="เช่น บริษัท ตัวอย่าง จำกัด">${agencyDatalist()}<div class="hintline">เลือกหน่วยงานที่เคยส่งหนังสือ ระบบจะเติมอีเมล ที่อยู่ และผู้รับให้</div></div>
      <div><label for="rc-docno">เลขที่หนังสือของหน่วยงาน</label><input id="rc-docno" data-in="df" data-f="docno" value="${esc(d.docno)}" placeholder="เช่น ABC 123/2569"></div>
      <div class="span2"><label for="rc-to">เรียน (ผู้รับหนังสือตอบ)</label><input id="rc-to" data-in="df" data-f="to" value="${esc(d.to)}" placeholder="เช่น ผู้จัดการฝ่ายทรัพยากรบุคคล บริษัท ตัวอย่าง จำกัด"></div>
      <div><label for="rc-docdate">หนังสือลงวันที่</label><input id="rc-docdate" type="date" data-in="df" data-f="docdate" value="${esc(d.docdate)}"></div>
      <div class="span2"><label for="rc-aaddr">ที่อยู่หน่วยงาน (สำหรับส่งไปรษณีย์)</label><textarea id="rc-aaddr" rows="2" data-in="df" data-f="aaddr" style="font-family:inherit;font-size:15px" placeholder="เลขที่ ถนน ตำบล/แขวง อำเภอ/เขต จังหวัด รหัสไปรษณีย์">${esc(d.aaddr || '')}</textarea></div>
      <div><label for="rc-aphone">โทรศัพท์หน่วยงาน</label><input id="rc-aphone" data-in="df" data-f="aphone" value="${esc(d.aphone || '')}"></div>
    </div>
    <div id="rc-dup">${dupWarn(d)}</div>
    <div class="formsel" role="radiogroup" aria-label="รูปแบบหนังสือ">
      <label class="opt ${d.form == 1 ? 'on' : ''}"><input type="radio" name="rc-form" value="1" data-ch="dform" ${d.form == 1 ? 'checked' : ''}><b>📄 แบบที่ 1 แนบใบรายชื่อ</b><span>หน่วยงานแนบไฟล์หรือเอกสารรายชื่อมาพร้อมหนังสือ</span></label>
      <label class="opt ${d.form == 2 ? 'on' : ''}"><input type="radio" name="rc-form" value="2" data-ch="dform" ${d.form == 2 ? 'checked' : ''}><b>📄 แบบที่ 2 ระบุรายชื่อ</b><span>กรณีไม่แนบใบรายชื่อ รายชื่อระบุอยู่ในเนื้อหนังสือ</span></label>
    </div>
    ${d.form == 1 ? `<div class="attach"><label for="rc-file" style="margin:0">ใบรายชื่อที่แนบมา (CSV / Excel / PDF / รูปภาพ)</label><input type="file" id="rc-file" data-ch="dfile" accept=".csv,.txt,.xls,.xlsx,.pdf,image/*"><p class="muted small">${d.file ? '✅ แนบแล้ว: <b>' + esc(d.file) + '</b> · ' : ''}ไฟล์ CSV/Excel ระบบดึงรายชื่อลงตารางให้ ถ้าเป็น PDF หรือรูปภาพ ให้พิมพ์รายชื่อลงตารางด้านล่าง</p></div>` : ''}
    <div class="between"><h3>รายชื่อผู้ขอตรวจสอบ (${d.persons.length} ราย)</h3><button type="button" class="btn btn-outline sm" data-act="addp">+ เพิ่มรายชื่อ</button></div>
    <p class="muted small" style="margin:0 0 8px">💡 กรอกอย่างใดอย่างหนึ่ง: รหัสประจำตัว 5 หลัก, เลขบัตรประชาชน 13 หลัก หรือชื่อ-สกุล ระบบจะดึงข้อมูลที่เหลือจากฐานข้อมูลผู้สำเร็จการศึกษาให้อัตโนมัติ</p>
    ${prefixList()}<div class="tablewrap"><table class="edit"><thead><tr><th>#</th><th>เลขประจำตัวนักเรียนเดิม</th><th>เลขบัตรประชาชน</th><th>คำนำหน้า/ยศ *</th><th>ชื่อ</th><th>สกุล</th><th>วันเดือนปีที่จบ</th><th>ระดับชั้น</th><th></th></tr></thead><tbody>
    ${d.persons.map((p, i) => `<tr><td>${i + 1}</td>
      <td><input id="dp-${i}-sid" aria-label="เลขประจำตัว แถว ${i + 1}" data-in="dp" data-ch="dpsid" data-i="${i}" data-f="sid" value="${esc(p.sid)}" inputmode="numeric" placeholder="รหัส 5 หลัก"><div class="db-hit" id="dp-${i}-hit" ${p.dbId ? '' : 'hidden'}>✓ ดึงจากฐานข้อมูล</div></td>
      <td><input id="dp-${i}-cid" class="cid" aria-label="เลขบัตรประชาชน แถว ${i + 1}" data-in="dp" data-ch="dpkey" data-i="${i}" data-f="cid" value="${esc(p.cid || '')}" inputmode="numeric" maxlength="17" placeholder="13 หลัก"></td>
      <td><input id="dp-${i}-prefix" class="pfx" list="prefix-list" aria-label="คำนำหน้าหรือยศ แถว ${i + 1}" data-in="dp" data-i="${i}" data-f="prefix" value="${esc(p.prefix)}" placeholder="นาย / นางสาว / ยศ"></td>
      <td><input id="dp-${i}-fname" aria-label="ชื่อ แถว ${i + 1}" data-in="dp" data-ch="dpkey" data-i="${i}" data-f="fname" value="${esc(p.fname)}"></td>
      <td><input id="dp-${i}-lname" aria-label="สกุล แถว ${i + 1}" data-in="dp" data-ch="dpkey" data-i="${i}" data-f="lname" value="${esc(p.lname)}"></td>
      <td><input id="dp-${i}-grad" aria-label="วันที่จบ แถว ${i + 1}" data-in="dp" data-i="${i}" data-f="gradText" value="${esc(p.gradText)}" placeholder="31/03/2568"></td>
      <td><select id="dp-${i}-level" aria-label="ระดับชั้น แถว ${i + 1}" data-ch="dp" data-i="${i}" data-f="level">${opt(p.level)}</select></td>
      <td><button type="button" class="icon-btn" data-act="delp" data-i="${i}" aria-label="ลบแถว ${i + 1}">✕</button></td></tr>`).join('')}
    </tbody></table></div>
    <div class="row end">${d.editingId ? '' : '<button type="button" class="btn btn-outline" data-act="resetdraft">ล้างฟอร์ม</button>'}<button class="btn btn-primary" type="submit">${d.editingId ? '💾 บันทึกการแก้ไข' : 'บันทึกรับหนังสือ'}</button></div>
  </form>
  <div class="card"><h2>ทะเบียนหนังสือรับ</h2>${reqTable(REQS().sort(byRecv), 'receive')}</div>`;
}

function quickResults() {
  const q = U.vq.trim();
  if (!q) return '';
  const qd = digits(q), qn = normName(q);
  const hits = S.students.filter(s => (qd.length >= 3 && (sidKey(s.sid).includes(sidKey(qd)) || s.cid.includes(qd))) || (qn && normName(fullName(s)).includes(qn))).slice(0, 8);
  if (!hits.length) return `<p class="muted small" style="margin:12px 0 0">ไม่พบ "${esc(q)}" ในฐานข้อมูลผู้สำเร็จการศึกษา</p>`;
  return `<div class="tablewrap" style="margin-top:12px"><table><thead><tr><th>รหัส</th><th>ชื่อ-สกุล</th><th>ระดับ</th><th>วันที่จบ</th><th>GPA</th><th>ปพ.1 ชุดที่/เลขที่</th><th>ค้างชำระ</th></tr></thead><tbody>
  ${hits.map(s => { const o = outstanding(s.id); return `<tr><td>${esc(s.sid)}</td><td>${esc(fullName(s))}</td><td>${esc(s.level)}</td><td>${fmtBE(s.gradDate)}</td><td>${esc(s.gpa || '-')}</td><td>${s.pp1Set || s.pp1No ? `${esc(s.pp1Set || '-')} / ${esc(s.pp1No || '-')}` : '-'}</td><td>${o > 0 ? `<span class="badge danger">฿${money(o)}</span>` : '<span class="badge ok">ไม่มี</span>'}</td></tr>`; }).join('')}</tbody></table></div>`;
}
const NOTE_PRESETS = ['ศึกษาต่อสถาบันอื่น', 'ลาออกระหว่างปีการศึกษา', 'ย้ายสถานศึกษา', 'ยังไม่สำเร็จการศึกษา', 'ไม่มีรายชื่อในทะเบียนนักเรียน', 'ชื่อ-สกุลไม่ตรงกับหลักฐาน', 'วันที่สำเร็จการศึกษาไม่ตรงกับหลักฐาน', 'ระดับชั้นที่สำเร็จไม่ตรงกับหลักฐาน', 'จบ ม.6 ภาคเรียนที่ 1'];
const pp1Text = s => s.pp1Set || s.pp1No ? `ปพ.1 ชุดที่ ${esc(s.pp1Set || '-')} เลขที่ ${esc(s.pp1No || '-')}` : '';
function pp1Cell(s, lock) {
  if (s.pp1Set && s.pp1No) return `<div class="pp1">📘 ${pp1Text(s)}</div>`;
  if (lock) return `<div class="pp1 muted">ไม่มีข้อมูลเลข ปพ.1</div>`;
  return `<div class="pp1-edit"><span class="small muted">ปพ.1</span><input id="pp1s-${s.id}" aria-label="ปพ.1 ชุดที่" data-ch="pp1" data-s="${s.id}" data-f="pp1Set" value="${esc(s.pp1Set || '')}" placeholder="ชุดที่ 00000" inputmode="numeric" maxlength="7"><input id="pp1n-${s.id}" aria-label="ปพ.1 เลขที่" data-ch="pp1" data-s="${s.id}" data-f="pp1No" value="${esc(s.pp1No || '')}" placeholder="เลขที่ 000000" inputmode="numeric" maxlength="8"></div>`;
}
function vVerify() {
  const opts = REQS().sort(byRecv).map(r => `<option value="${r.id}" ${r.id === U.reqId ? 'selected' : ''}>${esc(r.regNo)} · ${esc(r.agency)} (${r.persons.length} ราย · ${STATUS[r.status].t})</option>`).join('');
  const r = getReq(U.reqId);
  return `<div class="pagehead"><h1>ตรวจสอบและบันทึกผลรายบุคคล</h1><p class="muted">เทียบรายชื่อในหนังสือกับฐานข้อมูลผู้สำเร็จการศึกษา แล้วยืนยันผลทีละราย</p></div>
  <div class="card"><div class="grid g-2-1"><div><label for="vf-req">เลือกหนังสือที่จะตรวจสอบ</label><select id="vf-req" data-ch="vfreq"><option value="">— เลือกหนังสือ —</option>${opts}</select></div>
  <div><label for="vf-q">ค้นหาผู้สำเร็จการศึกษารายบุคคล</label><input id="vf-q" data-in="vfq" value="${esc(U.vq)}" placeholder="รหัส / เลขบัตร / ชื่อ-สกุล"></div></div><div id="vf-quick">${quickResults()}</div></div>
  ${r ? verifyPanel(r) : `<div class="card empty">เลือกหนังสือจากรายการด้านบนเพื่อเริ่มตรวจสอบ</div>`}`;
}
const DEBT_NOTE_DEFAULT = 'โปรดแจ้งเจ้าของประวัติติดต่องานวัดและประเมินผลโดยเร็ว';
const debtNote = () => (S.settings.debtNote || '').trim() || DEBT_NOTE_DEFAULT;
/* ข้อมูลที่ต้องครบก่อนยืนยันว่า "สำเร็จการศึกษาจริง" */
function missingData(p, r) {
  if (p.result !== 'found') return [];
  const s = getStu(p.matchedId); if (!s) return ['ไม่ได้จับคู่กับฐานข้อมูล'];
  const m = [];
  if (!s.pp1Set) m.push('ปพ.1 ชุดที่'); if (!s.pp1No) m.push('ปพ.1 เลขที่');
  if (!s.gradDate) m.push('วันที่จบ');
  if (r && showGpa(r) && !s.gpa) m.push('เกรดเฉลี่ย');
  return m;
}
const incompleteOf = r => r.persons.filter(p => missingData(p, r).length);
const hasDebt = p => { const s = p.result === 'found' && getStu(p.matchedId); return !!s && outstanding(s.id) > 0; };
/* หมายเหตุที่แสดงในหนังสือ/หน้าหน่วยงาน (ไม่ระบุยอดเงิน) */
function letterNote(p) {
  const base = p.note || (p.result === 'found' ? '' : DEFAULT_NOTE[p.result] || '');
  if (!hasDebt(p) || base.includes(debtNote())) return base;
  return base ? `${base} ${debtNote()}` : debtNote();
}
function verifyPanel(r) {
  const pend = r.persons.filter(p => p.result === 'pending').length, inc = r.status === 'replied' ? [] : incompleteOf(r), debt = r.persons.filter(hasDebt);
  return `<div class="card"><div class="between wrap"><div><span class="eyebrow">เลขรับ ${esc(r.regNo)} · ${r.form == 1 ? 'แบบที่ 1 แนบใบรายชื่อ' : 'แบบที่ 2 ระบุรายชื่อ'}</span><h2 style="margin:4px 0">${esc(r.agency)}</h2><p class="muted small" style="margin:0">หนังสือที่ ${esc(r.docNo)} ลงวันที่ ${fmtLong(r.docDate)} · รับเมื่อ ${fmtLong(r.recvDate)}${r.file ? ' · ไฟล์แนบ ' + esc(r.file) : ''}${r.source === 'online' ? ' · <span class="badge info">ส่งผ่านระบบออนไลน์</span>' : ''}</p>${attChips(r)}</div>
  <div class="row">${statusBadge(r)}${r.status !== 'replied' ? `<button type="button" class="btn btn-outline" data-act="editreq" data-id="${r.id}">✏️ แก้ไขข้อมูลรับหนังสือ</button><button type="button" class="btn btn-blue" data-act="automatch" data-id="${r.id}">⚡ ตรวจอัตโนมัติ</button>` : ''}<button type="button" class="btn btn-green" data-act="letter" data-id="${r.id}" ${pend || inc.length ? 'disabled' : ''}>📝 หนังสือตอบ</button></div></div>
  ${pend && r.status !== 'replied' ? `<p class="notice warn" style="margin-top:14px">ยังมี ${pend} รายที่รอผล กด "ตรวจอัตโนมัติ" แล้วตรวจทานผลก่อนสร้างหนังสือตอบ</p>` : ''}
  ${inc.length ? `<p class="notice danger" style="margin-top:10px">ข้อมูลยังไม่ครบสำหรับผู้ที่ยืนยันว่าสำเร็จการศึกษาจริง ${inc.length} ราย: ${inc.map(p => `<b>${esc(pName(p))}</b> (ขาด ${missingData(p, r).join(', ')})`).join(' · ')} — กรอกให้ครบก่อนสร้างหนังสือตอบ</p>` : ''}
  ${r.status !== 'replied' && wantsPP1(r) && pp1Missing(r).length ? `<p class="notice warn" style="margin-top:10px">📘 หน่วยงานนี้ต้องการสำเนา ปพ.1 ประกอบหนังสือตอบ ยังไม่มีไฟล์ ${pp1Missing(r).length} ราย: ${pp1Missing(r).map(t => esc(pName(t.p))).join(', ')} — กด "แนบสำเนา ปพ.1" ในตาราง</p>` : ''}
  ${debt.length && r.status !== 'replied' ? `<p class="notice warn" style="margin-top:10px">⚠️ มียอดค้างชำระค่าบำรุงการศึกษา ${debt.length} ราย: ${debt.map(p => esc(pName(p))).join(', ')} · หนังสือตอบจะมีหมายเหตุ "${esc(debtNote())}" (ไม่ระบุยอดเงิน)</p>` : ''}
  <div class="tablewrap" style="margin-top:14px"><table><thead><tr><th>#</th><th>ข้อมูลตามหนังสือ</th><th>ข้อมูลในฐานข้อมูลโรงเรียน</th><th class="num">เกรดเฉลี่ย</th><th>ค่าบำรุงค้างชำระ</th><th>ผลการตรวจสอบ</th><th>หมายเหตุ / ปัญหาที่พบ (แสดงในหนังสือตอบ)</th></tr></thead><tbody>
  ${r.persons.map((p, i) => {
    const s = getStu(p.matchedId), o = s ? outstanding(s.id) : 0;
    return `<tr><td>${i + 1}</td>
    <td><b>${esc(pName(p))}</b><div class="sub">เลขประจำตัว ${esc(p.sid || '-')} · จบ ${p.gradDate ? fmtBE(p.gradDate) : esc(p.gradText || '-')} · ${esc(p.level || '-')}</div>${priorHTML(p, r)}</td>
    <td>${s ? `<b>${esc(fullName(s))}</b><div class="sub">รหัส ${esc(s.sid)} · ${esc(s.level)} · จบ ${fmtBE(s.gradDate)}</div>${pp1Cell(s, r.status === 'replied')}${pp1Mini(s, r)}${stuExtra(s)}${missingData(p, r).length && r.status !== 'replied' ? `<div class="small" style="color:var(--danger-fg);font-weight:700">⚠️ ขาด ${missingData(p, r).join(', ')}</div>` : ''}` : '<span class="muted">—</span>'}${p.auto ? `<div class="small auto">${esc(p.auto)}</div>` : ''}${suggestHTML(p, r, i)}</td>
    <td class="num">${s && s.gpa ? `<b>${esc(s.gpa)}</b>` : '<span class="muted">—</span>'}</td>
    <td>${s ? (o > 0 ? `<span class="badge danger">฿${money(o)}</span>` : '<span class="badge ok">ไม่มี</span>') : '<span class="muted">—</span>'}</td>
    <td><select id="res-${p.id}" aria-label="ผลการตรวจสอบ ${esc(p.fname)}" class="res r-${p.result}" data-ch="res" data-r="${r.id}" data-i="${i}" ${r.status === 'replied' ? 'disabled' : ''}>${Object.entries(RESULT).map(([k, v]) => `<option value="${k}" ${p.result === k ? 'selected' : ''}>${v.t}</option>`).join('')}</select></td>
    <td><input id="note-${p.id}" aria-label="หมายเหตุ ${esc(p.fname)}" data-ch="note" data-r="${r.id}" data-i="${i}" value="${esc(p.note)}" list="note-presets" placeholder="${hasDebt(p) ? 'ระบบใส่หมายเหตุค้างชำระให้' : p.result === 'found' ? 'ถ้ามี' : 'ระบุปัญหาที่พบ'}" ${r.status === 'replied' ? 'disabled' : ''}></td></tr>`;
  }).join('')}
  </tbody></table></div><datalist id="note-presets">${NOTE_PRESETS.map(o => `<option value="${o}"></option>`).join('')}</datalist><p class="muted small" style="margin:10px 0 0">🔒 คอลัมน์ค่าบำรุงค้างชำระและเลข ปพ.1 แสดงเฉพาะเจ้าหน้าที่ ไม่ปรากฏในหนังสือตอบและหน้าหน่วยงานภายนอก</p></div>`;
}

function vOutgoing() {
  const R = REQS().sort(byRecv);
  const waitLetter = R.filter(r => r.status === 'done' && !r.outNo).length, waitSend = R.filter(r => r.outNo && r.status !== 'replied').length, sent = R.filter(r => r.status === 'replied').length;
  return `<div class="pagehead"><h1>หนังสือส่งออกตรวจสอบวุฒิ</h1><p class="muted">สร้างหนังสือแจ้งผล ออกเลขหนังสือส่ง และบันทึกการส่งถึงหน่วยงาน</p></div>
  <div class="ledger">${stat('รอสร้างหนังสือตอบ', waitLetter, 'ฉบับ', 'var(--yellow)')}${stat('ออกเลขแล้ว รอส่ง', waitSend, 'ฉบับ', 'var(--blue)')}${stat('ส่งแล้ว', sent, 'ฉบับ', 'var(--green)')}</div>
  <p class="notice ${outLeft() <= 5 ? 'warn' : 'info'}" style="margin:0">เลขหนังสือส่งที่ได้รับจัดสรร ${S.settings.docPrefix}${S.settings.outFrom}–${S.settings.outTo} · เลขถัดไป ${Math.max(S.settings.nextOut, S.settings.outFrom)} · เหลือ ${outLeft()} เลข <button type="button" class="btn btn-outline sm" data-act="go" data-v="settings">กำหนดช่วงเลข</button></p>
  <div class="card"><h2>ทะเบียนหนังสือส่ง</h2><div class="tablewrap"><table><thead><tr><th>เลขรับ</th><th>หน่วยงาน</th><th>สรุปผล</th><th>เลขหนังสือส่ง</th><th>วันที่ส่ง</th><th>สถานะ</th><th></th></tr></thead><tbody>
  ${R.map(r => { const pend = r.persons.some(p => p.result === 'pending'); return `<tr><td><b>${esc(r.regNo)}</b></td><td>${esc(r.agency)}<div class="sub">อ้างถึง ${esc(r.docNo)}</div></td><td>${resultSummary(r)}</td><td>${r.outNo ? esc(S.settings.docPrefix + r.outNo) : '<span class="muted">—</span>'}</td><td>${r.sentDate ? fmtBE(r.sentDate) : '<span class="muted">—</span>'}</td><td>${statusBadge(r)}</td>
  <td class="tdact">${pend || (r.status !== 'replied' && incompleteOf(r).length) ? `<button type="button" class="btn btn-outline sm" data-act="openverify" data-id="${r.id}">${pend ? 'ตรวจให้ครบก่อน' : 'ข้อมูลยังไม่ครบ'}</button>` : `<button type="button" class="btn btn-outline sm" data-act="letter" data-id="${r.id}">📝 ${r.outNo ? 'ดูหนังสือ' : 'สร้างหนังสือ'}</button>`}${r.outNo && r.status !== 'replied' ? ` <button type="button" class="btn btn-green sm" data-act="sent" data-id="${r.id}">บันทึกส่งแล้ว</button>` : ''}</td></tr>`; }).join('')}
  </tbody></table></div></div>`;
}

function trackList() {
  const q = U.tq.trim().toLowerCase();
  const list = REQS().sort(byRecv).filter(r => !q || [r.regNo, r.docNo, r.agency, r.outNo].join(' ').toLowerCase().includes(q));
  if (!list.length) return `<p class="muted small">ไม่พบหนังสือที่ตรงกับคำค้น</p>`;
  return list.map(r => `<button type="button" class="titem ${r.id === U.trackId ? 'on' : ''}" data-act="trsel" data-id="${r.id}"><b>${esc(r.regNo)} · ${esc(r.agency)}</b><span class="sub">ที่ ${esc(r.docNo)}</span><span>${statusBadge(r)}</span></button>`).join('');
}
function trackDetail(r) {
  if (!r) return `<p class="muted">เลือกหนังสือจากรายการ</p>`;
  return `<span class="eyebrow">เลขรับ ${esc(r.regNo)}</span><h2 style="margin:4px 0">${esc(r.agency)}</h2><p class="muted small" style="margin:0">หนังสือที่ ${esc(r.docNo)} · E-mail ${esc(r.email)} · ${r.persons.length} ราย</p>
  ${stepper(r)}${deliveryLine(r)}
  <div class="row" style="margin:14px 0"><button type="button" class="btn btn-outline sm" data-act="openverify" data-id="${r.id}">🔍 ผลการตรวจสอบ</button>${r.persons.every(p => p.result !== 'pending') ? `<button type="button" class="btn btn-outline sm" data-act="letter" data-id="${r.id}">📝 หนังสือตอบ</button>` : ''}</div>
  <h3 style="margin-bottom:10px">ประวัติการดำเนินการ</h3>
  <ul class="timeline">${r.timeline.slice().sort((a, b) => b.t - a.t).map(e => `<li class="${e.pub ? '' : 'priv'}"><time>${fmtDT(e.t)}</time>${esc(e.text)}${e.pub ? '' : ' <span class="badge info">🔒 ภายใน</span>'}</li>`).join('')}</ul>`;
}
function vTrack() {
  if (!getReq(U.trackId)) U.trackId = (REQS().sort(byRecv)[0] || {}).id || null;
  return `<div class="pagehead"><h1>ติดตามสถานะหนังสือ</h1><p class="muted">ดูขั้นตอนและประวัติการดำเนินการของหนังสือแต่ละฉบับ รายการที่มี 🔒 ไม่แสดงต่อหน่วยงานภายนอก</p></div>
  <div class="grid g-1-2"><div class="card"><label for="tr-q">ค้นหาหนังสือ</label><input id="tr-q" data-in="trq" value="${esc(U.tq)}" placeholder="เลขรับ / เลขที่หนังสือ / หน่วยงาน"><div class="tlist" id="tr-list">${trackList()}</div></div>
  <div class="card" id="tr-detail">${trackDetail(getReq(U.trackId))}</div></div>`;
}

function gradsTable() {
  const q = U.gq.trim(), qd = digits(q), qn = normName(q);
  const list = S.students.filter(s => (!U.glevel || s.level === U.glevel) && (!q || (qd.length >= 2 && (sidKey(s.sid).includes(sidKey(qd)) || s.cid.includes(qd))) || (qn && normName(fullName(s)).includes(qn))))
    .sort((a, b) => (b.gradDate || '').localeCompare(a.gradDate || '') || a.sid.localeCompare(b.sid));
  const shown = list.slice(0, 300);
  return `<p class="muted small">แสดง ${shown.length.toLocaleString('th-TH')} จาก ${list.length.toLocaleString('th-TH')} ราย${list.length > 300 ? ' (พิมพ์ค้นหาเพื่อกรอง)' : ''}</p>
  <div class="tablewrap"><table><thead><tr><th>รหัสประจำตัว</th><th>เลขบัตรประชาชน</th><th>ชื่อ-สกุล</th><th>ระดับชั้น</th><th>วันที่จบ</th><th>GPA</th><th>ปพ.1 ชุดที่/เลขที่</th><th>ค้างชำระ</th><th></th></tr></thead><tbody>
  ${shown.map(s => { const o = outstanding(s.id); return `<tr><td><b>${esc(s.sid || '-')}</b></td><td>${esc(maskCid(s.cid))}</td><td>${esc(fullName(s))}${s.father || s.mother ? `<div class="sub">${s.father ? 'บิดา ' + esc(s.father) : ''}${s.father && s.mother ? ' · ' : ''}${s.mother ? 'มารดา ' + esc(s.mother) : ''}</div>` : ''}${stuExtra(s)}</td><td>${esc(s.level)}</td><td>${fmtBE(s.gradDate)}</td><td>${esc(s.gpa || '-')}</td><td>${s.pp1Set || s.pp1No ? `${esc(s.pp1Set || '-')} / ${esc(s.pp1No || '-')}` : '<span class="muted">—</span>'}</td><td>${o > 0 ? `<span class="badge danger">฿${money(o)}</span>` : '<span class="muted">—</span>'}</td>
  <td><button type="button" class="btn btn-outline sm" data-act="delstu" data-id="${s.id}">ลบ</button></td></tr>`; }).join('') || `<tr><td colspan="9" class="muted">ไม่พบข้อมูล</td></tr>`}
  </tbody></table></div>`;
}
/* ---------- นำเข้าไฟล์ฐานข้อมูลนักเรียนที่จบการศึกษา (แบบฟอร์ม Excel ของงานทะเบียน) ---------- */
const STU_TEMPLATE_HEAD = ['ลำดับที่', 'เลขประจำตัวนักเรียน', 'เลขประจำตัวประชาชน', 'ชุดที่ ปพ.1', 'เลขที่ ปพ.1', 'เลขที่ ปพ.2', 'คำนำหน้า', 'ชื่อ', 'ชื่อสกุล', 'เกิดวันที่', 'เดือนเกิด', 'ปี พ.ศ. เกิด', 'คำนำหน้าบิดา', 'ชื่อบิดา', 'สกุลบิดา', 'คำนำหน้ามารดา', 'ชื่อมารดา', 'สกุลมารดา', 'หน่วยกิตที่เรียน', 'หน่วยกิตที่ได้', 'ผลการเรียนเฉลี่ยตลอดหลักสูตร', 'ผลการประเมินการอ่านคิดวิเคราะห์ และเขียน', 'ผลการประเมินคุณลักษณะอันพึงประสงค์', 'ผลการประเมินกิจกรรมพัฒนาผู้เรียน', 'หมายเหตุ', 'อื่นๆ (กรณีที่ไม่มีหลักฐาน) ระบุลำดับคอลัมภ์ที่พบว่าไม่มี', 'ประวัติค้างชำระค่าบำรุงการศึกษา'];
const DEBT_ITEM = 'ค่าบำรุงการศึกษา (ยอดค้างจากฐานข้อมูลนักเรียน)';
const padNum = (v, n) => { const d = digits(v); return d ? d.padStart(n, '0') : ''; };
function isStudentDB(rows) { return rows.some(r => r.some(c => /เลขประจำตัวนักเรียน/.test(String(c))) && r.some(c => /ชุดที่\s*ปพ/.test(String(c)))); }
function importStudentDB(rows, levelSel, gradSel, fileName) {
  const hi = rows.findIndex(r => r.some(c => /เลขประจำตัวนักเรียน/.test(String(c))) && r.some(c => /^ชื่อ$/.test(String(c).trim())));
  if (hi < 0) throw new Error('ไม่พบหัวตาราง "เลขประจำตัวนักเรียน" และ "ชื่อ" ในไฟล์');
  const h = rows[hi].map(c => String(c ?? '').replace(/\s+/g, ' ').trim());
  const col = (re, not) => h.findIndex(x => re.test(x) && !(not && not.test(x)));
  const C = {
    sid: col(/เลขประจำตัวนักเรียน/), cid: col(/ประชาชน/), set: col(/ชุดที่\s*ปพ/), no: col(/เลขที่\s*ปพ\.?\s*1/), pp2: col(/ปพ\.?\s*2/),
    pre: col(/^คำนำหน้า$/), fn: col(/^ชื่อ$/), ln: col(/^(ชื่อ)?สกุล$|^นามสกุล$/),
    bd: col(/เกิดวันที่|^วันเกิด$/), bm: col(/เดือนเกิด/), by: col(/ปี.*เกิด/),
    fpre: col(/คำนำหน้าบิดา/), ffn: col(/^ชื่อบิดา/), fln: col(/สกุลบิดา/), mpre: col(/คำนำหน้ามารดา/), mfn: col(/^ชื่อมารดา/), mln: col(/สกุลมารดา/),
    crA: col(/หน่วยกิตที่เรียน/), crB: col(/หน่วยกิตที่ได้/), gpa: col(/ผลการเรียนเฉลี่ย|เกรดเฉลี่ย|GPA/i),
    read: col(/อ่าน/), trait: col(/คุณลักษณะ/), act: col(/กิจกรรม/), note: col(/^หมายเหตุ/), miss: col(/ไม่มีหลักฐาน|^อื่นๆ/), debt: col(/ค้างชำระ/),
    level: col(/ระดับชั้น|ชั้นที่จบ/), grad: col(/วันที่จบ|วันที่สำเร็จ|อนุมัติ/)
  };
  if (C.level < 0 && !levelSel) throw new Error('ไฟล์ไม่มีคอลัมน์ระดับชั้น กรุณาเลือกระดับชั้นที่จบ');
  if (C.grad < 0 && !gradSel) throw new Error('ไฟล์ไม่มีคอลัมน์วันที่จบ กรุณากรอกวันที่จบ (วันที่อนุมัติการจบ)');
  const cell = (r, i) => i >= 0 ? String(r[i] ?? '').trim() : '';
  const join = (...a) => a.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  let added = 0, updated = 0, fees = 0, skipped = 0; const noPP1 = [];
  rows.slice(hi + 1).forEach(r => {
    const fname = cell(r, C.fn), sidRaw = cell(r, C.sid);
    if (!fname || !digits(sidRaw)) { if (r.some(c => String(c ?? '').trim())) skipped++; return; }
    const level = C.level >= 0 && cell(r, C.level) ? normLevel(cell(r, C.level)) : levelSel;
    const gradDate = (C.grad >= 0 && parseDateAny(cell(r, C.grad))) || gradSel;
    let dob = '';
    if (C.bd >= 0 && C.bm >= 0 && C.by >= 0) dob = findDate(`${cell(r, C.bd)} ${cell(r, C.bm)} ${cell(r, C.by)}`) || '';
    const missCols = cell(r, C.miss) ? thaiDigits(cell(r, C.miss)).split(/[^\d]+/).filter(Boolean).map(n => h[+n - 1]).filter(Boolean) : [];
    const obj = {
      sid: digits(sidRaw).padStart(Math.max(5, digits(sidRaw).length), '0'), cid: digits(cell(r, C.cid)),
      prefix: cell(r, C.pre), fname, lname: cell(r, C.ln), level, gradDate, dob,
      pp1Set: padNum(cell(r, C.set), 5), pp1No: padNum(cell(r, C.no), 6), pp2No: digits(cell(r, C.pp2)),
      father: join(cell(r, C.fpre) + cell(r, C.ffn), cell(r, C.fln)), mother: join(cell(r, C.mpre) + cell(r, C.mfn), cell(r, C.mln)),
      credits: cell(r, C.crA) || cell(r, C.crB) ? `${cell(r, C.crA) || '-'}/${cell(r, C.crB) || '-'}` : '',
      gpa: fmtGpa(cell(r, C.gpa)) || cell(r, C.gpa),
      evals: [cell(r, C.read), cell(r, C.trait), cell(r, C.act)],
      remark: cell(r, C.note), missingDocs: missCols, source: 'ฐานข้อมูลนักเรียน ' + (fileName || '')
    };
    if (!obj.pp1Set || !obj.pp1No) noPP1.push(fullName(obj));
    let s = S.students.find(x => (obj.cid && x.cid === obj.cid) || (sidKey(x.sid) === sidKey(obj.sid) && x.level === level));
    if (s) { Object.assign(s, obj); updated++; } else { s = Object.assign({ id: uid('s') }, obj); S.students.push(s); added++; }
    const debt = parseFloat(thaiDigits(cell(r, C.debt)).replace(/[^\d.]/g, '')) || 0;
    const fee = S.fees.find(f => f.studentId === s.id && f.item === DEBT_ITEM);
    if (debt > 0) { if (fee) { fee.amount = debt; fee.paid = 0; } else S.fees.push({ id: uid('f'), studentId: s.id, term: '', item: DEBT_ITEM, amount: debt, paid: 0, note: 'นำเข้าจากฐานข้อมูลนักเรียน' }); fees++; }
    else if (fee) fee.paid = fee.amount;
  });
  save();
  return { added, updated, fees, skipped, noPP1 };
}
/* รายละเอียดเพิ่มเติมจากฐานข้อมูล (เฉพาะเจ้าหน้าที่) */
function stuExtra(s) {
  const ev = (s.evals || []).filter(Boolean);
  const bits = [s.pp2No ? `ปพ.2 เลขที่ ${esc(s.pp2No)}` : '', s.credits ? `หน่วยกิต ${esc(s.credits)}` : '', ev.length === 3 ? `อ่านคิดฯ ${esc(ev[0])} · คุณลักษณะ ${esc(ev[1])} · กิจกรรม ${esc(ev[2])}` : ''].filter(Boolean);
  return (bits.length ? `<div class="sub">${bits.join(' · ')}</div>` : '')
    + (s.remark ? `<div class="sub">หมายเหตุ: ${esc(s.remark)}</div>` : '')
    + (s.missingDocs && s.missingDocs.length ? `<div class="small" style="color:var(--danger-fg);font-weight:700">⚠️ ไม่มีหลักฐาน: ${s.missingDocs.map(esc).join(', ')}</div>` : '');
}

function vGrads() {
  const lv = ['', 'ม.3', 'ม.6'];
  return `<div class="pagehead"><h1>ฐานข้อมูลผู้สำเร็จการศึกษา</h1><p class="muted">ข้อมูลอ้างอิงสำหรับตรวจสอบวุฒิ นำเข้าจากไฟล์ ปพ.3 ต้นฉบับ หรือไฟล์ CSV แบบย่อ</p></div>
  <div class="card stuimp"><div class="between wrap"><div><h2 style="margin:0">นำเข้าฐานข้อมูลนักเรียนที่จบการศึกษา (ไฟล์ Excel ของงานทะเบียน)</h2><p class="muted small" style="margin:4px 0 0">อ่านคอลัมน์ เลขประจำตัวนักเรียน · เลขประจำตัวประชาชน · ชุดที่/เลขที่ ปพ.1 · เลขที่ ปพ.2 · ชื่อ-สกุล · วันเกิด · บิดา-มารดา · หน่วยกิต · ผลการเรียนเฉลี่ย · ผลการประเมิน · หมายเหตุ · หลักฐานที่ไม่มี · ยอดค้างชำระ (ยอดค้างจะสร้างรายการในหน้าค่าบำรุงให้)</p></div><button type="button" class="btn btn-outline sm" data-act="stutemplate">ดาวน์โหลดแบบฟอร์มเปล่า</button></div>
    <div class="grid g3" style="margin-top:12px"><div><label for="si-file">ไฟล์ฐานข้อมูลนักเรียน (.xlsx / .xls / .csv)</label><input type="file" id="si-file" accept=".xlsx,.xls,.csv"></div>
    <div><label for="si-level">ระดับชั้นที่จบ</label><select id="si-level"><option value="">— เลือก —</option><option>ม.3</option><option>ม.6</option></select></div>
    <div><label for="si-date">วันที่จบ (วันที่อนุมัติการจบ)</label><input id="si-date" placeholder="31/03/2569"></div></div>
    <div class="row" style="margin-top:12px"><button type="button" class="btn btn-primary" data-act="stuimp">นำเข้าฐานข้อมูลนักเรียน</button><span class="muted small">ไฟล์ไม่มีคอลัมน์ระดับชั้นและวันที่จบ จึงต้องเลือกทั้งสองช่อง (นำเข้าทีละรุ่น)</span></div>
    <div id="si-msg" style="margin-top:10px">${U.stuMsg || ''}</div></div>
  <div class="grid g2">
    <div class="card"><h2>นำเข้าจากไฟล์ ปพ.3</h2><p class="muted small" style="margin-top:-6px">รองรับ .xls / .xlsx ต้นฉบับ อ่านทุกหน้าในไฟล์เดียว ดึงรหัสประจำตัว เลขบัตรประชาชน ชื่อ-สกุล วันเกิด ชื่อบิดา-มารดา GPA และวันที่อนุมัติจบจากท้ายเอกสาร</p>
      <div class="stack"><div><label for="gd-pp3">ไฟล์ ปพ.3</label><input type="file" id="gd-pp3" accept=".xls,.xlsx" data-ch="pp3file"></div>
      <div class="grid g2"><div><label for="gd-level">ระดับชั้นที่จบ</label><select id="gd-level"><option value="">— เลือก —</option><option>ม.3</option><option>ม.6</option></select></div>
      <div><label for="gd-date">วันที่จบ (ใช้เมื่อไม่พบในไฟล์)</label><input id="gd-date" placeholder="31/03/2569"></div></div>
      <button type="button" class="btn btn-primary" data-act="pp3">นำเข้าจากไฟล์ ปพ.3</button><div id="gd-msg">${U.lastImport}</div></div></div>
    <div class="card"><h2>นำเข้าจาก CSV</h2><p class="muted small" style="margin-top:-6px">คอลัมน์: รหัสประจำตัว, ชื่อ-สกุล, ระดับชั้นที่จบ, วันที่จบ (เพิ่มคอลัมน์ เลขบัตรประชาชน / GPA / ปพ.1 ชุดที่ / ปพ.1 เลขที่ ได้ · ไฟล์ที่มีแค่ รหัสประจำตัว + ชุดที่ + เลขที่ ใช้เติมเลข ปพ.1 ให้รายชื่อเดิม)</p>
      <div class="stack"><div><label for="gd-csv">ไฟล์ CSV</label><input type="file" id="gd-csv" accept=".csv,.txt" data-ch="csvfile"></div>
      <div><label for="gd-csvtext">หรือวางข้อความ CSV</label><textarea id="gd-csvtext" rows="4" placeholder="รหัสประจำตัว,ชื่อ-สกุล,ระดับชั้นที่จบ,วันที่จบ&#10;10301,นางสาวตัวอย่าง ใจดี,ม.6,31/03/2569"></textarea></div>
      <button type="button" class="btn btn-blue" data-act="csvimp">นำเข้า CSV</button></div></div>
  </div>
  <div class="card"><div class="between wrap"><h2 style="margin:0">รายชื่อผู้สำเร็จการศึกษา</h2><div class="row"><input id="gd-q" data-in="gdq" value="${esc(U.gq)}" placeholder="ค้นหา รหัส / เลขบัตร / ชื่อ" style="width:220px"><select id="gd-flevel" data-ch="gdlevel" aria-label="กรองระดับชั้น" style="width:auto">${lv.map(o => `<option value="${o}" ${U.glevel === o ? 'selected' : ''}>${o || 'ทุกระดับ'}</option>`).join('')}</select><button type="button" class="btn btn-outline sm" data-act="toggleadd">${U.showAdd ? 'ปิดฟอร์ม' : '+ เพิ่มรายบุคคล'}</button></div></div>
  <form class="addform" data-form="addstu" ${U.showAdd ? '' : 'hidden'} novalidate>
    <div><label for="as-sid">รหัสประจำตัว</label><input id="as-sid" required></div>
    <div><label for="as-cid">เลขบัตรประชาชน</label><input id="as-cid" inputmode="numeric"></div>
    <div class="span2"><label for="as-name">ชื่อ-สกุล (มีคำนำหน้า)</label><input id="as-name" required placeholder="นางสาวตัวอย่าง ใจดี"></div>
    <div><label for="as-level">ระดับชั้น</label><select id="as-level"><option>ม.6</option><option>ม.3</option></select></div>
    <div><label for="as-date">วันที่จบ</label><input id="as-date" placeholder="31/03/2569"></div>
    <div><label for="as-gpa">GPA</label><input id="as-gpa" inputmode="decimal"></div>
    <div><label for="as-pp1s">ปพ.1 ชุดที่</label><input id="as-pp1s" inputmode="numeric" placeholder="00000"></div>
    <div><label for="as-pp1n">ปพ.1 เลขที่</label><input id="as-pp1n" inputmode="numeric" placeholder="000000"></div>
    <div><button class="btn btn-primary" type="submit">เพิ่ม</button></div>
  </form>
  <div id="gd-table" style="margin-top:12px">${gradsTable()}</div></div>`;
}

function feesTable() {
  const q = U.fq.trim(), qn = normName(q), qd = digits(q);
  const list = S.fees.map(f => ({ f, s: getStu(f.studentId) })).filter(x => x.s && (!U.fOnly || x.f.amount - x.f.paid > 0) && (!q || (qd.length >= 2 && sidKey(x.s.sid).includes(sidKey(qd))) || (qn && normName(fullName(x.s)).includes(qn))));
  return `<div class="tablewrap"><table><thead><tr><th>รหัส</th><th>ชื่อ-สกุล</th><th>ภาค/ปีการศึกษา</th><th>รายการ</th><th class="num">จำนวนเงิน</th><th class="num">ชำระแล้ว</th><th class="num">ค้างชำระ</th><th>สถานะ</th><th></th></tr></thead><tbody>
  ${list.map(({ f, s }) => { const o = Math.max(0, f.amount - f.paid); return `<tr><td>${esc(s.sid)}</td><td>${esc(fullName(s))}</td><td>${esc(f.term)}</td><td>${esc(f.item)}</td><td class="num">${money(f.amount)}</td><td class="num">${money(f.paid)}</td><td class="num"><b>${money(o)}</b></td><td>${o > 0 ? '<span class="badge danger">ค้างชำระ</span>' : '<span class="badge ok">ชำระครบ</span>'}</td>
  <td class="tdact">${o > 0 ? `<button type="button" class="btn btn-green sm" data-act="payfull" data-id="${f.id}">รับชำระครบ</button> ` : ''}<button type="button" class="btn btn-outline sm" data-act="delfee" data-id="${f.id}">ลบ</button></td></tr>`; }).join('') || `<tr><td colspan="9" class="muted">ไม่มีรายการ</td></tr>`}
  </tbody></table></div>`;
}
function importFees(rows) {
  let hi = rows.findIndex(r => r.some(c => /รหัส|เลขประจำตัว/.test(String(c))) && r.some(c => /จำนวน|เงิน|ค้าง|ยอด/.test(String(c))));
  const h = hi >= 0 ? rows[hi].map(c => String(c).trim()) : [];
  const col = re => h.findIndex(x => re.test(x));
  let iSid = col(/รหัส|เลขประจำตัว(?!ประชาชน)/), iName = col(/ชื่อ/), iTerm = col(/ภาค|ปีการศึกษา/), iItem = col(/รายการ/), iAmt = col(/จำนวนเงิน|ยอดเงิน|ค่าบำรุง|^จำนวน/), iPaid = col(/ชำระแล้ว|จ่ายแล้ว|ชำระ$/), iOut = col(/ค้าง/);
  if (hi < 0) { iSid = 0; iName = 1; iTerm = 2; iItem = 3; iAmt = 4; iPaid = 5; iOut = -1; }
  const num = v => parseFloat(thaiDigits(String(v ?? '')).replace(/[^\d.\-]/g, '')) || 0;
  let added = 0, updated = 0; const miss = [];
  rows.slice(hi + 1).forEach(r => {
    const rawSid = String(r[iSid] ?? '').trim(); if (!rawSid && !(iName >= 0 && r[iName])) return;
    const ids = splitIds(rawSid), key = sidKey(ids.sid || rawSid), nm = iName >= 0 ? normName(r[iName]) : '';
    const s = S.students.find(x => (key && sidKey(x.sid) === key) || (ids.cid && x.cid === ids.cid)) || (nm ? S.students.find(x => normName(fullName(x)) === nm || normName(x.fname + x.lname) === nm) : null);
    if (!s) { miss.push(rawSid || String(r[iName])); return; }
    let amount = iAmt >= 0 ? num(r[iAmt]) : 0, paid = iPaid >= 0 ? num(r[iPaid]) : 0;
    const out = iOut >= 0 ? num(r[iOut]) : null;
    if (!amount && out !== null) { amount = out + paid; }
    if (out !== null && iPaid < 0) paid = Math.max(0, amount - out);
    if (amount <= 0) { miss.push(rawSid + ' (ไม่มีจำนวนเงิน)'); return; }
    const term = iTerm >= 0 ? String(r[iTerm] ?? '').trim() : '', item = (iItem >= 0 ? String(r[iItem] ?? '').trim() : '') || 'ค่าบำรุงการศึกษา';
    const ex = S.fees.find(f => f.studentId === s.id && f.term === term && f.item === item);
    if (ex) { ex.amount = amount; ex.paid = Math.min(paid, amount); updated++; }
    else { S.fees.push({ id: uid('f'), studentId: s.id, term, item, amount, paid: Math.min(paid, amount), note: 'นำเข้าจากไฟล์' }); added++; }
  });
  save();
  return { added, updated, miss };
}
function vFees() {
  const debtors = new Set(S.fees.filter(f => f.amount - f.paid > 0).map(f => f.studentId)).size;
  return `<div class="pagehead"><h1>ค่าบำรุงการศึกษา</h1><p class="muted">บันทึกรายการค่าบำรุงและยอดค้างชำระรายรายการ ใช้ประกอบการพิจารณาภายในเท่านั้น</p></div>
  <p class="notice info" style="margin:0">🔒 ข้อมูลหน้านี้แสดงเฉพาะเจ้าหน้าที่ ไม่แสดงในหน้าหน่วยงานภายนอกและไม่ปรากฏในหนังสือตอบ</p>
  <div class="ledger">${stat('ยอดค้างชำระรวม', '฿' + money(totalOutstanding()), '', 'var(--red)')}${stat('นักเรียนที่มียอดค้าง', debtors, 'ราย', 'var(--yellow)')}${stat('รายการทั้งหมด', S.fees.length, 'รายการ', 'var(--blue)')}</div>
  <div class="grid g2"><div class="card"><h2>นำเข้าจากไฟล์</h2><p class="muted small" style="margin-top:-6px">ไฟล์ Excel (.xlsx/.xls) หรือ CSV คอลัมน์: รหัสประจำตัว, ชื่อ-สกุล (ถ้ามี), ภาค/ปีการศึกษา, รายการ, จำนวนเงิน, ชำระแล้ว หรือ ค้างชำระ · รายการเดิมของนักเรียนคนเดิม ภาคเดิม รายการเดิม จะถูกอัปเดต</p>
    <div class="stack"><div><label for="fi-file">ไฟล์ค่าบำรุงการศึกษา</label><input type="file" id="fi-file" accept=".xlsx,.xls,.csv,.txt"></div>
    <div><label for="fi-text">หรือวางข้อความ CSV</label><textarea id="fi-text" rows="3" placeholder="รหัสประจำตัว,ชื่อ-สกุล,ภาค/ปีการศึกษา,รายการ,จำนวนเงิน,ชำระแล้ว&#10;10245,นายภูมิพัฒน์ วงศ์ทอง,2/2568,ค่าบำรุงการศึกษา,3500,1500"></textarea></div>
    <button type="button" class="btn btn-primary" data-act="feeimport">นำเข้าข้อมูลค่าบำรุง</button><div id="fi-msg">${U.feeMsg || ''}</div></div></div>
  <div class="card"><h2>บันทึกทีละรายการ</h2><form class="addform one" style="margin:0" data-form="addfee" novalidate>
    <div class="span2"><label for="fe-stu">นักเรียน (พิมพ์รหัสหรือชื่อ)</label><input id="fe-stu" list="fe-list" required placeholder="เช่น 10245"><datalist id="fe-list">${S.students.slice(0, 2000).map(s => `<option value="${esc(s.sid)} ${esc(fullName(s))}"></option>`).join('')}</datalist></div>
    <div><label for="fe-term">ภาค/ปีการศึกษา</label><input id="fe-term" value="2/2568"></div>
    <div><label for="fe-item">รายการ</label><input id="fe-item" value="ค่าบำรุงการศึกษา"></div>
    <div><label for="fe-amt">จำนวนเงิน (บาท)</label><input id="fe-amt" inputmode="decimal" value="3500"></div>
    <div><label for="fe-paid">ชำระแล้ว (บาท)</label><input id="fe-paid" inputmode="decimal" value="0"></div>
    <div><button class="btn btn-primary" type="submit">บันทึก</button></div>
  </form></div></div>
  <div class="card"><div class="between wrap"><h2 style="margin:0">รายการค่าบำรุง</h2><div class="row"><input id="fe-q" data-in="feq" value="${esc(U.fq)}" placeholder="ค้นหา รหัส / ชื่อ" style="width:200px"><label class="row" style="margin:0;gap:8px;font-weight:600"><span class="switch"><input type="checkbox" id="fe-only" data-ch="feonly" ${U.fOnly ? 'checked' : ''}><span class="slider"></span></span>เฉพาะที่ค้างชำระ</label></div></div>
  <div id="fe-table" style="margin-top:12px">${feesTable()}</div></div>`;
}

function vReports() {
  const R = REQS(), persons = R.flatMap(r => r.persons), cnt = k => persons.filter(p => p.result === k).length;
  const now = new Date(), months = [];
  for (let i = 5; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); months.push({ key: d.getFullYear() + '-' + pad(d.getMonth() + 1), label: TH_MS[d.getMonth()] + ' ' + String(d.getFullYear() + 543).slice(2) }); }
  months.forEach(m => { m.n = R.filter(r => (r.recvDate || '').startsWith(m.key)).length; });
  const mmax = Math.max(1, ...months.map(m => m.n));
  const agencies = {}; R.forEach(r => { agencies[r.agency] = agencies[r.agency] || { n: 0, p: 0 }; agencies[r.agency].n++; agencies[r.agency].p += r.persons.length; });
  const doneR = R.filter(r => r.sentDate && r.recvDate);
  const avg = doneR.length ? (doneR.reduce((a, r) => a + (new Date(r.sentDate) - new Date(r.recvDate)) / 864e5, 0) / doneR.length).toFixed(1) : '-';
  const debt = S.students.map(s => ({ s, o: outstanding(s.id) })).filter(x => x.o > 0).sort((a, b) => b.o - a.o);
  const pmax = Math.max(1, persons.length);
  return `<div class="pagehead between wrap"><div><h1>รายงาน</h1><p class="muted">สรุปงานรับ–ส่งและผลการตรวจสอบวุฒิ ปีการศึกษาปัจจุบัน</p></div><button type="button" class="btn btn-outline" data-act="copycsv">คัดลอกรายงานเป็น CSV</button></div>
  <div class="ledger">${stat('หนังสือรับ', R.length, 'ฉบับ', 'var(--blue)')}${stat('บุคคลที่ขอตรวจ', persons.length, 'ราย', 'var(--pink)')}${stat('ยืนยันสำเร็จการศึกษา', cnt('found'), 'ราย', 'var(--green)')}${stat('เวลาดำเนินการเฉลี่ย', avg, 'วัน', 'var(--yellow)')}</div>
  <div class="grid g2">
    <div class="card"><h2>หนังสือรับรายเดือน (6 เดือนล่าสุด)</h2><div class="bars">${months.map(m => `<div class="barrow"><span>${m.label}</span><div class="bartrack"><div class="barfill" style="width:${(m.n / mmax) * 100}%"></div></div><b>${m.n}</b></div>`).join('')}</div></div>
    <div class="card"><h2>ผลการตรวจสอบรายบุคคล</h2><div class="bars">${['found', 'mismatch', 'notfound', 'pending'].map(k => bar(RESULT[k].t, cnt(k), pmax, k)).join('')}</div></div>
  </div>
  <div class="grid g2">
    <div class="card"><h2>หน่วยงานที่ขอตรวจสอบ</h2><div class="tablewrap"><table style="min-width:0"><thead><tr><th>หน่วยงาน</th><th class="num">หนังสือ</th><th class="num">ราย</th></tr></thead><tbody>${Object.entries(agencies).sort((a, b) => b[1].p - a[1].p).map(([a, v]) => `<tr><td>${esc(a)}</td><td class="num">${v.n}</td><td class="num">${v.p}</td></tr>`).join('')}</tbody></table></div></div>
    <div class="card"><h2>ยอดค้างชำระรายบุคคล 🔒</h2><div class="tablewrap"><table style="min-width:0"><thead><tr><th>รหัส</th><th>ชื่อ-สกุล</th><th class="num">ค้างชำระ</th></tr></thead><tbody>${debt.map(x => `<tr><td>${esc(x.s.sid)}</td><td>${esc(fullName(x.s))}</td><td class="num">${money(x.o)}</td></tr>`).join('') || '<tr><td colspan="3" class="muted">ไม่มียอดค้าง</td></tr>'}</tbody></table></div></div>
  </div>`;
}

function agencyRows(list) {
  return list.map(a => `<tr><td>${esc(a.name)}${a.pw0 && !a.pwHash ? ' <span class="badge info">บัญชีทดลอง</span>' : ''}${a.contact ? `<div class="sub">${esc(a.contact)}</div>` : ''}</td><td>${esc(a.email)}</td><td>${esc(a.phone || '-')}</td><td>${fmtDT(a.createdAt)}</td><td class="num">${myReqs(a).length}</td>
    <td>${a.approved ? '<span class="badge ok">อนุมัติแล้ว</span>' : '<span class="badge warn">รออนุมัติ</span>'}</td>
    <td class="tdact">${a.approved ? `<button type="button" class="btn btn-outline sm" data-act="approveag" data-id="${a.id}" data-v="0">ระงับ</button>` : `<button type="button" class="btn btn-green sm" data-act="approveag" data-id="${a.id}" data-v="1">อนุมัติ</button>`}${CLOUD ? ` <button type="button" class="btn btn-outline sm" data-act="approveag" data-id="${a.id}" data-role="staff">ตั้งเป็นเจ้าหน้าที่</button>` : ` <button type="button" class="btn btn-outline sm" data-act="delagency" data-id="${a.id}">ลบ</button>`}</td></tr>`).join('');
}
function accountSettings() {
  const ags = (S.agencies || []).slice().sort((a, b) => (a.approved - b.approved) || (b.createdAt - a.createdAt));
  const pending = ags.filter(a => !a.approved).length;
  const pw = CLOUD
    ? `<form class="card form" data-form="staffpw" novalidate><h2 style="margin:0">🔐 เปลี่ยนรหัสผ่านของฉัน</h2><p class="muted small" style="margin:0">บัญชี ${esc(U.me ? U.me.email : '')}</p>
      <div class="grid g2"><div><label for="sp-new">รหัสผ่านใหม่ (อย่างน้อย 8 ตัว)</label><input id="sp-new" type="password" autocomplete="new-password"></div><div><label for="sp-new2">ยืนยันรหัสผ่านใหม่</label><input id="sp-new2" type="password" autocomplete="new-password"></div></div>
      <div class="row end"><button class="btn btn-primary" type="submit">เปลี่ยนรหัสผ่าน</button></div></form>`
    : `<form class="card form" data-form="staffpw" novalidate><h2 style="margin:0">🔐 รหัสผ่านเจ้าหน้าที่</h2>${S.settings.staffPwHash ? '' : `<p class="notice warn" style="margin:0">ยังใช้รหัสเริ่มต้น ${DEFAULT_STAFF_PW} ควรเปลี่ยนก่อนใช้งานจริง</p>`}
      <div class="grid g3"><div><label for="sp-cur">รหัสผ่านปัจจุบัน</label><input id="sp-cur" type="password" autocomplete="current-password"></div><div><label for="sp-new">รหัสผ่านใหม่ (อย่างน้อย 8 ตัว)</label><input id="sp-new" type="password" autocomplete="new-password"></div><div><label for="sp-new2">ยืนยันรหัสผ่านใหม่</label><input id="sp-new2" type="password" autocomplete="new-password"></div></div>
      <div class="row end"><button class="btn btn-primary" type="submit">เปลี่ยนรหัสผ่าน</button></div></form>`;
  const staffCard = CLOUD ? `<div class="card"><h2>🧑‍💼 เจ้าหน้าที่ในระบบ (${(S.staffList || []).length})</h2>${(S.staffList || []).map(s => `<span class="badge info" style="margin:0 6px 6px 0">${esc(s.email)}</span>`).join('')}
    <p class="muted small" style="margin:8px 0 0">เพิ่มเจ้าหน้าที่: ให้ผู้นั้นลงทะเบียนที่หน้า "หน่วยงานภายนอก" (ใส่ชื่อตัวเองในช่องชื่อหน่วยงาน) แล้วกด "ตั้งเป็นเจ้าหน้าที่" ในตารางด้านล่าง หรือเพิ่มใน Supabase ตามคู่มือ README</p></div>` : '';
  const agCard = `<div class="card"><h2>🏢 หน่วยงานที่ลงทะเบียน (${ags.length})${pending ? ` <span class="badge warn">รออนุมัติ ${pending}</span>` : ''}</h2>
    <p class="muted small" style="margin-top:-6px">หน่วยงานที่ลงทะเบียนใหม่ต้องได้รับอนุมัติก่อนจึงจะเข้าสู่ระบบและส่งคำขอได้</p>
    ${ags.length ? `<div class="tablewrap"><table><thead><tr><th>หน่วยงาน</th><th>อีเมล</th><th>โทรศัพท์</th><th>ลงทะเบียนเมื่อ</th><th class="num">คำขอ</th><th>สถานะ</th><th></th></tr></thead><tbody>${agencyRows(ags)}</tbody></table></div>` : '<p class="muted">ยังไม่มีหน่วยงานลงทะเบียน</p>'}</div>`;
  const dataCard = CLOUD
    ? `<div class="card"><h2>☁️ ข้อมูลบนระบบออนไลน์</h2><p class="muted" style="margin-top:0">ข้อมูลทั้งหมดเก็บบน Supabase เข้าใช้งานได้จากทุกเครื่อง · ผู้สำเร็จการศึกษา ${S.students.length.toLocaleString('th-TH')} ราย · หนังสือ ${S.requests.length} ฉบับ · ${syncChip()}</p>
      <div class="row"><button type="button" class="btn btn-outline" data-act="reloadcloud">โหลดข้อมูลล่าสุดจากระบบ</button><button type="button" class="btn btn-outline" data-act="backup">ดาวน์โหลดสำรองข้อมูล (JSON)</button><label class="btn btn-outline file-btn">นำเข้าข้อมูลสำรอง (JSON)<input type="file" accept=".json,application/json" class="vh" data-ch="restore"></label></div><p class="muted small" style="margin:8px 0 0">ใช้ย้ายข้อมูลจากโหมดทดลอง: ดาวน์โหลดสำรองข้อมูลจากโหมดทดลองแล้วนำเข้าที่นี่ ข้อมูลที่รหัสซ้ำจะถูกแทนที่</p></div>`
    : `<div class="card"><h2>💾 ข้อมูล Demo ในเบราว์เซอร์</h2><p class="muted" style="margin-top:0">${storageOK ? 'ข้อมูลทั้งหมดบันทึกไว้ในเบราว์เซอร์เครื่องนี้ (localStorage) เปิดครั้งหน้าข้อมูลยังอยู่ แต่ไม่ซิงก์ไปเครื่องอื่น' : 'เบราว์เซอร์นี้ไม่อนุญาตให้บันทึกข้อมูล ข้อมูลจะหายเมื่อปิดหน้า'} · ผู้สำเร็จการศึกษา ${S.students.length.toLocaleString('th-TH')} ราย · หนังสือ ${S.requests.length} ฉบับ</p>
      <div class="row"><button type="button" class="btn btn-outline" data-act="resetdemo">โหลดข้อมูลตัวอย่างใหม่</button><button type="button" class="btn btn-outline" data-act="clearall">ล้างข้อมูลทั้งหมด</button><button type="button" class="btn btn-outline" data-act="backup">ดาวน์โหลดสำรองข้อมูล (JSON)</button></div></div>`;
  return pw + staffCard + agCard + dataCard;
}
function vSettings() {
  const st = S.settings;
  const f = (id, label, v, ph = '') => `<div><label for="st-${id}">${label}</label><input id="st-${id}" value="${esc(v)}" placeholder="${esc(ph)}"></div>`;
  return `<div class="pagehead"><h1>ตั้งค่า</h1><p class="muted">ข้อมูลโรงเรียนที่ใช้ในหนังสือราชการ และการจัดการข้อมูลตัวอย่าง</p></div>
  <form class="card form" data-form="settings" novalidate><h2 style="margin:0">ข้อมูลในหนังสือตอบ</h2>
  <div class="grid g2">${f('school', 'ชื่อโรงเรียน', st.school)}<div><label for="st-address">ที่อยู่ (หัวหนังสือ แยกบรรทัดได้)</label><textarea id="st-address" rows="2" style="font-family:inherit;font-size:15px">${esc(st.address)}</textarea></div>
  ${f('docPrefix', 'รหัสหนังสือออก (นำหน้าเลขหนังสือ)', st.docPrefix, 'ศธ 04xxx.xx/')}${f('office', 'ส่วนราชการเจ้าของเรื่อง (ท้ายหนังสือ)', st.office)}
  ${f('director', 'ชื่อผู้ลงนาม', st.director, 'นาย/นาง/นางสาว ...')}${f('directorTitle', 'ตำแหน่งผู้ลงนาม', st.directorTitle)}
  ${f('phone', 'โทรศัพท์', st.phone)}${f('contact', 'ผู้ประสานงาน (ชื่อ และเบอร์ติดต่อ)', st.contact || '', 'เช่น นางสาว... งานทะเบียน โทร. 08x xxx xxxx')}${f('email', 'ไปรษณีย์อิเล็กทรอนิกส์ (E-mail)', st.email)}
  <label class="row" style="margin:0;gap:10px;font-weight:600;align-self:end"><span class="switch"><input type="checkbox" id="st-thaiNum" ${st.thaiNum !== false ? 'checked' : ''}><span class="slider"></span></span>ใช้เลขไทยในหนังสือราชการ</label>
  <label class="row" style="margin:0;gap:10px;font-weight:600;align-self:end"><span class="switch"><input type="checkbox" id="st-letterGpa" ${st.letterGpa !== false ? 'checked' : ''}><span class="slider"></span></span>แสดงเกรดเฉลี่ยในหนังสือตอบ (ค่าเริ่มต้น)</label>
  <div><label for="st-slaDays">กำหนดตอบหนังสือภายใน (วัน)</label><input id="st-slaDays" type="number" min="1" max="60" value="${slaDays()}"><p class="muted small" style="margin:6px 0 0">ใช้แจ้งเตือนหนังสือที่ใกล้หรือเกินกำหนด</p></div>
  <div class="span2"><label for="st-debtNote">หมายเหตุในหนังสือตอบ กรณีผู้สำเร็จการศึกษามียอดค้างชำระ</label><input id="st-debtNote" value="${esc(st.debtNote || DEBT_NOTE_DEFAULT)}"><p class="muted small" style="margin:6px 0 0">แสดงในช่องหมายเหตุโดยไม่ระบุยอดเงิน</p></div>
  <div class="span2"><label for="st-gasUrl">บริการส่งอีเมล (Google Apps Script Web App URL)</label><input id="st-gasUrl" value="${esc(st.gasUrl || '')}" placeholder="https://script.google.com/macros/s/.../exec"><p class="muted small" style="margin:6px 0 0">ตั้งค่าตามไฟล์ gas/Code.gs และ README ในชุดดาวน์โหลด ส่งอีเมลผ่านระบบได้เมื่อเปิดจากไฟล์ index.html</p></div>
  <div><label for="st-gasKey">รหัสลับของบริการ (KEY)</label><input id="st-gasKey" value="${esc(st.gasKey || '')}" autocomplete="off"></div>
  <div class="span2"><label for="st-outNoYear">รูปแบบเลขที่หนังสือส่ง (ค่าเริ่มต้น เปลี่ยนรายฉบับได้)</label><select id="st-outNoYear"><option value="0" ${st.outNoYear ? '' : 'selected'}>ไม่ใส่ปี พ.ศ. เช่น ที่ ${esc(st.docPrefix)}121</option><option value="1" ${st.outNoYear ? 'selected' : ''}>ใส่ปี พ.ศ. เช่น ที่ ${esc(st.docPrefix)}121/${beYear()}</option></select></div>
  <div class="span2 range-box"><b>ช่วงเลขหนังสือส่งที่ได้รับจัดสรรจากงานธุรการ</b><div class="grid g3"><div><label for="st-outFrom">ตั้งแต่เลขที่</label><input id="st-outFrom" inputmode="numeric" value="${st.outFrom}"></div><div><label for="st-outTo">ถึงเลขที่</label><input id="st-outTo" inputmode="numeric" value="${st.outTo}"></div><div><label for="st-nextOut">เลขถัดไปที่จะใช้</label><input id="st-nextOut" inputmode="numeric" value="${Math.max(st.nextOut, st.outFrom)}"></div></div><p class="muted small" style="margin:0">เหลือ ${outLeft()} เลข · ปี พ.ศ. ต่อท้ายให้อัตโนมัติ เช่น ${esc(st.docPrefix)}${Math.max(st.nextOut, st.outFrom)}/${beYear()}</p></div></div>
  <div class="row end"><button class="btn btn-primary" type="submit">บันทึกการตั้งค่า</button></div></form>
  ${signSettings()}
  ${accountSettings()}`;
}

/* ---------- หนังสือราชการ ---------- */
/* ตราครุฑ (สูง 3 ซม. ตามระเบียบงานสารบรรณสำหรับหนังสือภายนอก) */
const GARUDA_SRC = 'data:image/png;base64,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';
const TH_DIGITS = '๐๑๒๓๔๕๖๗๘๙';
/* แปลงเลขอารบิกเป็นเลขไทยเฉพาะข้อความ (ไม่แตะแท็ก/ลิงก์รูป และข้ามที่อยู่อีเมล) */
const toThaiNum = html => html.replace(/>([^<]+)</g, (m, t) => '>' + (t.includes('@') ? t : t.replace(/\d/g, d => TH_DIGITS[d])) + '<');
const showGpa = r => r.showGpa !== undefined ? r.showGpa : S.settings.letterGpa !== false;
const fmtShortDate = iso => { if (!iso) return '-'; const [y, m, d] = iso.split('-'); return `${+d} ${TH_MS[+m - 1]} ${+y + 543}`; };
const DEFAULT_NOTE = { mismatch: 'ข้อมูลไม่ตรงกับหลักฐาน', notfound: 'ไม่พบหลักฐานการสำเร็จการศึกษา', pending: 'อยู่ระหว่างตรวจสอบ' };
function resultRows(r) {
  const multi = r.persons.length > 1, gpa = showGpa(r);
  return r.persons.map((p, i) => {
    const s = getStu(p.matchedId), useS = s && p.result !== 'notfound';
    const gd = useS && s.gradDate ? s.gradDate : p.gradDate, ok = p.result === 'found';
    const note = letterNote(p);
    return `<tr>${multi ? `<td class="c">${i + 1}</td>` : ''}<td class="nm">${esc(pName(p))}</td><td class="c">${esc((useS ? s.sid : p.sid) || '-')}</td><td class="c">${esc((useS ? s.level : p.level) || '-')}</td><td class="c dt">${gd ? fmtShortDate(gd) : '-'}</td>${gpa ? `<td class="c">${useS && s.gpa ? esc(s.gpa) : '-'}</td>` : ''}<td class="c tick">${ok ? '✓' : ''}</td><td class="c tick">${ok || p.result === 'pending' ? '' : '✓'}</td><td>${esc(note)}</td></tr>`;
  }).join('');
}
const resultTable = r => { const R2 = ' rowspan="2"'; return `<table class="lt-table${showGpa(r) ? ' has-gpa' : ''}${r.persons.length > 1 ? '' : ' single'}"><thead><tr>${r.persons.length > 1 ? `<th class="w-no"${R2}>ที่</th>` : ''}<th class="w-name"${R2}>ชื่อ-สกุล</th><th class="w-sid"${R2}>เลขประจำตัว</th><th class="w-lv"${R2}>ระดับชั้น</th><th class="w-date"${R2}>วันที่จบ</th>${showGpa(r) ? `<th class="w-gpa"${R2}>เกรดเฉลี่ย</th>` : ''}<th colspan="2">สำเร็จการศึกษาแห่งนี้</th><th class="w-res"${R2}>หมายเหตุ</th></tr><tr><th class="w-ok">จริง</th><th class="w-ok">ไม่จริง</th></tr></thead><tbody>${resultRows(r)}</tbody></table>`; };
const numFix = html => S.settings.thaiNum !== false ? toThaiNum('<i hidden></i>' + html + '<i hidden></i>') : html;
const ENCL_TITLE = 'บัญชีรายชื่อผลการตรวจสอบวุฒิการศึกษา';
const ENCL_AGENCY = 'สำเนาใบรายชื่อจากสถาบัน';
const ENCL_PRESETS = [ENCL_TITLE, ENCL_AGENCY, 'สำเนาระเบียนแสดงผลการเรียน (ปพ.1)', 'สำเนาประกาศนียบัตร (ปพ.2)', 'สำเนาใบรับรองผลการศึกษา (ปพ.7)', 'สำเนาแบบรายงานผู้สำเร็จการศึกษา (ปพ.3)', 'สำเนาใบรายชื่อที่หน่วยงานส่งมา'];
const ENCL_UNITS = ['ฉบับ', 'ชุด', 'แผ่น', 'เล่ม'];
/* สิ่งที่ส่งมาด้วย (ค่าเริ่มต้น)
   - หน่วยงานแนบใบรายชื่อมา (แบบที่ 1) = ส่งสำเนาใบรายชื่อจากสถาบันกลับ + ผลอยู่ในตารางในหนังสือ
   - ไม่ได้แนบใบรายชื่อมา (แบบที่ 2) = แนบบัญชีรายชื่อผลการตรวจสอบจากระบบของโรงเรียนให้อัตโนมัติ */
const hasAgencyList = r => r.form == 1 && !!(r.file || (r.attachments || []).length);
function enclList(r) {
  if (!Array.isArray(r.enclosures)) r.enclosures = hasAgencyList(r) ? [{ name: ENCL_AGENCY, qty: 1, unit: 'ชุด' }] : [{ name: ENCL_TITLE, qty: 1, unit: 'ฉบับ' }];
  return r.enclosures;
}
const enclHas = (r, name) => enclList(r).some(e => String(e.name || '').trim() === name);
function enclShown(r) {
  const base = enclList(r).filter(e => String(e.name || '').trim());
  const n = wantsPP1(r) ? pp1Ready(r).length : 0;
  if (n && !base.some(e => e.name.trim() === PP1_ENCL)) base.push({ name: PP1_ENCL, qty: n, unit: 'ฉบับ', auto: true });
  return base;
}
const listIndex = r => enclShown(r).findIndex(e => e.name.trim() === ENCL_TITLE);
/* "จำนวน … หน่วย" ชิดขอบขวาของกระดาษ ตัวเลขอยู่กึ่งกลางช่องเดียวกันทุกบรรทัด */
const qtyHTML = (n, unit) => `<span class="qty">จำนวน<span class="qn">${esc(n)}</span>${esc(unit)}</span>`;
function letterHTML(r) {
  const st = S.settings, n = r.persons.length;
  const cnt = k => r.persons.filter(p => p.result === k).length;
  const summary = [['found', 'สำเร็จการศึกษาจริง'], ['mismatch', 'ข้อมูลไม่ตรงกับหลักฐานของโรงเรียน'], ['notfound', 'ไม่พบหลักฐานการสำเร็จการศึกษา']].filter(([k]) => cnt(k)).map(([k, t]) => `${t} จำนวน ${cnt(k)} ราย`).join(' ');
  const addr = [st.school, ...String(st.address || '').split('\n')].filter(Boolean).map(esc).join('<br>');
  const dots = '................................';
  const foot = [st.office, 'โทร. ' + (st.phone || dots), 'ไปรษณีย์อิเล็กทรอนิกส์ ' + (st.email || dots), st.contact && 'ผู้ประสานงาน ' + st.contact].filter(Boolean).map(t => `<p>${esc(t)}</p>`).join('');
  const f1 = r.form == 1, encs = enclShown(r), li = listIndex(r);
  const ref = encs.length > 1 ? ` ${li + 1}` : '';
  const body = `${r.outNo ? '' : '<div class="draftmark">ร่าง</div>'}
  <div class="lt-head"><p>ที่ ${esc(st.docPrefix)}${esc(r.outNo || '..........')}</p><p class="lt-addr">${addr}</p></div>
  <p class="lt-date">${letterDateText(r)}</p>
  <p class="lt-f"><span>เรื่อง</span><span>แจ้งผลการตรวจสอบวุฒิการศึกษา</span></p>
  <p class="lt-f"><span>เรียน</span><span>${esc(r.to || r.agency)}</span></p>
  <p class="lt-f"><span>อ้างถึง</span><span>หนังสือ${esc(r.agency)} ที่ ${esc(r.docNo)}<br>ลงวันที่ ${fmtLong(r.docDate)}</span></p>
  ${encs.length ? `<p class="lt-f"><span>สิ่งที่ส่งมาด้วย</span><span class="enc-lines">${encs.map((e, i) => `<span class="lt-cnt"><span>${encs.length > 1 ? (i + 1) + '. ' : ''}${esc(e.name.trim())}</span>${qtyHTML(Math.max(1, parseInt(e.qty, 10) || 1), e.unit || 'ฉบับ')}</span>`).join('')}</span></p>` : ''}
  <p class="lt-p">ตามหนังสือที่อ้างถึง ${esc(r.agency)} ขอให้โรงเรียนตรวจสอบวุฒิการศึกษาของบุคคล จำนวน ${n} ราย ${f1 ? 'ตามใบรายชื่อที่แนบมาพร้อมหนังสือ' : 'ตามรายชื่อที่ระบุในหนังสือ'} ความละเอียดแจ้งแล้ว นั้น</p>
  ${li >= 0
    ? `<p class="lt-p">${esc(st.school)} ได้ตรวจสอบกับหลักฐานทางการศึกษาของโรงเรียนแล้ว ปรากฏผลดังนี้</p>
  ${[['found', 'สำเร็จการศึกษาจริง'], ['mismatch', 'ข้อมูลไม่ตรงกับหลักฐานของโรงเรียน'], ['notfound', 'ไม่พบหลักฐานการสำเร็จการศึกษา']].map(([k, t], i) => `<p class="lt-li lt-cnt"><span>${i + 1}. ${t}</span>${qtyHTML(cnt(k) || '-', 'ราย')}</p>`).join('')}
  <p class="lt-p">ทั้งนี้ รายละเอียดรายบุคคลปรากฏตามสิ่งที่ส่งมาด้วย${ref}</p>`
    : `<p class="lt-p">${esc(st.school)} ได้ตรวจสอบกับหลักฐานทางการศึกษาของโรงเรียนแล้ว ปรากฏผลดังนี้</p>${resultTable(r)}`}
  <p class="lt-p">จึงเรียนมาเพื่อโปรดทราบ</p>
  ${mainSignHTML(r)}
  ${li < 0 ? coSignHTML(r, 'in-letter') : ''}
  <div class="lt-foot">${foot}</div>`;
  return `<img class="garuda" src="${GARUDA_SRC}" alt="ตราครุฑ">` + numFix(body);
}
/* หน้าแนบ (แบบที่ 1): บัญชีรายชื่อพร้อมผลการตรวจสอบ */
function enclHTML(r) {
  const st = S.settings;
  return numFix(`<p class="en-title">บัญชีรายชื่อผู้ขอตรวจสอบคุณวุฒิการศึกษา</p>
  <p class="en-sub en-agency">${esc(r.agency)}</p>
  <p class="en-sub">ตามหนังสือ${esc(r.agency)}</p>
  <p class="en-sub en-ref">ที่ ${esc(r.docNo)} ลงวันที่ ${fmtLong(r.docDate)}</p>
  ${resultTable(r)}
  <p class="en-cert">รับรองความถูกต้อง</p>
  ${coSignHTML(r, 'in-encl') || `<div class="en-sign"><p>ลงชื่อ ........................................................ ผู้ตรวจสอบ</p><p>(........................................................)</p><p>ตำแหน่ง ........................................................</p></div>`}`);
}
const docHTML = r => `<article class="letter" id="letter">${letterHTML(r)}</article>${listIndex(r) >= 0 ? `<article class="letter encl">${enclHTML(r)}</article>` : ''}${pp1CopyPages(r)}`;
function enclEditor(r) {
  const lock = r.status === 'replied';
  return `<div class="card encl-editor"><div class="between wrap"><h3>สิ่งที่ส่งมาด้วย</h3>${lock ? '<span class="muted small">ส่งหนังสือแล้ว แก้ไขไม่ได้</span>' : '<button type="button" class="btn btn-outline sm" data-act="encadd">+ เพิ่มรายการ</button>'}</div>
  <div class="sign-row"><span class="sign-lab">ใบรายชื่อที่แนบไป</span>
    <label class="chk"><input type="checkbox" data-ch="enclist" data-v="agency" ${enclHas(r, ENCL_AGENCY) ? 'checked' : ''} ${lock ? 'disabled' : ''}> ใบรายชื่อจากสถาบัน${hasAgencyList(r) ? ' (หน่วยงานแนบมา)' : ''}</label>
    <label class="chk"><input type="checkbox" data-ch="enclist" data-v="system" ${enclHas(r, ENCL_TITLE) ? 'checked' : ''} ${lock ? 'disabled' : ''}> บัญชีรายชื่อผลการตรวจสอบจากระบบของโรงเรียน${hasAgencyList(r) ? '' : ' (เพิ่มอัตโนมัติ เพราะหน่วยงานไม่ได้แนบใบรายชื่อ)'}</label></div>
  <datalist id="encl-presets">${ENCL_PRESETS.map(o => `<option value="${esc(o)}"></option>`).join('')}</datalist>
  ${enclList(r).length ? enclList(r).map((e, i) => `<div class="encl-row"><span class="muted">${i + 1}.</span>
    <input id="en-${i}-name" aria-label="ชื่อรายการ ${i + 1}" list="encl-presets" data-ch="enc" data-i="${i}" data-f="name" value="${esc(e.name)}" placeholder="เลือกหรือพิมพ์ชื่อเอกสาร" ${lock ? 'disabled' : ''}>
    <input id="en-${i}-qty" aria-label="จำนวน ${i + 1}" type="number" min="1" data-ch="enc" data-i="${i}" data-f="qty" value="${esc(e.qty)}" ${lock ? 'disabled' : ''}>
    <select id="en-${i}-unit" aria-label="หน่วย ${i + 1}" data-ch="enc" data-i="${i}" data-f="unit" ${lock ? 'disabled' : ''}>${ENCL_UNITS.map(u => `<option ${e.unit === u ? 'selected' : ''}>${u}</option>`).join('')}</select>
    ${lock ? '' : `<button type="button" class="icon-btn" data-act="encdel" data-i="${i}" aria-label="ลบรายการ ${i + 1}">✕</button>`}</div>`).join('') : (enclShown(r).length ? '' : '<p class="muted small" style="margin:6px 0 0">ไม่มีสิ่งที่ส่งมาด้วย (หนังสือจะไม่แสดงบรรทัดนี้)</p>')}
  ${enclShown(r).filter(e => e.auto).map(e => `<div class="encl-row auto"><span class="muted">+</span><span>${esc(e.name)}</span><span class="muted small">จำนวน ${e.qty} ${e.unit}</span><span class="badge info">เพิ่มอัตโนมัติ</span></div>`).join('')}
  <p class="muted small" style="margin:8px 0 0">ถ้ามี "${ENCL_TITLE}" ระบบจะแนบหน้าบัญชีรายชื่อท้ายหนังสือ และสรุปผลเป็นข้อ ๑–๓ ในเนื้อหนังสือ ถ้าไม่มีจะแสดงตารางผลในเนื้อหนังสือแทน</p></div>`;
}
/* ---------- ผู้ลงนามและลายเซ็น ---------- */
const SIGN_ROLES = {
  director: { label: 'ผู้อำนวยการ', pos: '', cap: '' },
  registrar: { label: 'นายทะเบียน', pos: 'นายทะเบียน', cap: 'ผู้รับรอง' },
  measure: { label: 'หัวหน้างานวัดและประเมินผล', pos: 'หัวหน้างานวัดและประเมินผล', cap: 'ผู้ตรวจสอบ' },
  staff: { label: 'เจ้าหน้าที่งานทะเบียนและวัดผล', pos: 'เจ้าหน้าที่งานทะเบียนและวัดผล', cap: 'ผู้ตรวจสอบ' }
};
const CO_ROLES = ['staff', 'measure', 'registrar'];
function signers() {
  const st = S.settings; st.signers = st.signers || {};
  for (const k of Object.keys(SIGN_ROLES)) st.signers[k] = Object.assign({ name: '', position: SIGN_ROLES[k].pos, sig: '' }, st.signers[k] || {});
  st.signDefaults = Object.assign({ main: 'director', co: [], img: true }, st.signDefaults || {});
  return st.signers;
}
function signOf(k) {
  const s = signers()[k];
  return k === 'director' ? { name: S.settings.director, position: S.settings.directorTitle, sig: s.sig } : s;
}
function reqSign(r) {
  signers();
  if (!r.sign) r.sign = JSON.parse(JSON.stringify(S.settings.signDefaults));
  if (!Array.isArray(r.sign.co)) r.sign.co = [];
  return r.sign;
}
const coKeys = r => { const sg = reqSign(r); return CO_ROLES.filter(k => sg.co.includes(k) && !(sg.main === 'registrar' && k === 'registrar')); };
function sigImg(k, sg) { const s = signOf(k); return sg.img !== false && s.sig ? `<img class="sig-img" src="${s.sig}" alt="ลายเซ็น${esc(SIGN_ROLES[k].label)}">` : ''; }
function mainSignHTML(r) {
  const sg = reqSign(r), k = sg.main === 'registrar' ? 'registrar' : 'director', s = signOf(k), dots = '..................................................';
  const lines = k === 'director' ? [`(${s.name || dots})`, s.position] : [`(${s.name || dots})`, s.position || 'นายทะเบียน', `ปฏิบัติราชการแทนผู้อำนวยการ${S.settings.school}`];
  return `<div class="lt-sign"><p>ขอแสดงความนับถือ</p><div class="sp">${sigImg(k, sg)}</div>${lines.filter(Boolean).map(l => `<p>${esc(l)}</p>`).join('')}</div>`;
}
function coSignHTML(r, where) {
  const sg = reqSign(r), ks = coKeys(r);
  if (!ks.length) return '';
  return `<div class="co-signs ${where}" style="grid-template-columns:repeat(${ks.length},minmax(0,1fr))">${ks.map(k => { const s = signOf(k); return `<div class="co-sign"><div class="co-sp">${sigImg(k, sg)}</div><p>(${esc(s.name || '................................')})</p><p>${esc(s.position || SIGN_ROLES[k].pos)}</p><p class="co-cap">${SIGN_ROLES[k].cap}</p></div>`; }).join('')}</div>`;
}
function signEditor(r) {
  const sg = reqSign(r), lock = r.status === 'replied', hasEncl = listIndex(r) >= 0;
  const sel = [sg.main === 'registrar' ? 'registrar' : 'director', ...coKeys(r)];
  const missing = sel.filter(k => { const s = signOf(k); return !s.name || (sg.img !== false && !s.sig); }).map(k => SIGN_ROLES[k].label + (signOf(k).name ? ' (ยังไม่มีภาพลายเซ็น)' : ' (ยังไม่ได้กรอกชื่อ)'));
  const dis = lock ? 'disabled' : '';
  return `<div class="card encl-editor sign-editor"><div class="between wrap"><h3>✍️ ผู้ลงนามและรายละเอียดในหนังสือ</h3>${lock ? '<span class="muted small">ส่งหนังสือแล้ว แก้ไขไม่ได้</span>' : ''}</div>
  <div class="sign-row"><span class="sign-lab">ลงนามหนังสือ</span>
    <label class="chk"><input type="radio" name="sg-main" value="director" data-ch="rsign" data-f="main" ${sg.main !== 'registrar' ? 'checked' : ''} ${dis}> ผู้อำนวยการ</label>
    <label class="chk"><input type="radio" name="sg-main" value="registrar" data-ch="rsign" data-f="main" ${sg.main === 'registrar' ? 'checked' : ''} ${dis}> นายทะเบียน (ปฏิบัติราชการแทน)</label></div>
  <div class="sign-row"><span class="sign-lab">ลงนามร่วม ${hasEncl ? '(ในบัญชีรายชื่อแนบท้าย)' : '(ท้ายหนังสือ)'}</span>
    ${CO_ROLES.map(k => `<label class="chk"><input type="checkbox" value="${k}" data-ch="rsign" data-f="co" ${sg.co.includes(k) ? 'checked' : ''} ${lock || (k === 'registrar' && sg.main === 'registrar') ? 'disabled' : ''}> ${SIGN_ROLES[k].label}</label>`).join('')}</div>
  <div class="sign-row"><span class="sign-lab">ลงวันที่ในหนังสือ</span>
    <label class="chk"><input type="radio" name="dt-mode" value="today" data-ch="rdate" ${dateMode(r) === 'today' ? 'checked' : ''} ${dis}> วันที่ออกหนังสือจริง (${fmtLong(r.outDate || todayISO())})</label>
    <label class="chk"><input type="radio" name="dt-mode" value="custom" data-ch="rdate" ${dateMode(r) === 'custom' ? 'checked' : ''} ${dis}> กำหนดเอง</label>
    ${dateMode(r) === 'custom' ? `<input type="date" class="inl" aria-label="วันที่ในหนังสือ" data-ch="rdatef" data-f="dateCustom" value="${esc(r.dateCustom || r.outDate || todayISO())}" ${dis}>` : ''}
    <label class="chk"><input type="radio" name="dt-mode" value="monthyear" data-ch="rdate" ${dateMode(r) === 'monthyear' ? 'checked' : ''} ${dis}> ใส่เฉพาะเดือนและปี</label>
    ${dateMode(r) === 'monthyear' ? `<select class="inl" aria-label="เดือน" data-ch="rdatef" data-f="dateMonth" ${dis}>${TH_M.map((m, i) => `<option value="${i + 1}" ${(r.dateMonth || new Date().getMonth() + 1) === i + 1 ? 'selected' : ''}>${m}</option>`).join('')}</select><input class="inl yr" type="number" aria-label="ปี พ.ศ." data-ch="rdatef" data-f="dateYear" value="${r.dateYear || beYear()}" min="2500" max="2700" ${dis}>` : ''}</div>
  <div class="sign-row"><span class="sign-lab">เลขที่หนังสือส่ง</span>
    <label class="chk"><input type="radio" name="out-year" value="0" data-ch="routyear" ${outYearOn(r) ? '' : 'checked'} ${dis}> ไม่ใส่ปี พ.ศ. (ที่ ${esc(S.settings.docPrefix)}${esc(outSeqOf(r) ? outSeqOf(r).n : '121')})</label>
    <label class="chk"><input type="radio" name="out-year" value="1" data-ch="routyear" ${outYearOn(r) ? 'checked' : ''} ${dis}> ใส่ปี พ.ศ. (ที่ ${esc(S.settings.docPrefix)}${esc(outSeqOf(r) ? outSeqOf(r).n : '121')}/${outSeqOf(r) ? outSeqOf(r).y : beYear()})</label></div>
  <label class="chk"><input type="checkbox" data-ch="rgpa" ${showGpa(r) ? 'checked' : ''} ${dis}> แสดงผลการเรียนเฉลี่ยสะสม (เกรดเฉลี่ย) ในผลการตรวจสอบ</label>
  <label class="chk"><input type="checkbox" data-ch="rsign" data-f="img" ${sg.img !== false ? 'checked' : ''} ${dis}> ใส่ภาพลายเซ็นในหนังสือ (ปิดไว้ถ้าจะพิมพ์แล้วลงนามด้วยปากกา)</label>
  ${missing.length ? `<p class="muted small" style="margin:0">⚠️ ${missing.map(esc).join(' · ')} — เพิ่มได้ที่ ⚙️ ตั้งค่า › ผู้ลงนามและลายเซ็น</p>` : ''}</div>`;
}
/* ภาพลายเซ็น: พื้นขาวเป็นโปร่งใส ตัดขอบ ย่อสูงไม่เกิน 160 px */
function processSig(src) {
  const c = document.createElement('canvas'); c.width = src.width || src.naturalWidth; c.height = src.height || src.naturalHeight;
  const ctx = c.getContext('2d'); ctx.drawImage(src, 0, 0);
  const img = ctx.getImageData(0, 0, c.width, c.height), d = img.data;
  let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
    const i = (y * c.width + x) * 4, lum = (d[i] + d[i + 1] + d[i + 2]) / 3;
    if (d[i + 3] < 20 || lum > 200) { d[i + 3] = 0; continue; }
    if (lum > 120) d[i + 3] = Math.round(d[i + 3] * (200 - lum) / 80);
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  if (x1 < 0) return '';
  ctx.putImageData(img, 0, 0);
  const pad = 6, w = x1 - x0 + 1 + pad * 2, h = y1 - y0 + 1 + pad * 2, k = Math.min(1, 160 / h, 600 / w);
  const o = document.createElement('canvas'); o.width = Math.round(w * k); o.height = Math.round(h * k);
  o.getContext('2d').drawImage(c, x0 - pad, y0 - pad, w, h, 0, 0, o.width, o.height);
  return o.toDataURL('image/png');
}
function signRoleCard(k) {
  const s = signOf(k), L = SIGN_ROLES[k].label;
  return `<div class="sign-card"><b>${L}</b>
  ${k === 'director' ? `<p class="muted small" style="margin:0">${esc(s.name || 'ยังไม่ได้กรอกชื่อ')} · ชื่อและตำแหน่งแก้ได้ในส่วน "ข้อมูลในหนังสือตอบ" ด้านบน</p>`
    : `<div><label for="sg-${k}-name">ชื่อ-สกุล</label><input id="sg-${k}-name" data-ch="signer" data-k="${k}" data-f="name" value="${esc(s.name)}" placeholder="นาย/นาง/นางสาว ..."></div>
       <div><label for="sg-${k}-pos">ตำแหน่ง</label><input id="sg-${k}-pos" data-ch="signer" data-k="${k}" data-f="position" value="${esc(s.position)}"></div>`}
  ${U.padRole === k
    ? `<canvas id="sig-pad" class="sig-pad" width="600" height="200" aria-label="พื้นที่วาดลายเซ็น"></canvas><div class="row"><button type="button" class="btn btn-primary sm" data-act="padsave">ใช้ลายเซ็นนี้</button><button type="button" class="btn btn-outline sm" data-act="padclear">ล้าง</button><button type="button" class="btn btn-outline sm" data-act="padcancel">ยกเลิก</button></div>`
    : `<div class="sig-box">${s.sig ? `<img src="${s.sig}" alt="ลายเซ็น${esc(L)}">` : '<span class="muted small">ยังไม่มีภาพลายเซ็น</span>'}</div>
       <div class="row"><label class="btn btn-outline sm file-btn">📁 อัปโหลดรูป<input type="file" accept="image/*" class="vh" data-ch="sigfile" data-k="${k}"></label><button type="button" class="btn btn-outline sm" data-act="padopen" data-k="${k}">✏️ วาดลายเซ็น</button>${s.sig ? `<button type="button" class="btn btn-outline sm" data-act="sigclear" data-k="${k}">ลบ</button>` : ''}</div>`}</div>`;
}
function signSettings() {
  signers(); const d = S.settings.signDefaults;
  return `<div class="card"><h2>✍️ ผู้ลงนามและลายเซ็น</h2><p class="muted small" style="margin-top:-6px">ใส่ชื่อ ตำแหน่ง และภาพลายเซ็นของผู้ลงนามแต่ละตำแหน่ง อัปโหลดรูปลายเซ็นบนกระดาษขาว (ระบบลบพื้นขาวให้) หรือวาดบนจอ แล้วเลือกผู้ลงนามได้ในหน้าหนังสือแต่ละฉบับ</p>
  <div class="sign-grid">${['director', 'registrar', 'measure', 'staff'].map(signRoleCard).join('')}</div>
  <h3 style="margin:16px 0 8px">ค่าเริ่มต้นสำหรับหนังสือฉบับใหม่</h3>
  <div class="sign-row"><span class="sign-lab">ลงนามหนังสือ</span>
    <label class="chk"><input type="radio" name="sd-main" value="director" data-ch="signdef" data-f="main" ${d.main !== 'registrar' ? 'checked' : ''}> ผู้อำนวยการ</label>
    <label class="chk"><input type="radio" name="sd-main" value="registrar" data-ch="signdef" data-f="main" ${d.main === 'registrar' ? 'checked' : ''}> นายทะเบียน (ปฏิบัติราชการแทน)</label></div>
  <div class="sign-row"><span class="sign-lab">ลงนามร่วม</span>${CO_ROLES.map(k => `<label class="chk"><input type="checkbox" value="${k}" data-ch="signdef" data-f="co" ${d.co.includes(k) ? 'checked' : ''}> ${SIGN_ROLES[k].label}</label>`).join('')}</div>
  <label class="chk"><input type="checkbox" data-ch="signdef" data-f="img" ${d.img !== false ? 'checked' : ''}> ใส่ภาพลายเซ็นในหนังสือโดยอัตโนมัติ</label>
  <p class="muted small" style="margin:10px 0 0">🔒 ภาพลายเซ็นเก็บในเบราว์เซอร์เครื่องนี้ ควรใช้กับเครื่องของงานทะเบียนที่ตั้งรหัสผ่านเจ้าหน้าที่แล้วเท่านั้น</p></div>`;
}
function initPad() {
  const c = $('#sig-pad'); if (!c) return;
  const ctx = c.getContext('2d'); ctx.lineWidth = 3.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#1a2a6c';
  let down = false;
  const pos = e => { const b = c.getBoundingClientRect(); return [(e.clientX - b.left) * c.width / b.width, (e.clientY - b.top) * c.height / b.height]; };
  c.addEventListener('pointerdown', e => { down = true; c.setPointerCapture(e.pointerId); const [x, y] = pos(e); ctx.beginPath(); ctx.moveTo(x, y); U.padDirty = true; });
  c.addEventListener('pointermove', e => { if (!down) return; const [x, y] = pos(e); ctx.lineTo(x, y); ctx.stroke(); });
  const up = () => { down = false; };
  c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
}

function renderModal() {
  const m = $('#modal'), r = getReq(U.letterId);
  if (!r) { m.hidden = true; m.innerHTML = ''; document.body.style.overflow = ''; return; }
  m.hidden = false; document.body.style.overflow = 'hidden';
  m.innerHTML = `<div class="modal-bar"><div><b>หนังสือแจ้งผลการตรวจสอบวุฒิ</b> <span class="muted small">· ${esc(r.agency)} · ${statusBadge(r)}</span></div>
  <div class="row">${!r.outNo ? `<button type="button" class="btn btn-yellow sm" data-act="issue" data-id="${r.id}">ออกเลขหนังสือส่ง</button>` : ''}<button type="button" class="btn btn-primary sm" data-act="pdf">💾 ดาวน์โหลด PDF</button>${canPrint ? `<button type="button" class="btn btn-outline sm" data-act="print">🖨️ พิมพ์</button>` : ''}<button type="button" class="btn btn-blue sm" data-act="panel" data-p="email">📧 ส่งอีเมล</button><button type="button" class="btn btn-blue sm" data-act="panel" data-p="post">📮 ส่งไปรษณีย์</button>${r.status !== 'replied' ? `<button type="button" class="btn btn-green sm" data-act="sent" data-id="${r.id}">บันทึกส่งแล้ว</button>` : ''}<button type="button" class="btn btn-outline sm" data-act="copyletter">คัดลอกข้อความ</button><button type="button" class="btn btn-dark sm" data-act="closemodal">ปิด</button></div></div>
  ${!canPrint ? `<p class="notice info modal-note">กด "💾 ดาวน์โหลด PDF" เพื่อบันทึกหนังสือเป็นไฟล์ PDF ขนาด A4 (สั่งพิมพ์ตรงจากหน้านี้ไม่ได้ ถ้าต้องการปุ่มพิมพ์ ให้เปิดไฟล์ index.html จากชุดดาวน์โหลด)</p>` : ''}
  ${signEditor(r)}
  ${pp1Editor(r)}
  ${enclEditor(r)}
  ${sendPanel(r)}
  <div class="paperwrap">${U.modalView === 'env' ? `<article class="letter envelope" id="envelope">${envelopeHTML(r)}</article>` : `<div id="letterDoc">${docHTML(r)}</div>`}</div>`;
  if (CLOUD && wantsPP1(r) && pp1Ready(r).some(t => pp1Pages(t.s).some(pg => !pageSrc(pg))) && U.pp1Loading !== r.id) {
    U.pp1Loading = r.id;
    ensurePP1(r).then(() => { if (U.letterId === r.id) renderModal(); }).catch(e => toast('โหลดสำเนา ปพ.1 ไม่สำเร็จ: ' + cloudMsg(e), 'err')).finally(() => { U.pp1Loading = null; });
  }
}

/* ---------- วันที่ในหนังสือ / เลขที่หนังสือส่ง ---------- */
/* โหมดวันที่: today = วันที่ออกหนังสือจริง (ค่าเริ่มต้น), custom = กำหนดเอง, monthyear = ใส่เฉพาะเดือนและปี (เว้นวันไว้เขียนเอง) */
const dateMode = r => r.dateMode || 'today';
function letterDateISO(r) { return dateMode(r) === 'custom' && r.dateCustom ? r.dateCustom : (r.outDate || todayISO()); }
function letterDateText(r) {
  if (dateMode(r) === 'monthyear') {
    const m = r.dateMonth || (new Date().getMonth() + 1), y = r.dateYear || beYear();
    return `      ${TH_M[m - 1]} ${y}`;
  }
  return fmtLong(letterDateISO(r));
}
/* เลขที่หนังสือส่ง: ค่าเริ่มต้นไม่ใส่ปี พ.ศ. (ที่ ศธ 04314.09/121) เลือกใส่ปีได้ (ที่ ศธ 04314.09/121/2569) */
const outYearOn = r => r.outYearOn !== undefined ? !!r.outYearOn : !!S.settings.outNoYear;
function outSeqOf(r) {
  if (r.outSeq) return { n: r.outSeq, y: r.outYear || beYear() };
  const m = String(r.outNo || '').match(/^(\d+)(?:\/(\d{4}))?$/);
  return m ? { n: +m[1], y: m[2] ? +m[2] : beYear() } : null;
}
function setOutNo(r) {
  const q = outSeqOf(r); if (!q) return;
  r.outSeq = q.n; r.outYear = q.y;
  r.outNo = outYearOn(r) ? `${q.n}/${q.y}` : String(q.n);
}
const outLeft = () => { const st = S.settings; return Math.max(0, st.outTo - Math.max(st.nextOut, st.outFrom) + 1); };
/* ออกเลขหนังสือส่งจากช่วงที่งานธุรการจัดสรร คืนค่า false ถ้าเลขหมดช่วง */
function issueNumber(r) {
  if (r.outNo) return true;
  const st = S.settings;
  if (st.nextOut < st.outFrom) st.nextOut = st.outFrom;
  if (st.nextOut > st.outTo) { toast(`เลขหนังสือส่งช่วง ${st.outFrom}–${st.outTo} ใช้ครบแล้ว กำหนดช่วงใหม่ที่ ⚙️ ตั้งค่า`, 'err'); return false; }
  r.outSeq = st.nextOut; r.outYear = beYear(); setOutNo(r); st.nextOut++;
  r.outDate = todayISO();
  addTL(r, `ออกเลขหนังสือส่ง ที่ ${r.outNo}`, true);
  return true;
}

/* ---------- ไลบรารีที่โหลดเมื่อใช้งาน ---------- */
const LIBS = {
  pdfjs: ['https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js', 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js'],
  tesseract: ['https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js'],
  pdfkit: ['https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js', 'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js']
};
const libLoading = {};
function loadScript(src) {
  return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('โหลดไลบรารีไม่สำเร็จ ตรวจสอบการเชื่อมต่ออินเทอร์เน็ต')); document.head.appendChild(s); });
}
function needLib(name) {
  if (!libLoading[name]) libLoading[name] = (async () => { for (const s of LIBS[name]) await loadScript(s); })().catch(e => { delete libLoading[name]; throw e; });
  return libLoading[name];
}
/* ความสามารถของหน้าเมื่อเปิดใน claude.ai (ไม่มีเมื่อเปิดไฟล์ในเครื่อง) */
async function useCap(name) {
  try { return window.claude && window.claude.use ? await window.claude.use(name) : null; } catch (e) { return null; }
}

/* ---------- สแกน/อ่านหนังสือเข้า ---------- */
async function fileToCanvases(file, onStatus) {
  const out = [];
  if (/pdf$/i.test(file.type) || /\.pdf$/i.test(file.name)) {
    onStatus && onStatus('กำลังเปิดไฟล์ PDF...');
    await needLib('pdfjs');
    const lib = window.pdfjsLib;
    lib.GlobalWorkerOptions.workerSrc = LIBS.pdfjs[1];
    const pdf = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const n = Math.min(pdf.numPages, 8);
    for (let i = 1; i <= n; i++) {
      onStatus && onStatus(`กำลังแปลงหน้า ${i}/${n}...`);
      const page = await pdf.getPage(i);
      const v1 = page.getViewport({ scale: 1 });
      const vp = page.getViewport({ scale: 2200 / v1.height });
      const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
      const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      out.push(c);
    }
  } else {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('เปิดไฟล์รูปภาพไม่ได้')); im.src = url; });
      const k = Math.min(1, 2600 / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
      const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height);
      out.push(c);
    } finally { URL.revokeObjectURL(url); }
  }
  return out;
}
const canvasBlob = (c, q = 0.88) => new Promise(res => c.toBlob(res, 'image/jpeg', q));
function cropCanvas(c, y0, y1) {
  const h = Math.round(c.height * (y1 - y0)), o = document.createElement('canvas'); o.width = c.width; o.height = h;
  o.getContext('2d').drawImage(c, 0, Math.round(c.height * y0), c.width, h, 0, 0, c.width, h); return o;
}
/* แบ่งแต่ละหน้าเป็นครึ่งบน/ล่าง (ซ้อนกันเล็กน้อย) เพื่อให้ตัวอักษรคมชัดพอเมื่อส่งให้ Claude อ่าน */
async function pagesToImages(canvases, max) {
  let parts = canvases.length * 2 <= max ? canvases.flatMap(c => [cropCanvas(c, 0, 0.56), cropCanvas(c, 0.44, 1)]) : canvases.slice(0, max);
  if (parts.length > canvases.length && parts.length < max) parts = [canvases[0], ...parts];
  return Promise.all(parts.map(c => canvasBlob(c)));
}
const SCAN_PROMPT = `The images are scanned pages (in order) of an official letter sent to a Thai school, ${'${SCHOOL}'}, asking it to verify the educational qualifications (ตรวจสอบวุฒิการศึกษา) of former students. The first image may be the whole first page; the other images may be each page split into an overlapping top half and bottom half. Read Thai carefully, character by character.
Layout of a Thai official letter (หนังสือราชการ / หนังสือบริษัท): at the TOP LEFT is the letter number: the word "ที่" (sometimes "เลขที่" or "No.") followed by the number, e.g. "ที่ อว 0603.12/1234", "ที่ ศธ 04314/ว 567", "ที่ TSL-HR 045/2569", "ที่ บค.123/2569". At the TOP RIGHT, under the sender's name, is the sender's postal address (house number, หมู่/ซอย/ถนน, ตำบล/แขวง, อำเภอ/เขต, จังหวัด, 5-digit postal code), usually 2–4 lines. Company letters may print the name, address, phone and e-mail in the letterhead at the very top or in the footer at the bottom of the page instead. Below that is the date, then เรื่อง, เรียน, อ้างถึง, สิ่งที่ส่งมาด้วย, the body, the signature, and a contact block at the bottom (department, โทร., โทรสาร, e-mail). The school's own name/address appears after "เรียน" or in the body: never use it as the sender's address.
Reply with ONLY one JSON object in this shape (use "" when a value is not shown; never invent data; convert Thai digits to Arabic digits; convert Buddhist-Era years to CE by subtracting 543 for dates):
{"agency":"the sending organization's name","docNo":"the complete letter number after ที่, keeping every letter, dot, slash and number exactly (without the word ที่)","docDate":"letter date as YYYY-MM-DD","subject":"text after เรื่อง","replyTo":"position title of the person who signed the letter followed by the organization name, e.g. ผู้จัดการฝ่ายทรัพยากรบุคคล บริษัท ตัวอย่าง จำกัด","email":"sender contact email","phone":"sender contact phone","address":"the sender's full postal address from the top-right block, letterhead or footer, lines separated by \\n (without the organization name)","headerText":"verbatim transcription of every line on page 1 above the line starting with เรียน, lines separated by \\n","footerText":"verbatim transcription of the lines below the signature on the last page of the letter, lines separated by \\n","hasList":true if the people are listed in an attached list or table page rather than written in the body,"persons":[{"prefix":"title or military/police rank exactly as written, e.g. นาย, นางสาว, ว่าที่ร้อยตรี, สิบเอก","fname":"","lname":"","sid":"former student ID (เลขประจำตัวนักเรียน) if shown","cid":"13-digit national ID digits if shown","gradDate":"graduation date YYYY-MM-DD if shown","gradYear":"graduation year in Buddhist Era if only a year is shown","level":"ม.3 or ม.6 if shown"}]}
Include a person even if only one of name, student ID or national ID is readable. Do not include the signer or the addressee in persons; persons are only the people whose qualifications should be verified.`;
async function readWithClaude(sample, canvases, lim, signal, onStatus) {
  const imgs = await pagesToImages(canvases, lim.images.maxCount || 4);
  onStatus('Claude กำลังอ่านเอกสาร อาจใช้เวลา 20–90 วินาที...');
  return sample.json(SCAN_PROMPT.replace('${SCHOOL}', S.settings.school), { images: imgs, signal, modelTier: 'default' });
}
async function readWithTesseract(canvases, onStatus) {
  onStatus('กำลังโหลดตัวอ่านข้อความภาษาไทย (ครั้งแรกใช้เวลาสักครู่)...');
  await needLib('tesseract');
  const worker = await window.Tesseract.createWorker(['tha', 'eng'], 1, { logger: m => { if (m.status === 'recognizing text') onStatus(`กำลังอ่านข้อความ ${Math.round(m.progress * 100)}%`); } });
  let text = '';
  try { for (const c of canvases) { const { data } = await worker.recognize(c); text += data.text + '\n'; } }
  finally { await worker.terminate(); }
  return parseLetterText(text);
}
/* ดึงเลขที่หนังสือ (ที่ ...) จากข้อความ */
function extractDocNo(text) {
  const t = thaiDigits(String(text || '')).replace(/[ \t]+/g, ' ');
  const lines = t.split(/\n/).map(x => x.trim()).filter(Boolean);
  for (const l of lines) {
    const m = l.match(/^(?:ที่|เลขที่|No\.?)\s*[:.]?\s*(.+?)(?:\s{2,}|$)/i);
    if (m && /\d/.test(m[1]) && /\//.test(m[1])) return m[1].replace(/\s*\/\s*/g, '/').trim().split(/\s+(?=[ก-๙]{4,})/)[0];
  }
  const m = t.match(/(?:^|\s)ที่\s+([A-Za-zก-๙.\-]{1,12}\s?[A-Za-zก-๙.\-]{0,8}\s?[\d.\-]+\s?\/\s?[ว]?\s?\d{1,5}(?:\s?\/\s?\d{2,4})?)/);
  return m ? m[1].replace(/\s*\/\s*/g, '/').trim() : '';
}
/* ดึงที่อยู่ไปรษณีย์จากข้อความ (บรรทัดที่มี ตำบล/แขวง อำเภอ/เขต จังหวัด ถนน หมู่ หรือรหัสไปรษณีย์) */
const ADDR_WORD = /(เลขที่\s*\d|^\d+(?:\/\d+)?\s|หมู่(?:ที่)?\s*\d|ม\.\s*\d|ซอย|ซ\.|ถนน|ถ\.|ตำบล|ต\.|แขวง|อำเภอ|อ\.|เขต|จังหวัด|จ\.|กรุงเทพ|\b\d{5}\b)/;
function extractAddress(text) {
  const school = S.settings.school || '', schoolAddr = normName(S.settings.address || '');
  const lines = thaiDigits(String(text || '')).split(/\n/).map(x => x.replace(/[ \t]+/g, ' ').trim()).filter(Boolean);
  const stop = lines.findIndex(l => /^เรียน/.test(l));
  const head = stop > 0 ? lines.slice(0, stop) : lines;
  const score = l => (l.match(/ตำบล|ต\.|แขวง|อำเภอ|อ\.|เขต|จังหวัด|จ\.|ถนน|ถ\.|หมู่|ซอย|กรุงเทพ/g) || []).length + (/\b\d{5}\b/.test(l) ? 2 : 0);
  const out = [];
  head.forEach(l => {
    if (/^(ที่|เลขที่|เรื่อง|เรียน|อ้างถึง|สิ่งที่ส่งมาด้วย)\b/.test(l) || l.includes(school) || /@|โทร|Tel|Fax|โทรสาร/i.test(l)) return;
    if (findDate(l) && !/\b\d{5}\b/.test(l)) return;
    const c = l.replace(/^ที่\s+\S+(\s+\S+)?\s{1,}(?=\S)/, '');
    if (ADDR_WORD.test(c) && score(c) + (/\d/.test(c) ? 1 : 0) >= 1) out.push(c);
  });
  const addr = out.filter(l => !schoolAddr || !schoolAddr.includes(normName(l))).join('\n');
  return /\d/.test(addr) && score(addr) >= 1 ? addr : '';
}
/* อ่านข้อความดิบจาก OCR แล้วเดาช่องข้อมูล (ใช้เมื่อไม่มี Claude) */
function parseLetterText(raw) {
  const t = thaiDigits(raw).replace(/[ \t]+/g, ' ');
  const lines = t.split(/\n/).map(s => s.trim()).filter(Boolean);
  const pick = re => { const m = t.match(re); return m ? m[1].trim() : ''; };
  const docNo = extractDocNo(t);
  const email = (t.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/) || [''])[0];
  const phone = pick(/(?:โทร(?:ศัพท์)?\.?|Tel\.?)\s*([0-9][0-9\s-]{7,14}[0-9])/i);
  const agencyLine = lines.find(l => /(บริษัท|มหาวิทยาลัย|โรงพยาบาล|สำนักงาน|กรม|ห้างหุ้นส่วน|ธนาคาร|วิทยาลัย|กอง|องค์การ)/.test(l) && !l.includes(S.settings.school) && !/^เรียน/.test(l));
  const agency = agencyLine ? agencyLine.replace(/^ที่\s+\S+\s*/, '').trim() : '';
  const persons = [], seen = new Set(), director = normName(S.settings.director || '');
  const re = /(\(?)(นางสาว|นาย|นาง|เด็กชาย|เด็กหญิง|น\.ส\.)\s*([ก-๙]{2,})\s+([ก-๙]{2,})/g;
  lines.forEach(l => {
    if (/^เรียน|ขอแสดงความนับถือ/.test(l)) return;
    let m; re.lastIndex = 0;
    while ((m = re.exec(l))) {
      if (m[1] === '(') continue;
      const key = m[3] + m[4];
      if (seen.has(key) || normName(m[3] + m[4]) === director) continue;
      seen.add(key);
      const ids = splitIds(l);
      persons.push({ prefix: m[2] === 'น.ส.' ? 'นางสาว' : m[2], fname: m[3], lname: m[4], sid: ids.sid, cid: ids.cid, gradDate: findDate(l.slice(m.index)), level: (l.match(/ม\.\s?([36])/) || [])[1] ? 'ม.' + l.match(/ม\.\s?([36])/)[1] : '' });
    }
  });
  return { agency, docNo, docDate: findDate(t), subject: pick(/เรื่อง\s*([^\n]+)/), replyTo: '', email, phone, address: extractAddress(t), hasList: /แนบ|บัญชีรายชื่อ|รายชื่อดังแนบ/.test(t), persons };
}
function applyScan(x, names, d = U.draft) {
  const str = v => String(v ?? '').trim();
  const hf = [str(x.headerText), str(x.footerText)].filter(Boolean).join('\n');
  const docNo = str(x.docNo) || extractDocNo(hf);
  let addr = str(x.address);
  if (!addr || !/\d/.test(addr)) addr = extractAddress(str(x.headerText)) || extractAddress(str(x.footerText)) || addr;
  if (str(x.agency)) d.agency = str(x.agency);
  if (docNo) d.docno = thaiDigits(docNo).replace(/^(ที่|เลขที่)\s*/, '').replace(/\s*\/\s*/g, '/').trim();
  const dd = parseDateAny(str(x.docDate)) || findDate(str(x.headerText)); if (dd) d.docdate = dd;
  const em = str(x.email) || (hf.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/) || [''])[0];
  if (em) d.email = em.toLowerCase();
  const ph = str(x.phone) || ((thaiDigits(hf).match(/(?:โทร(?:ศัพท์)?\.?|Tel\.?)\s*([0-9][0-9\s-]{7,14}[0-9])/i) || [])[1] || '');
  if (ph) d.aphone = ph.trim();
  if (addr) d.aaddr = thaiDigits(addr).split(/\n/).map(l => l.trim()).filter(l => l && normName(l) !== normName(d.agency)).join('\n');
  if (str(x.replyTo)) d.to = str(x.replyTo);
  d.form = x.hasList ? 1 : 2;
  d.file = names;
  const ps = (Array.isArray(x.persons) ? x.persons : []).filter(p => str(p.fname) || digits(p.sid) || digits(p.cid).length === 13).map(p => {
    const gd = parseDateAny(str(p.gradDate));
    const pre = str(p.prefix);
    return { sid: digits(p.sid), cid: digits(p.cid).length === 13 ? digits(p.cid) : '', prefix: pre, fname: str(p.fname), lname: str(p.lname), gradText: gd ? fmtBE(gd) : str(p.gradYear), level: /[36]/.test(str(p.level)) ? normLevel(p.level) : '' };
  });
  if (ps.length) d.persons = ps;
  d.enriched = d === U.draft ? ps.filter(p => enrichPerson(p, false)).length : 0;
  return ps.length;
}
function scanCard(kind) {
  const s = U.scan || {};
  return `<div class="card scan-card"><div class="between wrap"><div><h2 style="margin:0">📷 ${kind === 'agency' ? 'อ่านข้อมูลจากไฟล์หนังสือของหน่วยงาน' : 'สแกน / อ่านหนังสือเข้าอัตโนมัติ'}</h2><p class="muted small" style="margin:4px 0 0">เลือกไฟล์สแกนหรือรูปถ่ายหนังสือ (PDF, JPG, PNG) ระบบจะอ่านแล้วกรอกฟอร์มด้านล่างให้ ตรวจทานก่อนกดบันทึกทุกครั้ง</p></div></div>
  <div class="scan-row"><input type="file" id="sc-file" accept=".pdf,image/*" multiple aria-label="ไฟล์สแกนหนังสือ" ${s.busy ? 'disabled' : ''}>
  ${s.busy ? `<button type="button" class="btn btn-outline" data-act="scanstop">หยุด</button>` : `<button type="button" class="btn btn-blue" data-act="scan">🔎 อ่านเอกสาร</button>`}</div>
  ${s.msg ? `<p class="notice ${s.kind || 'info'}" style="margin:0">${s.msg}</p>` : ''}
  ${s.thumbs && s.thumbs.length ? `<div class="scan-thumbs">${s.thumbs.map(u => `<img src="${u}" alt="หน้าที่สแกน">`).join('')}</div>` : ''}</div>`;
}
let scanAbort = null;
async function runScan() {
  const files = [...($('#sc-file')?.files || [])];
  if (!files.length) return toast('เลือกไฟล์สแกนหนังสือก่อน', 'err');
  const D = U.mode === 'agency' ? U.adraft : U.draft, K = U.mode === 'agency' ? 'agency' : 'staff';
  const setS = (msg, kind, extra) => { U.scan = Object.assign(U.scan || {}, { msg, kind }, extra || {}); const el = $('.scan-card'); if (el) el.outerHTML = scanCard(K); };
  (U.scan?.thumbs || []).forEach(u => URL.revokeObjectURL(u));
  setS('กำลังเตรียมไฟล์...', 'info', { busy: true, thumbs: [] });
  scanAbort = new AbortController();
  try {
    const canvases = [];
    for (const f of files) canvases.push(...await fileToCanvases(f, m => setS(m, 'info')));
    const thumbs = await Promise.all(canvases.slice(0, 6).map(async c => { const k = 240 / c.height, t = document.createElement('canvas'); t.width = Math.round(c.width * k); t.height = 240; t.getContext('2d').drawImage(c, 0, 0, t.width, t.height); return URL.createObjectURL(await canvasBlob(t, 0.7)); }));
    U.scan.thumbs = thumbs;
    const sample = await useCap('sample');
    const lim = sample ? await sample.limits().catch(() => null) : null;
    let x, engine;
    if (sample && lim && lim.images) { engine = 'Claude'; x = await readWithClaude(sample, canvases, lim, scanAbort.signal, m => setS(m, 'info')); }
    else { engine = 'OCR ในเครื่อง'; x = await readWithTesseract(canvases, m => setS(m, 'info')); }
    const n = applyScan(x || {}, files.map(f => f.name).join(', '), D);
    const got = [['หน่วยงาน', D.agency], ['เลขที่หนังสือ', D.docno], ['ลงวันที่', D.docdate], ['E-mail', D.email], ['ที่อยู่', D.aaddr]].filter(a => a[1]).map(a => a[0]).join(' · ');
    const lack = [['เลขที่หนังสือ', D.docno], ['ที่อยู่', D.aaddr]].filter(a => !a[1]).map(a => a[0]);
    U.scan = { busy: false, thumbs, kind: n && !lack.length ? 'ok' : 'warn', msg: `อ่านด้วย ${engine} แล้ว · ได้ ${got || 'ข้อมูลหัวหนังสือไม่ครบ'} · รายชื่อ ${n} ราย${D.enriched ? ` (เติมจากฐานข้อมูล ${D.enriched} ราย)` : ''}${lack.length ? `<br>⚠️ อ่าน${lack.join('และ')}ไม่ได้ กรุณากรอกเองจากต้นฉบับ` : ''}<br>ตรวจทานทุกช่องให้ตรงกับต้นฉบับก่อนกด "บันทึกรับหนังสือ"` };
    render();
  } catch (e) {
    const code = e && e.code;
    const msg = code === 'cancelled' ? 'หยุดการอ่านแล้ว' : code === 'not_granted' ? 'ไม่ได้อนุญาตให้ Claude อ่านเอกสาร กรอกข้อมูลเองได้ตามปกติ' : code === 'rate_limited' ? 'มีการอ่านเอกสารถี่เกินไป รอสักครู่แล้วลองใหม่' : 'อ่านเอกสารไม่สำเร็จ: ' + esc((e && e.message) || e);
    U.scan = Object.assign(U.scan || {}, { busy: false, kind: code === 'cancelled' ? 'info' : 'danger', msg });
    render();
  } finally { scanAbort = null; }
}

/* ---------- PDF / อีเมล / ไปรษณีย์ ---------- */
const pdfName = r => `หนังสือแจ้งผลตรวจสอบวุฒิ_${(r.outNo || r.regNo).replace(/\//g, '-')}.pdf`;
async function saveFile(blob, filename) {
  const dl = await useCap('downloads');
  if (dl) { await dl.save({ filename, data: blob }); return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}
/* html2canvas ตัดบรรทัดภาษาไทยไม่เป็น: แทรก zero-width space ระหว่างคำ (Intl.Segmenter) ให้ตัดบรรทัดและวางคำตรงกับที่เบราว์เซอร์จัด */
function thaiBreaks(root) {
  if (!window.Intl || !Intl.Segmenter) return;
  const seg = new Intl.Segmenter('th', { granularity: 'word' });
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach(n => { if (/[\u0E00-\u0E7F]/.test(n.nodeValue)) n.nodeValue = [...seg.segment(n.nodeValue)].map(s => s.segment).join('\u200B'); });
}
/* สร้าง PDF: กระดาษแต่ละแผ่น (.letter) = 1 หน้า PDF เสมอ ถ้าเนื้อหายาวเกินเล็กน้อยจะย่อให้พอดีหน้า ถ้ายาวมากจะแบ่งหลายหน้า */
async function makePDF(html, pageClass) {
  await needLib('pdfkit');
  if (document.fonts && document.fonts.ready) await document.fonts.ready;
  const env = pageClass === 'env', W = env ? 220 : 210, H = env ? 110 : 297, pageRatio = H / W;
  const stage = document.createElement('div'); stage.className = 'pdf-stage ' + (pageClass || ''); stage.innerHTML = html;
  stage.style.cssText = 'position:fixed;left:-30000px;top:0;';
  thaiBreaks(stage);
  document.body.appendChild(stage);
  try {
    const pdf = new window.jspdf.jsPDF({ unit: 'mm', format: env ? [220, 110] : 'a4', orientation: env ? 'landscape' : 'portrait', compress: true });
    let first = true;
    for (const el of stage.querySelectorAll('.letter')) {
      const c = await window.html2canvas(el, { scale: 2, backgroundColor: '#ffffff', logging: false, useCORS: true, scrollX: 0, scrollY: 0, windowWidth: 1400, windowHeight: Math.max(1200, el.scrollHeight + 50) });
      const ratio = c.height / c.width;
      const parts = [];
      if (ratio <= pageRatio * 1.15) parts.push([0, c.height]);
      else { const sh = Math.floor(c.width * pageRatio); for (let y = 0; y < c.height; y += sh) parts.push([y, Math.min(sh, c.height - y)]); }
      for (const [y, h] of parts) {
        if (!first) pdf.addPage(); first = false;
        const part = document.createElement('canvas'); part.width = c.width; part.height = h;
        part.getContext('2d').drawImage(c, 0, y, c.width, h, 0, 0, c.width, h);
        const r = h / c.width;
        const w = r > pageRatio ? H / r : W, ph = r > pageRatio ? H : W * r;
        pdf.addImage(part.toDataURL('image/jpeg', 0.92), 'JPEG', (W - w) / 2, 0, w, ph);
      }
    }
    return pdf.output('blob');
  } finally { stage.remove(); }
}
const blobToB64 = b => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1]); fr.onerror = rej; fr.readAsDataURL(b); });
function summaryText(r) {
  const c = k => r.persons.filter(p => p.result === k).length;
  return `สำเร็จการศึกษาจริง ${c('found')} ราย / ข้อมูลไม่ตรงกับหลักฐานของโรงเรียน ${c('mismatch')} ราย / ไม่พบหลักฐานการสำเร็จการศึกษา ${c('notfound')} ราย`;
}
function defaultMail(r) {
  const st = S.settings, no = r.outNo ? st.docPrefix + r.outNo : '(ออกเลขเมื่อส่ง)';
  return {
    to: r.email || '', cc: '',
    subject: `แจ้งผลการตรวจสอบวุฒิการศึกษา – ${st.school} ที่ ${no}`,
    body: `เรียน ${r.to || r.agency}

${st.school} ขอส่งหนังสือแจ้งผลการตรวจสอบวุฒิการศึกษา ที่ ${no} ลงวันที่ ${letterDateText(r).trim()} ตอบหนังสือของท่านที่ ${r.docNo} ลงวันที่ ${fmtLong(r.docDate)} รายละเอียดตามไฟล์แนบ

สรุปผล: ${summaryText(r)}

ท่านตรวจสอบสถานะหนังสือได้ที่หน้าตรวจสอบสถานะของโรงเรียน โดยใช้เลขที่หนังสือ ${r.docNo} และอีเมลนี้

จึงเรียนมาเพื่อโปรดทราบ

${st.office}
${st.school}
โทร. ${st.phone || '-'}  อีเมล ${st.email || '-'}`
  };
}
function markSent(r, method, info) {
  if (!issueNumber(r)) return false;
  r.status = 'replied'; r.sentDate = todayISO();
  r.delivery = Object.assign({ method, at: Date.now() }, info);
  if (method === 'email') addTL(r, `ส่งหนังสือแจ้งผลทางไปรษณีย์อิเล็กทรอนิกส์ถึง ${info.to}`, true);
  else if (method === 'post') addTL(r, `ส่งหนังสือแจ้งผลทางไปรษณีย์ (${info.type})${info.track ? ' เลขพัสดุ ' + info.track : ''}`, true);
  else addTL(r, 'ส่งหนังสือแจ้งผลการตรวจสอบถึงหน่วยงานแล้ว', true);
  snapshotPublic(r);
  save();
  publishReply(r);
  return true;
}
const POST_TYPES = ['ลงทะเบียน', 'EMS', 'ธรรมดา', 'ส่งด้วยตนเอง'];
function sendPanel(r) {
  const st = S.settings, lock = r.status === 'replied';
  if (U.panel === 'email') {
    const m = U.mail || (U.mail = defaultMail(r));
    const gas = !!st.gasUrl;
    return `<div class="card send-panel"><div class="between wrap"><h3>📧 ส่งทางไปรษณีย์อิเล็กทรอนิกส์</h3><button type="button" class="icon-btn" data-act="panel" data-p="" aria-label="ปิด">✕</button></div>
    <div class="grid g2"><div><label for="ml-to">ถึง</label><input id="ml-to" type="email" data-in="mail" data-f="to" value="${esc(m.to)}"></div><div><label for="ml-cc">สำเนาถึง (ถ้ามี)</label><input id="ml-cc" data-in="mail" data-f="cc" value="${esc(m.cc)}"></div></div>
    <div><label for="ml-subject">เรื่อง</label><input id="ml-subject" data-in="mail" data-f="subject" value="${esc(m.subject)}"></div>
    <div><label for="ml-body">ข้อความ</label><textarea id="ml-body" rows="9" data-in="mail" data-f="body" style="font-family:inherit;font-size:14px">${esc(m.body)}</textarea></div>
    <label class="row" style="margin:0;gap:8px;font-weight:600"><input type="checkbox" id="ml-attach" ${m.attach === false ? '' : 'checked'} data-ch="mailattach"> แนบไฟล์ PDF หนังสือแจ้งผล (${esc(pdfName(r))})</label>
    <div class="row">${gas && !inFrame ? `<button type="button" class="btn btn-primary" data-act="mailsend" ${lock ? 'disabled' : ''}>📨 ส่งอีเมลผ่านระบบ</button>` : ''}
    <a class="btn btn-outline" href="mailto:${encodeURIComponent(m.to)}?${m.cc ? 'cc=' + encodeURIComponent(m.cc) + '&' : ''}subject=${encodeURIComponent(m.subject)}&body=${encodeURIComponent(m.body)}" target="_blank" rel="noopener">เปิดในโปรแกรมอีเมล</a>
    <button type="button" class="btn btn-outline" data-act="mailcopy">คัดลอกข้อความ</button>
    <button type="button" class="btn btn-outline" data-act="pdf">💾 ดาวน์โหลด PDF</button>
    ${lock ? '' : `<button type="button" class="btn btn-green" data-act="mailmark">บันทึกว่าส่งอีเมลแล้ว</button>`}</div>
    <p class="muted small" style="margin:0">${gas ? 'กด "ส่งอีเมลผ่านระบบ" จะส่งจากบัญชี Google ของโรงเรียนพร้อมไฟล์ PDF และบันทึกสถานะให้อัตโนมัติ' : 'ยังไม่ได้ตั้งค่าบริการส่งอีเมล (Google Apps Script) ในหน้าตั้งค่า ตอนนี้ให้ดาวน์โหลด PDF แล้วส่งจากอีเมลของโรงเรียน จากนั้นกด "บันทึกว่าส่งอีเมลแล้ว"'} · ปุ่ม "เปิดในโปรแกรมอีเมล" แนบไฟล์ให้ไม่ได้ ต้องแนบ PDF เอง</p></div>`;
  }
  if (U.panel === 'post') {
    const p = U.post || (U.post = { type: 'ลงทะเบียน', track: '' });
    return `<div class="card send-panel"><div class="between wrap"><h3>📮 ส่งทางไปรษณีย์</h3><button type="button" class="icon-btn" data-act="panel" data-p="" aria-label="ปิด">✕</button></div>
    <div class="grid g2"><div><label for="po-to">เรียน (บรรทัดแรกบนซอง)</label><input id="po-to" data-ch="rfield" data-f="to" value="${esc(r.to || r.agency)}"></div>
    <div><label for="po-addr">ที่อยู่หน่วยงาน</label><textarea id="po-addr" rows="3" data-ch="rfield" data-f="aaddr" style="font-family:inherit;font-size:14px" placeholder="เลขที่ ถนน ตำบล/แขวง อำเภอ/เขต จังหวัด รหัสไปรษณีย์">${esc(r.aaddr || '')}</textarea></div></div>
    <div class="row"><button type="button" class="btn btn-outline" data-act="view" data-v="${U.modalView === 'env' ? 'letter' : 'env'}">${U.modalView === 'env' ? '📄 กลับไปดูหนังสือ' : '✉️ ดูซองจดหมาย'}</button>${U.modalView === 'env' ? `${canPrint ? '<button type="button" class="btn btn-primary" data-act="print">🖨️ พิมพ์ซอง</button>' : ''}<button type="button" class="btn btn-outline" data-act="envpdf">💾 ดาวน์โหลด PDF ซอง</button>` : ''}</div>
    <div class="grid g3"><div><label for="po-type">วิธีส่ง</label><select id="po-type" data-ch="post" data-f="type" ${lock ? 'disabled' : ''}>${POST_TYPES.map(t => `<option ${p.type === t ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
    <div><label for="po-track">เลขพัสดุ / เลขลงทะเบียน</label><input id="po-track" data-ch="post" data-f="track" value="${esc(p.track)}" placeholder="เช่น EB123456789TH" ${lock ? 'disabled' : ''}></div>
    <div style="align-self:end">${lock ? '<span class="muted small">ส่งแล้ว</span>' : '<button type="button" class="btn btn-green" data-act="postmark">บันทึกส่งทางไปรษณีย์</button>'}</div></div>
    <p class="muted small" style="margin:0">ซองขนาด DL 22 × 11 ซม. มีตราครุฑ ชื่อและที่อยู่โรงเรียนมุมซ้ายบน ผู้รับอยู่กลางค่อนขวา · ใส่เลขพัสดุแล้วหน่วยงานกดติดตามได้จากหน้าตรวจสอบสถานะ</p></div>`;
  }
  return '';
}
function envelopeHTML(r) {
  const st = S.settings;
  const addr = String(r.aaddr || '').split('\n').filter(Boolean).map(esc).join('<br>');
  return numFix(`<div class="env-from"><img class="env-garuda" src="${GARUDA_SRC}" alt="ตราครุฑ"><div><p>ที่ ${esc(st.docPrefix)}${esc(r.outNo || '..........')}</p><p>${esc(st.school)}</p>${String(st.address || '').split('\n').filter(Boolean).map(l => `<p>${esc(l)}</p>`).join('')}</div></div>
  <div class="env-stamp" aria-hidden="true">ติดแสตมป์</div>
  <div class="env-to"><p>เรียน ${esc(r.to || r.agency)}</p>${addr ? `<p>${addr}</p>` : '<p class="env-missing">(กรอกที่อยู่หน่วยงานก่อนพิมพ์)</p>'}</div>`);
}
async function sendViaGAS(payload) {
  const res = await fetch(S.settings.gasUrl, { method: 'POST', body: JSON.stringify(payload) });
  let j = null; try { j = await res.json(); } catch (e) { j = null; }
  if (!j || !j.ok) throw new Error((j && j.error) || 'บริการส่งอีเมลไม่ตอบกลับ ตรวจสอบ URL ในหน้าตั้งค่า');
}

/* ---------- เรนเดอร์ ---------- */
/* ---------- ไอคอน (เส้น 24px ใช้สีตามตัวอักษร) ---------- */
const ICONS = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/>',
  inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  send: '<path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  cap: '<path d="M22 10 12 5 2 10l10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>',
  card: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/>',
  route: '<circle cx="6" cy="19" r="3"/><circle cx="18" cy="5" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/>',
  chart: '<path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 5-6"/>',
  sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/>',
  filepen: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h5"/><path d="M14 3v5h5"/><path d="M18.4 12.6a2 2 0 0 1 2.8 2.8L16 20.6l-3.6.9.9-3.6z"/>',
  file: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h6"/>',
  alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5M12 15V3"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  key: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="M10.7 12.3 21 2M16 7l3 3M19 4l2 2"/>',
  cloud: '<path d="M17.5 19H9a7 7 0 1 1 6.7-9h1.8a4.5 4.5 0 1 1 0 9z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  building: '<rect x="4" y="2" width="16" height="20" rx="1.5"/><path d="M9 22v-4h6v4M8 6h.01M12 6h.01M16 6h.01M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01"/>',
  pencil: '<path d="M17 3a2.8 2.8 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5z"/>',
  mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>',
  package: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  bulb: '<path d="M9 18h6M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/>',
  zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9z"/>',
  upload: '<path d="M3 6a2 2 0 0 1 2-2h4l2 3h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M12 17v-6M9 14l3-3 3 3"/>',
  scan: '<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M7 12h10"/>',
  printer: '<path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M6 14h12v7H6z"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
  clip: '<path d="m21.4 11.1-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5"/>',
  sign: '<path d="M3 17c3-1 4-8 7-8s-1 9 2 9 3-4 5-4 2 2 4 2"/><path d="M3 21h18"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
  spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6.3 6.3l2.5 2.5M15.2 15.2l2.5 2.5M6.3 17.7l2.5-2.5M15.2 8.8l2.5-2.5"/>'
};
const ic = (n, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[n] || ''}</svg>`;
/* ข้อความเดิมในระบบใช้อีโมจิ: แปลงเป็นไอคอนเส้นตอนแสดงผล เพื่อให้หน้าตาเป็นทางการและสม่ำเสมอ */
const EMOJI_ICON = { '📊': 'grid', '📥': 'inbox', '📤': 'send', '🔍': 'search', '🔎': 'search', '🎓': 'cap', '💳': 'card', '🧭': 'route', '📈': 'chart', '⚙️': 'sliders', '🏠': 'home', '📝': 'filepen', '📄': 'file', '⚠️': 'alert', '💾': 'download', '🔒': 'lock', '🔐': 'key', '☁️': 'cloud', '⏳': 'clock', '🧑‍💼': 'user', '🏢': 'building', '✏️': 'pencil', '📨': 'inbox', '📧': 'mail', '📮': 'package', '✉️': 'mail', '✅': 'check', '📬': 'mail', '💡': 'bulb', '📘': 'book', '⚡': 'zap', '📁': 'upload', '📷': 'scan', '🖨️': 'printer', '🔔': 'bell', '📎': 'clip', '✍️': 'sign' };
const EMOJI_RE = new RegExp('(' + Object.keys(EMOJI_ICON).sort((a, b) => b.length - a.length).map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')\\s?', 'gu');
const EMOJI_TEST = new RegExp(EMOJI_RE.source, 'u');
const stripEmoji = s => String(s).replace(EMOJI_RE, '');
function iconize(root) {
  if (!root || root.closest && root.closest('.letter')) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: n => EMOJI_TEST.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT });
  const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach(n => {
    const p = n.parentNode; if (!p) return;
    if (/^(OPTION|TEXTAREA|TITLE|SCRIPT|STYLE)$/.test(p.nodeName) || p.closest('.letter')) { n.nodeValue = stripEmoji(n.nodeValue); return; }
    const span = document.createElement('span'); span.className = 'icx';
    span.innerHTML = esc(n.nodeValue).replace(EMOJI_RE, (m, e) => ic(EMOJI_ICON[e]));
    p.replaceChild(span, n);
    if (span.childNodes.length) { while (span.firstChild) p.insertBefore(span.firstChild, span); p.removeChild(span); }
  });
}
const iconObserver = new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => { if (n.nodeType === 1) iconize(n); else if (n.nodeType === 3 && n.parentNode) iconize(n.parentNode); })));
['#app', '#modal', '#modeSeg', '#nav', '#gsearch'].forEach(s => { const el = $(s); if (el) iconObserver.observe(el, { childList: true, subtree: true }); });

/* ---------- ระยะเวลาดำเนินการ ---------- */
const DAY = 864e5;
const slaDays = () => Math.max(1, +S.settings.slaDays || 7);
const isoDays = (a, b) => Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / DAY));
function ageOf(r) {
  const start = r.recvDate || (r.submittedAt ? isoOf(new Date(r.submittedAt)) : todayISO());
  const d = isoDays(start, r.sentDate || todayISO()), sla = slaDays();
  return { d, sla, over: r.status !== 'replied' && d > sla, late: d - sla, left: sla - d };
}
function ageChip(r) {
  if (r.status === 'replied') { const a = ageOf(r); return `<span class="age done">ใช้เวลา ${a.d} วัน</span>`; }
  const a = ageOf(r);
  const cls = a.over ? 'over' : a.left <= 2 ? 'near' : '';
  const txt = a.over ? `เกินกำหนด ${a.late} วัน` : a.d === 0 ? 'รับวันนี้' : `รับมา ${a.d} วัน`;
  return `<span class="age ${cls}" title="กำหนดตอบภายใน ${a.sla} วันนับจากวันที่รับ">${txt}</span>`;
}
/* ขั้นตอนถัดไปของหนังสือแต่ละฉบับ */
function nextAction(r) {
  if (r.status === 'submitted') return { pri: 0, text: 'คำขอออนไลน์รอรับเข้าทะเบียน', btn: 'เปิดคำขอ', act: 'go', v: 'receive' };
  if (r.status === 'replied' || r.status === 'returned') return null;
  const pend = r.persons.filter(p => p.result === 'pending').length, inc = incompleteOf(r).length;
  if (pend) return { pri: 2, text: `ตรวจรายชื่อ เหลือ ${pend} จาก ${r.persons.length} ราย`, btn: 'ตรวจสอบ', act: 'openverify' };
  if (inc) return { pri: 2, text: `เติมเลข ปพ.1 / วันที่จบ ${inc} ราย ก่อนออกหนังสือ`, btn: 'เติมข้อมูล', act: 'openverify' };
  const pm = wantsPP1(r) ? pp1Missing(r).length : 0;
  if (pm) return { pri: 2, text: `แนบสำเนา ปพ.1 อีก ${pm} ราย (หน่วยงานขอสำเนาประกอบ)`, btn: 'แนบสำเนา', act: 'openverify' };
  if (!r.outNo) return { pri: 3, text: 'ตรวจครบแล้ว รอออกเลขและสร้างหนังสือตอบ', btn: 'สร้างหนังสือตอบ', act: 'letter' };
  return { pri: 3, text: `ออกเลข ${r.outNo} แล้ว รอส่งหนังสือตอบ`, btn: 'ส่งหนังสือตอบ', act: 'letter' };
}
function queueItems() {
  return S.requests.map(r => ({ r, a: nextAction(r), age: ageOf(r) })).filter(x => x.a)
    .sort((x, y) => (y.age.over - x.age.over) || (x.a.pri - y.a.pri) || (y.age.d - x.age.d));
}
function workQueue(limit = 8) {
  const q = queueItems();
  if (!q.length) return `<div class="queue-empty">${ic('check')}<div><b>ไม่มีงานค้าง</b><p class="muted small">หนังสือทุกฉบับส่งหนังสือตอบแล้ว</p></div></div>`;
  return `<ol class="queue">${q.slice(0, limit).map(({ r, a, age }) => `<li class="q-item ${age.over ? 'is-over' : a.pri === 0 ? 'is-new' : ''}">
    <div class="q-main"><div class="q-top"><b class="q-reg">${r.regNo ? esc(r.regNo) : 'ออนไลน์'}</b>${ageChip(r)}</div>
    <div class="q-agency">${esc(r.agency)}</div><div class="q-next">${esc(a.text)}</div></div>
    <button type="button" class="btn ${a.pri <= 1 || age.over ? 'btn-primary' : 'btn-outline'} sm" data-act="${a.act}" ${a.v ? `data-v="${a.v}"` : ''} data-id="${r.id}">${a.btn}</button></li>`).join('')}</ol>
    ${q.length > limit ? `<p class="muted small" style="margin:10px 0 0">และอีก ${q.length - limit} ฉบับ <button type="button" class="linkbtn" data-act="go" data-v="track">ดูทั้งหมด</button></p>` : ''}`;
}
function recentActivity(n = 5) {
  const ev = S.requests.flatMap(r => (r.timeline || []).map(e => ({ e, r }))).sort((a, b) => b.e.t - a.e.t).slice(0, n);
  if (!ev.length) return '<p class="muted small">ยังไม่มีความเคลื่อนไหว</p>';
  return `<ul class="activity">${ev.map(({ e, r }) => `<li><span class="act-dot"></span><div><div class="small">${esc(e.text)}</div><div class="sub">${esc(r.regNo || 'ออนไลน์')} · ${esc(r.agency)} · ${fmtDT(e.t)}</div></div></li>`).join('')}</ul>`;
}

/* ---------- ความคล้ายของชื่อ (สะกดต่างกันเล็กน้อย) ---------- */
function lev(a, b) {
  if (a === b) return 0; if (!a.length) return b.length; if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}
/* ตัดวรรณยุกต์/การันต์ เพื่อให้ชื่อที่สะกดวรรณยุกต์ต่างกันยังจับคู่ได้ */
const softName = s => normName(s).replace(/[็-๎]/g, '');
function nameSim(a, b) {
  const x = softName(a), y = softName(b); if (!x || !y) return 0;
  return 1 - lev(x, y) / Math.max(x.length, y.length);
}
function suggestFor(p, n = 3, exceptId) {
  const full = (p.fname || '') + (p.lname || ''), cid = digits(p.cid), key = sidKey(p.sid);
  return S.students.filter(s => s.id !== exceptId).map(s => {
    let sc = nameSim(full, s.fname + s.lname);
    const fn = nameSim(p.fname, s.fname), ln = nameSim(p.lname, s.lname);
    if (fn === 1 || ln === 1) sc = Math.max(sc, 0.5 + 0.4 * Math.min(fn, ln));
    if (key && sidKey(s.sid) === key) sc += 0.25;
    if (cid && cid === s.cid) sc += 0.4;
    if (p.level && s.level && normLevel(p.level) === s.level) sc += 0.03;
    return { s, sc: Math.min(1, sc) };
  }).filter(x => x.sc >= 0.62).sort((a, b) => b.sc - a.sc).slice(0, n);
}
function suggestHTML(p, r, i) {
  if (r.status === 'replied' || p.result === 'found') return '';
  const list = suggestFor(p, 3, p.matchedId);
  if (!list.length) return '';
  return `<div class="suggest"><span class="sub">${ic('spark')} ใกล้เคียงในฐานข้อมูล</span>${list.map(({ s, sc }) => `<button type="button" class="chip" data-act="pickstu" data-r="${r.id}" data-i="${i}" data-s="${s.id}" title="ใช้รายนี้เทียบข้อมูล">${esc(fullName(s))} · ${esc(s.sid)} · ${esc(s.level || '')} <b>${Math.round(sc * 100)}%</b></button>`).join('')}</div>`;
}
/* เคยตรวจบุคคลนี้ในหนังสือฉบับอื่นแล้วหรือไม่ */
function priorChecks(p, r) {
  const k = sidKey(p.sid), cid = digits(p.cid), nm = normName((p.fname || '') + (p.lname || ''));
  return S.requests.filter(x => x.id !== r.id && registered(x)).flatMap(x => x.persons.filter(q => q.result !== 'pending' && (
    (p.matchedId && q.matchedId === p.matchedId) || (cid && digits(q.cid) === cid) || (k && sidKey(q.sid) === k) || (nm && normName(q.fname + q.lname) === nm)
  )).map(q => ({ x, q })));
}
function priorHTML(p, r) {
  const h = priorChecks(p, r); if (!h.length) return '';
  return `<div class="prior">${ic('history')} เคยตรวจแล้ว ${h.length} ครั้ง: ${h.slice(0, 3).map(({ x, q }) => `<button type="button" class="linkbtn" data-act="openverify" data-id="${x.id}">เลขรับ ${esc(x.regNo)}</button> (${esc(x.agency)} · ${RESULT[q.result].t})`).join(', ')}</div>`;
}

/* ---------- ช่วยกรอกฟอร์มรับหนังสือ ---------- */
function nextRegNo() {
  const y = String(beYear());
  const ns = S.requests.map(r => String(r.regNo || '').replace(/\s/g, '').match(/^(\d+)\/(\d{4})$/)).filter(m => m && m[2] === y).map(m => +m[1]);
  return ns.length ? `${Math.max(...ns) + 1}/${y}` : '';
}
const agencyKey = s => String(s || '').replace(/\s+/g, '').replace(/^(บริษัท|บจก\.?)/, '').replace(/(จำกัด|\(มหาชน\))+$/g, '');
function knownAgencies() {
  const m = new Map();
  S.requests.slice().sort((a, b) => (a.recvDate || '').localeCompare(b.recvDate || '')).forEach(r => { if (r.agency) m.set(agencyKey(r.agency), { name: r.agency, email: r.email, to: r.to, aaddr: r.aaddr, aphone: r.aphone }); });
  (S.agencies || []).forEach(a => { const k = agencyKey(a.name); if (a.name && !m.has(k)) m.set(k, { name: a.name, email: a.email, to: '', aaddr: a.address || '', aphone: a.phone || '' }); });
  return m;
}
function agencyDatalist() { return `<datalist id="agency-list">${[...knownAgencies().values()].map(a => `<option value="${esc(a.name)}"></option>`).join('')}</datalist>`; }
function dupWarn(d) {
  const no = String(d.docno || '').replace(/\s/g, ''), ak = agencyKey(d.agency);
  if (!no) return '';
  const hit = S.requests.find(r => r.id !== d.editingId && String(r.docNo || '').replace(/\s/g, '') === no && (!ak || agencyKey(r.agency) === ak));
  return hit ? `<p class="notice warn row" style="margin:0">${ic('alert')} หนังสือเลขที่นี้เคยลงทะเบียนแล้ว: เลขรับ <b>${esc(hit.regNo || 'คำขอออนไลน์')}</b> (${esc(hit.agency)} · ${STATUS[hit.status].t}) <button type="button" class="linkbtn" data-act="openverify" data-id="${hit.id}">เปิดดู</button></p>` : '';
}
function fillAgency(name) {
  const a = knownAgencies().get(agencyKey(name)); if (!a) return 0;
  const d = U.draft, map = { email: 'rc-email', to: 'rc-to', aaddr: 'rc-aaddr', aphone: 'rc-aphone' };
  let n = 0;
  Object.entries(map).forEach(([k, id]) => { if (a[k] && !String(d[k] || '').trim()) { d[k] = a[k]; const el = $('#' + id); if (el) el.value = a[k]; n++; } });
  return n;
}

/* ---------- ค้นหาทั้งระบบ (Ctrl+K) ---------- */
function gsResults() {
  const q = (U.gsq || '').trim(); if (!q) return '';
  const qd = digits(q), qn = normName(q).toLowerCase();
  const reqs = S.requests.filter(r => [r.regNo, r.agency, r.docNo, r.outNo].some(v => String(v || '').toLowerCase().replace(/\s/g, '').includes(q.toLowerCase().replace(/\s/g, ''))) || r.persons.some(p => (qn && normName(p.fname + p.lname).includes(qn)) || (qd.length >= 4 && (digits(p.cid).includes(qd) || digits(p.sid).includes(qd))))).slice(0, 6);
  const stus = S.students.filter(s => (qn && normName(fullName(s)).includes(qn)) || (qd.length >= 3 && (sidKey(s.sid).includes(sidKey(qd)) || (s.cid || '').includes(qd)))).slice(0, 6);
  if (!reqs.length && !stus.length) return `<div class="gs-empty">ไม่พบ "${esc(q)}" ในหนังสือหรือฐานข้อมูลผู้สำเร็จการศึกษา</div>`;
  return (reqs.length ? `<div class="gs-group">หนังสือ</div>${reqs.map(r => `<button type="button" class="gs-item" data-act="${registered(r) ? 'openverify' : 'go'}" data-v="receive" data-id="${r.id}">${ic('file')}<span><b>${esc(r.regNo || 'คำขอออนไลน์')}</b> ${esc(r.agency)}<span class="sub">ที่ ${esc(r.docNo)} · ${r.persons.length} ราย · ${STATUS[r.status].t}</span></span></button>`).join('')}` : '')
    + (stus.length ? `<div class="gs-group">ผู้สำเร็จการศึกษา</div>${stus.map(s => `<button type="button" class="gs-item" data-act="gsstu" data-q="${esc(s.sid)}">${ic('cap')}<span><b>${esc(fullName(s))}</b><span class="sub">รหัส ${esc(s.sid)} · ${esc(s.level)} · จบ ${fmtBE(s.gradDate)}</span></span></button>`).join('')}` : '');
}
function renderSearch() {
  const box = $('#gsearch'); if (!box) return;
  const on = U.mode === 'staff' && U.staffAuth && U.gsOpen;
  box.hidden = !on;
  if (!on) { if (box.innerHTML) box.innerHTML = ''; return; }
  if (!$('#gs-q')) box.innerHTML = `<div class="pal-panel" role="dialog" aria-modal="true" aria-label="ค้นหาทั้งระบบ"><div class="pal-in">${ic('search')}<label class="vh" for="gs-q">ค้นหาทั้งระบบ</label><input id="gs-q" data-in="gsq" autocomplete="off" placeholder="พิมพ์เลขรับ เลขที่หนังสือ หน่วยงาน ชื่อ รหัส หรือเลขบัตร" value="${esc(U.gsq || '')}"><kbd>Esc</kbd></div><div id="gs-res" class="gs-res">${gsResults() || gsHint()}</div></div>`;
}
const gsHint = () => `<div class="gs-empty">ค้นได้ทั้งหนังสือรับ (เลขรับ เลขที่หนังสือ หน่วยงาน รายชื่อในหนังสือ) และฐานข้อมูลผู้สำเร็จการศึกษา · กด Enter เพื่อเปิดรายการแรก</div>`;
function openSearch() { U.gsOpen = true; renderSearch(); const i = $('#gs-q'); if (i) { i.focus(); i.select(); } }
function closeSearch() { U.gsOpen = false; U.gsq = ''; renderSearch(); }

/* ---------- สำเนา ปพ.1 แนบไปกับหนังสือตอบ ----------
   เก็บไว้ที่ข้อมูลนักเรียน (ใช้ซ้ำได้ทุกครั้งที่มีหน่วยงานขอตรวจคนเดิม)
   โหมดทดลอง: เก็บเป็นรูปในเบราว์เซอร์ · โหมดออนไลน์: เก็บใน Storage (attachments/pp1/...) ซึ่งเห็นได้เฉพาะเจ้าหน้าที่ */
const PP1_ENCL = 'สำเนาระเบียนแสดงผลการเรียน (ปพ.1)';
const PP1_CACHE = {};
const LEARN_CENTER_RE = /สกร|กศน|ส่งเสริมการเรียนรู้|การศึกษานอกระบบ|การศึกษาตามอัธยาศัย/;
const isLearnCenter = r => LEARN_CENTER_RE.test(`${r.agency || ''} ${r.to || ''}`);
const wantsPP1 = r => r.attachPP1 !== undefined ? !!r.attachPP1 : isLearnCenter(r);
const pp1Pages = s => (s && s.pp1Copy && Array.isArray(s.pp1Copy.pages)) ? s.pp1Copy.pages : [];
const pageSrc = pg => pg.src || PP1_CACHE[pg.path] || '';
/* รายชื่อที่ต้องแนบสำเนา = ผู้ที่ยืนยันว่าสำเร็จการศึกษาจริง */
function pp1Targets(r) {
  return r.persons.filter(p => p.result === 'found' && getStu(p.matchedId)).map(p => ({ p, s: getStu(p.matchedId) }));
}
const pp1Ready = r => pp1Targets(r).filter(t => pp1Pages(t.s).length);
const pp1Missing = r => pp1Targets(r).filter(t => !pp1Pages(t.s).length);

/* แปลงไฟล์ (PDF/รูป) เป็นหน้า JPEG ขนาดพอดีพิมพ์ A4 */
async function fileToPP1Pages(file) {
  const canvases = await fileToCanvases(file);
  return canvases.map(c => {
    const k = Math.min(1, 1600 / Math.max(c.width, c.height));
    const o = document.createElement('canvas'); o.width = Math.round(c.width * k); o.height = Math.round(c.height * k);
    const g = o.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, o.width, o.height); g.drawImage(c, 0, 0, o.width, o.height);
    return { src: o.toDataURL('image/jpeg', 0.8), w: o.width, h: o.height };
  });
}
async function uploadPP1(s, files) {
  const pages = [];
  for (const f of files) pages.push(...await fileToPP1Pages(f));
  if (!pages.length) throw new Error('ไม่พบหน้าที่อ่านได้ในไฟล์');
  const prev = s.pp1Copy;
  if (CLOUD) {
    const out = [];
    for (let i = 0; i < pages.length; i++) {
      const path = `pp1/${s.id}/${Date.now()}_${i}.jpg`;
      const { error } = await sb.storage.from('attachments').upload(path, dataURLtoBlob(pages[i].src), { contentType: 'image/jpeg', upsert: true });
      if (error) throw new Error(cloudMsg(error));
      PP1_CACHE[path] = pages[i].src;
      out.push({ path, w: pages[i].w, h: pages[i].h });
    }
    s.pp1Copy = { name: files.map(f => f.name).join(', '), pages: out, at: Date.now() };
    save();
    if (prev) removePP1Files(prev);
  } else {
    s.pp1Copy = { name: files.map(f => f.name).join(', '), pages, at: Date.now() };
    save();
    if (!storageOK) { s.pp1Copy = prev; save(); throw new Error('พื้นที่เก็บข้อมูลในเบราว์เซอร์เต็ม (โหมดทดลองเก็บได้จำกัด) ลองไฟล์ที่เล็กลงหรือใช้ระบบออนไลน์'); }
  }
  return pages.length;
}
function removePP1Files(copy) {
  if (!CLOUD || !copy) return;
  const paths = pp1Pages({ pp1Copy: copy }).map(p => p.path).filter(Boolean);
  if (paths.length) sb.storage.from('attachments').remove(paths).catch(() => {});
}
/* โหลดรูปจาก Storage ให้ครบก่อนแสดง/สร้าง PDF */
async function ensurePP1(r) {
  if (!CLOUD || !wantsPP1(r)) return;
  for (const { s } of pp1Ready(r)) for (const pg of pp1Pages(s)) {
    if (pageSrc(pg) || !pg.path) continue;
    const blob = await cloudDownload('attachments', pg.path);
    PP1_CACHE[pg.path] = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(blob); });
  }
}
async function replyPDF(r) { await ensurePP1(r); return makePDF(docHTML(r)); }

/* หน้าสำเนา: รูป ปพ.1 + ข้อความกำกับการใช้ + "สำเนาถูกต้อง" */
function pp1CopyPages(r) {
  if (!wantsPP1(r)) return '';
  const sg = reqSign(r), cert = r.pp1Cert || 'registrar', who = signOf(cert), dots = '........................................';
  const mark = r.pp1Mark === false ? '' : `ใช้สำหรับการตรวจสอบวุฒิการศึกษาตามหนังสือ${r.agency} ที่ ${r.docNo} เท่านั้น`;
  return pp1Ready(r).flatMap(({ p, s }) => pp1Pages(s).map((pg, i, all) => `<article class="letter copy">
    <div class="cp-frame"><img class="cp-img" src="${pageSrc(pg)}" alt="สำเนา ปพ.1 ของ ${esc(pName(p))}${all.length > 1 ? ` หน้า ${i + 1}` : ''}">
    ${mark ? `<div class="cp-mark">${esc(mark)}</div>` : ''}</div>
    <div class="cp-cert"><b>สำเนาถูกต้อง</b><div class="cp-sp">${sg.img !== false && who.sig ? `<img class="sig-img" src="${who.sig}" alt="ลายเซ็น">` : ''}</div><div>(${esc(who.name || dots)})</div><div>${esc(who.position || SIGN_ROLES[cert].label)}</div></div>
  </article>`)).join('');
}

/* แผงในหน้าหนังสือตอบ */
function pp1Editor(r) {
  const lock = r.status === 'replied', on = wantsPP1(r), tg = pp1Targets(r), miss = pp1Missing(r);
  const auto = r.attachPP1 === undefined && isLearnCenter(r);
  return `<div class="card encl-editor pp1-editor"><div class="between wrap"><h3>📘 สำเนา ปพ.1 แนบไปกับหนังสือตอบ</h3>${lock ? '<span class="muted small">ส่งหนังสือแล้ว แก้ไขไม่ได้</span>' : ''}</div>
  <label class="chk"><input type="checkbox" data-ch="rpp1" ${on ? 'checked' : ''} ${lock ? 'disabled' : ''}> แนบสำเนา ปพ.1 ของผู้ที่สำเร็จการศึกษาจริง (${tg.length} ราย)</label>
  ${auto ? `<p class="muted small" style="margin:0">เปิดให้อัตโนมัติ เพราะหน่วยงานนี้เป็นศูนย์ส่งเสริมการเรียนรู้ (สกร./กศน.) ซึ่งมักขอสำเนา ปพ.1 ประกอบ</p>` : ''}
  ${on ? `${!tg.length ? '<p class="muted small" style="margin:0">ยังไม่มีผู้ที่ยืนยันว่าสำเร็จการศึกษาจริง</p>' : `<div class="pp1-list">${tg.map(({ p, s }) => pp1Row(p, s, lock)).join('')}</div>`}
    ${miss.length ? `<p class="notice warn" style="margin:0">⚠️ ยังไม่มีสำเนา ปพ.1: ${miss.map(t => esc(pName(t.p))).join(', ')} — หนังสือจะแนบเฉพาะรายที่มีไฟล์</p>` : ''}
    <div class="sign-row"><span class="sign-lab">ผู้รับรองสำเนา</span>${['registrar', 'measure', 'director'].map(k => `<label class="chk"><input type="radio" name="pp1-cert" value="${k}" data-ch="rpp1cert" ${(r.pp1Cert || 'registrar') === k ? 'checked' : ''} ${lock ? 'disabled' : ''}> ${SIGN_ROLES[k].label}</label>`).join('')}</div>
    <label class="chk"><input type="checkbox" data-ch="rpp1mark" ${r.pp1Mark === false ? '' : 'checked'} ${lock ? 'disabled' : ''}> พิมพ์ข้อความกำกับ "ใช้สำหรับการตรวจสอบวุฒิการศึกษาตามหนังสือนี้เท่านั้น" บนสำเนา</label>
    <p class="muted small" style="margin:0">🔒 ไฟล์สำเนาเก็บกับข้อมูลนักเรียน เห็นได้เฉพาะเจ้าหน้าที่ และใช้ซ้ำได้เมื่อมีหน่วยงานขอตรวจคนเดิม ระบบเพิ่ม "${PP1_ENCL}" ในสิ่งที่ส่งมาด้วยให้อัตโนมัติ</p>` : ''}
  </div>`;
}
function pp1Row(p, s, lock) {
  const pages = pp1Pages(s);
  return `<div class="pp1-row"><div class="pp1-who"><b>${esc(pName(p))}</b><span class="sub">รหัส ${esc(s.sid)} · ${esc(s.level || '')}${s.pp1Set ? ` · ปพ.1 ชุดที่ ${esc(s.pp1Set)} เลขที่ ${esc(s.pp1No || '-')}` : ''}</span></div>
    <div class="pp1-state">${pages.length ? `<span class="badge ok">มีไฟล์ ${pages.length} หน้า</span>${pages.slice(0, 3).map(pg => pageSrc(pg) ? `<img class="pp1-thumb" src="${pageSrc(pg)}" alt="">` : '').join('')}` : '<span class="badge warn">ยังไม่มีไฟล์</span>'}</div>
    ${lock ? '' : `<div class="row"><label class="btn btn-outline sm file-btn">📁 ${pages.length ? 'เปลี่ยนไฟล์' : 'อัปโหลด PDF / รูป'}<input type="file" class="vh" accept=".pdf,image/*" multiple data-ch="pp1up" data-s="${s.id}"></label>${pages.length ? `<button type="button" class="icon-btn" data-act="pp1del" data-s="${s.id}" aria-label="ลบสำเนา ปพ.1 ของ ${esc(pName(p))}">✕</button>` : ''}</div>`}</div>`;
}
/* ปุ่มเล็กในหน้าตรวจสอบ (ช่องข้อมูลในฐานข้อมูล) */
function pp1Mini(s, r) {
  if (!s) return '';
  const n = pp1Pages(s).length;
  if (r.status === 'replied') return n ? `<div class="small muted">สำเนา ปพ.1 ${n} หน้า</div>` : '';
  return `<div class="pp1-mini">${n ? `<span class="small" style="color:var(--ok-fg)">✓ สำเนา ปพ.1 ${n} หน้า</span>` : (wantsPP1(r) ? '<span class="small" style="color:var(--warn-fg)">ยังไม่มีสำเนา ปพ.1</span>' : '')}
    <label class="linkbtn file-btn small">${n ? 'เปลี่ยน' : 'แนบสำเนา ปพ.1'}<input type="file" class="vh" accept=".pdf,image/*" multiple data-ch="pp1up" data-s="${s.id}"></label></div>`;
}

const VIEW_FN = { dash: vDash, receive: vReceive, outgoing: vOutgoing, verify: vVerify, grads: vGrads, fees: vFees, track: vTrack, reports: vReports, settings: vSettings };
function topBar() {
  if (U.mode === 'staff' && U.staffAuth) return `${CLOUD ? syncChip() : ''}<button type="button" class="seg-search" data-act="gsopen" aria-label="ค้นหาทั้งระบบ (Ctrl K)">${ic('search')} ค้นหา <kbd>Ctrl K</kbd></button><span class="who">🧑‍💼 ${esc(CLOUD && U.me ? U.me.email : 'เจ้าหน้าที่')}</span><button type="button" data-act="home">หน้าแรก</button><button type="button" data-act="logout">ออกจากระบบ</button>`;
  const acc = curAgency();
  if (U.mode === 'agency' && acc) return `<span class="who">🏢 ${esc(acc.name)}</span><button type="button" data-act="logout">ออกจากระบบ</button>`;
  return U.mode === 'home' ? `<button type="button" data-act="role" data-r="staff">เจ้าหน้าที่</button><button type="button" data-act="role" data-r="agency">หน่วยงานภายนอก</button>` : `<button type="button" data-act="home">← หน้าแรก</button>`;
}
function render() {
  const ft = $('.footer'); if (ft) ft.textContent = `WNM-Educational Measurement and Evaluation Section Ver.1 · ระบบรับ–ส่งและตรวจสอบวุฒิการศึกษา · ${CLOUD ? 'ข้อมูลเก็บบนระบบออนไลน์ (Supabase)' : 'โหมดทดลอง ข้อมูลเก็บในเบราว์เซอร์เครื่องนี้เท่านั้น'}`;
  $('#modeSeg').innerHTML = topBar();
  const nav = $('#nav'), acc = curAgency();
  let items = '';
  if (U.mode === 'staff' && U.staffAuth) { const n = inboxReqs().length; items = VIEWS.map(([k, t]) => `<button type="button" class="${U.view === k ? 'on' : ''}" data-act="go" data-v="${k}">${t}${k === 'receive' && n ? ` <span class="badge danger">${n}</span>` : ''}</button>`).join(''); }
  else if (U.mode === 'agency' && acc) { const un = agencyEvents(acc).filter(x => x.e.t > (acc.lastSeen || 0)).length; items = AVIEWS.map(([k, t]) => `<button type="button" class="${U.aView === k || (k === 'status' && U.aView === 'detail') ? 'on' : ''}" data-act="ago" data-v="${k}">${t}${k === 'home' && un ? ` <span class="badge danger">${un}</span>` : ''}</button>`).join(''); }
  nav.hidden = !items; nav.innerHTML = items;
  const nb = $('.navbar'); if (nb) nb.hidden = !items;
  renderSearch();
  $('#app').innerHTML = U.mode === 'home' ? vHome() : U.mode === 'staff' ? (U.staffAuth ? VIEW_FN[U.view]() : vStaffLogin()) : (acc ? vAgency() : vAgencyAuth());
  if (U.padRole) initPad();
  renderModal();
}
function go(view) { U.view = view; U.mode = 'staff'; render(); window.scrollTo(0, 0); }
function ago(view) { U.aView = view; U.mode = 'agency'; render(); window.scrollTo(0, 0); }

let toastT = null;
function toast(msg, kind) {
  const t = $('#toast'); t.textContent = stripEmoji(msg); t.className = 'toast' + (kind === 'err' ? ' err' : ''); t.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 3200);
}
/* ยืนยันสองจังหวะ (หน้านี้ใช้ confirm() ไม่ได้) */
function armed(btn, label) {
  if (btn.dataset.armed) return true;
  const old = btn.textContent; btn.dataset.armed = '1'; btn.textContent = label || 'กดอีกครั้งเพื่อยืนยัน';
  setTimeout(() => { if (btn.isConnected) { delete btn.dataset.armed; btn.textContent = old; } }, 3000);
  return false;
}
async function copyText(text, okMsg) {
  try { await navigator.clipboard.writeText(text); toast(okMsg || 'คัดลอกแล้ว'); }
  catch (e) {
    const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch (er) { ok = false; }
    ta.remove(); toast(ok ? (okMsg || 'คัดลอกแล้ว') : 'คัดลอกอัตโนมัติไม่ได้ ให้เลือกข้อความแล้วกด Ctrl+C', ok ? '' : 'err');
  }
}

/* ---------- การกระทำ ---------- */
const ACT = {
  go: b => { if (b.closest('#gs-res')) closeSearch(); go(b.dataset.v); },
  pickstu: b => {
    const r = getReq(b.dataset.r), p = r && r.persons[+b.dataset.i], s = getStu(b.dataset.s); if (!p || !s) return;
    const m = compareWith(p, s);
    Object.assign(p, { matchedId: s.id, result: m.result, auto: 'เลือกจากรายชื่อใกล้เคียง · ' + m.auto, manual: true });
    addTL(r, `เลือกจับคู่ ${pName(p)} กับ ${fullName(s)} (รหัส ${s.sid})`);
    refreshStatus(r); save(); render(); toast(`จับคู่กับ ${fullName(s)} แล้ว ตรวจผลอีกครั้งก่อนยืนยัน`);
  },
  gsopen: () => openSearch(),
  gsstu: b => { U.gq = b.dataset.q; closeSearch(); go('grads'); },
  usereg: b => { U.draft.regno = b.dataset.v; const el = $('#rc-reg'); if (el) { el.value = b.dataset.v; el.focus(); } },
  home: () => { U.mode = 'home'; U.authErr = ''; U.letterId = null; render(); window.scrollTo(0, 0); },
  role: b => { U.mode = b.dataset.r; U.authErr = ''; U.letterId = null; render(); window.scrollTo(0, 0); },
  logout: async () => { if (CLOUD) { if (saving || SYNC.state === 'pending') { toast('กำลังบันทึกข้อมูล รอสักครู่แล้วออกจากระบบอีกครั้ง', 'err'); return; } await sb.auth.signOut(); S = emptyState(); U.me = null; } U.staffAuth = false; U.agencyId = null; U.adraft = null; U.letterId = null; U.mode = 'home'; saveSession(); render(); toast('ออกจากระบบแล้ว'); },
  atab: b => { U.aTab = b.dataset.t; U.authErr = ''; render(); },
  ademo: b => { const a = S.agencies.find(x => x.id === b.dataset.id); $('#al-email').value = a.email; $('#al-pw').value = a.pw0; },
  ago: b => ago(b.dataset.v),
  aopen: b => { U.aReqId = b.dataset.id; const acc = curAgency(); acc.lastSeen = Date.now(); save(); ago('detail'); },
  aseen: () => { const acc = curAgency(); acc.lastSeen = Date.now(); save(); render(); },
  aresetdraft: () => { U.adraft = newADraft(curAgency()); render(); },
  adelfile: b => { U.adraft.files.splice(+b.dataset.i, 1); render(); },
  attdl: async b => {
    const list = b.dataset.r ? (getReq(b.dataset.r).attachments || []) : U.adraft.files, a = list[+b.dataset.i];
    try { await saveFile(a.path && CLOUD ? await cloudDownload('attachments', a.path) : dataURLtoBlob(a.data), a.name); } catch (e) { if (!e || e.code !== 'declined') toast('ดาวน์โหลดไม่สำเร็จ', 'err'); }
  },
  aedit: b => {
    const r = getReq(b.dataset.id), acc = curAgency();
    U.adraft = Object.assign(newADraft(acc), { form: r.form, agency: r.agency, docno: r.docNo, docdate: r.docDate, to: r.to, email: r.email, aphone: r.aphone || '', aaddr: r.aaddr || '', files: (r.attachments || []).slice(), editingId: r.id,
      persons: r.persons.map(p => ({ sid: p.sid, prefix: p.prefix || '', fname: p.fname, lname: p.lname, gradText: p.gradText || (p.gradDate ? fmtBE(p.gradDate) : ''), level: p.level || '' })) });
    ago('new');
  },
  areply: async b => {
    const r = getReq(b.dataset.id), old = b.textContent; b.disabled = true; b.textContent = 'กำลังสร้าง PDF...';
    try {
      if (CLOUD && !r.replyPdf) throw new Error('โรงเรียนยังไม่ได้อัปโหลดไฟล์หนังสือตอบ');
      await saveFile(CLOUD ? await cloudDownload('replies', `${r.id}.pdf`) : await replyPDF(r), pdfName(r)); toast('บันทึกหนังสือตอบกลับแล้ว');
    }
    catch (e) { toast(e && e.code === 'declined' ? 'ยกเลิกการบันทึกไฟล์' : 'สร้าง PDF ไม่สำเร็จ: ' + ((e && (e.message || e.code)) || e), e && e.code === 'declined' ? '' : 'err'); }
    finally { if (b.isConnected) { b.disabled = false; b.textContent = old; } }
  },
  acceptreq: b => {
    const r = getReq(b.dataset.id), reg = thaiDigits(($('#acc-reg')?.value || '')).trim();
    if (!reg) { toast('กรอกเลขทะเบียนรับจากงานธุรการ', 'err'); $('#acc-reg')?.focus(); return; }
    if (regTaken(reg, r.id)) return toast(`เลขทะเบียนรับ ${reg} ถูกใช้แล้ว`, 'err');
    U.acceptId = null; r.regNo = reg; r.recvDate = todayISO(); r.status = 'received';
    addTL(r, `เจ้าหน้าที่รับหนังสือแล้ว เลขทะเบียนรับ ${reg}`, true);
    save(); U.reqId = r.id; go('verify'); toast(`รับหนังสือแล้ว เลขทะเบียนรับ ${reg}`);
  },
  acceptopen: b => { U.acceptId = U.acceptId === b.dataset.id ? null : b.dataset.id; U.returnId = null; render(); $('#acc-reg')?.focus(); },
  retopen: b => { U.returnId = U.returnId === b.dataset.id ? null : b.dataset.id; render(); $('#ret-reason')?.focus(); },
  returnreq: b => {
    const reason = ($('#ret-reason')?.value || '').trim();
    if (!reason) return toast('ระบุเหตุผลที่ส่งกลับ', 'err');
    const r = getReq(b.dataset.id); r.status = 'returned'; r.returnReason = reason;
    addTL(r, `เจ้าหน้าที่ส่งคำขอกลับให้แก้ไข: ${reason}`, true);
    U.returnId = null; save(); render(); toast('ส่งคำขอกลับให้หน่วยงานแก้ไขแล้ว');
  },
  approveag: async b => {
    const a = S.agencies.find(x => x.id === b.dataset.id), v = b.dataset.v === '1', staff = b.dataset.role === 'staff';
    if (staff && !armed(b, 'ยืนยันตั้งเป็นเจ้าหน้าที่?')) return;
    if (CLOUD) {
      const { error } = await sb.from('profiles').update(staff ? { role: 'staff', approved: true } : { approved: v }).eq('id', a.id);
      if (error) return toast('บันทึกไม่สำเร็จ: ' + cloudMsg(error), 'err');
      if (staff) { S.agencies = S.agencies.filter(x => x.id !== a.id); S.staffList.push(Object.assign(a, { role: 'staff', approved: true })); }
    }
    if (!staff) a.approved = v;
    save(); render(); toast(staff ? 'ตั้งเป็นเจ้าหน้าที่แล้ว' : v ? `อนุมัติ ${a.name} แล้ว` : `ระงับ ${a.name} แล้ว`);
  },
  reloadcloud: async b => { b.disabled = true; try { await cloudLoadStaff(); render(); toast('โหลดข้อมูลล่าสุดแล้ว'); } catch (e) { toast(cloudMsg(e), 'err'); b.disabled = false; } },
  backup: async () => { try { await saveFile(new Blob([JSON.stringify(S, null, 1)], { type: 'application/json' }), `สำรองข้อมูล_ตรวจสอบวุฒิ_${todayISO()}.json`); } catch (e) { if (!e || e.code !== 'declined') toast('ดาวน์โหลดไม่สำเร็จ', 'err'); } },
  delagency: b => { if (!armed(b, 'ยืนยันลบ?')) return; S.agencies = S.agencies.filter(a => a.id !== b.dataset.id); save(); render(); toast('ลบบัญชีหน่วยงานแล้ว'); },
  openverify: b => { if (b.closest('#gs-res')) closeSearch(); U.reqId = b.dataset.id; U.letterId = null; go('verify'); },
  opentrack: b => { U.trackId = b.dataset.id; go('track'); },
  trsel: b => { U.trackId = b.dataset.id; $('#tr-list').innerHTML = trackList(); $('#tr-detail').innerHTML = trackDetail(getReq(U.trackId)); },
  addp: b => { const k = b.dataset.d || 'draft', d = U[k]; d.persons.push(blankP()); render(); $(k === 'draft' ? `#dp-${d.persons.length - 1}-sid` : `#${k}-${d.persons.length - 1}-fname`)?.focus(); },
  delp: b => { const d = U[b.dataset.d || 'draft']; d.persons.splice(+b.dataset.i, 1); if (!d.persons.length) d.persons.push(blankP()); render(); },
  resetdraft: () => { U.draft = newDraft(); render(); },
  editreq: b => {
    const r = getReq(b.dataset.id); if (!r) return;
    if (r.status === 'replied') return toast('หนังสือนี้ส่งหนังสือตอบแล้ว แก้ไขข้อมูลรับไม่ได้', 'err');
    U.draft = { editingId: r.id, regno: r.regNo, date: r.recvDate, email: r.email || '', agency: r.agency || '', to: r.to || '', docno: r.docNo || '', docdate: r.docDate || '', aaddr: r.aaddr || '', aphone: r.aphone || '', form: r.form, file: r.file || '',
      persons: r.persons.map(p => ({ pid: p.id, sid: p.sid || '', cid: p.cid || '', prefix: p.prefix || '', fname: p.fname || '', lname: p.lname || '', gradText: p.gradText || (p.gradDate ? fmtBE(p.gradDate) : ''), level: p.level || '', dbId: p.matchedId || null })) };
    if (!U.draft.persons.length) U.draft.persons.push(blankP());
    U.scan = null; go('receive');
    setTimeout(() => $('#rc-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  },
  canceledit: () => { U.draft = newDraft(); render(); toast('ยกเลิกการแก้ไขแล้ว'); },
  delreq: b => { if (!armed(b, 'ยืนยันลบ?')) return; S.requests = S.requests.filter(r => r.id !== b.dataset.id); save(); render(); toast('ลบหนังสือแล้ว'); },
  automatch: b => {
    const r = getReq(b.dataset.id); let n = 0;
    r.persons.forEach(p => { if (!p.manual) { Object.assign(p, matchPerson(p)); n++; } });
    addTL(r, `ตรวจเทียบฐานข้อมูลอัตโนมัติ ${n} ราย`, false);
    refreshStatus(r); save(); render(); toast(`ตรวจอัตโนมัติ ${n} ราย กรุณาตรวจทานผล`);
  },
  letter: b => { const lr = getReq(b.dataset.id); if (lr && lr.status !== 'replied' && incompleteOf(lr).length) { toast('ข้อมูลผู้สำเร็จการศึกษายังไม่ครบ (ปพ.1 / วันที่จบ) กรอกในหน้าตรวจสอบก่อน', 'err'); U.reqId = lr.id; go('verify'); return; } U.letterId = b.dataset.id; U.panel = ''; U.mail = null; U.post = null; U.modalView = 'letter'; renderModal(); },
  closemodal: () => { U.letterId = null; U.panel = ''; U.mail = null; U.post = null; U.modalView = 'letter'; renderModal(); render(); },
  issue: b => { const r = getReq(b.dataset.id); if (!issueNumber(r)) return; save(); renderModal(); toast(`ออกเลขหนังสือส่ง ${S.settings.docPrefix}${r.outNo}`); },
  sent: b => { const r = getReq(b.dataset.id); if (!markSent(r, 'other', {})) return; render(); toast('บันทึกการส่งหนังสือแล้ว'); },
  print: () => window.print(),
  padopen: b => { U.padRole = b.dataset.k; U.padDirty = false; render(); },
  padcancel: () => { U.padRole = null; render(); },
  padclear: () => { const c = $('#sig-pad'); c.getContext('2d').clearRect(0, 0, c.width, c.height); U.padDirty = false; },
  padsave: () => {
    const c = $('#sig-pad'), url = U.padDirty ? processSig(c) : '';
    if (!url) return toast('วาดลายเซ็นในกรอบก่อน', 'err');
    signers()[U.padRole].sig = url; U.padRole = null; save(); render(); toast('บันทึกลายเซ็นแล้ว');
  },
  sigclear: b => { if (!armed(b, 'ยืนยันลบ?')) return; signers()[b.dataset.k].sig = ''; save(); render(); toast('ลบลายเซ็นแล้ว'); },
  pp1del: b => {
    if (!armed(b, 'ยืนยันลบ?')) return;
    const s = getStu(b.dataset.s); if (!s) return;
    removePP1Files(s.pp1Copy); delete s.pp1Copy; save();
    if (U.letterId) renderModal(); else render(); toast('ลบสำเนา ปพ.1 แล้ว');
  },
  pdf: async b => {
    const r = getReq(U.letterId), old = b.textContent; b.disabled = true; b.textContent = 'กำลังสร้าง PDF...';
    try { await saveFile(await replyPDF(r), pdfName(r)); toast('บันทึกไฟล์ PDF แล้ว'); }
    catch (e) { toast(e && e.code === 'declined' ? 'ยกเลิกการบันทึกไฟล์' : 'สร้าง PDF ไม่สำเร็จ: ' + ((e && (e.message || e.code)) || e), e && e.code === 'declined' ? '' : 'err'); }
    finally { if (b.isConnected) { b.disabled = false; b.textContent = old; } }
  },
  envpdf: async b => {
    const r = getReq(U.letterId), old = b.textContent; b.disabled = true; b.textContent = 'กำลังสร้าง PDF...';
    try { await saveFile(await makePDF(`<article class="letter envelope">${envelopeHTML(r)}</article>`, 'env'), `ซองจดหมาย_${(r.outNo || r.regNo).replace(/\//g, '-')}.pdf`); toast('บันทึกไฟล์ PDF ซองแล้ว'); }
    catch (e) { toast(e && e.code === 'declined' ? 'ยกเลิกการบันทึกไฟล์' : 'สร้าง PDF ไม่สำเร็จ: ' + ((e && (e.message || e.code)) || e), e && e.code === 'declined' ? '' : 'err'); }
    finally { if (b.isConnected) { b.disabled = false; b.textContent = old; } }
  },
  panel: b => { U.panel = b.dataset.p; if (U.panel !== 'post') U.modalView = 'letter'; renderModal(); $('.send-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); },
  view: b => { U.modalView = b.dataset.v; renderModal(); },
  mailcopy: () => { const m = U.mail; copyText(`ถึง: ${m.to}${m.cc ? '\nสำเนาถึง: ' + m.cc : ''}\nเรื่อง: ${m.subject}\n\n${m.body}`, 'คัดลอกข้อความอีเมลแล้ว'); },
  mailmark: () => { const r = getReq(U.letterId), m = U.mail; if (!/^\S+@\S+\.\S+$/.test(m.to)) return toast('กรอกอีเมลผู้รับให้ถูกต้อง', 'err'); if (!markSent(r, 'email', { to: m.to })) return; U.panel = ''; render(); toast('บันทึกการส่งอีเมลแล้ว'); },
  mailsend: async b => {
    const r = getReq(U.letterId), m = U.mail, st = S.settings;
    if (!/^\S+@\S+\.\S+$/.test(m.to)) return toast('กรอกอีเมลผู้รับให้ถูกต้อง', 'err');
    b.disabled = true; b.textContent = 'กำลังส่ง...';
    try {
      if (!issueNumber(r)) { renderModal(); return; } save();
      const no = st.docPrefix + r.outNo;
      m.subject = m.subject.replace('(ออกเลขเมื่อส่ง)', no); m.body = m.body.replace('(ออกเลขเมื่อส่ง)', no);
      const pdf = m.attach === false ? null : await blobToB64(await replyPDF(r));
      await sendViaGAS({ key: st.gasKey || '', to: m.to, cc: m.cc || '', subject: m.subject, text: m.body, replyTo: st.email || '', fromName: st.school, pdf, filename: pdfName(r) });
      markSent(r, 'email', { to: m.to }); U.panel = ''; render(); toast('ส่งอีเมลเรียบร้อยแล้ว');
    } catch (e) { toast('ส่งอีเมลไม่สำเร็จ: ' + ((e && e.message) || e), 'err'); renderModal(); }
  },
  postmark: () => {
    const r = getReq(U.letterId), p = U.post;
    if (!String(r.aaddr || '').trim() && p.type !== 'ส่งด้วยตนเอง') return toast('กรอกที่อยู่หน่วยงานก่อนบันทึกส่งทางไปรษณีย์', 'err');
    if (!markSent(r, 'post', { type: p.type, track: String(p.track || '').trim().toUpperCase() })) return; U.panel = ''; U.modalView = 'letter'; render(); toast('บันทึกส่งทางไปรษณีย์แล้ว');
  },
  scan: () => runScan(),
  scanstop: () => { if (scanAbort) scanAbort.abort(); },
  encadd: () => { const r = getReq(U.letterId); enclList(r).push({ name: '', qty: 1, unit: 'ฉบับ' }); save(); renderModal(); $(`#en-${r.enclosures.length - 1}-name`)?.focus(); },
  encdel: b => { const r = getReq(U.letterId); enclList(r).splice(+b.dataset.i, 1); save(); renderModal(); },
  copyletter: () => copyText(($('#letterDoc') || $('#envelope')).innerText, 'คัดลอกข้อความหนังสือแล้ว'),
  toggleadd: () => { U.showAdd = !U.showAdd; render(); if (U.showAdd) $('#as-sid')?.focus(); },
  delstu: b => { if (!armed(b, 'ยืนยัน?')) return; S.students = S.students.filter(s => s.id !== b.dataset.id); S.fees = S.fees.filter(f => f.studentId !== b.dataset.id); save(); $('#gd-table').innerHTML = gradsTable(); toast('ลบรายชื่อแล้ว'); },
  stuimp: async b => {
    const f = $('#si-file').files[0];
    if (!f) return toast('เลือกไฟล์ฐานข้อมูลนักเรียนก่อน', 'err');
    const level = $('#si-level').value, grad = parseDateAny($('#si-date').value);
    b.disabled = true; b.textContent = 'กำลังอ่านไฟล์...';
    try {
      const res = importStudentDB(await fileToMatrix(f), level, grad, f.name);
      U.stuMsg = `<p class="notice ${res.noPP1.length ? 'warn' : 'ok'}" style="margin:0">นำเข้า ${esc(f.name)} สำเร็จ · เพิ่มใหม่ ${res.added} · อัปเดต ${res.updated} ราย${res.fees ? ` · มียอดค้างชำระ ${res.fees} ราย (สร้างรายการในหน้าค่าบำรุงแล้ว)` : ''}${res.skipped ? ` · ข้าม ${res.skipped} แถวที่ไม่มีรหัสหรือชื่อ` : ''}${res.noPP1.length ? `<br>ไม่มีเลข ปพ.1: ${res.noPP1.slice(0, 10).map(esc).join(', ')}${res.noPP1.length > 10 ? ' …' : ''}` : ''}</p>`;
    } catch (e) { U.stuMsg = `<p class="notice danger" style="margin:0">${esc(e.message || e)}</p>`; }
    render();
  },
  stutemplate: async () => {
    try {
      if (typeof XLSX === 'undefined') throw new Error('ยังโหลดตัวสร้างไฟล์ Excel ไม่สำเร็จ');
      const ws = XLSX.utils.aoa_to_sheet([STU_TEMPLATE_HEAD]); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
      await saveFile(new Blob([XLSX.write(wb, { bookType: 'xlsx', type: 'array' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'แบบฟอร์มฐานข้อมูลนักเรียนที่จบการศึกษา.xlsx');
    } catch (e) { if (!e || e.code !== 'declined') toast('ดาวน์โหลดไม่สำเร็จ: ' + (e.message || e), 'err'); }
  },
  pp3: async b => {
    const file = $('#gd-pp3').files[0], level = $('#gd-level').value, fb = parseDateAny($('#gd-date').value);
    if (!file) return toast('เลือกไฟล์ ปพ.3 ก่อน', 'err');
    if (!level) return toast('เลือกระดับชั้นที่จบ (ไฟล์ ปพ.3 ไม่ระบุ ม.3/ม.6 ไว้ในตัว)', 'err');
    b.disabled = true; b.textContent = 'กำลังอ่านไฟล์...';
    try {
      const res = await importPP3(file, level, fb);
      if (!res.total) U.lastImport = `<p class="notice danger">ไม่พบแถวข้อมูลนักเรียนใน ${esc(file.name)} ตรวจสอบว่าเป็นไฟล์ ปพ.3 ที่มีคอลัมน์เลขประจำตัวและชื่อ-สกุล</p>`;
      else U.lastImport = `<p class="notice ok">นำเข้า ${esc(file.name)} สำเร็จ ${res.total} ราย (${level}) · เพิ่มใหม่ ${res.added} · อัปเดต ${res.updated} · มีเกรดเฉลี่ย ${res.withGpa} ราย<br>วันที่จบ: ${res.gradDate ? fmtLong(res.gradDate) + (res.approval ? ' (จากบล็อกอนุมัติการจบในไฟล์)' : ' (จากช่องที่กรอก)') : '<b>ไม่พบ</b> กรอกวันที่จบแล้วนำเข้าซ้ำเพื่ออัปเดต'}</p>`;
    } catch (e) { U.lastImport = `<p class="notice danger">อ่านไฟล์ไม่สำเร็จ: ${esc(e.message)}</p>`; }
    render();
  },
  csvimp: async () => {
    const f = $('#gd-csv').files[0];
    const text = f ? await readText(f) : $('#gd-csvtext').value;
    if (!String(text).trim()) return toast('เลือกไฟล์ CSV หรือวางข้อความก่อน', 'err');
    const r = importGradCSV(text);
    U.lastImport = `<p class="notice ok">นำเข้า CSV · เพิ่มใหม่ ${r.added} · อัปเดต ${r.updated}${r.skipped ? ' · ข้าม ' + r.skipped + ' แถว (ไม่มีชื่อ)' : ''}</p>`;
    render();
  },
  feeimport: async b => {
    const f = $('#fi-file').files[0], text = $('#fi-text').value;
    if (!f && !text.trim()) return toast('เลือกไฟล์หรือวางข้อความก่อน', 'err');
    b.disabled = true;
    try {
      const rows = f ? await fileToMatrix(f) : parseCSV(text);
      const res = importFees(rows);
      U.feeMsg = `<p class="notice ${res.miss.length ? 'warn' : 'ok'}" style="margin:0">เพิ่มใหม่ ${res.added} · อัปเดต ${res.updated}${res.miss.length ? `<br>ไม่พบในฐานข้อมูลผู้สำเร็จการศึกษา ${res.miss.length} แถว: ${res.miss.slice(0, 12).map(esc).join(', ')}${res.miss.length > 12 ? ' …' : ''}` : ''}</p>`;
    } catch (e) { U.feeMsg = `<p class="notice danger" style="margin:0">อ่านไฟล์ไม่สำเร็จ: ${esc(e.message || e)}</p>`; }
    render();
  },
  payfull: b => { const f = S.fees.find(x => x.id === b.dataset.id); f.paid = f.amount; save(); render(); toast('บันทึกรับชำระครบแล้ว'); },
  delfee: b => { if (!armed(b, 'ยืนยัน?')) return; S.fees = S.fees.filter(f => f.id !== b.dataset.id); save(); render(); },
  copycsv: () => {
    const lines = [['เลขรับ', 'วันที่รับ', 'หน่วยงาน', 'เลขที่หนังสือ', 'แบบ', 'ชื่อ', 'สกุล', 'เลขประจำตัว', 'ผลการตรวจสอบ', 'หมายเหตุ', 'สถานะหนังสือ', 'เลขหนังสือส่ง', 'วันที่ส่ง']];
    REQS().sort(byRecv).forEach(r => r.persons.forEach(p => lines.push([r.regNo, fmtBE(r.recvDate), r.agency, r.docNo, 'แบบที่ ' + r.form, p.fname, p.lname, p.sid, RESULT[p.result].t, p.note, STATUS[r.status].t, r.outNo, r.sentDate ? fmtBE(r.sentDate) : ''])));
    copyText(lines.map(l => l.map(v => /[",\n]/.test(String(v ?? '')) ? `"${String(v).replace(/"/g, '""')}"` : (v ?? '')).join(',')).join('\n'), 'คัดลอกรายงาน CSV แล้ว วางใน Excel/Google Sheets ได้');
  },
  resetdemo: b => { if (!armed(b, 'กดอีกครั้ง: แทนที่ข้อมูลทั้งหมด')) return; S = seed(); save(); U.reqId = null; U.trackId = null; U.lastImport = ''; render(); toast('โหลดข้อมูลตัวอย่างใหม่แล้ว'); },
  clearall: b => { if (!armed(b, 'กดอีกครั้ง: ลบทุกอย่าง')) return; S = { v: 1, settings: S.settings, agencies: S.agencies || [], students: [], fees: [], requests: [] }; save(); U.reqId = null; U.trackId = null; render(); toast('ล้างข้อมูลแล้ว'); },
};
/* รับหนังสือ: กรอกอย่างใดอย่างหนึ่ง (รหัสประจำตัว / เลขบัตรประชาชน / ชื่อ-สกุล) แล้วดึงข้อมูลที่เหลือจากฐานข้อมูลให้อัตโนมัติ */
function findStuFor(p, by) {
  const L = S.students, key = sidKey(p.sid), cid = digits(p.cid);
  const uniq = a => a.length === 1 ? a[0] : a.length > 1 ? 'many' : null;
  const bySid = () => key ? uniq(L.filter(s => sidKey(s.sid) === key)) : null;
  const byCid = () => cid.length === 13 ? uniq(L.filter(s => s.cid === cid)) : null;
  const byName = () => {
    let fn = p.fname, ln = p.lname;
    if (fn && !ln && /\s/.test(fn.trim())) { const n = splitName(fn); fn = n.fname; ln = n.lname; }
    if (!normName(fn)) return null;
    const a = L.filter(s => normName(s.fname) === normName(fn) && (!normName(ln) || normName(s.lname) === normName(ln)));
    return normName(ln) || a.length === 1 ? uniq(a) : (a.length ? 'many' : null);
  };
  const order = by === 'cid' ? [byCid, bySid, byName] : by === 'name' ? [byName, byCid, bySid] : [bySid, byCid, byName];
  for (const f of order) { const r = f(); if (r) return r; }
  return null;
}
/* เติมข้อมูลจากฐานข้อมูล: overwrite=true เขียนทับทุกช่อง (กรอกเอง), false = เติมเฉพาะช่องที่ว่าง (หลังสแกน) */
function enrichPerson(p, overwrite, by) {
  const s = findStuFor(p, by);
  if (!s || s === 'many') return s;
  const put = (k, v) => { if (v && (overwrite || !String(p[k] || '').trim())) p[k] = v; };
  put('sid', s.sid); put('cid', s.cid); put('prefix', s.prefix); put('fname', s.fname); put('lname', s.lname);
  put('gradText', s.gradDate ? fmtBE(s.gradDate) : ''); put('level', s.level);
  p.dbId = s.id;
  return s;
}
function fillFromDB(i, moveNext, by) {
  const p = U.draft.persons[i]; if (!p) return;
  const prev = p.dbId;
  if (by === 'name' && !p.lname && /\s/.test((p.fname || '').trim())) { const n = splitName(p.fname); p.fname = n.fname; p.lname = n.lname; if (n.prefix && !p.prefix) p.prefix = n.prefix; }
  const s = findStuFor(p, by);
  if (s === 'many') { toast('พบชื่อนี้หลายรายในฐานข้อมูล กรุณาระบุรหัสประจำตัวหรือเลขบัตรประชาชน', 'err'); return; }
  if (!s) { if (prev) { p.dbId = null; syncRow(i, p); } return; }
  if (prev === s.id) return;
  enrichPerson(p, true, by);
  syncRow(i, p);
  if (moveNext) { const next = $(`#dp-${i + 1}-sid`); if (next) next.focus(); }
  toast(`พบในฐานข้อมูล: ${fullName(s)} · ${s.level} จบ ${fmtBE(s.gradDate)}`);
}
/* อัปเดตค่าในแถวโดยไม่วาดหน้าใหม่ (เคอร์เซอร์ไม่กระโดด) */
function syncRow(i, p) {
  ['sid', 'cid', 'prefix', 'fname', 'lname', 'level'].forEach(f => { const el = $(`#dp-${i}-${f}`); if (el && el !== document.activeElement) el.value = p[f] || ''; });
  const g = $(`#dp-${i}-grad`); if (g) g.value = p.gradText || '';
  const tr = $(`#dp-${i}-sid`)?.closest('tr'); if (tr) tr.classList.toggle('db-row', !!p.dbId);
  const hit = $(`#dp-${i}-hit`); if (hit) hit.hidden = !p.dbId;
}
const IN = {
  mail: el => { U.mail[el.dataset.f] = el.value; },
  df: el => { U[el.dataset.d || 'draft'][el.dataset.f] = el.value; if (!el.dataset.d && (el.dataset.f === 'docno' || el.dataset.f === 'agency')) { const w = $('#rc-dup'); if (w) w.innerHTML = dupWarn(U.draft); } },
  gsq: el => { U.gsq = el.value; const r = $('#gs-res'); if (r) r.innerHTML = gsResults() || gsHint(); },
  dp: el => {
    U[el.dataset.d || 'draft'].persons[+el.dataset.i][el.dataset.f] = el.value;
    if (el.dataset.d) return;
    if (el.dataset.f === 'sid' && digits(el.value).length >= 5) fillFromDB(+el.dataset.i, true, 'sid');
    if (el.dataset.f === 'cid' && digits(el.value).length === 13) fillFromDB(+el.dataset.i, false, 'cid');
  },
  vfq: el => { U.vq = el.value; $('#vf-quick').innerHTML = quickResults(); },
  trq: el => { U.tq = el.value; $('#tr-list').innerHTML = trackList(); },
  gdq: el => { U.gq = el.value; $('#gd-table').innerHTML = gradsTable(); },
  feq: el => { U.fq = el.value; $('#fe-table').innerHTML = feesTable(); }
};
const CH = {
  restore: async el => {
    const f = el.files[0]; if (!f) return;
    try {
      const d = JSON.parse(await readText(f));
      if (!d || !Array.isArray(d.students)) throw new Error('ไม่ใช่ไฟล์สำรองข้อมูลของระบบนี้');
      const merge = (k) => { const m = new Map(S[k].map(o => [o.id, o])); (d[k] || []).forEach(o => { if (o && o.id) m.set(o.id, o); }); S[k] = [...m.values()]; };
      merge('students'); merge('fees'); merge('requests');
      if (d.settings) { const keep = { staffPwHash: S.settings.staffPwHash }; S.settings = Object.assign(S.settings, d.settings, keep); }
      migrateState(); save(); render(); toast(`นำเข้าแล้ว: ผู้สำเร็จการศึกษา ${(d.students || []).length} · ค่าบำรุง ${(d.fees || []).length} · หนังสือ ${(d.requests || []).length}`);
    } catch (e) { toast('นำเข้าไม่สำเร็จ: ' + e.message, 'err'); }
  },
  agencypick: el => { const n = fillAgency(el.value); if (n) toast(`เติมข้อมูลติดต่อ ${n} ช่องจากหนังสือครั้งก่อนของหน่วยงานนี้`); },
  dpsid: el => { if (digits(el.value).length >= 3) fillFromDB(+el.dataset.i, false, 'sid'); },
  dpkey: el => { const f = el.dataset.f; if (f === 'cid' ? digits(el.value).length === 13 : el.value.trim()) fillFromDB(+el.dataset.i, false, f === 'cid' ? 'cid' : 'name'); },
  pp1: el => { const s = getStu(el.dataset.s); s[el.dataset.f] = digits(el.value); save(); render(); },
  rpp1: el => { const r = getReq(U.letterId); r.attachPP1 = el.checked; save(); renderModal(); },
  rpp1cert: el => { const r = getReq(U.letterId); r.pp1Cert = el.value; save(); renderModal(); },
  rpp1mark: el => { const r = getReq(U.letterId); r.pp1Mark = el.checked; save(); if ($('#letterDoc')) $('#letterDoc').innerHTML = docHTML(r); },
  pp1up: async el => {
    const s = getStu(el.dataset.s), files = [...el.files]; if (!s || !files.length) return;
    toast('กำลังเตรียมสำเนา ปพ.1...');
    try { const n = await uploadPP1(s, files); toast(`แนบสำเนา ปพ.1 ของ ${fullName(s)} แล้ว ${n} หน้า`); }
    catch (e) { toast('แนบสำเนาไม่สำเร็จ: ' + ((e && e.message) || e), 'err'); }
    if (U.letterId) renderModal(); else render();
  },
  enclist: el => {
    const r = getReq(U.letterId), name = el.dataset.v === 'agency' ? ENCL_AGENCY : ENCL_TITLE, L = enclList(r);
    if (el.checked && !enclHas(r, name)) { if (name === ENCL_TITLE) L.unshift({ name, qty: 1, unit: 'ฉบับ' }); else L.push({ name, qty: 1, unit: 'ชุด' }); }
    if (!el.checked) r.enclosures = L.filter(e => String(e.name || '').trim() !== name);
    save(); renderModal();
  },
  rdate: el => { const r = getReq(U.letterId); r.dateMode = el.value; if (el.value === 'custom' && !r.dateCustom) r.dateCustom = r.outDate || todayISO(); save(); renderModal(); },
  rdatef: el => { const r = getReq(U.letterId), f = el.dataset.f; r[f] = f === 'dateCustom' ? el.value : (parseInt(el.value, 10) || undefined); save(); if ($('#letterDoc')) $('#letterDoc').innerHTML = docHTML(r); },
  routyear: el => { const r = getReq(U.letterId); r.outYearOn = el.value === '1'; if (r.outNo) { const old = r.outNo; setOutNo(r); if (old !== r.outNo) addTL(r, `ปรับรูปแบบเลขหนังสือส่งเป็น ที่ ${r.outNo}`); } save(); renderModal(); },
  rgpa: el => { const r = getReq(U.letterId); r.showGpa = el.checked; save(); if ($('#letterDoc')) $('#letterDoc').innerHTML = docHTML(r); },
  signer: el => { signers()[el.dataset.k][el.dataset.f] = el.value.trim(); save(); },
  signdef: el => {
    signers(); const d = S.settings.signDefaults, f = el.dataset.f;
    if (f === 'main') d.main = el.value; else if (f === 'img') d.img = el.checked;
    else d.co = el.checked ? [...new Set([...d.co, el.value])] : d.co.filter(k => k !== el.value);
    save();
  },
  rsign: el => {
    const r = getReq(U.letterId), sg = reqSign(r), f = el.dataset.f;
    if (f === 'main') { sg.main = el.value; if (sg.main === 'registrar') sg.co = sg.co.filter(k => k !== 'registrar'); }
    else if (f === 'img') sg.img = el.checked;
    else sg.co = el.checked ? [...new Set([...sg.co, el.value])] : sg.co.filter(k => k !== el.value);
    save(); renderModal();
  },
  sigfile: async el => {
    const f = el.files[0]; if (!f) return;
    const url = URL.createObjectURL(f);
    try {
      const img = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = url; });
      const out = processSig(img);
      if (!out) return toast('ไม่พบลายเซ็นในรูป ใช้รูปลายเซ็นสีเข้มบนกระดาษขาว', 'err');
      signers()[el.dataset.k].sig = out; save(); render(); toast('บันทึกลายเซ็นแล้ว');
    } catch (e) { toast('เปิดรูปไม่ได้', 'err'); } finally { URL.revokeObjectURL(url); }
  },
  mailattach: el => { U.mail.attach = el.checked; },
  post: el => { U.post[el.dataset.f] = el.value; },
  rfield: el => { const r = getReq(U.letterId); r[el.dataset.f] = el.value.trim(); save(); if (U.modalView === 'env') $('#envelope').innerHTML = envelopeHTML(r); },
  dform: el => { U[el.dataset.d || 'draft'].form = +el.value; render(); },
  dp: el => { U[el.dataset.d || 'draft'].persons[+el.dataset.i][el.dataset.f] = el.value; },
  aconsent: el => { U.adraft.consent = el.checked; },
  afiles: async el => {
    const files = [...el.files]; let stored = U.adraft.files.reduce((a, f) => a + (f.data ? f.data.length : 0), 0);
    for (const f of files) {
      const rec = { name: f.name, size: f.size, type: f.type, data: '' };
      if (CLOUD ? f.size <= 10 * 1048576 : (f.size <= 1.5 * 1048576 && stored < 3.5 * 1048576)) { rec.data = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(f); }); stored += rec.data.length; }
      U.adraft.files.push(rec);
    }
    render();
  },
  dfile: async el => {
    const f = el.files[0]; if (!f) return;
    U.draft.file = f.name;
    if (/\.(csv|txt|xlsx?)$/i.test(f.name)) {
      try {
        const ps = personsFromMatrix(await fileToMatrix(f));
        if (ps.length) { const kept = U.draft.persons.filter(p => p.fname || p.sid); U.draft.persons = [...kept, ...ps]; toast(`ดึงรายชื่อจากไฟล์ ${ps.length} ราย`); }
        else toast('ไม่พบรายชื่อในไฟล์ พิมพ์รายชื่อลงตารางแทน', 'err');
      } catch (e) { toast('อ่านไฟล์ไม่สำเร็จ: ' + e.message, 'err'); }
    }
    render();
  },
  enc: el => {
    const r = getReq(U.letterId), e = enclList(r)[+el.dataset.i];
    e[el.dataset.f] = el.dataset.f === 'qty' ? Math.max(1, parseInt(el.value, 10) || 1) : el.value;
    save(); if ($('#letterDoc')) $('#letterDoc').innerHTML = docHTML(r);
  },
  vfreq: el => { U.reqId = el.value || null; render(); },
  res: el => {
    const r = getReq(el.dataset.r), p = r.persons[+el.dataset.i];
    p.result = el.value; p.manual = true;
    addTL(r, `บันทึกผล ${pName(p)}: ${RESULT[p.result].t}`, false);
    refreshStatus(r); save(); render();
  },
  note: el => { const r = getReq(el.dataset.r); r.persons[+el.dataset.i].note = el.value.trim(); save(); },
  gdlevel: el => { U.glevel = el.value; $('#gd-table').innerHTML = gradsTable(); },
  feonly: el => { U.fOnly = el.checked; $('#fe-table').innerHTML = feesTable(); },
  pp3file: el => { const f = el.files[0]; const m = f && f.name.match(/PP3-\d{4}-(\d)/i); if (m && (m[1] === '3' || m[1] === '6')) $('#gd-level').value = 'ม.' + m[1]; },
  csvfile: () => {}
};
const FORMS = {
  receive: () => {
    const d = U.draft, miss = [];
    if (!String(d.regno || '').trim()) miss.push('เลขทะเบียนรับ');
    if (!d.agency.trim()) miss.push('หน่วยงาน');
    if (!d.docno.trim()) miss.push('เลขที่หนังสือ');
    if (!/^\S+@\S+\.\S+$/.test(d.email.trim())) miss.push('E-mail');
    if (!d.docdate) miss.push('วันที่ของหนังสือ');
    const old = d.editingId && getReq(d.editingId);
    if (d.editingId && !old) { U.draft = newDraft(); render(); return toast('ไม่พบหนังสือที่กำลังแก้ไข (อาจถูกลบแล้ว)', 'err'); }
    if (old && old.status === 'replied') return toast('หนังสือนี้ส่งหนังสือตอบแล้ว แก้ไขข้อมูลรับไม่ได้', 'err');
    const same = (a, b) => ['sid', 'cid', 'prefix', 'fname', 'lname', 'gradDate', 'level'].every(k => String(a[k] || '').trim() === String(b[k] || '').trim());
    const persons = d.persons.filter(p => String(p.fname || '').trim() || String(p.sid || '').trim() || digits(p.cid)).map(p => {
      const np = { id: p.pid || uid('p'), sid: String(p.sid || '').trim(), cid: digits(p.cid), prefix: String(p.prefix || '').trim(), fname: String(p.fname || '').trim(), lname: String(p.lname || '').trim(), gradDate: parseDateAny(p.gradText), gradText: String(p.gradText || '').trim(), level: p.level, result: 'pending', matchedId: null, auto: '', note: '', manual: false };
      const op = old && p.pid && old.persons.find(x => x.id === p.pid);
      return op && same(op, np) ? Object.assign({}, op, { gradText: np.gradText }) : np;
    });
    const noName = persons.map((p, i) => p.fname ? 0 : i + 1).filter(Boolean);
    if (noName.length) miss.push('ชื่อ-สกุลของรายชื่อลำดับ ' + noName.join(', ') + ' (ไม่พบในฐานข้อมูล)');
    if (!persons.length) miss.push('รายชื่ออย่างน้อย 1 ราย');
    const noPfx = persons.map((p, i) => p.prefix ? 0 : i + 1).filter(Boolean);
    if (noPfx.length) miss.push('คำนำหน้า/ยศ ของรายชื่อลำดับ ' + noPfx.join(', '));
    if (miss.length) return toast('กรอกให้ครบ: ' + miss.join(', '), 'err');
    const reg = thaiDigits(d.regno).trim();
    if (regTaken(reg, d.editingId)) return toast(`เลขทะเบียนรับ ${reg} ถูกใช้แล้ว`, 'err');
    if (old) {
      const changed = [];
      const F = { regNo: [reg, 'เลขทะเบียนรับ'], recvDate: [d.date || old.recvDate, 'วันที่รับ'], agency: [d.agency.trim(), 'หน่วยงาน'], to: [d.to.trim(), 'เรียน'], docNo: [d.docno.trim(), 'เลขที่หนังสือ'], docDate: [d.docdate, 'ลงวันที่'], email: [d.email.trim().toLowerCase(), 'E-mail'], aaddr: [(d.aaddr || '').trim(), 'ที่อยู่'], aphone: [(d.aphone || '').trim(), 'โทรศัพท์'], form: [d.form, 'แบบหนังสือ'] };
      Object.entries(F).forEach(([k, [v, label]]) => { if (String(old[k] ?? '') !== String(v ?? '')) { old[k] = v; changed.push(label); } });
      if (d.form == 1 && d.file) old.file = d.file; else if (d.form != 1 && !old.source) old.file = '';
      const pc = persons.length !== old.persons.length || persons.some((p, i) => p !== old.persons[i] && !(old.persons[i] && same(old.persons[i], p) && p.result === old.persons[i].result));
      if (pc) changed.push('รายชื่อผู้ขอตรวจสอบ');
      old.persons = persons;
      if (registered(old) && old.status !== 'letter') { const pend = persons.filter(p => p.result === 'pending').length; old.status = pend === 0 ? 'done' : pend < persons.length ? 'checking' : 'received'; }
      else if (old.status === 'letter' && persons.some(p => p.result === 'pending')) old.status = 'checking';
      addTL(old, changed.length ? `แก้ไขข้อมูลรับหนังสือ (${changed.join(', ')})` : 'บันทึกข้อมูลรับหนังสือ (ไม่มีการเปลี่ยนแปลง)');
      save();
      U.draft = newDraft(); U.reqId = old.id; go('verify'); toast(changed.length ? `บันทึกการแก้ไขหนังสือเลขรับ ${reg} แล้ว` : 'ไม่มีข้อมูลที่เปลี่ยนแปลง');
      return;
    }
    const r = { id: uid('r'), regNo: reg, recvDate: d.date || todayISO(), agency: d.agency.trim(), to: d.to.trim(), docNo: d.docno.trim(), docDate: d.docdate, email: d.email.trim().toLowerCase(), aaddr: (d.aaddr || '').trim(), aphone: (d.aphone || '').trim(), form: d.form, file: d.form == 1 ? d.file : '', persons, status: 'received', outNo: '', outDate: '', sentDate: '', timeline: [] };
    addTL(r, `รับหนังสือ เลขทะเบียนรับ ${reg}`, true);
    S.requests.push(r); save();
    U.draft = newDraft(); U.reqId = r.id; go('verify'); toast(`บันทึกรับหนังสือ ${reg} แล้ว`);
  },
  addstu: () => {
    const n = splitName($('#as-name').value), sid = $('#as-sid').value.trim();
    if (!sid || !n.fname) return toast('กรอกรหัสประจำตัวและชื่อ-สกุล', 'err');
    S.students.push({ id: uid('s'), sid, cid: digits($('#as-cid').value), ...n, level: $('#as-level').value, gradDate: parseDateAny($('#as-date').value), gpa: $('#as-gpa').value.trim(), pp1Set: digits($('#as-pp1s').value), pp1No: digits($('#as-pp1n').value), dob: '', father: '', mother: '', source: 'เพิ่มเอง' });
    save(); render(); toast('เพิ่มรายชื่อแล้ว');
  },
  addfee: () => {
    const v = $('#fe-stu').value.trim(), key = sidKey(v.split(' ')[0]);
    const s = S.students.find(x => key && sidKey(x.sid) === key) || S.students.find(x => normName(fullName(x)) && normName(v).includes(normName(x.fname + x.lname)));
    if (!s) return toast('ไม่พบนักเรียนนี้ในฐานข้อมูล', 'err');
    const amount = parseFloat($('#fe-amt').value) || 0, paid = parseFloat($('#fe-paid').value) || 0;
    if (amount <= 0) return toast('ระบุจำนวนเงินมากกว่า 0', 'err');
    S.fees.push({ id: uid('f'), studentId: s.id, term: $('#fe-term').value.trim(), item: $('#fe-item').value.trim() || 'ค่าบำรุงการศึกษา', amount, paid: Math.min(paid, amount), note: '' });
    save(); render(); toast(`บันทึกรายการของ ${fullName(s)} แล้ว`);
  },
  settings: () => {
    const st = S.settings;
    ['school', 'address', 'docPrefix', 'office', 'director', 'directorTitle', 'phone', 'email', 'contact', 'gasUrl', 'gasKey', 'debtNote'].forEach(k => { st[k] = $('#st-' + k).value.trim(); });
    st.outNoYear = $('#st-outNoYear').value === '1';
    st.slaDays = Math.min(60, Math.max(1, parseInt($('#st-slaDays').value, 10) || 7));
    st.thaiNum = $('#st-thaiNum').checked;
    st.letterGpa = $('#st-letterGpa').checked;
    const of = parseInt($('#st-outFrom').value, 10), ot = parseInt($('#st-outTo').value, 10), nx = parseInt($('#st-nextOut').value, 10);
    if (!(of > 0 && ot >= of)) return toast('ช่วงเลขหนังสือส่งไม่ถูกต้อง (เลขเริ่มต้องไม่มากกว่าเลขสุดท้าย)', 'err');
    st.outFrom = of; st.outTo = ot; st.nextOut = nx >= of && nx <= ot + 1 ? nx : of;
    save(); render(); toast('บันทึกการตั้งค่าแล้ว');
  },
  stafflogin: async () => {
    if (CLOUD) {
      U.authErr = ''; const btn = $('form[data-form="stafflogin"] button[type=submit]'); if (btn) { btn.disabled = true; btn.textContent = 'กำลังเข้าสู่ระบบ...'; }
      try { await cloudLogin($('#sl-email').value.trim(), $('#sl-pw').value, 'staff'); U.view = 'dash'; render(); toast('เข้าสู่ระบบเจ้าหน้าที่แล้ว'); }
      catch (e) { U.authErr = cloudMsg(e); render(); }
      return;
    }
    const ok = await checkStaffPw($('#sl-pw').value);
    if (!ok) { U.authErr = 'รหัสผ่านไม่ถูกต้อง'; render(); $('#sl-pw')?.focus(); return; }
    U.staffAuth = true; U.authErr = ''; U.mode = 'staff'; U.view = 'dash'; saveSession(); render(); toast('เข้าสู่ระบบเจ้าหน้าที่แล้ว');
  },
  alogin: async () => {
    if (CLOUD) {
      U.authErr = ''; U.authOk = '';
      try { await cloudLogin($('#al-email').value.trim().toLowerCase(), $('#al-pw').value, 'agency'); render(); toast('เข้าสู่ระบบแล้ว'); }
      catch (e) { U.authErr = cloudMsg(e); render(); }
      return;
    }
    const email = $('#al-email').value.trim().toLowerCase(), pw = $('#al-pw').value;
    const acc = (S.agencies || []).find(a => a.email === email);
    if (!acc || !(await checkAgencyPw(acc, pw))) { U.authErr = 'อีเมลหรือรหัสผ่านไม่ถูกต้อง'; render(); return; }
    if (acc.approved === false) { U.authErr = 'บัญชีหน่วยงานรอเจ้าหน้าที่โรงเรียนอนุมัติ เมื่ออนุมัติแล้วจึงจะเข้าสู่ระบบได้'; render(); return; }
    U.agencyId = acc.id; U.authErr = ''; U.aView = 'home'; U.adraft = null; saveSession(); render(); toast('เข้าสู่ระบบแล้ว');
  },
  aregister: async () => {
    const v = id => $('#' + id).value.trim();
    const name = v('ar-name'), email = v('ar-email').toLowerCase(), pw = $('#ar-pw').value, pw2 = $('#ar-pw2').value;
    let err = '';
    if (!name) err = 'กรอกชื่อหน่วยงาน';
    else if (!/^\S+@\S+\.\S+$/.test(email)) err = 'กรอกอีเมลให้ถูกต้อง';
    else if ((S.agencies || []).some(a => a.email === email)) err = 'อีเมลนี้ลงทะเบียนแล้ว ใช้เมนูเข้าสู่ระบบ';
    else if (pw.length < 8) err = 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร';
    else if (pw !== pw2) err = 'ยืนยันรหัสผ่านไม่ตรงกัน';
    if (err) { U.authErr = err; render(); return; }
    if (CLOUD) {
      const { data, error } = await sb.auth.signUp({ email, password: pw, options: { data: { agency_name: name, phone: v('ar-phone'), contact: v('ar-contact'), address: $('#ar-addr').value.trim() }, emailRedirectTo: location.origin + location.pathname } });
      if (error) { U.authErr = /registered|exists/i.test(error.message) ? 'อีเมลนี้ลงทะเบียนแล้ว ใช้เมนูเข้าสู่ระบบ' : cloudMsg(error); render(); return; }
      if (data.session) await sb.auth.signOut();
      U.authErr = ''; U.aTab = 'login'; U.authOk = 'ลงทะเบียนเรียบร้อย' + (data.session ? '' : ' กรุณากดลิงก์ยืนยันในอีเมล') + ' และรอเจ้าหน้าที่โรงเรียนอนุมัติบัญชี เมื่ออนุมัติแล้วจะเข้าสู่ระบบได้';
      render(); return;
    }
    const acc = { id: uid('a'), name, email, phone: v('ar-phone'), contact: v('ar-contact'), address: $('#ar-addr').value.trim(), pwHash: await agencyHash(email, pw), pw0: '', createdAt: Date.now(), lastSeen: 0 };
    acc.approved = false; S.agencies = S.agencies || []; S.agencies.push(acc); save();
    U.authErr = ''; U.aTab = 'login'; U.authOk = 'ลงทะเบียนเรียบร้อย รอเจ้าหน้าที่โรงเรียนอนุมัติบัญชี (ทดลองอนุมัติได้ที่ เจ้าหน้าที่ › ตั้งค่า)'; render();
  },
  asubmit: () => {
    const d = U.adraft, acc = curAgency(), miss = [];
    if (!d.agency.trim()) miss.push('หน่วยงาน');
    if (!d.docno.trim()) miss.push('เลขที่หนังสือ');
    if (!d.docdate) miss.push('วันที่ของหนังสือ');
    if (!d.to.trim()) miss.push('ผู้รับหนังสือตอบ');
    if (!/^\S+@\S+\.\S+$/.test(d.email.trim())) miss.push('อีเมลรับผล');
    const persons = d.persons.filter(p => p.fname.trim()).map(p => ({ id: uid('p'), sid: p.sid.trim(), prefix: String(p.prefix || '').trim(), fname: p.fname.trim(), lname: p.lname.trim(), gradDate: parseDateAny(p.gradText), gradText: p.gradText.trim(), level: p.level, result: 'pending', matchedId: null, auto: '', note: '', manual: false }));
    if (!persons.length) miss.push('รายชื่ออย่างน้อย 1 ราย');
    const noPfx = persons.map((p, i) => p.prefix ? 0 : i + 1).filter(Boolean);
    if (noPfx.length) miss.push('คำนำหน้า/ยศ ของรายชื่อลำดับ ' + noPfx.join(', '));
    if (!d.consent) miss.push('ยืนยันความยินยอม');
    if (miss.length) return toast('กรอกให้ครบ: ' + miss.join(', '), 'err');
    const fields = { agency: d.agency.trim(), to: d.to.trim(), docNo: d.docno.trim(), docDate: d.docdate, email: d.email.trim().toLowerCase(), aaddr: d.aaddr.trim(), aphone: d.aphone.trim(), form: d.form, file: d.files.map(f => f.name).join(', '), attachments: d.files.slice(), persons, status: 'submitted', submittedAt: Date.now() };
    if (CLOUD) {
      const btn = $('form[data-form="asubmit"] button[type=submit]'); if (btn) { btn.disabled = true; btn.textContent = 'กำลังส่ง...'; }
      cloudSubmitRequest(d, fields).then(rid => { U.adraft = null; U.aReqId = rid; ago('detail'); toast('ส่งคำขอเรียบร้อย โรงเรียนจะแจ้งสถานะในระบบ'); })
        .catch(e => { toast('ส่งคำขอไม่สำเร็จ: ' + cloudMsg(e), 'err'); if (btn) { btn.disabled = false; btn.textContent = 'ส่งคำขอ'; } });
      return;
    }
    let r = d.editingId && getReq(d.editingId);
    if (r) { Object.assign(r, fields); r.returnReason = ''; addTL(r, 'หน่วยงานแก้ไขและส่งคำขออีกครั้ง', true); }
    else { r = Object.assign({ id: uid('r'), regNo: '', recvDate: '', source: 'online', agencyId: acc.id, outNo: '', outDate: '', sentDate: '', timeline: [] }, fields); addTL(r, 'หน่วยงานส่งคำขอตรวจสอบออนไลน์', true); S.requests.push(r); }
    save();
    if (!storageOK) toast('บันทึกลงเบราว์เซอร์ไม่ได้ (ไฟล์แนบอาจใหญ่เกิน) ลองลดขนาดไฟล์แนบ', 'err');
    U.adraft = null; U.aReqId = r.id; ago('detail'); if (storageOK) toast('ส่งคำขอเรียบร้อย โรงเรียนจะแจ้งสถานะในระบบ');
  },
  staffpw: async () => {
    if (CLOUD) {
      const n1 = $('#sp-new').value, n2 = $('#sp-new2').value;
      if (n1.length < 8) return toast('รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร', 'err');
      if (n1 !== n2) return toast('ยืนยันรหัสผ่านใหม่ไม่ตรงกัน', 'err');
      const { error } = await sb.auth.updateUser({ password: n1 });
      if (error) return toast('เปลี่ยนรหัสผ่านไม่สำเร็จ: ' + cloudMsg(error), 'err');
      render(); return toast('เปลี่ยนรหัสผ่านของคุณแล้ว');
    }
    const cur = $('#sp-cur').value, n1 = $('#sp-new').value, n2 = $('#sp-new2').value;
    if (!(await checkStaffPw(cur))) return toast('รหัสผ่านปัจจุบันไม่ถูกต้อง', 'err');
    if (n1.length < 8) return toast('รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร', 'err');
    if (n1 !== n2) return toast('ยืนยันรหัสผ่านใหม่ไม่ตรงกัน', 'err');
    S.settings.staffPwHash = await staffHash(n1); save(); render(); toast('เปลี่ยนรหัสผ่านเจ้าหน้าที่แล้ว');
  }
};

document.addEventListener('click', e => { const el = e.target.closest('[data-act]'); if (!el || el.disabled) return; const fn = ACT[el.dataset.act]; if (fn) fn(el, e); });
document.addEventListener('input', e => { const k = e.target.dataset && e.target.dataset.in; if (k && IN[k]) IN[k](e.target); });
document.addEventListener('change', e => { const k = e.target.dataset && e.target.dataset.ch; if (k && CH[k]) CH[k](e.target); });
document.addEventListener('submit', e => { e.preventDefault(); const k = e.target.dataset.form; if (FORMS[k]) FORMS[k](e.target); });
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && U.mode === 'staff' && U.staffAuth) { e.preventDefault(); openSearch(); return; }
  if (e.key === 'Escape' && U.gsOpen) { closeSearch(); return; }
  if (e.key === 'Enter' && document.activeElement && document.activeElement.id === 'gs-q') { const f = $('#gs-res .gs-item'); if (f) { e.preventDefault(); f.click(); } return; }
  if (e.key === 'Escape' && U.letterId) { U.letterId = null; renderModal(); }
});
document.addEventListener('mousedown', e => { if (U.gsOpen && e.target.id === 'gsearch') closeSearch(); });

if (CLOUD) { render(); cloudBoot().then(render); }
else {
  loadSession();
  if (U.mode === 'home' && (U.staffAuth || U.agencyId)) U.mode = U.staffAuth ? 'staff' : 'agency';
  render();
}

// send-email: ส่งอีเมลจากระบบผ่าน Google Apps Script (เฉพาะเจ้าหน้าที่ที่อนุมัติแล้ว)
// ลิงก์ Apps Script: ใช้ค่าในหน้าตั้งค่าของระบบ (settings.gasUrl) ก่อน แล้วสำรองด้วย Secret GAS_URL
// Secret ที่ต้องมี: GAS_KEY (ตรงกับ Script property KEY ใน Apps Script)
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

// ลิงก์แบบโดเมน (/a/macros/<โดเมน>/s/…) บังคับล็อกอิน Google ของโดเมน เรียกจากเซิร์ฟเวอร์ไม่ได้
// จึงลองลิงก์แบบทั่วไป (/macros/s/…) ก่อน แล้วค่อยลองลิงก์เดิม
const variants = (u: string) => {
  const g = u.replace(/\/a\/macros\/[^/]+\/s\//, '/macros/s/');
  return g !== u ? [g, u] : [u];
};
const plain = (t: string) => t.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 240);

async function callGas(url: string, payload: unknown) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
    redirect: 'follow',
  });
  const text = await res.text();
  try {
    return { json: JSON.parse(text), status: res.status, finalUrl: res.url };
  } catch {
    const login = /accounts\.google\.com|ServiceLogin|Sign in|ลงชื่อเข้าใช้/i.test(text) || /accounts\.google\.com/.test(res.url);
    return { json: null, status: res.status, finalUrl: res.url, login, snippet: plain(text) };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    // 1) ล็อกอินแล้ว
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ ok: false, error: 'ยังไม่ได้เข้าสู่ระบบ' }, 401);

    // 2) เป็นเจ้าหน้าที่ที่อนุมัติแล้ว
    const { data: profile } = await supabase.from('profiles').select('role, approved').eq('id', user.id).maybeSingle();
    if (!profile || profile.role !== 'staff' || profile.approved !== true) {
      return json({ ok: false, error: 'เฉพาะเจ้าหน้าที่ที่ได้รับอนุมัติเท่านั้น' }, 403);
    }

    // 3) ค่าตั้งค่า
    const { data: st } = await supabase.from('settings').select('data').eq('id', 1).maybeSingle();
    const okUrl = (u: unknown) => typeof u === 'string' && /^https:\/\/script\.google\.com\/(a\/macros\/[^/]+\/s|macros\/s)\/[\w-]+\/exec$/.test(u.trim());
    const fromSettings = okUrl(st?.data?.gasUrl) ? String(st!.data.gasUrl).trim() : '';
    const fromSecret = (Deno.env.get('GAS_URL') || '').trim();
    const urls = [...new Set([fromSettings, fromSecret].filter(Boolean).flatMap(variants))];
    const gasUrl = urls[0] || '';
    const gasKey = Deno.env.get('GAS_KEY') || '';
    if (!gasUrl) return json({ ok: false, error: 'ยังไม่ได้ใส่ลิงก์ Apps Script ในหน้าตั้งค่า › บริการส่งอีเมล' }, 500);
    if (!gasKey) return json({ ok: false, error: 'ยังไม่ได้ตั้งค่า GAS_KEY ใน Supabase › Edge Functions › Secrets' }, 500);

    const body = await req.json();
    if (!body.to) return json({ ok: false, error: 'ไม่มีอีเมลผู้รับ' }, 400);
    const size = JSON.stringify(body).length;

    // 4) ส่งต่อไป Apps Script
    let last: Awaited<ReturnType<typeof callGas>> | null = null;
    for (const url of urls) {
      const r = await callGas(url, { ...body, key: gasKey });
      if (r.json) {
        if (r.json.ok) {
          console.log('sent', { to: body.to, subject: String(body.subject || '').slice(0, 80), size, via: url });
          return json({ ok: true });
        }
        console.error('gas_error', { error: r.json.error, to: body.to, size });
        const e = String(r.json.error || '');
        const hint = /KEY/i.test(e) ? ' · GAS_KEY ใน Supabase Secrets ต้องตรงกับ Script property KEY ใน Apps Script'
          : /too many times|quota|limit/i.test(e) ? ' · เกินโควตาส่งอีเมลรายวันของบัญชี Google'
          : /permission|authoriz/i.test(e) ? ' · เปิด Apps Script แล้วกด Run หรือ Deploy ใหม่เพื่ออนุญาตสิทธิ์ส่งอีเมล'
          : '';
        return json({ ok: false, error: 'Apps Script: ' + e + hint }, 502);
      }
      last = r;
      console.error('gas_not_json', { url, status: r.status, finalUrl: r.finalUrl, login: r.login, snippet: r.snippet });
    }
    const gone = last?.status === 404 || /does not exist|ไม่มีอยู่/i.test(last?.snippet || '');
    const err = gone
      ? 'ไม่พบ Web app ของ Apps Script ตามลิงก์ที่ตั้งไว้ (Google ตอบว่าไม่มีไฟล์นี้) · มักเกิดจากการ Deploy ถูกลบ/เปลี่ยนเวอร์ชัน หรือจำกัดสิทธิ์ไว้เฉพาะคนในโรงเรียน · แก้: เปิด Apps Script → Deploy → New deployment → Web app → Execute as: Me · Who has access: Anyone → Deploy แล้วนำ Web app URL ใหม่ (ลงท้าย /exec) ไปใส่ในหน้าตั้งค่า › บริการส่งอีเมล แล้วกดบันทึก'
      : last?.login
      ? 'Apps Script ต้องล็อกอิน Google ก่อน จึงส่งอีเมลจากระบบไม่ได้ · แก้: เปิด Apps Script → Deploy → Manage deployments → แก้ไข (ไอคอนดินสอ) → Who has access เลือก "Anyone" → Deploy แล้วคัดลอก URL ใหม่ (แบบ https://script.google.com/macros/s/…/exec) ไปใส่ในหน้าตั้งค่า › บริการส่งอีเมล แล้วกดบันทึก'
      : `Apps Script ตอบกลับไม่ถูกต้อง (HTTP ${last?.status}) · ตรวจว่า GAS_URL เป็น Web app URL ที่ลงท้ายด้วย /exec และ Deploy เป็น Web app แล้ว`;
    return json({ ok: false, error: err, detail: last?.snippet }, 502);
  } catch (err) {
    console.error('exception', String(err));
    return json({ ok: false, error: 'ส่งอีเมลไม่สำเร็จ: ' + String(err) }, 500);
  }
});

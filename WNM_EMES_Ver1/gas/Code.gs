/**
 * WNM-Educational Measurement and Evaluation Section Ver.1 — บริการส่งอีเมลหนังสือแจ้งผลการตรวจสอบวุฒิ (Google Apps Script)
 *
 * วิธีติดตั้ง (ใช้บัญชี Google ของโรงเรียน เช่น watpol@wnm.ac.th)
 * 1. เปิด https://script.google.com → New project → วางโค้ดนี้แทนของเดิม
 * 2. Project Settings → Script properties → Add property
 *      KEY = รหัสลับที่ตั้งเอง (เช่น ตัวอักษรสุ่ม 20 ตัว)
 * 3. Deploy → New deployment → เลือกประเภท Web app
 *      Execute as: Me   ·   Who has access: Anyone
 *    กด Deploy แล้วอนุญาตสิทธิ์ส่งอีเมล → คัดลอก Web app URL (ลงท้ายด้วย /exec)
 * 4. ในระบบ WNM-Educational Measurement and Evaluation Section Ver.1 → ⚙️ ตั้งค่า → วาง URL และ KEY เดียวกัน → บันทึก
 *
 * อีเมลจะส่งจากบัญชีที่ Deploy โควตา Google Workspace for Education ประมาณ 1,500 ฉบับ/วัน
 */
function doPost(e) {
  try {
    var d = JSON.parse(e.postData.contents);
    var key = PropertiesService.getScriptProperties().getProperty('KEY');
    if (!key || d.key !== key) return out_({ ok: false, error: 'รหัสลับ (KEY) ไม่ถูกต้อง' });
    if (!d.to) return out_({ ok: false, error: 'ไม่มีอีเมลผู้รับ' });
    var opts = { name: d.fromName || 'WNM Measurement and Evaluation' };
    if (d.replyTo) opts.replyTo = d.replyTo;
    if (d.cc) opts.cc = d.cc;
    if (d.pdf) opts.attachments = [Utilities.newBlob(Utilities.base64Decode(d.pdf), 'application/pdf', d.filename || 'letter.pdf')];
    MailApp.sendEmail(d.to, d.subject || '', d.text || '', opts);
    return out_({ ok: true });
  } catch (err) {
    return out_({ ok: false, error: String(err) });
  }
}
function out_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

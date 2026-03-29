const { Resend } = require('resend');

const getResendClient = () => {
  if (!process.env.RESEND_API_KEY) return null;
  return new Resend(process.env.RESEND_API_KEY);
};

const formatDate = (value, withTime = false) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return withTime
    ? date.toLocaleString('hr-HR')
    : date.toLocaleDateString('hr-HR');
};

// HTML template za stranku (profesionalni)
const buildCustomerHtml = (workOrder, company, elevator, downloadUrl, hasAttachment) => {
  const linkValidityText = workOrder?.tokenExpiresAt
    ? `Poveznica za preuzimanje aktivna je do ${formatDate(workOrder.tokenExpiresAt, true)}.`
    : 'Poveznica za preuzimanje dostupna je dok je link aktivan.';

  return `
    <!DOCTYPE html>
    <html lang="hr" style="font-family: Arial, sans-serif; color: #111827;">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Radni nalog ${workOrder.workOrderNumber}</title>
      <style>
        body { margin: 0; padding: 20px; background: #f5f7fb; }
        .container { max-width: 640px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 24px; }
        .subject { font-size: 16px; font-weight: 700; color: #0f172a; margin: 0 0 18px; }
        .text { font-size: 14px; line-height: 1.8; color: #334155; margin: 0 0 14px; }
        .box { margin: 18px 0; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px; }
        .button { display: inline-block; margin-top: 8px; background: #0f4c81; color: #ffffff !important; text-decoration: none; padding: 12px 16px; border-radius: 8px; font-size: 14px; font-weight: 700; }
        .small { font-size: 12px; color: #64748b; line-height: 1.6; margin-top: 14px; }
        .firm-box { margin-top: 16px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px 14px; }
        .firm-title { margin: 0 0 8px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; color: #0f4c81; font-weight: 700; }
        .firm-row { margin: 0 0 6px; font-size: 13px; color: #334155; line-height: 1.5; }
        .firm-row:last-child { margin-bottom: 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <p class="subject">Radni nalog ${workOrder.workOrderNumber || ''}</p>

        <p class="text">Poštovani,</p>
        <p class="text">u privitku Vam dostavljamo radni nalog koji se odnosi na izvršene radove na vašem dizalu.</p>
        <p class="text">Ljubazno molimo da dokument pregledate te nas, u slučaju eventualnih primjedbi, nejasnoća ili potrebe za dodatnim informacijama, kontaktirate putem navedenih kontakata.</p>
        <p class="text">Stojimo Vam na raspolaganju za sva dodatna pitanja.</p>

        <div class="box">
          <p class="text" style="margin:0 0 8px 0;"><strong>PDF dokument:</strong> ${hasAttachment ? 'priložen je uz ovaj email.' : 'možete preuzeti putem poveznice ispod.'}</p>
          <a class="button" href="${downloadUrl}">Preuzmi PDF dokument</a>
          <p class="small">${linkValidityText}</p>
        </div>

        <p class="text" style="margin-top: 22px;">S poštovanjem,<br/><strong>${company?.naziv || 'Servisna firma'}</strong></p>

        <div class="firm-box">
          <p class="firm-title">Podaci o pošiljatelju</p>
          <p class="firm-row">🏢 <strong>Naziv:</strong> ${company?.naziv || '-'}</p>
          <p class="firm-row">📍 <strong>Adresa:</strong> ${company?.adresa || '-'}</p>
          <p class="firm-row">🧾 <strong>OIB:</strong> ${company?.oib || '-'}</p>
          <p class="firm-row">✉️ <strong>Email:</strong> ${company?.email || '-'}</p>
          <p class="firm-row">☎️ <strong>Telefon:</strong> ${company?.telefon || '-'}</p>
          <p class="firm-row">📱 <strong>Mobitel:</strong> ${company?.mobitel || '-'}</p>
          <p class="firm-row">🌐 <strong>Web:</strong> ${company?.web || '-'}</p>
        </div>

        <p class="small">Ovaj email je automatski generiran.</p>
      </div>
    </body>
    </html>
  `;
};

// HTML template za firmu (kratki sažetak)
const buildCompanyHtml = (workOrder, company, elevator) => {
  const lokacija = [elevator?.ulica, elevator?.mjesto].filter(Boolean).join(', ') || '-';
  return `
    <!DOCTYPE html>
    <html lang="hr" style="font-family: Arial, sans-serif; color: #111827;">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Radni nalog ${workOrder.workOrderNumber} - Potpisan</title>
      <style>
        body { margin: 0; padding: 20px; background: #f5f7fb; }
        .container { max-width: 640px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 24px; }
        .subject { font-size: 16px; font-weight: 700; color: #0f172a; margin: 0 0 18px; }
        .text { font-size: 14px; line-height: 1.8; color: #334155; margin: 0 0 14px; }
        .info-box { margin: 16px 0; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 10px; padding: 14px; }
        .info-row { margin: 0 0 6px; font-size: 14px; color: #334155; line-height: 1.6; }
        .info-row:last-child { margin-bottom: 0; }
        .small { font-size: 12px; color: #64748b; line-height: 1.6; margin-top: 14px; }
      </style>
    </head>
    <body>
      <div class="container">
        <p class="subject">✅ Radni nalog potpisan</p>

        <div class="info-box">
          <p class="info-row">📋 <strong>Broj:</strong> ${workOrder.workOrderNumber || '-'}</p>
          <p class="info-row">🏢 <strong>Stranka:</strong> ${elevator?.nazivStranke || '-'}</p>
          <p class="info-row">📍 <strong>Lokacija:</strong> ${lokacija}</p>
          <p class="info-row">🔢 <strong>Broj dizala:</strong> ${elevator?.brojDizala || '-'}</p>
          <p class="info-row">✍️ <strong>Potpisao:</strong> ${workOrder.signedByName || '-'}</p>
          <p class="info-row">📅 <strong>Datum potpisa:</strong> ${formatDate(workOrder.signedAt, true)}</p>
        </div>

        <p class="small">Ovaj email je automatski generiran. PDF radnog naloga je u privitku.</p>
      </div>
    </body>
    </html>
  `;
};

// Slanje emaila nakon potpisivanja radnog naloga
const sendWorkOrderEmail = async (workOrder, company, repair, elevator, downloadUrl, options = {}) => {
  try {
    console.log('📧 Email servis - početak slanja');
    console.log('   API Key postoji:', !!process.env.RESEND_API_KEY);
    console.log('   Na email (firma):', company?.email);
    console.log('   Na email (stranka):', options?.customerEmail || 'nema');
    
    // Ako nema API key-a, koristi test mode
    if (!process.env.RESEND_API_KEY) {
      console.log('📧 [TEST MODE] Email bi bio poslan na:', company.email);
      if (options.customerEmail) console.log('📧 [TEST MODE] Email bi bio poslan i na stranku:', options.customerEmail);
      console.log('📧 [TEST MODE] Predmet: Radni nalog', workOrder.workOrderNumber);
      return { success: true, mode: 'test' };
    }

    const resend = getResendClient();
    if (!resend) {
      console.log('📧 [TEST MODE] Resend client nije inicijaliziran (nema API ključa).');
      return { success: true, mode: 'test' };
    }

    const hasAttachment = Array.isArray(options.attachments) && options.attachments.length > 0;
    const attachments = hasAttachment ? options.attachments : undefined;
    const subject = options.subject || `Radni nalog ${workOrder.workOrderNumber}`;
    const results = {};

    // 1. Email firmi - kratki sažetak
    console.log('📧 Slanje emaila firmi...');
    const companyHtml = buildCompanyHtml(workOrder, company, elevator);
    const companyResponse = await resend.emails.send({
      from: 'noreply@radni-nalog.uk',
      to: company.email,
      subject: `${subject} - Potpisan`,
      html: companyHtml,
      attachments,
    });

    if (companyResponse.error) {
      console.error('❌ Resend error (firma):', companyResponse.error);
    } else {
      console.log('✅ Email poslan firmi:', companyResponse.id);
      results.company = { success: true, messageId: companyResponse.id };
    }

    // 2. Email stranki - profesionalni template (samo ako ima email)
    if (options.customerEmail) {
      console.log('📧 Slanje emaila stranki...');
      const customerHtml = options.htmlBody || buildCustomerHtml(workOrder, company, elevator, downloadUrl, hasAttachment);
      const customerResponse = await resend.emails.send({
        from: 'noreply@radni-nalog.uk',
        to: options.customerEmail,
        replyTo: company.email,
        subject,
        html: customerHtml,
        attachments,
      });

      if (customerResponse.error) {
        console.error('❌ Resend error (stranka):', customerResponse.error);
      } else {
        console.log('✅ Email poslan stranki:', customerResponse.id);
        results.customer = { success: true, messageId: customerResponse.id };
      }
    }

    return { success: true, results };
  } catch (error) {
    console.error('❌ Greška pri slanju emaila:', error.message);
    console.error('❌ Stack trace:', error.stack);
    return { success: false, error: error.message };
  }
};

module.exports = { sendWorkOrderEmail };

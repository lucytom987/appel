const { Resend } = require('resend');

const getResendClient = () => {
  if (!process.env.RESEND_API_KEY) return null;
  return new Resend(process.env.RESEND_API_KEY);
};

// Slanje emaila nakon potpisivanja radnog naloga
const sendWorkOrderEmail = async (workOrder, company, repair, elevator, downloadUrl, options = {}) => {
  try {
    console.log('📧 Email servis - početak slanja');
    console.log('   API Key postoji:', !!process.env.RESEND_API_KEY);
    console.log('   Na email:', company?.email);
    
    // Ako nema API key-a, koristi test mode
    if (!process.env.RESEND_API_KEY) {
      console.log('📧 [TEST MODE] Email bi bio poslan na:', company.email);
      console.log('📧 [TEST MODE] Predmet: Radni nalog', workOrder.workOrderNumber);
      return { success: true, mode: 'test' };
    }

    const hasAttachment = Array.isArray(options.attachments) && options.attachments.length > 0;
    const formatDate = (value, withTime = false) => {
      if (!value) return '-';
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return '-';
      return withTime
        ? date.toLocaleString('hr-HR')
        : date.toLocaleDateString('hr-HR');
    };
    const customerAddress = [elevator?.ulica, elevator?.mjesto].filter(Boolean).join(', ') || '-';
    const companyLogo = company?.logoUrl || company?.logo || '';

    const fallbackHtmlTemplate = `
      <!DOCTYPE html>
      <html lang="hr" style="font-family: Arial, sans-serif; color: #111827;">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Radni nalog ${workOrder.workOrderNumber}</title>
        <style>
          body { margin: 0; padding: 24px 12px; background: #eef2f7; }
          .shell { max-width: 680px; margin: 0 auto; }
          .card { background: #ffffff; border-radius: 18px; overflow: hidden; box-shadow: 0 18px 50px rgba(15, 23, 42, 0.08); }
          .hero { background: linear-gradient(135deg, #0f4c81 0%, #163a5f 100%); color: #ffffff; padding: 28px 28px 24px; }
          .hero-top { display: flex; align-items: center; gap: 14px; }
          .logo-wrap { width: 56px; height: 56px; border-radius: 14px; background: rgba(255,255,255,0.12); border: 1px solid rgba(255,255,255,0.18); display: flex; align-items: center; justify-content: center; overflow: hidden; flex: 0 0 auto; }
          .logo-wrap img { width: 100%; height: 100%; object-fit: contain; background: #ffffff; }
          .logo-fallback { font-size: 22px; font-weight: 800; color: #ffffff; }
          .company-name { font-size: 22px; font-weight: 800; margin: 0; }
          .hero-subtitle { margin: 6px 0 0; font-size: 13px; line-height: 1.5; color: rgba(255,255,255,0.88); }
          .hero-badge { display: inline-block; margin-top: 18px; padding: 8px 12px; border-radius: 999px; background: rgba(255,255,255,0.14); border: 1px solid rgba(255,255,255,0.18); font-size: 12px; font-weight: 700; letter-spacing: 0.2px; }
          .content { padding: 24px 28px 28px; }
          .lead { font-size: 14px; line-height: 1.7; color: #334155; margin: 0 0 18px; }
          .notice { background: #f8fafc; border: 1px solid #dbe6f0; border-radius: 14px; padding: 14px 16px; margin-bottom: 20px; font-size: 13px; line-height: 1.6; color: #334155; }
          .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 20px; }
          .info-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 14px; padding: 14px 16px; }
          .info-title { margin: 0 0 10px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.7px; color: #0f4c81; font-weight: 800; }
          .info-row { margin: 0 0 8px; font-size: 13px; line-height: 1.6; color: #334155; }
          .info-row:last-child { margin-bottom: 0; }
          .info-row strong { color: #0f172a; }
          .button-wrap { margin: 22px 0 18px; }
          .button { display: inline-block; background: #0f4c81; color: #ffffff !important; text-decoration: none; padding: 13px 18px; border-radius: 12px; font-size: 14px; font-weight: 700; }
          .subtle { font-size: 12px; line-height: 1.6; color: #64748b; margin: 0; }
          .footer { margin-top: 22px; padding-top: 18px; border-top: 1px solid #e5e7eb; font-size: 12px; line-height: 1.7; color: #64748b; }
          @media only screen and (max-width: 640px) {
            .grid { grid-template-columns: 1fr; }
            .hero, .content { padding-left: 18px; padding-right: 18px; }
          }
        </style>
      </head>
      <body>
        <div class="shell">
          <div class="card">
            <div class="hero">
              <div class="hero-top">
                <div class="logo-wrap">
                  ${companyLogo
                    ? `<img src="${companyLogo}" alt="${company?.naziv || 'Logo'}" />`
                    : `<div class="logo-fallback">${String(company?.naziv || 'A').charAt(0).toUpperCase()}</div>`}
                </div>
                <div>
                  <p class="company-name">${company.naziv || 'Servisna firma'}</p>
                  <p class="hero-subtitle">Radni nalog je uspješno kreiran i poslan. Službeni dokument nalazi se ${hasAttachment ? 'u PDF privitku ovog emaila' : 'na poveznici ispod'}.</p>
                </div>
              </div>
              <div class="hero-badge">Radni nalog ${workOrder.workOrderNumber}</div>
            </div>

            <div class="content">
              <p class="lead">
                Poštovani, u nastavku su osnovne informacije o izvršenom radu. Za službenu verziju dokumenta koristite PDF privitak ili preuzimanje putem gumba ispod.
              </p>

              <div class="notice">
                <strong>Dokument:</strong>
                ${hasAttachment
                  ? ' PDF radnog naloga priložen je uz ovaj email.'
                  : ' PDF privitak trenutno nije dostupan, ali dokument možete preuzeti putem poveznice ispod.'}
              </div>

              <div class="grid">
                <div class="info-card">
                  <p class="info-title">Podaci o nalogu</p>
                  <p class="info-row"><strong>Broj naloga:</strong> ${workOrder.workOrderNumber || '-'}</p>
                  <p class="info-row"><strong>Stranka:</strong> ${elevator?.nazivStranke || '-'}</p>
                  <p class="info-row"><strong>Adresa:</strong> ${customerAddress}</p>
                  <p class="info-row"><strong>Broj dizala:</strong> ${elevator?.brojDizala || '-'}</p>
                  <p class="info-row"><strong>Broj ugovora:</strong> ${elevator?.brojUgovora || '-'}</p>
                </div>

                <div class="info-card">
                  <p class="info-title">Status i potpis</p>
                  <p class="info-row"><strong>Datum prijave:</strong> ${formatDate(repair?.datumPrijave)}</p>
                  <p class="info-row"><strong>Datum popravka:</strong> ${formatDate(repair?.datumPopravka)}</p>
                  <p class="info-row"><strong>Potpisao:</strong> ${workOrder.signedByName || '-'}</p>
                  <p class="info-row"><strong>Vrijeme potpisa:</strong> ${formatDate(workOrder.signedAt, true)}</p>
                </div>
              </div>

              <div class="info-card" style="margin-bottom: 20px;">
                <p class="info-title">Sažetak radova</p>
                <p class="info-row"><strong>Opis kvara:</strong> ${repair?.opisKvara || '-'}</p>
                <p class="info-row"><strong>Opis popravka:</strong> ${repair?.opisPopravka || '-'}</p>
              </div>

              <div class="button-wrap">
                <a class="button" href="${downloadUrl}">Preuzmi radni nalog</a>
              </div>

              <p class="subtle">
                Kontakt: ${company.email || '-'}${company.telefon || company.mobitel ? ` · ${company.telefon || company.mobitel}` : ''}${company.web ? ` · ${company.web}` : ''}
              </p>

              <div class="footer">
                Ovaj email je automatski generiran. Ako trebate dodatne informacije, obratite se pošiljatelju ili kontaktima gore.
              </div>
            </div>
          </div>
        </div>
        </div>
      </body>
      </html>
    `;

    const htmlTemplate = options.htmlBody || fallbackHtmlTemplate;

    const resend = getResendClient();
    if (!resend) {
      console.log('📧 [TEST MODE] Resend client nije inicijaliziran (nema API ključa).');
      return { success: true, mode: 'test' };
    }

    console.log('📧 Slanje emaila preko Resend...');
    // Slanje emaila preko Resend
    const response = await resend.emails.send({
      from: 'noreply@radni-nalog.uk',
      to: company.email,
      replyTo: company.email,  // Odgovori idu na company email
      subject: options.subject || `Radni nalog ${workOrder.workOrderNumber} - Potpisan`,
      html: htmlTemplate,
      attachments: Array.isArray(options.attachments) ? options.attachments : undefined,
    });

    console.log('📧 Resend response:', JSON.stringify(response));

    if (response.error) {
      console.error('❌ Resend error:', response.error);
      throw new Error(response.error.message || 'Resend API error');
    }

    console.log('✅ Email poslan uspješno via Resend:', response.id);
    return { success: true, messageId: response.id };
  } catch (error) {
    console.error('❌ Greška pri slanju emaila:', error.message);
    console.error('❌ Stack trace:', error.stack);
    return { success: false, error: error.message };
  }
};

module.exports = { sendWorkOrderEmail };

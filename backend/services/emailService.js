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
    const linkValidityText = workOrder?.tokenExpiresAt
      ? `Poveznica za preuzimanje aktivna je do ${formatDate(workOrder.tokenExpiresAt, true)}.`
      : 'Poveznica za preuzimanje dostupna je dok je link aktivan.';

    const fallbackHtmlTemplate = `
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

          <p class="small">Kontakt: ${company.email || '-'}${company.telefon || company.mobitel ? ` · ${company.telefon || company.mobitel}` : ''}${company.web ? ` · ${company.web}` : ''}</p>
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

const { Resend } = require('resend');

// Kreiraj Resend instance
const resend = new Resend(process.env.RESEND_API_KEY);

// Slanje emaila nakon potpisivanja radnog naloga
const sendWorkOrderEmail = async (workOrder, company, repair, elevator, downloadUrl) => {
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

    // HTML template za email
    const htmlTemplate = `
      <!DOCTYPE html>
      <html lang="hr" style="font-family: Arial, sans-serif; color: #111827;">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Radni nalog ${workOrder.workOrderNumber}</title>
        <style>
          body { margin: 0; padding: 20px; background: #f5f5f5; }
          .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; padding: 30px; }
          .header { border-bottom: 3px solid #1e3a8a; padding-bottom: 20px; margin-bottom: 20px; }
          .company-name { font-size: 24px; font-weight: bold; color: #1e3a8a; margin: 0; }
          .company-info { font-size: 12px; color: #6b7280; margin-top: 8px; }
          .section-title { font-size: 14px; font-weight: 700; color: #1e40af; margin-top: 20px; margin-bottom: 10px; border-bottom: 1px solid #e5e7eb; padding-bottom: 8px; }
          .section-content { font-size: 13px; line-height: 1.6; color: #374151; }
          .section-content strong { color: #111827; }
          .badge { display: inline-block; background: #dbeafe; color: #1e40af; padding: 4px 10px; border-radius: 4px; font-size: 12px; font-weight: 600; margin-bottom: 16px; }
          .button { display: inline-block; margin-top: 20px; background: #2563eb; color: white; padding: 12px 20px; text-decoration: none; border-radius: 6px; font-weight: bold; }
          .button:hover { background: #1d4ed8; }
          .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #6b7280; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <p class="company-name">${company.naziv || 'Servisna firma'}</p>
            <div class="company-info">
              <p style="margin: 4px 0;">
                ${company.adresa ? company.adresa + ' | ' : ''}
                ${company.web ? '<a href="' + company.web + '" style="color: #2563eb;">' + company.web + '</a>' : ''}
              </p>
              <p style="margin: 4px 0;">
                ${company.email ? '<a href="mailto:' + company.email + '" style="color: #2563eb;">' + company.email + '</a>' : ''}
                ${company.mobitel ? ' | ' + company.mobitel : ''}
              </p>
            </div>
          </div>

          <div>
            <div class="badge">Radni nalog: ${workOrder.workOrderNumber}</div>

            <div class="section-title">📋 Informacije o popravku</div>
            <div class="section-content">
              <strong>Stranka:</strong> ${elevator?.nazivStranke || '-'}<br/>
              <strong>Adresa:</strong> ${elevator?.ulica || '-'}, ${elevator?.mjesto || '-'}<br/>
              <strong>Broj dizala:</strong> ${elevator?.brojDizala || '-'}<br/>
              <strong>Broj ugovora:</strong> ${elevator?.brojUgovora || '-'}<br/>
              <br/>
              <strong>Datum prijave:</strong> ${new Date(repair?.datumPrijave).toLocaleDateString('hr-HR')}<br/>
              <strong>Datum popravka:</strong> ${new Date(repair?.datumPopravka).toLocaleDateString('hr-HR')}<br/>
              <strong>Opis kvara:</strong> ${repair?.opisKvara || '-'}<br/>
              <strong>Opis popravka:</strong> ${repair?.opisPopravka || '-'}<br/>
            </div>

            <div class="section-title">✅ Potpisano od strane</div>
            <div class="section-content">
              <strong>${workOrder.signedByName || '-'}</strong><br/>
              Vrijeme: ${new Date(workOrder.signedAt).toLocaleString('hr-HR')}
            </div>

            <div class="section-title">📥 Preuzmi dokument</div>
            <div class="section-content">
              Kliknite na gumb ispod da preuzme PDF dokument:
              <br/>
              <a class="button" href="${downloadUrl}">Preuzmi PDF radni nalog</a>
            </div>

            <div class="section-title">📞 Kontaktirajte nas</div>
            <div class="section-content">
              Ako imate pitanja ili potrebni su dodatni detalji, slobodno nas kontaktirajte:
              <br/>
              Telefon: ${company.telefon || company.mobitel || '-'}<br/>
              Email: ${company.email || '-'}<br/>
              Web: ${company.web ? '<a href="' + company.web + '" style="color: #2563eb;">' + company.web + '</a>' : '-'}
            </div>
          </div>

          <div class="footer">
            <p style="margin: 0;">
              Ovaj email je automatski generiran. Molimo ne odgovarajte direktno na ovaj email.
            </p>
          </div>
        </div>
      </body>
      </html>
    `;

    console.log('📧 Slanje emaila preko Resend...');
    // Slanje emaila preko Resend
    const response = await resend.emails.send({
      from: 'onboarding@resend.dev',  // Resend sandbox email (radi odmah)
      to: company.email,
      replyTo: company.email,  // Odgovori idu na company email
      subject: `Radni nalog ${workOrder.workOrderNumber} - Potpisan`,
      html: htmlTemplate,
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

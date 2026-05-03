const puppeteer = require('puppeteer-core');
let chromium;
try { chromium = require('@sparticuz/chromium'); } catch (e) { chromium = null; }
const fs = require('fs');
const path = require('path');
const ejs = require('ejs');
const QRCode = require('qrcode');

const PDF_OUTPUT_DIR = path.join(__dirname, '..', 'generated', 'work-orders');
const TEMPLATE_PATH = path.join(__dirname, '..', 'templates', 'workorder.html');

const ensurePdfDir = () => {
  if (!fs.existsSync(PDF_OUTPUT_DIR)) {
    fs.mkdirSync(PDF_OUTPUT_DIR, { recursive: true });
  }
};

const formatDateHR = (value) => {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('hr-HR');
};

/**
 * Generate PDF from HTML template using Puppeteer
 * @param {Object} data - Data to render in HTML template
 * @returns {Promise<{fileName, filePath}>}
 */
const generatePdfFromHtml = async (data) => {
  ensurePdfDir();

  try {
    // Render EJS template with data
    const html = await ejs.renderFile(TEMPLATE_PATH, {
      workOrder: data.workOrder || {},
      repair: data.repair || {},
      elevator: data.elevator || {},
      company: data.company || {},
      qrCodeDataUrl: data.qrCodeDataUrl || '',
      formatDateHR,
    });

    // Launch browser
    const browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();

    // Set content and wait for assets
    await page.setContent(html, { waitUntil: 'networkidle0' });

    // Generate PDF
    const fileName = `${data.workOrder.workOrderNumber}.pdf`;
    const filePath = path.join(PDF_OUTPUT_DIR, fileName);

    await page.pdf({
      path: filePath,
      format: 'A4',
      margin: {
        top: '10mm',
        bottom: '10mm',
        left: '12mm',
        right: '12mm',
      },
      printBackground: true,
    });

    await browser.close();

    return { fileName, filePath };
  } catch (error) {
    console.error('PDF generation error:', error);
    throw new Error(`Failed to generate PDF: ${error.message}`);
  }
};


/**
 * Generate QR code as data URL
 * @param {string} url - URL to encode in QR code
 * @returns {Promise<string>} - Data URL of QR code image
 */
const generateQRCode = async (url) => {
  try {
    return await QRCode.toDataURL(url, {
      margin: 1,
      width: 200,
    });
  } catch (error) {
    console.error('QR code generation error:', error);
    throw new Error(`Failed to generate QR code: ${error.message}`);
  }
};

module.exports = {
  generatePdfFromHtml,
  generateQRCode,
  ensurePdfDir,
  formatDateHR,
};

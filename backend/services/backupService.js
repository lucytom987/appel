const zlib = require('zlib');

const Company = require('../models/Company');
const User = require('../models/User');
const Elevator = require('../models/Elevator');
const Service = require('../models/Service');
const Repair = require('../models/Repair');
const Event = require('../models/Event');
const ChatRoom = require('../models/ChatRoom');
const Message = require('../models/Message');
const SimCard = require('../models/SimCard');
const WorkOrder = require('../models/WorkOrder');
const ServiceWorkOrder = require('../models/ServiceWorkOrder');
const WorkOrderCounter = require('../models/WorkOrderCounter');
const AuditLog = require('../models/AuditLog');
const BackupSnapshot = require('../models/BackupSnapshot');

const BACKUP_MODELS = [
  { key: 'users', model: User },
  { key: 'elevators', model: Elevator },
  { key: 'services', model: Service },
  { key: 'repairs', model: Repair },
  { key: 'events', model: Event },
  { key: 'chatRooms', model: ChatRoom },
  { key: 'messages', model: Message },
  { key: 'simCards', model: SimCard },
  { key: 'workOrderCounters', model: WorkOrderCounter },
  { key: 'workOrders', model: WorkOrder },
  { key: 'serviceWorkOrders', model: ServiceWorkOrder },
  { key: 'auditLogs', model: AuditLog, optional: true },
];

const DEFAULT_BACKUP_LIMIT = Number(process.env.BACKUP_LIMIT_PER_COMPANY || 5);
const LIST_LIMIT_CAP = 30;
const MAX_UPLOAD_BYTES = Number(process.env.BACKUP_UPLOAD_MAX_BYTES || 20 * 1024 * 1024);

const toJSONDoc = (doc) => {
  if (!doc) return doc;
  if (typeof doc.toObject === 'function') return doc.toObject();
  return doc;
};

const normalizeLimit = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return 10;
  return Math.min(Math.floor(parsed), LIST_LIMIT_CAP);
};

const slugifyPart = (value, fallback = 'backup') => {
  const raw = String(value || '').trim().toLowerCase();
  const slug = raw
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);

  return slug || fallback;
};

const formatTimestampForName = (date = new Date()) => {
  const pad = (n) => String(n).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join('-') + '_' + [
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join('-');
};

const buildBackupLabel = ({ company, customName }) => {
  const stamp = formatTimestampForName(new Date());
  const companyPart = slugifyPart(company?.naziv, 'firma');
  const customPart = slugifyPart(customName, 'snapshot');

  const backupName = `${companyPart}_${customPart}_${stamp}`;
  const fileName = `${backupName}.json.gz`;

  return { backupName, fileName };
};

const maybeTrimOldBackups = async (companyId) => {
  if (!Number.isFinite(DEFAULT_BACKUP_LIMIT) || DEFAULT_BACKUP_LIMIT < 1) return;

  const staleBackups = await BackupSnapshot.find({ companyId })
    .sort({ createdAt: -1 })
    .skip(DEFAULT_BACKUP_LIMIT)
    .select('_id')
    .lean();

  if (!staleBackups.length) return;

  const staleIds = staleBackups.map((item) => item._id);
  await BackupSnapshot.deleteMany({ _id: { $in: staleIds } });
};

const buildCompanyPayload = async ({ companyId, includeAuditLogs = false }) => {
  const company = await Company.findById(companyId).lean();
  if (!company) {
    throw new Error('Firma nije pronađena');
  }

  const collections = {};
  const collectionCounts = {};
  let totalDocuments = 0;

  for (const entry of BACKUP_MODELS) {
    if (entry.optional && !includeAuditLogs) {
      collections[entry.key] = [];
      collectionCounts[entry.key] = 0;
      continue;
    }

    const docs = await entry.model.find({ companyId }).lean();
    collections[entry.key] = docs;
    collectionCounts[entry.key] = docs.length;
    totalDocuments += docs.length;
  }

  return {
    payload: {
      version: 1,
      createdAt: new Date().toISOString(),
      company,
      includeAuditLogs: Boolean(includeAuditLogs),
      collections,
    },
    collectionCounts,
    totalDocuments,
  };
};

const restoreFromPayload = async ({ companyId, payload }) => {
  if (!payload?.company || String(payload.company._id) !== String(companyId)) {
    throw new Error('Backup ne pripada odabranoj firmi');
  }

  await Company.replaceOne({ _id: companyId }, payload.company, { upsert: true });

  for (const entry of BACKUP_MODELS) {
    const docs = Array.isArray(payload?.collections?.[entry.key])
      ? payload.collections[entry.key].map(toJSONDoc)
      : [];

    await entry.model.deleteMany({ companyId });
    if (docs.length) {
      await entry.model.insertMany(docs, { ordered: false });
    }
  }
};

const decodeCompressedPayload = (compressedBuffer) => {
  if (!Buffer.isBuffer(compressedBuffer)) {
    throw new Error('Nevažeći sadržaj backup datoteke');
  }

  if (compressedBuffer.length < 1 || compressedBuffer.length > MAX_UPLOAD_BYTES) {
    throw new Error('Backup datoteka je prevelika ili prazna');
  }

  const raw = zlib.gunzipSync(compressedBuffer);
  return JSON.parse(raw.toString('utf8'));
};

const createCompanyBackup = async ({ companyId, user, source = 'company', reason = '', includeAuditLogs = false, customName = '' }) => {
  const { payload, collectionCounts, totalDocuments } = await buildCompanyPayload({
    companyId,
    includeAuditLogs,
  });

  const company = payload.company;
  const { backupName, fileName } = buildBackupLabel({ company, customName });

  const json = JSON.stringify(payload);
  const payloadBuffer = Buffer.from(json, 'utf8');
  const compressedData = zlib.gzipSync(payloadBuffer, { level: zlib.constants.Z_BEST_SPEED });

  const snapshot = await BackupSnapshot.create({
    companyId,
    backupName,
    fileName,
    source,
    createdBy: user._id,
    createdByEmail: user.email || '',
    reason: String(reason || '').trim(),
    includeAuditLogs: Boolean(includeAuditLogs),
    payloadVersion: 1,
    payloadBytes: payloadBuffer.length,
    compressedBytes: compressedData.length,
    totalDocuments,
    collectionCounts,
    compressedData,
  });

  await maybeTrimOldBackups(companyId);

  return {
    _id: snapshot._id,
    companyId: snapshot.companyId,
    backupName: snapshot.backupName,
    fileName: snapshot.fileName,
    source: snapshot.source,
    createdAt: snapshot.createdAt,
    payloadBytes: snapshot.payloadBytes,
    compressedBytes: snapshot.compressedBytes,
    totalDocuments: snapshot.totalDocuments,
    collectionCounts: snapshot.collectionCounts,
    includeAuditLogs: snapshot.includeAuditLogs,
  };
};

const listCompanyBackups = async ({ companyId, limit = 10 }) => {
  const safeLimit = normalizeLimit(limit);
  const backups = await BackupSnapshot.find({ companyId })
    .sort({ createdAt: -1 })
    .limit(safeLimit)
    .select('_id companyId backupName fileName source createdBy createdByEmail reason includeAuditLogs payloadVersion payloadBytes compressedBytes totalDocuments collectionCounts createdAt')
    .lean();

  return backups;
};

const getCompanyBackupFile = async ({ companyId, backupId }) => {
  const snapshot = await BackupSnapshot.findOne({ _id: backupId, companyId })
    .select('_id companyId backupName fileName createdAt compressedBytes payloadBytes totalDocuments collectionCounts +compressedData')
    .lean();

  if (!snapshot || !snapshot.compressedData) {
    throw new Error('Backup nije pronađen');
  }

  return {
    backupId: snapshot._id,
    companyId: snapshot.companyId,
    backupName: snapshot.backupName,
    fileName: snapshot.fileName,
    createdAt: snapshot.createdAt,
    compressedBytes: snapshot.compressedBytes,
    payloadBytes: snapshot.payloadBytes,
    totalDocuments: snapshot.totalDocuments,
    collectionCounts: snapshot.collectionCounts,
    compressedData: snapshot.compressedData,
  };
};

const restoreCompanyBackup = async ({ companyId, backupId, user }) => {
  const snapshot = await BackupSnapshot.findOne({ _id: backupId, companyId }).select('+compressedData');
  if (!snapshot) {
    throw new Error('Backup nije pronađen');
  }

  const payload = decodeCompressedPayload(snapshot.compressedData);
  await restoreFromPayload({ companyId, payload });

  return {
    backupId: snapshot._id,
    companyId,
    restoredAt: new Date().toISOString(),
    restoredBy: user?._id,
    totalDocuments: snapshot.totalDocuments,
    collectionCounts: snapshot.collectionCounts,
  };
};

const restoreCompanyBackupFromUpload = async ({ companyId, fileBase64, user, fileName = '' }) => {
  const encoded = String(fileBase64 || '').trim();
  if (!encoded) {
    throw new Error('Nedostaje sadržaj backup datoteke');
  }

  const compressedData = Buffer.from(encoded, 'base64');
  const payload = decodeCompressedPayload(compressedData);
  await restoreFromPayload({ companyId, payload });

  const collectionCounts = {};
  let totalDocuments = 0;
  for (const entry of BACKUP_MODELS) {
    const count = Array.isArray(payload?.collections?.[entry.key]) ? payload.collections[entry.key].length : 0;
    collectionCounts[entry.key] = count;
    totalDocuments += count;
  }

  return {
    companyId,
    fileName: String(fileName || '').trim() || 'uploaded-backup.json.gz',
    restoredAt: new Date().toISOString(),
    restoredBy: user?._id,
    totalDocuments,
    collectionCounts,
  };
};

const createBackupsForAllCompanies = async ({ user, includeAuditLogs = false, reason = '' }) => {
  const companies = await Company.find().select('_id naziv').lean();
  const result = [];

  for (const company of companies) {
    try {
      const backup = await createCompanyBackup({
        companyId: company._id,
        user,
        source: 'superadmin-global',
        reason,
        includeAuditLogs,
        customName: reason,
      });

      result.push({
        companyId: company._id,
        companyName: company.naziv,
        ok: true,
        backupId: backup._id,
        compressedBytes: backup.compressedBytes,
        totalDocuments: backup.totalDocuments,
      });
    } catch (error) {
      result.push({
        companyId: company._id,
        companyName: company.naziv,
        ok: false,
        error: error.message,
      });
    }
  }

  return result;
};

module.exports = {
  createCompanyBackup,
  listCompanyBackups,
  getCompanyBackupFile,
  restoreCompanyBackup,
  restoreCompanyBackupFromUpload,
  createBackupsForAllCompanies,
};

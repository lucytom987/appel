const mongoose = require('mongoose');

const backupSnapshotSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
  backupName: { type: String, required: true, trim: true },
  fileName: { type: String, required: true, trim: true },
  source: {
    type: String,
    enum: ['company', 'superadmin-company', 'superadmin-global'],
    default: 'company',
  },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdByEmail: { type: String, trim: true, lowercase: true },
  reason: { type: String, trim: true, default: '' },
  includeAuditLogs: { type: Boolean, default: false },
  payloadVersion: { type: Number, default: 1 },
  payloadBytes: { type: Number, required: true },
  compressedBytes: { type: Number, required: true },
  totalDocuments: { type: Number, required: true },
  collectionCounts: { type: mongoose.Schema.Types.Mixed, default: {} },
  compressedData: { type: Buffer, required: true, select: false },
  createdAt: { type: Date, default: Date.now },
}, {
  strict: true,
  timestamps: false,
});

backupSnapshotSchema.index({ companyId: 1, createdAt: -1 });
backupSnapshotSchema.index({ source: 1, createdAt: -1 });

module.exports = mongoose.model('BackupSnapshot', backupSnapshotSchema);

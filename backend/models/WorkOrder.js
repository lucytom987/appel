const mongoose = require('mongoose');

const workOrderSchema = new mongoose.Schema({
  repairId: { type: mongoose.Schema.Types.ObjectId, ref: 'Repair', required: true },
  elevatorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Elevator', required: true },
  serviserID: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  workOrderNumber: { type: String, required: true, unique: true }, // RN-DDMMYY-XX
  dayKey: { type: String, required: true },
  dailySequence: { type: Number, required: true },

  status: {
    type: String,
    enum: ['draft', 'signed', 'sent', 'cancelled'],
    default: 'draft',
  },

  pdfPath: { type: String },
  pdfFileName: { type: String },

  viewToken: { type: String, required: true },
  tokenExpiresAt: { type: Date, required: true },

  signedAt: { type: Date },
  signedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  signedByName: { type: String },
  signatureImage: { type: String },

  sentAt: { type: Date },
  sentChannels: [{ type: String }],

  lastGeneratedAt: { type: Date, default: Date.now },

  updated_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updated_at: { type: Date, default: Date.now },
  created_at: { type: Date, default: Date.now },
}, {
  strict: true,
  timestamps: false,
});

workOrderSchema.index({ repairId: 1 }, { unique: true });
workOrderSchema.index({ dayKey: 1, dailySequence: 1 }, { unique: true });
workOrderSchema.index({ status: 1, updated_at: -1 });

module.exports = mongoose.model('WorkOrder', workOrderSchema);

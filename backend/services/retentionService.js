const Repair = require('../models/Repair');
const Service = require('../models/Service');
const Event = require('../models/Event');

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_RETENTION_DAYS = 60;

const getRetentionDays = () => {
  const parsed = Number.parseInt(process.env.SOFT_DELETE_RETENTION_DAYS || `${DEFAULT_RETENTION_DAYS}`, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_RETENTION_DAYS;
};

const purgeSoftDeletedOlderThanRetention = async () => {
  const retentionDays = getRetentionDays();
  const cutoffDate = new Date(Date.now() - (retentionDays * DAY_MS));

  const filter = {
    is_deleted: true,
    deleted_at: { $lte: cutoffDate },
  };

  const [repairsResult, servicesResult, eventsResult] = await Promise.all([
    Repair.deleteMany(filter),
    Service.deleteMany(filter),
    Event.deleteMany(filter),
  ]);

  return {
    retentionDays,
    cutoffDate,
    repairsDeleted: repairsResult.deletedCount || 0,
    servicesDeleted: servicesResult.deletedCount || 0,
    eventsDeleted: eventsResult.deletedCount || 0,
  };
};

const setupSoftDeleteRetentionJob = () => {
  const run = async () => {
    try {
      const result = await purgeSoftDeletedOlderThanRetention();
      const totalDeleted = result.repairsDeleted + result.servicesDeleted + result.eventsDeleted;
      if (totalDeleted > 0) {
        console.log(
          `🧹 Retention purge (${result.retentionDays}d): repairs=${result.repairsDeleted}, services=${result.servicesDeleted}, events=${result.eventsDeleted}`
        );
      }
    } catch (error) {
      console.error('❌ Retention purge failed:', error?.message || error);
    }
  };

  run();
  const intervalId = setInterval(run, DAY_MS);
  return intervalId;
};

module.exports = {
  purgeSoftDeletedOlderThanRetention,
  setupSoftDeleteRetentionJob,
};

/**
 * M6 记录与反馈（实验3 表3-5；FR-06、FR-07）
 * record / updateRecord / listRecords / submitFeedback。
 */
import { NS } from './d1-store.js';
import { newId, toDateString, validateRecord, validateFeedback } from './d2-schema.js';

export function createRecordService({ store, logger, menu }) {
  function listRecords() {
    return store.read(NS.record, []).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  function record({ dishId, date, source = 'recommend', riskConfirmedAt = null }) {
    const entry = {
      recordId: newId('r'),
      dishId,
      date: date ?? toDateString(),
      source,
      riskConfirmedAt,
      createdAt: new Date().toISOString(),
    };
    const check = validateRecord(entry);
    if (!check.ok) {
      logger?.warn('record.rejected', { errors: check.errors });
      return { ok: false, errors: check.errors };
    }

    // 同一天只保留最新一条
    const kept = listRecords().filter((r) => r.date !== entry.date);
    store.write(NS.record, [...kept, entry]);
    logger?.info('record.saved', { recordId: entry.recordId, dishId, date: entry.date, riskConfirmedAt });
    return { ok: true, record: entry };
  }

  function updateRecord(recordId, patch = {}) {
    const list = store.read(NS.record, []);
    const idx = list.findIndex((r) => r.recordId === recordId);
    if (idx < 0) {
      logger?.warn('record.update.not_found', { recordId });
      return { ok: false, errors: ['记录不存在，可能已被清空'] };
    }
    list[idx] = { ...list[idx], ...patch, updatedAt: new Date().toISOString() };
    store.write(NS.record, list);
    logger?.info('record.updated', { recordId, fields: Object.keys(patch) });
    return { ok: true, record: list[idx] };
  }

  function listFeedback() {
    return store.read(NS.feedback, []);
  }

  function submitFeedback({ recordId, result, reason = '' }) {
    const check = validateFeedback({ recordId, result });
    if (!check.ok) {
      logger?.warn('feedback.rejected', { errors: check.errors });
      return { ok: false, errors: check.errors };
    }
    const records = store.read(NS.record, []);
    if (!records.some((r) => r.recordId === recordId)) {
      logger?.warn('feedback.no_record', { recordId });
      return { ok: false, errors: ['先记录今天吃的，再反馈'] };
    }

    const fb = {
      feedbackId: newId('f'),
      recordId,
      result,
      reason,
      weightDelta: result === 'MISMATCH' ? -0.25 : 0,
      createdAt: new Date().toISOString(),
    };
    store.write(NS.feedback, [...listFeedback(), fb]);
    logger?.info('feedback.saved', { feedbackId: fb.feedbackId, recordId, result });
    return { ok: true, feedback: fb };
  }

  function getWeights() {
    return store.read(NS.weights, { version: 1, mismatchTasteTags: {}, updatedAt: null });
  }

  function todayRecords(date = toDateString()) {
    return listRecords().filter((r) => r.date === date);
  }

  return { record, updateRecord, listRecords, listFeedback, submitFeedback, getWeights, todayRecords, menu };
}

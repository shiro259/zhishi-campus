/**
 * M1 画像服务（实验3 表3-5）
 * getProfile / saveProfile / clearProfile；字段校验由 D2 提供。
 */
import { NS } from './d1-store.js';
import { validateProfile } from './d2-schema.js';

export function createProfileService({ store, logger }) {
  function getProfile() {
    return store.read(NS.profile, null);
  }

  function saveProfile(input) {
    const result = validateProfile(input);
    if (!result.ok) {
      logger?.warn('profile.save.rejected', { errors: result.errors });
      return { ok: false, errors: result.errors };
    }
    result.value.updatedAt = new Date().toISOString();
    store.write(NS.profile, result.value);
    logger?.info('profile.saved', {
      profileId: result.value.profileId,
      tasteCount: result.value.tasteTags.length,
      // 最小化：日志不落忌口清单内容，只记条数（NFR-05）
      avoidCount: result.value.avoidList.length,
      healthGoal: result.value.healthGoal,
    });
    return { ok: true, profile: result.value };
  }

  function clearProfile() {
    store.remove(NS.profile);
    logger?.info('profile.cleared', {});
  }

  return { getProfile, saveProfile, clearProfile };
}

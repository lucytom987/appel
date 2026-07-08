import { pickerSettingsDB, userPickerVisibilityDB } from '../database/db';

export const PICKER_ONLY_MARKED_KEY = 'picker.onlyMarked';

export function getUserId(user) {
  return user?._id || user?.id || null;
}

export function normalizeRole(role) {
  const r = String(role || '').toLowerCase();
  if (r === 'technician') return 'serviser';
  if (r === 'manager') return 'menadzer';
  return r;
}

export function isTechnicianUser(user) {
  const role = normalizeRole(user?.uloga || user?.role);
  return role === 'serviser';
}

export function isUserAccountActive(user) {
  return !(user?.aktivan === false || user?.aktivan === 0 || String(user?.aktivan).toLowerCase() === 'false');
}

export function getPickerOnlyMarkedEnabled() {
  const row = pickerSettingsDB.get(PICKER_ONLY_MARKED_KEY);
  if (!row || row.value == null) return true;
  return String(row.value) !== '0';
}

export function setPickerOnlyMarkedEnabled(enabled) {
  pickerSettingsDB.set(PICKER_ONLY_MARKED_KEY, enabled ? '1' : '0');
}

export function getUserPickerVisibilityMap() {
  return userPickerVisibilityDB.getMap();
}

export function setUserPickerVisible(userId, visible) {
  userPickerVisibilityDB.setVisible(userId, visible);
}

export function isUserVisibleInPicker(userId, visibilityMap) {
  if (!userId) return true;
  const value = visibilityMap?.[String(userId)];
  return value !== false;
}

export function applyUserPickerFilter(users, options = {}) {
  const {
    currentUserId = null,
    technicianOnly = false,
    requireActiveAccount = true,
    onlyMarked = getPickerOnlyMarkedEnabled(),
    visibilityMap = getUserPickerVisibilityMap(),
  } = options;

  return (Array.isArray(users) ? users : []).filter((u) => {
    const id = getUserId(u);
    if (!id) return false;
    if (currentUserId && String(id) === String(currentUserId)) return false;

    if (technicianOnly && !isTechnicianUser(u)) return false;
    if (requireActiveAccount && !isUserAccountActive(u)) return false;

    if (!onlyMarked) return true;
    return isUserVisibleInPicker(id, visibilityMap);
  });
}

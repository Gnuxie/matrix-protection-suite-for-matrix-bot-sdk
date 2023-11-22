/**
 * Copyright (C) 2023 Gnuxie <Gnuxie@protonmail.com>
 * All rights reserved.
 */

import {
  ALL_RULE_TYPES,
  MJOLNIR_PROTECTED_ROOMS_EVENT_TYPE,
  MjolnirEnabledProtectionsEventType,
  MjolnirProtectionSettingsEventType,
  StandardStateTrackingMeta,
  StateTrackingMeta,
} from 'matrix-protection-suite';

export let DefaultStateTrackingMeta: StateTrackingMeta =
  new StandardStateTrackingMeta()
    .setInformOnlyStateType('m.room.member')
    .setStoredStateType('m.room.server_acl')
    .setStoredStateType(MjolnirEnabledProtectionsEventType)
    .setStoredStateType(MjolnirProtectionSettingsEventType)
    .setStoredStateType(MJOLNIR_PROTECTED_ROOMS_EVENT_TYPE);

for (const type of ALL_RULE_TYPES) {
  DefaultStateTrackingMeta =
    DefaultStateTrackingMeta.setInformOnlyStateType(type);
}

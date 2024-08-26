// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import {
  ClientPlatform,
  RoomBanner,
  RoomCreator,
  RoomEventRedacter,
  RoomEventRelationsGetter,
  RoomJoiner,
  RoomKicker,
  RoomMessageSender,
  RoomResolver,
  RoomStateEventSender,
  RoomUnbanner,
} from 'matrix-protection-suite';
import { BotSDKBaseClient } from './BotSDKBaseClient';

export class BotSDKClientPlatform implements ClientPlatform {
  constructor(private readonly allClient: BotSDKBaseClient) {
    // nothing to do,
  }
  toRoomBanner(): RoomBanner {
    return this.allClient;
  }
  toRoomEventRedacter(): RoomEventRedacter {
    return this.allClient;
  }
  toRoomEventRelationsGetter(): RoomEventRelationsGetter {
    return this.allClient;
  }
  toRoomKicker(): RoomKicker {
    return this.allClient;
  }
  toRoomCreator(): RoomCreator {
    return this.allClient;
  }
  toRoomJoiner(): RoomJoiner {
    return this.allClient;
  }
  toRoomResolver(): RoomResolver {
    return this.allClient;
  }
  toRoomStateEventSender(): RoomStateEventSender {
    return this.allClient;
  }
  toRoomUnbanner(): RoomUnbanner {
    return this.allClient;
  }
  toRoomMessageSender(): RoomMessageSender {
    return this.allClient;
  }
}

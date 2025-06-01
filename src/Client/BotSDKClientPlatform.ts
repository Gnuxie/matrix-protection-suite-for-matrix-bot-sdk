// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import {
  ClientPlatform,
  RoomBanner,
  RoomCreator,
  RoomEventRedacter,
  RoomEventRelationsGetter,
  RoomInviter,
  RoomJoiner,
  RoomKicker,
  RoomMessageSender,
  RoomResolver,
  RoomStateEventSender,
  RoomStateGetter,
  RoomUnbanner,
} from 'matrix-protection-suite';
import { BotSDKBaseClient } from './BotSDKBaseClient';
import { RoomReactionSender } from 'matrix-protection-suite/dist/Client/RoomReactionSender';

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
  toRoomInviter(): RoomInviter {
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
  toRoomStateGetter(): RoomStateGetter {
    return this.allClient;
  }
  toRoomUnbanner(): RoomUnbanner {
    return this.allClient;
  }
  toRoomReactionSender(): RoomReactionSender {
    return this.allClient;
  }
  toRoomMessageSender(): RoomMessageSender {
    return this.allClient;
  }
}
